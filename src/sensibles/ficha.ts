// Acceso a los datos de salud de menores (decisión 12). ESTE es el único código que toca la tabla
// `ficha_salud` (`check:capas` lo impone). Reglas:
//
// - Quién: el permiso `salud:leer` / `salud:escribir` de la matriz (administrador y maestro) Y, para el
//   maestro, que el sujeto sea de uno de SUS grupos (`maestroDelSujeto`: un prospecto con clase muestra
//   en un grupo suyo; un alumno aún no existe —F1/F3— y falla CERRADO).
// - Cada lectura y cada escritura deja una fila en `acceso_dato_sensible` (quién, a quién, qué campos
//   —solo sus nombres—, motivo, ruta), en la MISMA transacción que la lectura: si no se puede
//   registrar, no se lee. TODO intento denegado también se registra (EB-01), con su causa: falta de
//   permiso, sujeto que no existe (o de otra organización) y maestro que no es del grupo, tanto al
//   leer como al escribir. Quien sondea ids queda en el registro.
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
 * ¿Es el sujeto de un grupo de este maestro? Un PROSPECTO es de su maestro mientras tenga una clase muestra vigente o
 * ya dada (agendada, asistió, no asistió) en un grupo cuyo instructor está ligado a ese usuario (D5): una clase cancelada o
 * reagendada ya no le da acceso. Un ALUMNO llega con la inscripción (F1/F3): hasta entonces nadie es de un maestro (falla
 * cerrado). La regla se implementa AQUÍ y solo aquí.
 */
export type MaestroDelSujeto = (db: Consultas | BaseDatos, usuarioId: string, sujetoTipo: SujetoSalud, sujetoId: string) => Promise<boolean>;
export const maestroDelSujetoPorDefecto: MaestroDelSujeto = async (db, usuarioId, sujetoTipo, sujetoId) => {
  if (sujetoTipo !== "prospecto") return false;
  const n = await db.clase_muestra.count({
    where: { prospecto_id: sujetoId, estatus: { in: ["agendada", "asistio", "no_asistio"] }, grupo: { instructor: { usuario_id: usuarioId, eliminado_en: null } } },
  });
  return n > 0;
};

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
  return (await tx.alumno.count({ where: { id } })) > 0;
}

async function registrarAcceso(
  tx: Consultas,
  actor: ActorSensible,
  p: Peticion,
  accion: "leer" | "escribir" | "validar",
  resultado: "permitido" | "denegado",
  campos: readonly CampoSensible[],
  causa: ErrorAccesoSensible["motivo"] | null = null,
): Promise<void> {
  await tx.acceso_dato_sensible.create({
    data: altaConAlcance({
      usuario_id: actor.usuarioId,
      sujeto_tipo: p.sujetoTipo,
      sujeto_id: p.sujetoId,
      accion,
      resultado,
      causa,
      campos: [...campos],
      motivo: p.motivo.slice(0, 300),
      ruta: p.ruta?.slice(0, 200) ?? null,
    }),
  });
}

/**
 * Deja constancia de un intento DENEGADO, en su propia transacción (nunca dentro de una que se vaya a
 * revertir). La usan el servicio y la guarda de permiso de la ruta de salud (que niega antes de llegar
 * al servicio): así ningún intento queda sin rastro (EB-01).
 */
export async function registrarDenegado(
  db: BaseDatos,
  actor: ActorSensible,
  p: Peticion,
  accion: "leer" | "escribir",
  causa: ErrorAccesoSensible["motivo"],
  campos: readonly CampoSensible[] = [],
): Promise<void> {
  await db.$transaction((tx) => registrarAcceso(tx, actor, p, accion, "denegado", campos, causa));
  log.warn("acceso_dato_sensible_denegado", { usuario: actor.usuarioId, sujeto_tipo: p.sujetoTipo, accion, causa });
}

/** Deniega y deja constancia. */
async function denegar(db: BaseDatos, actor: ActorSensible, p: Peticion, accion: "leer" | "escribir", campos: readonly CampoSensible[], motivo: ErrorAccesoSensible["motivo"]): Promise<never> {
  await registrarDenegado(db, actor, p, accion, motivo, campos);
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
  if (!tienePermiso(actor.rol, "salud:leer")) return denegar(db, actor, p, "leer", campos, "sin_permiso");
  const cifrador = cifradorDe(opciones);

  const existe = await db.$transaction((tx) => existeSujeto(tx, p.sujetoTipo, p.sujetoId));
  if (!existe) return denegar(db, actor, p, "leer", campos, "sujeto_no_encontrado");
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
  if (!tienePermiso(actor.rol, "salud:escribir")) return denegar(db, actor, p, "escribir", campos, "sin_permiso");
  const cifrador = cifradorDe(opciones);

  try {
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
  } catch (e) {
    // La transacción se revirtió; la constancia del intento denegado va aparte (EB-01).
    if (e instanceof ErrorAccesoSensible) await registrarDenegado(db, actor, p, "escribir", e.motivo, campos);
    throw e;
  }
}

/**
 * Compara el contacto de emergencia guardado con unas personas (los tutores del registro) SIN mostrar nada: devuelve
 * `true` si alguna es la misma (`mismaPersona` decide con los valores, que no salen de esta función). Es una validación
 * interna del sistema —el asesor, que no puede leer salud, también necesita que se cumpla «el contacto de emergencia es
 * distinto del tutor»—, así que NO exige `salud:leer` pero deja constancia con la acción `validar` (quién la provocó, sobre
 * quién y qué campo). `null` si no hay contacto guardado o el sujeto no existe.
 */
export async function contactoDeEmergenciaCoincide(
  db: BaseDatos,
  actor: ActorSensible,
  p: Peticion,
  mismaPersona: (contacto: { nombre: string; telefono: string }) => boolean,
  opciones?: OpcionesSensibles,
): Promise<boolean | null> {
  const cifrador = cifradorDe(opciones);
  return db.$transaction(async (tx) => {
    if (!(await existeSujeto(tx, p.sujetoTipo, p.sujetoId))) return null;
    const fila = await tx.ficha_salud.findFirst({ where: { sujeto_tipo: p.sujetoTipo, sujeto_id: p.sujetoId }, select: { contacto_emergencia: true } });
    if (!fila?.contacto_emergencia) return null;
    await registrarAcceso(tx, actor, p, "validar", "permitido", ["contacto_emergencia"]);
    const c = JSON.parse(cifrador.descifrar(fila.contacto_emergencia, aad(actor, p, "contacto_emergencia"))) as { nombre?: unknown; telefono?: unknown };
    return typeof c.nombre === "string" && typeof c.telefono === "string" ? mismaPersona({ nombre: c.nombre, telefono: c.telefono }) : false;
  });
}

/** Qué campos de la ficha tienen dato (solo presencia: no se descifra nada). */
export async function camposConDato(db: BaseDatos | Consultas, sujetoTipo: SujetoSalud, sujetoId: string): Promise<CampoSensible[]> {
  const fila = (await db.ficha_salud.findFirst({ where: { sujeto_tipo: sujetoTipo, sujeto_id: sujetoId }, select: Object.fromEntries(CAMPOS_SENSIBLES.map((c) => [c, true])) as Record<CampoSensible, true> })) as Partial<Record<CampoSensible, string | null>> | null;
  return fila ? CAMPOS_SENSIBLES.filter((c) => fila[c] != null) : [];
}

export interface FiltroAccesos {
  sujetoId?: string;
  usuarioId?: string;
  resultado?: "permitido" | "denegado";
}

export interface FilaAcceso {
  id: string;
  usuario_id: string;
  sujeto_tipo: string;
  sujeto_id: string;
  accion: string;
  resultado: string;
  causa: string | null;
  campos: string[];
  motivo: string | null;
  ruta: string | null;
  creado_en: Date;
}

/**
 * Consulta del registro de accesos a salud (quién vio a quién), más reciente primero. Es lo único que
 * lee `acceso_dato_sensible` fuera de esta carpeta: la ruta del administrador (EB-21). Nunca trae
 * valores de salud, solo los NOMBRES de los campos tocados.
 */
export async function listarAccesos(db: BaseDatos, filtro: FiltroAccesos, pagina: { saltar: number; tomar: number }): Promise<{ total: number; filas: FilaAcceso[] }> {
  const where = {
    ...(filtro.sujetoId ? { sujeto_id: filtro.sujetoId } : {}),
    ...(filtro.usuarioId ? { usuario_id: filtro.usuarioId } : {}),
    ...(filtro.resultado ? { resultado: filtro.resultado } : {}),
  };
  const [total, filas] = await Promise.all([
    db.acceso_dato_sensible.count({ where }),
    db.acceso_dato_sensible.findMany({
      where,
      select: { id: true, usuario_id: true, sujeto_tipo: true, sujeto_id: true, accion: true, resultado: true, causa: true, campos: true, motivo: true, ruta: true, creado_en: true },
      orderBy: [{ creado_en: "desc" }, { id: "desc" }],
      skip: pagina.saltar,
      take: pagina.tomar,
    }),
  ]);
  return { total, filas };
}
