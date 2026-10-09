// Periodos de cobro (`AAAA-MM`) y días entre fechas de calendario. PURO: sin reloj ni zonas horarias (las fechas son el texto `AAAA-MM-DD` del calendario
// local de la sucursal). Vive fuera de las zonas estrictas de `check:dinero` porque hace aritmética de calendario con `Math`; nada de aquí toca dinero.

import { partesDeFecha, type FechaISO } from "./edad.ts";

export type Periodo = string;

const FORMA = /^(\d{4})-(0[1-9]|1[0-2])$/;

export const esPeriodo = (p: string): boolean => FORMA.test(p);

/** El periodo (`AAAA-MM`) al que pertenece una fecha. */
export function periodoDe(fecha: FechaISO): Periodo {
  partesDeFecha(fecha); // valida
  return fecha.slice(0, 7);
}

export function partesDePeriodo(p: Periodo): { anio: number; mes: number } {
  const m = FORMA.exec(p);
  if (!m) throw new RangeError(`Periodo inválido: «${p}» (se espera AAAA-MM)`);
  return { anio: Number(m[1]), mes: Number(m[2]) };
}

/** El periodo `n` meses después (n puede ser negativo). */
export function sumarMeses(p: Periodo, n: number): Periodo {
  const { anio, mes } = partesDePeriodo(p);
  const total = anio * 12 + (mes - 1) + n;
  const a = Math.floor(total / 12);
  const m = total - a * 12 + 1;
  return `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}`;
}

/** Cuántos meses hay de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function mesesEntre(desde: Periodo, hasta: Periodo): number {
  const a = partesDePeriodo(desde);
  const b = partesDePeriodo(hasta);
  return (b.anio - a.anio) * 12 + (b.mes - a.mes);
}

/** Días de calendario de `desde` a `hasta` (negativo si `hasta` es anterior). */
export function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  partesDeFecha(desde);
  partesDeFecha(hasta);
  return Math.round((Date.parse(`${hasta}T00:00:00.000Z`) - Date.parse(`${desde}T00:00:00.000Z`)) / 86_400_000);
}

/** «noviembre de 2026» (es-MX) para mostrar un periodo. */
export function nombreDelPeriodo(p: Periodo): string {
  const { anio, mes } = partesDePeriodo(p);
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(anio, mes - 1, 1))).replace(/^(\p{L}+) (\d)/u, "$1 de $2");
}

/** Cuántos días de calendario cubren `minutos` (redondeando hacia arriba). Fuera de las zonas de dinero porque usa `Math`. */
export function diasQueCubren(minutos: number): number {
  return Math.ceil(minutos / 1440);
}
