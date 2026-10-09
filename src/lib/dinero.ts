// Dinero. UNA sola forma de calcularlo en todo el sistema (C2): CENTAVOS ENTEROS en `bigint`.
//
//   $1,234.50  ==  123450n
//
// Nunca punto flotante: `0.1 + 0.2 !== 0.3` en JavaScript, y un descuento del 15 % de $1,234.50 no
// puede depender de eso. Por eso `parseFloat`, `Number(importe)` y `.toNumber()` sobre dinero están
// prohibidos (`npm run check:dinero`). Las columnas son `Decimal(12,2)`; se convierten con `deDecimal`
// (exacto: pasa por el texto de dos decimales) y se escriben con `aTexto`.
//
// REDONDEO (definido y único): cuando una operación produce fracciones de centavo (un porcentaje, un
// reparto) se redondea al centavo MÁS CERCANO y, si queda justo a la mitad, ALEJÁNDOSE DE CERO
// («mitad hacia arriba» en valor absoluto): 0.5 centavo → 1 centavo; -0.5 → -1. Es el redondeo que
// espera una persona con una calculadora. En un reparto (`repartir`) no se pierde ni se inventa un
// centavo: el resto se reparte de uno en uno a las primeras partes.
//
// Los importes de entrada de la API llegan como TEXTO («1234.50»), nunca como número JSON.

export type Centavos = bigint;

const CERO = 0n;

export class ErrorDeDinero extends Error {}

/** Tope de lo que cabe en `Decimal(12,2)`: 9 999 999 999.99. */
export const MAXIMO_DECIMAL_12_2: Centavos = 999_999_999_999n;

const FORMA = /^(-?)(\d{1,15})(?:\.(\d{1,2}))?$/;

/** «1234.50» / «1234.5» / «1234» / «-0.05» → centavos. Estricto: sin comas, sin símbolo, a lo más dos decimales (no redondea en silencio). */
export function deTexto(texto: string): Centavos {
  const m = FORMA.exec(texto);
  if (!m) throw new ErrorDeDinero(`Importe inválido: «${texto}» (usa dígitos con a lo más dos decimales, p. ej. 1234.50)`);
  const [, signo, enteros, decimales = ""] = m as unknown as [string, string, string, string | undefined];
  const centavos = BigInt(enteros) * 100n + BigInt(decimales.padEnd(2, "0"));
  return signo === "-" ? -centavos : centavos;
}

/** Centavos → «1234.50» (siempre dos decimales; para escribir en `Decimal(12,2)` y en JSON). */
export function aTexto(c: Centavos): string {
  const negativo = c < CERO;
  const abs = negativo ? -c : c;
  const enteros = abs / 100n;
  const decimales = abs % 100n;
  return `${negativo ? "-" : ""}${enteros}.${decimales.toString().padStart(2, "0")}`;
}

/** Un `Decimal` de Prisma (o cualquiera con `toFixed`) → centavos, sin pasar por flotantes. */
export function deDecimal(d: { toFixed(decimales: number): string }): Centavos {
  return deTexto(d.toFixed(2));
}

/** ¿Es un importe válido (entero `bigint`)? */
export const esCentavos = (x: unknown): x is Centavos => typeof x === "bigint";

/** Formato para personas, es-MX: `$1,234.50`, `-$12.00`. Exacto (formatea el texto decimal, no un flotante). */
export function formatear(c: Centavos, moneda = "MXN"): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: moneda }).format(aTexto(c) as `${number}`);
}

export function sumar(...importes: Centavos[]): Centavos {
  let total = CERO;
  for (const i of importes) total += i;
  return total;
}

export const restar = (a: Centavos, b: Centavos): Centavos => a - b;

/** Un importe por una cantidad entera de unidades (n ≥ 0): 3 mensualidades. */
export function multiplicar(c: Centavos, unidades: number): Centavos {
  if (!Number.isInteger(unidades) || unidades < 0) throw new ErrorDeDinero(`Cantidad inválida: ${unidades}`);
  return c * BigInt(unidades);
}

export const minimo = (a: Centavos, b: Centavos): Centavos => (a < b ? a : b);
export const maximo = (a: Centavos, b: Centavos): Centavos => (a > b ? a : b);

/** Nunca por debajo de cero: un descuento mayor que el monto deja el monto en 0. */
export const noNegativo = (c: Centavos): Centavos => (c < CERO ? CERO : c);

/** num/den redondeado al entero más cercano, alejándose de cero en la mitad. `den` > 0. */
function dividirRedondeando(num: bigint, den: bigint): bigint {
  if (den <= CERO) throw new ErrorDeDinero("División entre cero o negativa");
  const negativo = num < CERO;
  const abs = negativo ? -num : num;
  const cociente = (abs * 2n + den) / (2n * den);
  return negativo ? -cociente : cociente;
}

const FORMA_PORCENTAJE = /^(\d{1,4})(?:\.(\d{1,2}))?$/;

/** «15» / «12.5» / «33.33» → centésimas de punto porcentual (15 % = 1500). Hasta 9999.99 %. */
export function porcentajeABasisPoints(porcentaje: string): bigint {
  const m = FORMA_PORCENTAJE.exec(porcentaje);
  if (!m) throw new ErrorDeDinero(`Porcentaje inválido: «${porcentaje}» (dígitos con a lo más dos decimales, p. ej. 15 o 12.5)`);
  return BigInt(m[1]!) * 100n + BigInt((m[2] ?? "").padEnd(2, "0"));
}

/**
 * El `porcentaje` % de un importe, redondeado al centavo (mitad alejándose de cero).
 * `porcentaje("15")` de $1,234.50 = $185.18 (185.175 → 185.18).
 */
export function porcentaje(c: Centavos, porcentaje: string): Centavos {
  return dividirRedondeando(c * porcentajeABasisPoints(porcentaje), 10_000n);
}

/**
 * Un importe menos su descuento porcentual (el descuento se redondea al centavo, no el resultado):
 * `descuentoPorcentual(123450n, "15")` → { descuento: 18518n, final: 104932n }.
 */
export function descuentoPorcentual(c: Centavos, pct: string): { descuento: Centavos; final: Centavos } {
  const descuento = porcentaje(c, pct);
  return { descuento, final: c - descuento };
}

/**
 * Un importe entre `n` (>= 1) al centavo MÁS CERCANO, la mitad alejándose de cero: un costo promedio (gasto / alumnos). Para REPARTIR un total sin perder ni inventar centavos usa
 * `repartir`. El divisor es un entero: no hay división por cero (lanza) ni flotantes.
 */
export function dividir(c: Centavos, n: number): Centavos {
  if (!Number.isInteger(n) || n < 1) throw new ErrorDeDinero(`Divisor inválido: ${n}`);
  return dividirRedondeando(c, BigInt(n));
}

/** Reparte `total` en `partes` partes iguales sin perder ni inventar centavos: el resto, de uno en uno a las primeras. */
export function repartir(total: Centavos, partes: number): Centavos[] {
  if (!Number.isInteger(partes) || partes < 1) throw new ErrorDeDinero(`Partes inválidas: ${partes}`);
  const n = BigInt(partes);
  const negativo = total < CERO;
  const abs = negativo ? -total : total;
  const base = abs / n;
  const resto = Number(abs % n);
  return Array.from({ length: partes }, (_, i) => {
    const parte = base + (i < resto ? 1n : CERO);
    return negativo ? -parte : parte;
  });
}

/**
 * Una CANTIDAD entera (meses, piezas) guardada en una columna `Decimal` («2.00» → 2). Lanza si no es un
 * entero. Existe para no usar `Number()` sobre columnas decimales en las zonas de dinero.
 */
export function cantidadEntera(texto: string): number {
  const c = deTexto(texto);
  if (c % 100n !== CERO) throw new ErrorDeDinero(`Se esperaba una cantidad entera y llegó «${texto}»`);
  return Number(c / 100n);
}

/** ¿Cabe en `Decimal(12,2)` y no es negativo? Para validar entradas de precios. */
export const cabeEnDecimal = (c: Centavos): boolean => c >= CERO && c <= MAXIMO_DECIMAL_12_2;
