// Horario de envío de la organización (V5, invariante 14). Lo que el sistema inicia solo sale entre `horario_envio_inicio_min` y `horario_envio_fin_min` de la configuración de la
// organización, hora local de la sucursal. La escuela puede ESTRECHAR 09:00–20:00 (en Administración → Configuración), nunca ampliarlo: lo impone el servidor y un CHECK en la base,
// y este módulo lo vuelve a acotar al leerlo por si una fila llegara por otra vía.
//
// Cada automatización conserva su propia ventana (que también cabe en 09:00–20:00). La ventana que cuenta es la INTERSECCIÓN de las dos: nada sale fuera de la de la escuela ni de la propia. Si no
// se tocan (la automatización solo envía de 09:00 a 10:00 y la escuela de 12:00 a 18:00), manda la de la escuela: el horario de la organización es el que protege a las familias.

import type { Consultas } from "../datos/alcance.ts";
import { leerConfiguracion } from "../configuracion/index.ts";
import { HORARIO_DE_ENVIO, type VentanaHoraria } from "./reglas.ts";

export interface HorarioDeEnvio {
  inicioMin: number;
  finMin: number;
}

/** El horario de envío de la organización del scope, siempre dentro de 09:00–20:00. */
export async function horarioDeEnvio(db: Consultas): Promise<HorarioDeEnvio> {
  const c = await leerConfiguracion(db);
  return acotado({ inicioMin: c.horarioEnvioInicioMin, finMin: c.horarioEnvioFinMin });
}

/** Nunca fuera de 09:00–20:00 ni al revés (inv. 14): lo que no cumpla vuelve al horario de siempre. */
export function acotado(h: HorarioDeEnvio): HorarioDeEnvio {
  const inicioMin = Math.max(h.inicioMin, HORARIO_DE_ENVIO.inicioMin);
  const finMin = Math.min(h.finMin, HORARIO_DE_ENVIO.finMin);
  return inicioMin < finMin ? { inicioMin, finMin } : { inicioMin: HORARIO_DE_ENVIO.inicioMin, finMin: HORARIO_DE_ENVIO.finMin };
}

/** La ventana de la organización como `VentanaHoraria` (todos los días: los días los decide cada automatización). */
export const ventanaDeLaOrganizacion = (h: HorarioDeEnvio): VentanaHoraria => ({ inicioMin: h.inicioMin, finMin: h.finMin, dias: HORARIO_DE_ENVIO.dias });

/** Las horas de la automatización recortadas al horario de la organización. PURA. */
export function estrechar<T extends { hora_inicio_min: number; hora_fin_min: number }>(a: T, h: HorarioDeEnvio): T {
  const inicio = Math.max(a.hora_inicio_min, h.inicioMin);
  const fin = Math.min(a.hora_fin_min, h.finMin);
  return inicio < fin ? { ...a, hora_inicio_min: inicio, hora_fin_min: fin } : { ...a, hora_inicio_min: h.inicioMin, hora_fin_min: h.finMin };
}

/** Atajo: lee el horario de la organización y recorta las automatizaciones. */
export async function estrecharAutomatizaciones<T extends { hora_inicio_min: number; hora_fin_min: number }>(db: Consultas, automatizaciones: readonly T[]): Promise<T[]> {
  if (automatizaciones.length === 0) return [];
  const h = await horarioDeEnvio(db);
  return automatizaciones.map((a) => estrechar(a, h));
}
