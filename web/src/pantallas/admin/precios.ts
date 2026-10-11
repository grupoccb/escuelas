// Lo puro de «Precios» (R7b): en qué estado está cada vigencia del historial y cómo se dice su rango en palabras («Desde el 1 de enero de 2027 · abierta»,
// «1 de agosto al 31 de diciembre de 2026»). Los importes no pasan por aquí: van como texto del servidor y se formatean con `lib/dinero.ts`.

import { formatearDiaYMes } from "../../lib/fechas.ts";

export type EstadoDeVigencia = "vigente" | "futura" | "pasada";

export interface Vigencia {
  vigencia_desde: string;
  vigencia_hasta: string | null;
}

/** Los días van como texto `AAAA-MM-DD`, así que comparar texto es comparar fechas. */
export function estadoDeVigencia(v: Vigencia, hoy: string): EstadoDeVigencia {
  if (v.vigencia_desde > hoy) return "futura";
  if (v.vigencia_hasta === null || v.vigencia_hasta >= hoy) return "vigente";
  return "pasada";
}

/** Siempre con el año completo en el extremo final; el de arriba lo omite cuando es el mismo año. */
export function rangoDeVigencia(v: Vigencia): string {
  const SIEMPRE_CON_AÑO = "0000-01-01";
  if (v.vigencia_hasta === null) return `Desde el ${formatearDiaYMes(v.vigencia_desde, SIEMPRE_CON_AÑO)} · abierta`;
  return `${formatearDiaYMes(v.vigencia_desde, v.vigencia_hasta)} al ${formatearDiaYMes(v.vigencia_hasta, SIEMPRE_CON_AÑO)}`;
}

export const TEXTO_DE_VIGENCIA: Record<EstadoDeVigencia, string> = { vigente: "Vigente", futura: "Futura", pasada: "Pasada" };
