// Lo que no necesita React de «Hoy» del maestro (R4b): las horas en 12 h, la marca «Ahora … · siguiente en …» entre clases y el horario de un grupo. Puro: se prueba con `node --test`.
// Nada de esto trae valores de ejemplo: la hora sale del reloj y de la hora de cada clase.

import { DIAS_LARGOS, diaEnZona } from "../../lib/fechas.ts";
import type { Horario } from "../../api/tipos.ts";

const MS_MINUTO = 60_000;

/** «16:00» → { hora: «4:00», ampm: «pm» } (la hora que manda la API viene en 24 h, en la zona de la sucursal). */
export function hora12(hhmm: string): { hora: string; ampm: "am" | "pm" } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return { hora: hhmm, ampm: "am" };
  const h = Number(m[1]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return { hora: `${h12}:${m[2]}`, ampm: h >= 12 ? "pm" : "am" };
}

/** «16:00» → «4:00 pm». */
export function texto12(hhmm: string): string {
  const { hora, ampm } = hora12(hhmm);
  return `${hora} ${ampm}`;
}

/** Los minutos desde la medianoche de un instante en la zona dada (0 a 1439). */
export function minutosDelDia(ms: number, zona: string): number {
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const h = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(partes.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

/** Un instante como «4:20 pm» en la zona de la sucursal. */
export function horaDelInstante(ms: number, zona: string): string {
  const min = minutosDelDia(ms, zona);
  return texto12(`${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`);
}

/** 40 → «40 min»; 80 → «1 h 20 min»; 120 → «2 h». */
export function duracionCorta(minutos: number): string {
  const m = Math.max(0, Math.round(minutos));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h} h` : `${h} h ${m % 60} min`;
}

export interface ClaseDeLaLinea {
  id: string;
  fecha_hora: string;
  zona_horaria: string;
}

export interface MarcaDeAhora {
  /** La clase ANTES de la que va la marca (la próxima de hoy). */
  antesDeId: string;
  texto: string;
}

/**
 * La marca «Ahora 4:20 pm · siguiente en 40 min»: va antes de la próxima clase de HOY (la primera cuya hora todavía no llega). Sin una próxima clase hoy no hay marca.
 * `clasesDeHoy` viene en orden de hora. Los minutos se cuentan desde el minuto en que está el reloj (a las 4:20:40 sigue siendo «4:20»).
 */
export function marcaDeAhora(clasesDeHoy: readonly ClaseDeLaLinea[], ahoraMs: number): MarcaDeAhora | null {
  const siguiente = clasesDeHoy.find((c) => new Date(c.fecha_hora).getTime() > ahoraMs);
  if (!siguiente) return null;
  const minutoDeAhora = Math.floor(ahoraMs / MS_MINUTO);
  const minutoDeLaClase = Math.floor(new Date(siguiente.fecha_hora).getTime() / MS_MINUTO);
  const faltan = Math.max(1, minutoDeLaClase - minutoDeAhora);
  return { antesDeId: siguiente.id, texto: `Ahora ${horaDelInstante(ahoraMs, siguiente.zona_horaria)} · siguiente en ${duracionCorta(faltan)}` };
}

/** ¿La clase es del día de calendario `dia` (`AAAA-MM-DD`) en la zona de su sucursal? */
export const esDelDia = (c: ClaseDeLaLinea, dia: string): boolean => diaEnZona(c.fecha_hora, c.zona_horaria) === dia;

const DIAS_CORTOS = DIAS_LARGOS.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3));

/** «Lun y Mié 4:00 pm» (los días con la misma hora de inicio se juntan); con varias horas, «Lun 4:00 pm · Sáb 10:00 am». Vacío si el grupo no tiene horario. */
export function horarioDeGrupo(horarios: readonly Pick<Horario, "dia_semana" | "hora_inicio_min">[]): string {
  const porHora = new Map<number, number[]>();
  for (const h of [...horarios].sort((a, b) => a.hora_inicio_min - b.hora_inicio_min || a.dia_semana - b.dia_semana)) porHora.set(h.hora_inicio_min, [...(porHora.get(h.hora_inicio_min) ?? []), h.dia_semana]);
  return [...porHora]
    .map(([min, dias]) => {
      if (dias.length === 7) return `Todos los días ${texto12(`${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`)}`;
      const nombres = dias.map((d) => DIAS_CORTOS[d] ?? "?");
      const unidos = nombres.length === 1 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1] ?? ""}`;
      return `${unidos} ${texto12(`${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`)}`;
    })
    .join(" · ");
}

/** «martes 13 de octubre» → «Martes 13 de octubre» (el encabezado del resumen de «Hoy»). */
export const conInicialMayuscula = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
