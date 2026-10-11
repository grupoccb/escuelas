// El resumen fijo de la inscripción (R5a, README «Inscripción»): lo que se cobra al inscribir, sumado. Los importes son texto decimal del servidor y se suman con `lib/dinero.ts` (centavos): nunca con números.

import { sumar } from "../../lib/dinero.ts";

/** Lo que el cotizador dice que cuesta un niño ahora (con las promociones que aplican): inscripción y primera mensualidad, y cuántos meses gratis. */
export interface PrecioDeNino {
  inscripcion: string;
  mensualidad: string;
  mesesGratis: number;
}

/**
 * El primer pago de la familia: inscripción más primera mensualidad de cada niño. `null` si no se puede decir con honestidad: falta el precio de alguno (aún sin grupo o sin precio vigente),
 * no hay niños, o alguno tiene meses gratis (ahí quién cobra qué lo decide el servidor al inscribir y sumar sería inventar).
 */
export function primerPago(precios: readonly (PrecioDeNino | null)[]): string | null {
  if (precios.length === 0 || precios.some((p) => p === null || p.mesesGratis > 0)) return null;
  return sumar(...precios.flatMap((p) => (p ? [p.inscripcion, p.mensualidad] : [])));
}
