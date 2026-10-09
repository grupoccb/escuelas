// Tarea para el asesor cuando una deuda pasa de un umbral de días (H6). El recordatorio automático es lo primero; cuando la deuda sigue y ya lleva `umbral_dias_deuda` días
// vencida (configuración de la organización, 15 por omisión), una persona decide cómo cobrarla.
//
//   · UNA tarea por familia con deuda vencida (la pendiente), ligada a su cargo vencido MÁS ANTIGUO; nunca más de una por cargo, sin importar su estado (si una persona la resuelve y la
//     deuda sigue, no se vuelve a crear: sería un ciclo). Si ese cargo se salda, otro cargo vencido puede abrir la suya.
//   · Se RESUELVE sola (`hecha`) cuando su cargo ya no está abierto o la familia ya no tiene deuda por encima del umbral.
//   · No se crea por una inscripción dada de baja (su deuda es un asunto distinto: la baja tiene su propio seguimiento).
//   · El texto lleva el nombre de pila del alumno, los días de atraso y el monto: nunca datos de salud.

import { deFecha, type FechaISO } from "../catalogo/precios.ts";
import { altaConAlcance, type BaseDatos } from "../datos/alcance.ts";
import { esViolacionUnica } from "../datos/prisma.ts";
import { deDecimal, formatear, sumar } from "../lib/dinero.ts";
import { fechaLocal } from "../lib/horario.ts";
import { diasEntre } from "../lib/periodo.ts";

export interface ResumenDeTareasDeCobranza {
  creadas: number;
  resueltas: number;
}

export async function barrerTareasDeCobranza(db: BaseDatos, ahora: Date, umbralDias: number): Promise<ResumenDeTareasDeCobranza> {
  const resumen: ResumenDeTareasDeCobranza = { creadas: 0, resueltas: 0 };
  const abiertos = await db.cargo.findMany({
    where: { estatus: { in: ["pendiente", "vencido"] }, OR: [{ inscripcion_id: null }, { inscripcion: { estatus: { not: "baja" } } }] },
    orderBy: [{ fecha_vencimiento: "asc" }, { id: "asc" }],
    select: { id: true, tutor_id: true, inscripcion_id: true, fecha_vencimiento: true, monto_final: true, monto_pagado: true, alumno: { select: { nombre: true } }, inscripcion: { select: { lead_id: true } }, sucursal: { select: { zona_horaria: true } } },
  });
  // Por familia: los cargos con atraso >= umbral (el más antiguo primero, por el orden de la consulta).
  const porTutor = new Map<string, { cargo: (typeof abiertos)[number]; atraso: number }[]>();
  const hoyDe = new Map<string, FechaISO>();
  for (const c of abiertos) {
    const zona = c.sucursal.zona_horaria;
    const hoy = hoyDe.get(zona) ?? hoyDe.set(zona, fechaLocal(ahora, zona)).get(zona)!;
    const atraso = diasEntre(deFecha(c.fecha_vencimiento), hoy);
    if (atraso < umbralDias) continue;
    (porTutor.get(c.tutor_id) ?? porTutor.set(c.tutor_id, []).get(c.tutor_id)!).push({ cargo: c, atraso });
  }

  const pendientes = await db.tarea_asesor.findMany({ where: { tipo: "deuda_vencida", estado: "pendiente", cargo_id: { not: null } }, select: { id: true, cargo: { select: { id: true, tutor_id: true, estatus: true } } } });
  const conTareaPendiente = new Set<string>();
  for (const t of pendientes) {
    if (!t.cargo) continue;
    const sigue = (porTutor.get(t.cargo.tutor_id) ?? []).some((x) => x.cargo.id === t.cargo!.id);
    if (sigue) {
      conTareaPendiente.add(t.cargo.tutor_id);
      continue;
    }
    // El cargo se saldó o se canceló, o la familia ya no tiene deuda por encima del umbral: se resuelve sola.
    const r = await db.tarea_asesor.updateMany({ where: { id: t.id, estado: "pendiente" }, data: { estado: "hecha", resuelta_en: ahora } });
    resumen.resueltas += r.count;
  }

  for (const [tutorId, lista] of porTutor) {
    if (conTareaPendiente.has(tutorId)) continue;
    const { cargo } = lista[0]!;
    // Nunca más de una tarea por cargo, sin importar su estado.
    if (await db.tarea_asesor.findFirst({ where: { cargo_id: cargo.id, tipo: "deuda_vencida" }, select: { id: true } })) continue;
    const saldo = sumar(...lista.map((x) => deDecimal(x.cargo.monto_final) - deDecimal(x.cargo.monto_pagado)));
    const mayor = lista.reduce((m, x) => (x.atraso > m ? x.atraso : m), 0);
    try {
      await db.tarea_asesor.create({
        data: altaConAlcance({
          lead_id: cargo.inscripcion?.lead_id ?? null,
          inscripcion_id: cargo.inscripcion_id,
          cargo_id: cargo.id,
          tipo: "deuda_vencida" as const,
          descripcion: `La familia de ${cargo.alumno.nombre} debe ${formatear(saldo)} (${lista.length} ${lista.length === 1 ? "cargo vencido" : "cargos vencidos"}); el más antiguo lleva ${mayor} ${mayor === 1 ? "día" : "días"} de atraso. Llámales o escríbeles para acordar el pago.`,
        }),
      });
      resumen.creadas++;
    } catch (e) {
      if (!esViolacionUnica(e)) throw e;
    }
  }
  return resumen;
}

export interface TareaDeCobro {
  cargoId: string;
  inscripcionId: string | null;
  leadId: string | null;
  tipo: "cobranza_sin_canal";
  descripcion: string;
}

/** Una tarea pendiente por (cargo, tipo): no se puede avisar por WhatsApp y una persona cobra. Devuelve true si la creó. */
export async function asegurarTareaDeCobro(db: BaseDatos, t: TareaDeCobro): Promise<boolean> {
  if (await db.tarea_asesor.findFirst({ where: { cargo_id: t.cargoId, tipo: t.tipo, estado: "pendiente" }, select: { id: true } })) return false;
  try {
    await db.tarea_asesor.create({ data: altaConAlcance({ lead_id: t.leadId, inscripcion_id: t.inscripcionId, cargo_id: t.cargoId, tipo: t.tipo, descripcion: t.descripcion }) });
    return true;
  } catch (e) {
    if (!esViolacionUnica(e)) throw e;
    return false;
  }
}
