// Edad en años cumplidos a una fecha de calendario (C5). Pura y determinista: sin reloj, sin zonas
// horarias. Las fechas son texto `AAAA-MM-DD` (la fecha local de la escuela).
//
// Regla: se cumple un año el día del cumpleaños; quien nació un 29 de febrero cumple el 1 de marzo en los años
// que no son bisiestos (la convención civil más común: el 28 de febrero todavía no los cumple). Es la
// comparación natural de (mes, día): 2-28 < 2-29 < 3-01.

export type FechaISO = string;

const FORMATO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Año, mes y día de una fecha válida `AAAA-MM-DD`, o lanza RangeError (también con un 31 de abril). */
export function partesDeFecha(fecha: FechaISO): { anio: number; mes: number; dia: number } {
  const m = FORMATO.exec(fecha);
  if (!m) throw new RangeError(`Fecha inválida: «${fecha}» (se espera AAAA-MM-DD)`);
  const d = new Date(`${fecha}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) throw new RangeError(`Fecha inexistente: «${fecha}»`);
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

/**
 * Años cumplidos por quien nació en `fechaNacimiento` el día `fecha`. Lanza RangeError si todavía no había
 * nacido (`fecha` anterior al nacimiento): quien llama decide qué hacer (p. ej. «aún no es elegible»).
 */
export function edadCumplida(fechaNacimiento: FechaISO, fecha: FechaISO): number {
  const nac = partesDeFecha(fechaNacimiento);
  const hoy = partesDeFecha(fecha);
  if (fechaNacimiento > fecha) throw new RangeError(`La fecha ${fecha} es anterior al nacimiento (${fechaNacimiento})`);
  const yaCumplio = hoy.mes > nac.mes || (hoy.mes === nac.mes && hoy.dia >= nac.dia);
  return hoy.anio - nac.anio - (yaCumplio ? 0 : 1);
}
