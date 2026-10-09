// Dinero en centavos enteros (C2): conversión, formato es-MX, operaciones y el redondeo definido.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ErrorDeDinero,
  MAXIMO_DECIMAL_12_2,
  aTexto,
  cabeEnDecimal,
  deDecimal,
  deTexto,
  descuentoPorcentual,
  dividir,
  formatear,
  maximo,
  minimo,
  multiplicar,
  noNegativo,
  porcentaje,
  porcentajeABasisPoints,
  repartir,
  restar,
  sumar,
} from "./dinero.ts";

// PRNG determinista (mulberry32) para las pruebas de propiedades: sin Math.random, sin flotantes en el dinero.
function prng(semilla: number): () => number {
  let a = semilla;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const aleatorioCentavos = (r: () => number, max = 1_000_000_000): bigint => BigInt(Math.floor(r() * max));

test("deTexto: enteros, uno y dos decimales, cero, negativos; lo demás se rechaza (nunca se redondea en silencio)", () => {
  const casos: [string, bigint][] = [
    ["0", 0n], ["0.0", 0n], ["0.00", 0n], ["0.5", 50n], ["0.05", 5n], ["0.01", 1n], ["1", 100n], ["12", 1200n], ["12.3", 1230n],
    ["1234.50", 123450n], ["1234.5", 123450n], ["999999999.99", 99999999999n], ["-0.05", -5n], ["-12.30", -1230n], ["007", 700n],
  ];
  for (const [texto, esperado] of casos) assert.equal(deTexto(texto), esperado, texto);
  for (const mal of ["", " ", "1,234.50", "$12", "12.", ".5", "1.234", "1.2.3", "abc", "1e3", "NaN", "Infinity", "--1", "+5", " 12", "12 ", "１２", "1234567890123456"]) {
    assert.throws(() => deTexto(mal), ErrorDeDinero, JSON.stringify(mal));
  }
});

test("aTexto: siempre dos decimales, con signo; ida y vuelta exacta en 20 000 importes", () => {
  assert.equal(aTexto(0n), "0.00");
  assert.equal(aTexto(5n), "0.05");
  assert.equal(aTexto(50n), "0.50");
  assert.equal(aTexto(123450n), "1234.50");
  assert.equal(aTexto(-5n), "-0.05");
  assert.equal(aTexto(-123450n), "-1234.50");
  assert.equal(aTexto(99_999_999_999n), "999999999.99");
  const r = prng(7);
  for (let i = 0; i < 20_000; i++) {
    const c = aleatorioCentavos(r) * (i % 2 === 0 ? 1n : -1n);
    assert.equal(deTexto(aTexto(c)), c);
  }
});

test("deDecimal: lee un Decimal(12,2) de Prisma (o cualquiera con toFixed) sin pasar por flotantes", () => {
  assert.equal(deDecimal({ toFixed: (n) => (1234.5).toFixed(n) }), 123450n);
  assert.equal(deDecimal({ toFixed: () => "0.10" }), 10n);
  assert.equal(deDecimal({ toFixed: () => "9999999999.99" }), 999_999_999_999n);
});

test("formatear es-MX: separador de miles, dos decimales, signo; sin error de flotantes en cifras grandes", () => {
  assert.equal(formatear(123450n), "$1,234.50");
  assert.equal(formatear(0n), "$0.00");
  assert.equal(formatear(5n), "$0.05");
  assert.equal(formatear(100n), "$1.00");
  assert.equal(formatear(-123450n), "-$1,234.50");
  assert.equal(formatear(99_999_999_999n), "$999,999,999.99");
  assert.equal(formatear(MAXIMO_DECIMAL_12_2), "$9,999,999,999.99");
  assert.equal(formatear(123_456_789_012_345n), "$1,234,567,890,123.45", "más allá de 2^53 centavos no pierde un centavo");
  assert.match(formatear(123450n, "USD"), /1,234\.50/);
});

test("sumar, restar, multiplicar, mínimo, máximo y no negativo", () => {
  assert.equal(sumar(), 0n);
  assert.equal(sumar(10n, 20n, 30n), 60n);
  assert.equal(restar(100n, 130n), -30n);
  assert.equal(multiplicar(15050n, 3), 45150n);
  assert.equal(multiplicar(15050n, 0), 0n);
  assert.throws(() => multiplicar(100n, -1), ErrorDeDinero);
  assert.throws(() => multiplicar(100n, 1.5), ErrorDeDinero);
  assert.equal(minimo(3n, 5n), 3n);
  assert.equal(maximo(3n, 5n), 5n);
  assert.equal(noNegativo(-1n), 0n);
  assert.equal(noNegativo(7n), 7n);
  // La suma de centavos es exacta donde los flotantes fallan: 0.1 + 0.2.
  assert.equal(sumar(deTexto("0.10"), deTexto("0.20")), deTexto("0.30"));
  assert.notEqual(0.1 + 0.2, 0.3, "(control: con flotantes no cuadra)");
});

test("porcentajeABasisPoints: enteros, uno y dos decimales; lo demás se rechaza", () => {
  assert.equal(porcentajeABasisPoints("15"), 1500n);
  assert.equal(porcentajeABasisPoints("12.5"), 1250n);
  assert.equal(porcentajeABasisPoints("33.33"), 3333n);
  assert.equal(porcentajeABasisPoints("100"), 10000n);
  assert.equal(porcentajeABasisPoints("0"), 0n);
  for (const mal of ["", "-5", "1.234", "abc", "15%", "1,5", ".5", "10000"]) assert.throws(() => porcentajeABasisPoints(mal), ErrorDeDinero, mal);
});

test("porcentaje: 15 % de $1,234.50 es $185.18 (185.175 se redondea hacia arriba); el redondeo es mitad ALEJÁNDOSE DE CERO", () => {
  assert.equal(porcentaje(123450n, "15"), 18518n);
  assert.equal(aTexto(porcentaje(123450n, "15")), "185.18");
  const { descuento, final } = descuentoPorcentual(123450n, "15");
  assert.deepEqual([descuento, final], [18518n, 104932n]);
  assert.equal(descuento + final, 123450n, "descuento + final = original, siempre");
  // Mitades exactas: 1 centavo al 50 % = 0.5 centavo → 1.
  assert.equal(porcentaje(1n, "50"), 1n);
  assert.equal(porcentaje(3n, "50"), 2n, "1.5 → 2");
  assert.equal(porcentaje(5n, "50"), 3n, "2.5 → 3 (no a par: no es redondeo bancario)");
  assert.equal(porcentaje(-1n, "50"), -1n, "-0.5 → -1");
  assert.equal(porcentaje(-5n, "50"), -3n);
  assert.equal(porcentaje(1n, "49.99"), 0n, "0.4999 → 0");
  assert.equal(porcentaje(1n, "50.01"), 1n);
  // Extremos.
  assert.equal(porcentaje(123450n, "0"), 0n);
  assert.equal(porcentaje(123450n, "100"), 123450n);
  assert.equal(porcentaje(0n, "37.5"), 0n);
  assert.equal(porcentaje(10000n, "12.5"), 1250n);
  assert.equal(porcentaje(99_999_999_999n, "100"), 99_999_999_999n);
  // Casos conocidos.
  assert.equal(porcentaje(100000n, "10"), 10000n);
  assert.equal(porcentaje(99900n, "33.33"), 33297n, "999.00 × 33.33 % = 332.9667 → 332.97");
  assert.equal(porcentaje(150000n, "7.5"), 11250n);
  assert.equal(porcentaje(199999n, "20"), 40000n, "399.998 → 400.00");
});

test("porcentaje: coincide con la definición (redondeo de num/den) en 30 000 casos aleatorios y es monótono", () => {
  const r = prng(42);
  for (let i = 0; i < 30_000; i++) {
    const c = aleatorioCentavos(r, 10_000_000);
    const bp = BigInt(Math.floor(r() * 1_000_000));
    const pct = `${bp / 100n}.${(bp % 100n).toString().padStart(2, "0")}`;
    const exacto = c * bp; // c × bp / 10 000, con resto
    const q = exacto / 10_000n;
    const resto = exacto % 10_000n;
    const esperado = resto * 2n >= 10_000n ? q + 1n : q;
    assert.equal(porcentaje(c, pct), esperado, `${c} × ${pct} %`);
  }
  // Monótono en el monto: a más dinero, nunca menos descuento.
  let anterior = 0n;
  for (let c = 0n; c <= 2000n; c++) {
    const p = porcentaje(c, "33.33");
    assert.ok(p >= anterior, `c=${c}`);
    anterior = p;
  }
});

test("repartir: la suma de las partes es SIEMPRE el total; el resto va de uno en uno a las primeras", () => {
  assert.deepEqual(repartir(100n, 3), [34n, 33n, 33n]);
  assert.deepEqual(repartir(100n, 1), [100n]);
  assert.deepEqual(repartir(0n, 4), [0n, 0n, 0n, 0n]);
  assert.deepEqual(repartir(2n, 5), [1n, 1n, 0n, 0n, 0n]);
  assert.deepEqual(repartir(-100n, 3), [-34n, -33n, -33n]);
  assert.throws(() => repartir(100n, 0), ErrorDeDinero);
  assert.throws(() => repartir(100n, 1.5), ErrorDeDinero);
  const r = prng(99);
  for (let i = 0; i < 5_000; i++) {
    const total = aleatorioCentavos(r, 100_000_000) * (i % 3 === 0 ? -1n : 1n);
    const partes = 1 + Math.floor(r() * 12);
    const reparto = repartir(total, partes);
    assert.equal(reparto.length, partes);
    assert.equal(sumar(...reparto), total);
    const abs = reparto.map((x) => (x < 0n ? -x : x));
    assert.ok(Math.max(...abs.map(Number)) - Math.min(...abs.map(Number)) <= 1, "las partes difieren a lo más en un centavo");
  }
});

test("cabeEnDecimal: 0 a 9 999 999 999.99", () => {
  assert.equal(cabeEnDecimal(0n), true);
  assert.equal(cabeEnDecimal(MAXIMO_DECIMAL_12_2), true);
  assert.equal(cabeEnDecimal(MAXIMO_DECIMAL_12_2 + 1n), false);
  assert.equal(cabeEnDecimal(-1n), false);
});

test("dividir: costo promedio al centavo más cercano, la mitad alejándose de cero, exacto con bigint y sin dividir entre cero", () => {
  assert.equal(dividir(133333n, 2), 66667n, "666.665 → 666.67");
  assert.equal(dividir(133333n, 3), 44444n, "444.4433 → 444.44");
  assert.equal(dividir(133333n, 1), 133333n);
  assert.equal(dividir(0n, 5), 0n);
  assert.equal(dividir(-5n, 2), -3n, "-0.025 → -0.03 (alejándose de cero)");
  assert.equal(dividir(1n, 3), 0n);
  assert.equal(dividir(2n, 3), 1n);
  assert.throws(() => dividir(100n, 0), ErrorDeDinero);
  assert.throws(() => dividir(100n, -1), ErrorDeDinero);
  assert.throws(() => dividir(100n, 1.5), ErrorDeDinero);
});
