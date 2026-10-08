// Acceso a los datos de salud de menores (decisión 12). ESTE es el único código que toca la tabla
// `ficha_salud` (`check:capas` lo impone). Reglas:
//
// - Quién: el permiso `salud:leer` / `salud:escribir` de la matriz (administrador y maestro) Y, para el
//   maestro, que el sujeto sea de uno de SUS grupos (`maestroDelSujeto`; mientras no exista la
//   inscripción —F1/F3— esa comprobación devuelve false: el maestro queda fuera, falla CERRADO).
// - Cada lectura y cada escritura deja una fila en `acceso_dato_sensible` (quién, a quién, qué campos
//   —solo sus nombres—, motivo, ruta), en la MISMA transacción que la lectura: si no se puede
//   registrar, no se lee. Los intentos denegados también se registran.
// - Los valores van cifrados en la base y salen envueltos en `Sensible`: si se cuelan a un log o a un
//   texto, se imprimen como [REDACTADO].
// - Nunca se escriben en logs, notas de Chatwoot ni mensajes de WhatsApp (lo vigila un test y
//   `check:sensibles`).

import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import { transaccionConBloqueo } from "../datos/bloqueos.ts";
import type { Rol } from "../auth/roles.ts";
import { tienePermiso } from "../api/permisos.ts";
import { log } from "../lib/log.ts";
import { CAMPOS_SENSIBLES, type CampoSensible } from "./campos.ts";
import { cifradorDesdeEntorno, type Cifrador } from "./cifrado.ts";
import { Sensible } from "./marca.ts";

export type SujetoSalud = "prospecto" | "alumno";

/** Quién pide el acceso. La organización es la de su sesión. */
export interface ActorSensible {
  usuarioId: string;
  organizacionId: string;
  rol: Rol;
}

export class ErrorAccesoSensible extends Error {
  readonly motivo: "sin_permiso" | "sujeto_no_encontrado" | "no_es_de_tu_grupo";
  constructor(motivo: ErrorAccesoSensible["motivo"]) {
    super(motivo === "sin_permiso" ? "No tienes permiso para este dato" : "No se encontró");
    this.motivo = motivo;
  }
}

/**
 * ¿Es el sujeto de un grupo de este maestro? Hoy no hay inscripciones (llegan con F1/F3), así que NO:
 * el maestro no puede leer ninguna ficha todavía. Cuando exista la relación inscripción → grupo →
 * instructor ↔ usuario, se implementa AQUÍ y solo aquí.
 */
export type MaestroDelSujeto = (db: Consultas | BaseDatos, usuarioId: string, sujetoTipo: SujetoSalud, sujetoId: string) => Promise<boolean>;
export const maestroDelSujetoPorDefecto: MaestroDelSujeto = async () => false;

export interface OpcionesSensibles {
  cifrador?: Cifrador;
  maestroDelSujeto?: MaestroDelSujeto;
}

let cifradorDelProceso: Cifrador | undefined;
function cifradorDe(o?: OpcionesSensibles): Cifrador {
  return o?.cifrador ?? (cifradorDelProceso ??= cifradorDesdeEntorno());
}

export interface Peticion {
  sujetoTipo: SujetoSalud;
  sujetoId: string;
  /** Por qué se accede (queda en el registro). */
  motivo: string;
  /** Ruta o proceso desde el que se accede (queda en el registro). */
  ruta?: string;
}

async function existeSujeto(tx: Consultas, tipo: SujetoSalud, id: string): Promise<boolean> {
  if (tipo === "prospecto") return (await tx.prospecto.count({ where: { id } })) > 0;
  // `alumno` llega con F1: hasta entonces no hay a quién pertenezca una ficha de alumno.
  return false;
}

async function registrarAcceso(
  tx: Consultas,
  actor: ActorSensible,
  p: Peticion,
  accion: "leer" | "escribir",
  resultado: "permitido" | "denegado",
  campos: readonly CampoSensible[],
): Promise<void> {
  await tx.acceso_dato_sensible.create({
    data: altaConAlcance({
      usuario_id: actor.usuarioId,
      sujeto_tipo: p.sujetoTipo,
      sujeto_id: p.sujetoId,
      accion,
      resultado,
      campos: [...campos],
      motivo: p.motivo.slice(0, 300),
      ruta: p.ruta?.slice(0, 200) ?? null,
    }),
  });
}

/** Deniega y deja constancia (fuera de cualquier transacción que se vaya a revertir). */
async function denegar(db: BaseDatos, actor: ActorSensible, p: Peticion, accion: "leer" | "escribir", campos: readonly CampoSensible[], motivo: ErrorAccesoSensible["motivo"]): Promise<never> {
  await db.$transaction((tx) => registrarAcceso(tx, actor, p, accion, "denegado", campos));
  log.warn("acceso_dato_sensible_denegado", { usuario: actor.usuarioId, sujeto_tipo: p.sujetoTipo, accion, causa: motivo });
  throw new ErrorAccesoSensible(motivo);
}

const aad = (actor: ActorSensible, p: Peticion, campo: CampoSensible): string => `${actor.organizacionId}|${p.sujetoTipo}|${p.sujetoId}|${campo}`;

export type FichaLeida = { existe: boolean; campos: Partial<Record<CampoSensible, Sensible<unknown> | null>> };

/**
 * Lee campos de la ficha de un sujeto. Devuelve cada valor envuelto en `Sensible` (o null si no hay
 * dato). Lanza `ErrorAccesoSensible` si no hay permiso, el sujeto no existe o el maestro no es de su
 * grupo. Registra el acceso (permitido o denegado).
 */
export async function leerSensible(
  db: BaseDatos,
  actor: ActorSensible,
  p: Peticion & { campos?: readonly CampoSensible[] },
  opciones?: OpcionesSensibles,
): Promise<FichaLeida> {
  const campos = p.campos ?? CAMPOS_SENSIBLES;
  if (!tienePermiso(actor.rol, "salud:leer")) throw new ErrorAccesoSensible("sin_permiso");
  const cifrador = cifradorDe(opciones);

  const existe = await db.$transaction((tx) => existeSujeto(tx, p.sujetoTipo, p.sujetoId));
  if (!existe) throw new ErrorAccesoSensible("sujeto_no_encontrado");
  if (actor.rol === "maestro") {
    const suyo = await (opciones?.maestroDelSujeto ?? maestroDelSujetoPorDefecto)(db, actor.usuarioId, p.sujetoTipo, p.sujetoId);
    if (!suyo) return denegar(db, actor, p, "leer", campos, "no_es_de_tu_grupo");
  }

  return db.$transaction(async (tx) => {
    await registrarAcceso(tx, actor, p, "leer", "permitido", campos);
    const select = Object.fromEntries(campos.map((c) => [c, true])) as Record<CampoSensible, true>;
    const fila = await tx.ficha_salud.findFirst({ where: { sujeto_tipo: p.sujetoTipo, sujeto_id: p.sujetoId }, select }) as Partial<Record<CampoSensible, string | null>> | null;
    const salida: FichaLeida["campos"] = {};
    for (const c of campos) {
      const guardado = fila?.[c];
      salida[c] = guardado ? new Sensible(JSON.parse(cifrador.descifrar(guardado, aad(actor, p, c))) as unknown) : null;
    }
    return { existe: fila !== null, campos: salida };
  });
}

/**
 * Guarda (crea o actualiza) campos de la ficha. `null` borra el valor de ese campo; un campo que no
 * se menciona no cambia. Registra el acceso. Dos escrituras simultáneas del mismo sujeto se serializan
 * y se mezclan (una ficha por sujeto).
 */
export async function guardarSensible(
  db: BaseDatos,
  actor: ActorSensible,
  p: Peticion & { valores: Partial<Record<CampoSensible, unknown>> },
  opciones?: OpcionesSensibles,
): Promise<void> {
  const campos = (Object.keys(p.valores) as CampoSensible[]).filter((c) => (CAMPOS_SENSIBLES as readonly string[]).includes(c) && p.valores[c] !== undefined);
  if (!tienePermiso(actor.rol, "salud:escribir")) throw new ErrorAccesoSensible("sin_permiso");
  const cifrador = cifradorDe(opciones);

  await transaccionConBloqueo(db, actor.organizacionId, `ficha_salud:${p.sujetoTipo}:${p.sujetoId}`, async (tx) => {
    if (!(await existeSujeto(tx, p.sujetoTipo, p.sujetoId))) throw new ErrorAccesoSensible("sujeto_no_encontrado");
    if (actor.rol === "maestro" && !(await (opciones?.maestroDelSujeto ?? maestroDelSujetoPorDefecto)(tx, actor.usuarioId, p.sujetoTipo, p.sujetoId))) {
      throw new ErrorAccesoSensible("no_es_de_tu_grupo");
    }
    const datos: Partial<Record<CampoSensible, string | null>> = {};
    for (const c of campos) {
      const v = p.valores[c];
      datos[c] = v === null ? null : cifrador.cifrar(JSON.stringify(v), aad(actor, p, c));
    }
    const existente = await tx.ficha_salud.findFirst({ where: { sujeto_tipo: p.sujetoTipo, sujeto_id: p.sujetoId }, select: { id: true } });
    if (existente) await tx.ficha_salud.update({ where: { id: existente.id }, data: datos });
    else await tx.ficha_salud.create({ data: altaConAlcance({ sujeto_tipo: p.sujetoTipo, sujeto_id: p.sujetoId, ...datos }) });
    await registrarAcceso(tx, actor, p, "escribir", "permitido", campos);
  });
}
