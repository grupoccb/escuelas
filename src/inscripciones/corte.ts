// Día de corte del pago (F3). PURO: sin reloj ni zonas horarias; las fechas son texto `AAAA-MM-DD` del calendario local.
//
// REGLA DEL FIN DE MES. `dia_corte_pago` es un entero de 1 a 31 que se guarda tal cual lo eligió la familia. En un mes que no tiene ese
// día el corte cae en el ÚLTIMO día del mes: quien corta el 31 corta el 30 de abril y el 28 (o 29) de febrero; quien corta el 30, el 28 de
// febrero. Nunca se salta al mes siguiente ni se guarda el día "corregido": el 31 vuelve a ser 31 en mayo. (Alternativa descartada: pasar el
// corte al día 1 del mes siguiente, que dejaría a la familia sin corte en febrero y con dos en marzo.)

import { partesDeFecha, type FechaISO } from "../lib/edad.ts";

export const DIA_DE_CORTE_MINIMO = 1;
export const DIA_DE_CORTE_MAXIMO = 31;

export const esDiaDeCorteValido = (dia: number): boolean => Number.isInteger(dia) && dia >= DIA_DE_CORTE_MINIMO && dia <= DIA_DE_CORTE_MAXIMO;

/** Cuántos días tiene el mes (1 a 12) de ese año, con bisiestos. */
export function ultimoDiaDelMes(anio: number, mes: number): number {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new RangeError(`Mes inválido: ${mes}`);
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

const dos = (n: number): string => String(n).padStart(2, "0");

/** El día en que cae el corte de ese mes: el pedido, o el último del mes si el mes es más corto. */
export function diaDeCorteEnMes(dia: number, anio: number, mes: number): number {
  if (!esDiaDeCorteValido(dia)) throw new RangeError(`Día de corte inválido: ${dia} (de 1 a 31)`);
  return Math.min(dia, ultimoDiaDelMes(anio, mes));
}

/** La fecha de corte de un mes (`AAAA-MM-DD`). */
export function fechaDeCorte(dia: number, anio: number, mes: number): FechaISO {
  return `${String(anio).padStart(4, "0")}-${dos(mes)}-${dos(diaDeCorteEnMes(dia, anio, mes))}`;
}

/** El primer corte que cae en `desde` o después. */
export function proximoCorte(dia: number, desde: FechaISO): FechaISO {
  const { anio, mes } = partesDeFecha(desde);
  const esteMes = fechaDeCorte(dia, anio, mes);
  if (esteMes >= desde) return esteMes;
  return mes === 12 ? fechaDeCorte(dia, anio + 1, 1) : fechaDeCorte(dia, anio, mes + 1);
}

/** El día de corte por omisión: el día del mes en que empieza el alumno (se queda en 1 a 31 porque es un día del calendario). */
export function diaDeCortePorOmision(fechaInicio: FechaISO): number {
  return partesDeFecha(fechaInicio).dia;
}
