// Cobranza (H6): CUÁNDO se le recuerda a una familia su pago. PURO: sin base de datos ni reloj.
//
// Dos eventos del motor de automatizaciones (la entidad es el `cargo`):
//   · `cargo_por_vencer`: ANTES del vencimiento. `offset_minutos` es NEGATIVO y se mide desde el INICIO del día de vencimiento (calendario local de la sucursal que cobra):
//     -4320 = 3 días antes (a esa medianoche, recorrido al horario de envío). Sale a lo más hasta el final del día de vencimiento; después de eso se descarta (invariante 14).
//   · `cargo_vencido`: DESPUÉS de vencer. La referencia es el inicio del día siguiente al vencimiento (cuando el cargo ya está vencido) y `offset_minutos` los minutos
//     después (1440 = un día después). `max_intentos` es el tope de recordatorios; el intento n sale `espaciado_minutos` (7 días por omisión) después del ENVÍO del n−1 (nunca antes de lo que marca el calendario del vencimiento), y solo si el
//     anterior salió y la familia no ha pagado.
// Todo lo que cae fuera de 09:00–20:00 de la sucursal se recorre al siguiente horario válido (nada de cobranza a las 6 a. m.): eso lo hace quien programa y lo vuelve a
// exigir MessagingProvider al enviar.

import type { FechaISO } from "../catalogo/precios.ts";
import { instanteLocal } from "../mensajeria/reglas.ts";
import { partesDeFecha } from "../lib/edad.ts";

export const MINUTO_MS = 60_000;
export const DIA_MS = 24 * 60 * MINUTO_MS;
/** Separación entre recordatorios de un cargo vencido cuando la automatización no dice otra cosa. */
export const ESPACIADO_POR_OMISION_MIN = 7 * 24 * 60;
/** No se persigue deuda que venció hace más de esto (para eso está la tarea del asesor): al encender la automatización no se le escribe de golpe a toda la cartera vieja. */
export const ATRASO_MAXIMO_POR_OMISION_DIAS = 60;

export type EventoDeCobranza = "cargo_por_vencer" | "cargo_vencido";

/** Medianoche local (inicio del día) de una fecha en esa zona. */
export function inicioDelDia(fecha: FechaISO, zona: string): Date {
  const { anio, mes, dia } = partesDeFecha(fecha);
  return instanteLocal(anio, mes, dia, 0, zona);
}

/** El instante de referencia de un evento: el inicio del día de vencimiento (por vencer) o el inicio del día siguiente (vencido). */
export function referenciaDeCobranza(evento: EventoDeCobranza, vencimiento: FechaISO, zona: string): Date {
  const inicio = inicioDelDia(vencimiento, zona);
  return evento === "cargo_por_vencer" ? inicio : inicioDelDia(diaSiguiente(vencimiento), zona);
}

function diaSiguiente(f: FechaISO): FechaISO {
  const d = new Date(`${f}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Cuándo toca el recordatorio número `ocurrencia` (1 en adelante), sin recorrer al horario de envío.
 * V13-fix (EV-05): el espaciado cuenta desde el ENVÍO del anterior (`anteriorEnviadoEn`), no solo desde el vencimiento: si el primer recordatorio salió tarde (la automatización o
 * el módulo de finanzas estuvieron apagados y se encendieron semanas después) el segundo ya no sale al día siguiente porque «su fecha» quedó en el pasado. Nunca sale antes de lo que
 * decía el calendario del vencimiento.
 */
export function nominalDeRecordatorio(evento: EventoDeCobranza, vencimiento: FechaISO, zona: string, a: { offsetMinutos: number; espaciadoMinutos: number | null }, ocurrencia: number, anteriorEnviadoEn: Date | null = null): Date {
  const ref = referenciaDeCobranza(evento, vencimiento, zona).getTime();
  const espaciado = a.espaciadoMinutos ?? ESPACIADO_POR_OMISION_MIN;
  const delCalendario = ref + (a.offsetMinutos + (ocurrencia - 1) * espaciado) * MINUTO_MS;
  if (ocurrencia <= 1 || anteriorEnviadoEn === null) return new Date(delCalendario);
  return new Date(Math.max(delCalendario, anteriorEnviadoEn.getTime() + espaciado * MINUTO_MS));
}

/** Hasta cuándo sirve un recordatorio de «por vencer»: el final del día de vencimiento (exclusivo). Pasado eso, ya no es «por vencer». */
export function limiteDeRecordatorioPorVencer(vencimiento: FechaISO, zona: string): Date {
  return inicioDelDia(diaSiguiente(vencimiento), zona);
}

/**
 * ¿Qué recordatorio toca programar ahora? `previa` es la última ejecución de esa automatización para el cargo (o null). Devuelve el número de ocurrencia o null.
 * Reglas: el primero cuando su momento ya llegó; los siguientes solo si el anterior SALIÓ, sin pasar de `maxIntentos`; lo que vence hace más de `atrasoMaximoDias` no se persigue.
 */
export function ocurrenciaPorProgramar(
  evento: EventoDeCobranza,
  p: { vencimiento: FechaISO; zona: string; ahora: Date; maxIntentos: number; offsetMinutos: number; espaciadoMinutos: number | null; atrasoMaximoDias: number; previa: { ocurrencia: number; salio: boolean; enviadoEn?: Date | null } | null },
): number | null {
  const n = p.previa ? p.previa.ocurrencia + 1 : 1;
  if (n > p.maxIntentos) return null;
  if (p.previa && !p.previa.salio) return null;
  if (p.ahora.getTime() - referenciaDeCobranza(evento, p.vencimiento, p.zona).getTime() > p.atrasoMaximoDias * DIA_MS) return null;
  const nominal = nominalDeRecordatorio(evento, p.vencimiento, p.zona, { offsetMinutos: p.offsetMinutos, espaciadoMinutos: p.espaciadoMinutos }, n, p.previa?.enviadoEn ?? null);
  if (nominal.getTime() > p.ahora.getTime()) return null;
  if (evento === "cargo_por_vencer" && p.ahora.getTime() >= limiteDeRecordatorioPorVencer(p.vencimiento, p.zona).getTime()) return null;
  return n;
}

/** `condiciones.max_atraso_dias` (1 a 365) de la automatización, o el valor por omisión. */
export function atrasoMaximoDias(condiciones: unknown): number {
  const v = typeof condiciones === "object" && condiciones !== null && !Array.isArray(condiciones) ? (condiciones as Record<string, unknown>)["max_atraso_dias"] : undefined;
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 365 ? v : ATRASO_MAXIMO_POR_OMISION_DIAS;
}
