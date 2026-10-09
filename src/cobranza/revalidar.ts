// Antes de mandar un recordatorio de pago (H6): ¿sigue valiendo? PURO. Lo que se programó hace días puede haber cambiado: la familia pagó, el cargo se cancelaron, la inscripción se dio de baja.
// El motor llama a esto al ejecutar; además, al saldar o cancelar un cargo (o dar de baja la inscripción) las ejecuciones aún no reclamadas se CANCELAN (`cancelarEjecucionesDeCobro`).

import type { FechaISO } from "../catalogo/precios.ts";
import type { EventoDeCobranza } from "./plan.ts";

export interface CargoParaCobrar {
  estatus: "pendiente" | "pagado" | "vencido" | "cancelado";
  vencimiento: FechaISO;
  inscripcionEstatus: "activa" | "congelada" | "baja" | null;
}

export type Revalidacion = { ok: true } | { ok: false; motivo: "cargo_cancelado" | "cargo_saldado" | "inscripcion_baja" | "cargo_no_vencido" | "evento_pasado" };

export function revalidarCobro(evento: EventoDeCobranza, c: CargoParaCobrar, hoy: FechaISO): Revalidacion {
  if (c.estatus === "cancelado") return { ok: false, motivo: "cargo_cancelado" };
  if (c.estatus === "pagado") return { ok: false, motivo: "cargo_saldado" };
  if (c.inscripcionEstatus === "baja") return { ok: false, motivo: "inscripcion_baja" };
  // «Vencido» solo se cobra si ya venció; «por vencer», solo hasta el día de vencimiento inclusive.
  if (evento === "cargo_vencido" && !(c.vencimiento < hoy)) return { ok: false, motivo: "cargo_no_vencido" };
  if (evento === "cargo_por_vencer" && c.vencimiento < hoy) return { ok: false, motivo: "evento_pasado" };
  return { ok: true };
}
