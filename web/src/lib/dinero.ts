// Dinero en la interfaz: SIEMPRE texto decimal exacto del servidor («1234.50») y centavos enteros (`bigint`); nunca `Number` ni `parseFloat`
// (`npm run check:dinero` lo vigila en `web/src/pantallas/recepcion/`, `.../conversion/` y aquí). El formato es-MX no pierde precisión:
// la parte entera se agrupa como `bigint` y los centavos se pegan como texto.

const IMPORTE = /^-?\d{1,12}(?:\.\d{1,2})?$/;

export const CERO = "0.00";

export function esImporte(texto: string): boolean {
  return IMPORTE.test(texto);
}

/** «1234.5» → 123450n. Lanza si no es un importe (no hay conversión silenciosa). */
export function aCentavos(texto: string): bigint {
  if (!IMPORTE.test(texto)) throw new RangeError(`No es un importe: «${texto}»`);
  const negativo = texto.startsWith("-");
  const [entero = "0", dec = ""] = (negativo ? texto.slice(1) : texto).split(".");
  const c = BigInt(entero) * 100n + BigInt(dec.padEnd(2, "0"));
  return negativo ? -c : c;
}

/** 123450n → «1234.50». */
export function deCentavos(centavos: bigint): string {
  const negativo = centavos < 0n;
  const abs = negativo ? -centavos : centavos;
  const dec = (abs % 100n).toString().padStart(2, "0");
  return `${negativo ? "-" : ""}${(abs / 100n).toString()}.${dec}`;
}

export function sumar(...importes: string[]): string {
  return deCentavos(importes.reduce((acc, t) => acc + aCentavos(t), 0n));
}

export function restar(a: string, b: string): string {
  return deCentavos(aCentavos(a) - aCentavos(b));
}

export function comparar(a: string, b: string): -1 | 0 | 1 {
  const x = aCentavos(a);
  const y = aCentavos(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export const esPositivo = (t: string): boolean => aCentavos(t) > 0n;

/** El menor de dos importes. */
export function minimo(a: string, b: string): string {
  return comparar(a, b) <= 0 ? a : b;
}

const AGRUPAR = new Intl.NumberFormat("es-MX", { useGrouping: true, maximumFractionDigits: 0 });

/** «1234.5» → «$1,234.50». Un valor ausente o que no es importe se muestra como «—» (nunca se inventa un 0). */
export function formatear(texto: string | null | undefined, vacio = "—"): string {
  if (texto === null || texto === undefined || !IMPORTE.test(texto)) return vacio;
  const c = aCentavos(texto);
  const abs = c < 0n ? -c : c;
  return `${c < 0n ? "-" : ""}$${AGRUPAR.format(abs / 100n)}.${(abs % 100n).toString().padStart(2, "0")}`;
}

/**
 * Lo que alguien teclea («$1,234.5», «1 234», «300») → importe del servidor («1234.50»), o `null` si no es un importe válido
 * (letras, más de dos decimales, negativo, vacío). Acepta «,» como separador de miles, no como decimal.
 */
export function normalizarCaptura(entrada: string): string | null {
  const limpio = entrada.replace(/[\s$]/g, "").replace(/,/g, "");
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(limpio) && !/^\.\d{1,2}$/.test(limpio)) return null;
  const [entero = "0", dec = ""] = limpio.split(".");
  return `${entero === "" ? "0" : entero}.${dec.padEnd(2, "0")}`;
}
