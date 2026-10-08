import { test } from "node:test";
import assert from "node:assert/strict";
import { diaDeCorteEnMes, diaDeCortePorOmision, esDiaDeCorteValido, fechaDeCorte, proximoCorte, ultimoDiaDelMes } from "./corte.ts";

test("el último día de cada mes, con años bisiestos y los de siglo", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => ultimoDiaDelMes(2027, m)), [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  assert.equal(ultimoDiaDelMes(2028, 2), 29);
  assert.equal(ultimoDiaDelMes(2100, 2), 28, "2100 no es bisiesto");
  assert.equal(ultimoDiaDelMes(2000, 2), 29, "2000 sí");
  assert.throws(() => ultimoDiaDelMes(2027, 13), RangeError);
});

test("FIN DE MES: el corte del 31 cae el último día de un mes más corto y vuelve a ser 31 cuando el mes lo tiene", () => {
  assert.equal(fechaDeCorte(31, 2027, 1), "2027-01-31");
  assert.equal(fechaDeCorte(31, 2027, 2), "2027-02-28");
  assert.equal(fechaDeCorte(31, 2028, 2), "2028-02-29");
  assert.equal(fechaDeCorte(31, 2027, 4), "2027-04-30");
  assert.equal(fechaDeCorte(31, 2027, 5), "2027-05-31");
  assert.equal(fechaDeCorte(30, 2027, 2), "2027-02-28");
  assert.equal(fechaDeCorte(29, 2027, 2), "2027-02-28");
  assert.equal(fechaDeCorte(29, 2028, 2), "2028-02-29");
  assert.equal(fechaDeCorte(28, 2027, 2), "2027-02-28");
  assert.equal(fechaDeCorte(1, 2027, 2), "2027-02-01");
  assert.equal(diaDeCorteEnMes(15, 2027, 6), 15);
});

test("próximo corte: este mes si todavía no pasa (o es hoy), si no el mes siguiente, y diciembre da enero", () => {
  assert.equal(proximoCorte(15, "2026-10-08"), "2026-10-15");
  assert.equal(proximoCorte(15, "2026-10-15"), "2026-10-15", "hoy mismo cuenta");
  assert.equal(proximoCorte(15, "2026-10-16"), "2026-11-15");
  assert.equal(proximoCorte(31, "2026-11-01"), "2026-11-30", "noviembre tiene 30");
  assert.equal(proximoCorte(31, "2026-11-30"), "2026-11-30");
  assert.equal(proximoCorte(31, "2026-12-01"), "2026-12-31");
  assert.equal(proximoCorte(10, "2026-12-20"), "2027-01-10");
  assert.equal(proximoCorte(30, "2027-01-31"), "2027-02-28", "pasó el 30 de enero: febrero corta el 28");
  assert.equal(proximoCorte(31, "2027-02-10"), "2027-02-28");
});

test("validez del día de corte y valor por omisión", () => {
  for (const ok of [1, 15, 31]) assert.equal(esDiaDeCorteValido(ok), true);
  for (const mal of [0, 32, -1, 1.5, Number.NaN]) assert.equal(esDiaDeCorteValido(mal), false, String(mal));
  assert.throws(() => diaDeCorteEnMes(0, 2027, 1), RangeError);
  assert.throws(() => diaDeCorteEnMes(32, 2027, 1), RangeError);
  assert.equal(diaDeCortePorOmision("2026-10-31"), 31);
  assert.equal(diaDeCortePorOmision("2026-10-08"), 8);
});
