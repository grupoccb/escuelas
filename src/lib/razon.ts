// Razones y porcentajes de CONTEOS (reportes), en aritmética de enteros y con texto de salida: sin mostrar flotantes crudos. Fuera de las zonas estrictas de `check:dinero` porque
// usa `Math`; nada de aquí toca dinero (el dinero va por `src/lib/dinero.ts`).

/** `num / den` como porcentaje con un decimal («42.9»), redondeado a la mitad hacia arriba; null si `den` es 0 (nada que dividir: el reporte muestra «—»). */
export function porcentajeConUnDecimal(num: number, den: number): string | null {
  if (!Number.isInteger(num) || !Number.isInteger(den) || num < 0 || den < 0) throw new RangeError(`Conteos inválidos: ${num}/${den}`);
  if (den === 0) return null;
  const decimas = Math.floor((num * 2000 + den) / (2 * den)); // num/den en milésimas = décimas de punto porcentual, redondeado
  return `${Math.floor(decimas / 10)}.${decimas % 10}`;
}

/** Un valor opcional como texto para mostrar: «—» cuando no hay. */
export const oGuion = (v: string | number | null | undefined): string => (v === null || v === undefined ? "—" : String(v));
