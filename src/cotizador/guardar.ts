// Persistencia de las cotizaciones (C8). Lo cotizado se guarda CONGELADO (`snapshot`): programa, horarios con lugar,
// precios y promociones de ese día; la inscripción (F3) puede respetarlo si se decide, y el asesor ve lo que se le
// dijo al contacto aunque el catálogo haya cambiado. Todo por el scope de la organización (invariante 1).
//
// Una cotización vigente por (prospecto, programa): una nueva REEMPLAZA a la anterior (la pasa a `vencida`) en la
// misma transacción; el índice único parcial `cotizacion_vigente_key` lo garantiza si dos altas compiten.

import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import type { ValorJson } from "../datos/tipos.ts";
import { aFecha, sumarDias, type FechaISO } from "../catalogo/precios.ts";
import { opcionesDeSnapshot, type OpcionHorario } from "./cotizacion.ts";

export type OrigenDeCotizacion = "bot" | "asesor";

export interface DatosDeCotizacion {
  leadId: string;
  prospectoId: string;
  programaId: string;
  sucursalId: string;
  origen: OrigenDeCotizacion;
  /** El bot: la conversación donde la mandó. El asesor: nulo. */
  conversacionId?: string | null;
  /** El asesor que la hizo a mano. El bot: nulo. */
  creadoPorUsuarioId?: string | null;
  fecha: FechaISO;
  vigenteHasta: FechaISO;
  snapshot: object;
}

/**
 * Guarda la cotización y pasa a `vencida` la vigente anterior del mismo prospecto y programa. Dentro de una
 * transacción. Devuelve el id de la nueva y los de las que reemplazó.
 */
export async function guardarCotizacion(tx: Consultas, d: DatosDeCotizacion): Promise<{ id: string; reemplazadas: string[] }> {
  const previas = await tx.cotizacion.findMany({ where: { prospecto_id: d.prospectoId, programa_id: d.programaId, estatus: "vigente" }, select: { id: true } });
  if (previas.length > 0) await tx.cotizacion.updateMany({ where: { id: { in: previas.map((c) => c.id) } }, data: { estatus: "vencida" } });
  const creada = await tx.cotizacion.create({
    data: altaConAlcance({
      lead_id: d.leadId,
      prospecto_id: d.prospectoId,
      programa_id: d.programaId,
      sucursal_id: d.sucursalId,
      origen: d.origen,
      conversacion_id: d.conversacionId ?? null,
      creado_por_usuario_id: d.creadoPorUsuarioId ?? null,
      fecha: aFecha(d.fecha),
      vigente_hasta: aFecha(d.vigenteHasta),
      snapshot: d.snapshot as unknown as ValorJson,
    }),
    select: { id: true },
  });
  return { id: creada.id, reemplazadas: previas.map((c) => c.id) };
}

/** La cotización vigente más reciente que el bot le mandó a este prospecto en esta conversación. */
export async function cotizacionDelBot(tx: Consultas, conversacionId: string, prospectoId: string) {
  return tx.cotizacion.findFirst({
    where: { conversacion_id: conversacionId, prospecto_id: prospectoId, origen: "bot", estatus: "vigente" },
    orderBy: [{ creado_en: "desc" }, { id: "desc" }],
  });
}

/**
 * Los horarios que se le numeraron al contacto en esa cotización (los del snapshot guardado) y el que eligió y está
 * por confirmar, si lo hay.
 */
export async function horariosCotizadosAlContacto(tx: Consultas, conversacionId: string, prospectoId: string): Promise<{ opciones: OpcionHorario[]; grupoElegidoId: string | null } | null> {
  const c = await cotizacionDelBot(tx, conversacionId, prospectoId);
  return c ? { opciones: opcionesDeSnapshot(c.snapshot), grupoElegidoId: c.grupo_elegido_id } : null;
}

/**
 * Anota el horario que eligió el contacto en su cotización del bot (null = lo descartó). El grupo tiene que ser del
 * programa cotizado.
 * Devuelve false si no hay cotización a la que anotárselo.
 */
export async function elegirHorario(tx: Consultas, d: { conversacionId: string; prospectoId: string; grupoId: string | null }): Promise<boolean> {
  const c = await cotizacionDelBot(tx, d.conversacionId, d.prospectoId);
  if (!c) return false;
  if (d.grupoId !== null && !(await tx.grupo.findFirst({ where: { id: d.grupoId, programa_id: c.programa_id }, select: { id: true } }))) {
    throw new RangeError("El horario elegido no es de un grupo del programa cotizado");
  }
  const r = await tx.cotizacion.updateMany({ where: { id: c.id, estatus: "vigente" }, data: { grupo_elegido_id: d.grupoId } });
  return r.count === 1;
}

/**
 * Pasa a `vencida` las cotizaciones vigentes cuyo último día ya pasó en CUALQUIER zona horaria (un día entero de
 * margen sobre la fecha UTC: nunca vence una antes de tiempo). Idempotente. Devuelve cuántas venció.
 */
export async function vencerCotizaciones(db: BaseDatos | Consultas, ahora: Date): Promise<number> {
  const hoyUtc = ahora.toISOString().slice(0, 10);
  const r = await db.cotizacion.updateMany({ where: { estatus: "vigente", vigente_hasta: { lt: aFecha(sumarDias(hoyUtc, -1)) } }, data: { estatus: "vencida" } });
  return r.count;
}
