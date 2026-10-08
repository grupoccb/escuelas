// Lista de espera de los grupos llenos (C9).
//
// Una entrada VIVA (esperando u ofrecido) por (grupo, prospecto). La POSICIÓN es 1..N entre las vivas, sin huecos ni
// repetidos: la nueva siempre queda al final (orden de llegada determinista), al cerrarse una entrada las demás se
// recorren y el asesor puede mover a alguien. Todo cambio de posiciones corre bajo un candado por grupo
// (`lista_espera:<grupo>`), y la base impide repetir una posición (índice único parcial): dos altas simultáneas nunca
// quedan con la misma.
//
// PUNTOS DE ENCHUFE para las fases siguientes:
//   · F5 (baja o cambio de grupo) llama `ofrecerLugarLiberado(db, grupoId)` cuando un grupo libera un lugar: marca como
//     `ofrecido` al primero de la fila y deja una tarea para el asesor (el sistema NO le escribe a la familia: lo hace
//     la persona). Devuelve null si nadie espera.
//   · F3 (inscripción) llama `cerrarEntrada(db, id, "inscrito")` (o `cerrarEntradaDe(db, grupoId, prospectoId, "inscrito")`)
//     cuando quien estaba en la fila se inscribe.
//   · La ocupación real del grupo (F4) NO cuenta la lista de espera: son familias sin lugar.

import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import { transaccionConBloqueo } from "../datos/bloqueos.ts";
import { leerConfiguracion } from "../configuracion/index.ts";
import { formatearHorarios } from "../lib/horario.ts";

export type EstatusVivo = "esperando" | "ofrecido";
const VIVOS: EstatusVivo[] = ["esperando", "ofrecido"];

export interface EntradaDeLista {
  id: string;
  grupoId: string;
  prospectoId: string;
  leadId: string;
  estatus: "esperando" | "ofrecido" | "inscrito" | "cancelado";
  posicion: number;
  ofrecidoEn: Date | null;
  venceEn: Date | null;
}

interface FilaEntrada {
  id: string;
  grupo_id: string;
  prospecto_id: string;
  lead_id: string;
  estatus: EntradaDeLista["estatus"];
  posicion: number;
  ofrecido_en: Date | null;
  vence_en: Date | null;
}
const SELECCION = { id: true, grupo_id: true, prospecto_id: true, lead_id: true, estatus: true, posicion: true, ofrecido_en: true, vence_en: true } as const;
const aEntrada = (f: FilaEntrada): EntradaDeLista => ({ id: f.id, grupoId: f.grupo_id, prospectoId: f.prospecto_id, leadId: f.lead_id, estatus: f.estatus, posicion: f.posicion, ofrecidoEn: f.ofrecido_en, venceEn: f.vence_en });

/** Clave del candado de un grupo: la comparten alta, quitar, mover y ofrecer. */
export const claveDeCandado = (grupoId: string): string => `lista_espera:${grupoId}`;

async function conCandado<R>(db: BaseDatos, grupoId: string, fn: (tx: Consultas) => Promise<R>): Promise<R> {
  // La organización sale de la fila misma (el scope ya la filtró): el candado la exige explícita.
  const g = await db.grupo.findFirst({ where: { id: grupoId } });
  if (!g) throw new RangeError("El grupo no existe");
  return transaccionConBloqueo(db, g.organizacion_id, claveDeCandado(grupoId), fn);
}

// ── Alta ─────────────────────────────────────────────────────────────────────────────────────────────────

export type MotivoDeRechazo = "grupo_inexistente" | "sin_lista_de_espera" | "prospecto_ajeno";
export type ResultadoDeAlta = { ok: true; creada: boolean; entrada: EntradaDeLista } | { ok: false; motivo: MotivoDeRechazo };

export interface DatosDeAlta {
  grupoId: string;
  prospectoId: string;
  leadId: string;
}

/**
 * Apunta al prospecto al final de la lista de espera del grupo. Idempotente: si ya está viva, la devuelve (`creada:
 * false`). SIN candado, para usarla dentro de la transacción de otro flujo (el bot): si dos altas chocan por la
 * posición, la base rechaza a la segunda (violación de unicidad) y quien llama repite su transacción; para una
 * llamada suelta usa `altaConCandado`. No exige que el grupo esté lleno: eso lo decide quien ofrece la lista.
 */
export async function altaListaEspera(tx: Consultas, d: DatosDeAlta): Promise<ResultadoDeAlta> {
  const grupo = await tx.grupo.findFirst({ where: { id: d.grupoId, activo: true }, select: { permite_lista_espera: true } });
  if (!grupo) return { ok: false, motivo: "grupo_inexistente" };
  if (!grupo.permite_lista_espera) return { ok: false, motivo: "sin_lista_de_espera" };
  if (!(await tx.prospecto.findFirst({ where: { id: d.prospectoId, lead_id: d.leadId }, select: { id: true } }))) return { ok: false, motivo: "prospecto_ajeno" };

  const viva = await tx.lista_espera.findFirst({ where: { grupo_id: d.grupoId, prospecto_id: d.prospectoId, estatus: { in: VIVOS } }, select: SELECCION });
  if (viva) return { ok: true, creada: false, entrada: aEntrada(viva) };

  const max = await tx.lista_espera.aggregate({ where: { grupo_id: d.grupoId, estatus: { in: VIVOS } }, _max: { posicion: true } });
  const creada = await tx.lista_espera.create({
    data: altaConAlcance({ grupo_id: d.grupoId, prospecto_id: d.prospectoId, lead_id: d.leadId, posicion: (max._max.posicion ?? 0) + 1 }),
    select: SELECCION,
  });
  return { ok: true, creada: true, entrada: aEntrada(creada) };
}

/** `altaListaEspera` en su propia transacción y bajo el candado del grupo: las altas simultáneas se ponen en fila. */
export async function altaConCandado(db: BaseDatos, d: DatosDeAlta): Promise<ResultadoDeAlta> {
  return conCandado(db, d.grupoId, (tx) => altaListaEspera(tx, d));
}

// ── Posiciones ───────────────────────────────────────────────────────────────────────────────────────────

const DESPLAZAMIENTO = 1_000_000;

/**
 * Deja las posiciones de las entradas vivas del grupo en `orden` (1..N, sin huecos). Solo toca las que cambian y
 * las saca primero de en medio (el índice único no admite repetir una posición ni un instante): dos pasos.
 * Dentro de la transacción con el candado del grupo.
 */
async function asignarPosiciones(tx: Consultas, grupoId: string, orden: readonly { id: string; posicion: number }[]): Promise<void> {
  const cambian = orden.map((e, i) => ({ id: e.id, de: e.posicion, a: i + 1 })).filter((e) => e.de !== e.a);
  if (cambian.length === 0) return;
  await tx.lista_espera.updateMany({ where: { grupo_id: grupoId, id: { in: cambian.map((c) => c.id) } }, data: { posicion: { increment: DESPLAZAMIENTO } } });
  for (const c of cambian) await tx.lista_espera.update({ where: { id: c.id }, data: { posicion: c.a } });
}

/** Las entradas vivas del grupo, en el orden de la fila. */
async function vivas(tx: Consultas, grupoId: string) {
  return tx.lista_espera.findMany({ where: { grupo_id: grupoId, estatus: { in: VIVOS } }, select: SELECCION, orderBy: [{ posicion: "asc" }, { id: "asc" }] });
}

// ── Quitar y mover ───────────────────────────────────────────────────────────────────────────────────────

/** Se llama DENTRO de la transacción del cambio (con el candado del grupo), para dejar el registro de auditoría atómico con él. */
export type AlCambiar = (tx: Consultas, antes: EntradaDeLista, despues: EntradaDeLista) => Promise<void>;

export type ResultadoDeCambio = { ok: true; entrada: EntradaDeLista } | { ok: false; motivo: "no_existe" | "ya_cerrada" | "fuera_de_rango" | "ya_ofrecida" };

async function grupoDeEntrada(db: BaseDatos, id: string): Promise<string | null> {
  return (await db.lista_espera.findFirst({ where: { id }, select: { grupo_id: true } }))?.grupo_id ?? null;
}

/**
 * Cierra una entrada viva: `cancelado` (se quita de la fila) o `inscrito` (tomó el lugar). Las demás se recorren.
 * `ya_cerrada` si ya no estaba viva.
 */
export async function cerrarEntrada(db: BaseDatos, id: string, como: "cancelado" | "inscrito" = "cancelado", alCambiar?: AlCambiar): Promise<ResultadoDeCambio> {
  const grupoId = await grupoDeEntrada(db, id);
  if (!grupoId) return { ok: false, motivo: "no_existe" };
  return conCandado(db, grupoId, async (tx) => {
    const actual = await tx.lista_espera.findFirst({ where: { id }, select: SELECCION });
    if (!actual) return { ok: false as const, motivo: "no_existe" as const };
    if (actual.estatus !== "esperando" && actual.estatus !== "ofrecido") return { ok: false as const, motivo: "ya_cerrada" as const };
    // Sale de la fila (conserva la posición que tenía, como historial; el índice único solo mira a las vivas) y se recorren las demás.
    const cerrada = await tx.lista_espera.update({ where: { id }, data: { estatus: como }, select: SELECCION });
    await asignarPosiciones(tx, grupoId, await vivas(tx, grupoId));
    await alCambiar?.(tx, aEntrada(actual), aEntrada(cerrada));
    return { ok: true as const, entrada: aEntrada(cerrada) };
  });
}

/** Cierra la entrada viva de este prospecto en este grupo (la que usará la inscripción). null si no estaba en la fila. */
export async function cerrarEntradaDe(db: BaseDatos, grupoId: string, prospectoId: string, como: "cancelado" | "inscrito"): Promise<ResultadoDeCambio | null> {
  const viva = await db.lista_espera.findFirst({ where: { grupo_id: grupoId, prospecto_id: prospectoId, estatus: { in: VIVOS } }, select: { id: true } });
  return viva ? cerrarEntrada(db, viva.id, como) : null;
}

/**
 * Mueve a alguien que está esperando a otra posición (1..N entre las vivas); las demás se recorren. Una familia
 * a la que ya se le ofreció un lugar no se mueve (`ya_ofrecida`).
 */
export async function moverEnListaEspera(db: BaseDatos, id: string, posicion: number, alCambiar?: AlCambiar): Promise<ResultadoDeCambio> {
  const grupoId = await grupoDeEntrada(db, id);
  if (!grupoId) return { ok: false, motivo: "no_existe" };
  return conCandado(db, grupoId, async (tx) => {
    const actual = await tx.lista_espera.findFirst({ where: { id }, select: SELECCION });
    if (!actual) return { ok: false as const, motivo: "no_existe" as const };
    if (actual.estatus === "ofrecido") return { ok: false as const, motivo: "ya_ofrecida" as const };
    if (actual.estatus !== "esperando") return { ok: false as const, motivo: "ya_cerrada" as const };
    const fila = await vivas(tx, grupoId);
    if (!Number.isInteger(posicion) || posicion < 1 || posicion > fila.length) return { ok: false as const, motivo: "fuera_de_rango" as const };
    const sin = fila.filter((e) => e.id !== id);
    const nuevaFila = [...sin.slice(0, posicion - 1), actual, ...sin.slice(posicion - 1)];
    await asignarPosiciones(tx, grupoId, nuevaFila);
    const despues = aEntrada(await tx.lista_espera.findFirstOrThrow({ where: { id }, select: SELECCION }));
    await alCambiar?.(tx, aEntrada(actual), despues);
    return { ok: true as const, entrada: despues };
  });
}

// ── Ofrecer un lugar liberado ────────────────────────────────────────────────────────────────────────────

export interface LugarOfrecido {
  entrada: EntradaDeLista;
  tareaId: string;
}

/**
 * Se liberó un lugar en el grupo: marca como `ofrecido` al primero de la fila (el de menor posición entre los que
 * `esperando`), le fija `vence_en` (horas de la configuración de la organización) y crea una TAREA para el asesor
 * para que se lo ofrezca a la familia. Atómico bajo el candado del grupo: dos lugares liberados a la vez se ofrecen a
 * dos familias distintas, nunca a la misma. Devuelve null si nadie espera. No manda ningún mensaje.
 *
 * F5 (baja o cambio de grupo) la invoca cuando un grupo libera un lugar; la prueba de este bloque la ejercita sola.
 */
export async function ofrecerLugarLiberado(db: BaseDatos, grupoId: string, o: { ahora?: Date; horas?: number } = {}): Promise<LugarOfrecido | null> {
  const ahora = o.ahora ?? new Date();
  return conCandado(db, grupoId, async (tx) => {
    const siguiente = await tx.lista_espera.findFirst({ where: { grupo_id: grupoId, estatus: "esperando" }, orderBy: [{ posicion: "asc" }, { id: "asc" }], select: SELECCION });
    if (!siguiente) return null;
    const horas = o.horas ?? (await leerConfiguracion(tx)).listaEsperaOfertaHoras;
    const vence = new Date(ahora.getTime() + horas * 60 * 60 * 1000);
    const marcada = await tx.lista_espera.updateMany({ where: { id: siguiente.id, estatus: "esperando" }, data: { estatus: "ofrecido", ofrecido_en: ahora, vence_en: vence } });
    if (marcada.count !== 1) return null; // con el candado no pasa; si pasara, no se ofrece dos veces

    const grupo = await tx.grupo.findFirstOrThrow({ where: { id: grupoId }, select: { nombre: true, programa: { select: { sucursal: { select: { zona_horaria: true } } } }, horarios: { where: { eliminado_en: null }, select: { dia_semana: true, hora_inicio_min: true, hora_fin_min: true } } } });
    const prospecto = await tx.prospecto.findFirstOrThrow({ where: { id: siguiente.prospecto_id }, select: { nombre: true } });
    const hasta = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short", timeZone: grupo.programa.sucursal.zona_horaria }).format(vence);
    const horario = formatearHorarios(grupo.horarios.map((h) => ({ dia: h.dia_semana, inicioMin: h.hora_inicio_min, finMin: h.hora_fin_min })));
    const tarea = await tx.tarea_asesor.create({
      data: altaConAlcance({
        lead_id: siguiente.lead_id,
        tipo: "lista_espera_lugar_liberado" as const,
        vence_en: vence,
        descripcion: `Se liberó un lugar en el grupo «${grupo.nombre}»${horario ? ` (${horario})` : ""}. Le toca a ${prospecto.nombre ?? "quien sigue en la lista"} (posición ${siguiente.posicion}): ofrécele el lugar antes del ${hasta}. Si no lo toma, quítalo de la lista y ofrécelo al siguiente.`,
      }),
      select: { id: true },
    });
    return { entrada: aEntrada({ ...siguiente, estatus: "ofrecido", ofrecido_en: ahora, vence_en: vence }), tareaId: tarea.id };
  });
}

/** Posición y estatus de las entradas vivas de un prospecto, con el nombre del grupo (para la nota del asesor). */
export async function entradasVivasDe(tx: Consultas, prospectoId: string): Promise<{ grupo: string; posicion: number; estatus: "esperando" | "ofrecido" }[]> {
  const filas = await tx.lista_espera.findMany({ where: { prospecto_id: prospectoId, estatus: { in: VIVOS } }, select: { posicion: true, estatus: true, grupo: { select: { nombre: true } } }, orderBy: [{ creado_en: "asc" }, { id: "asc" }] });
  return filas.map((f) => ({ grupo: f.grupo.nombre, posicion: f.posicion, estatus: f.estatus as "esperando" | "ofrecido" }));
}
