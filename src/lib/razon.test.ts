import { test } from "node:test";
import assert from "node:assert/strict";
import { oGuion, porcentajeConUnDecimal } from "./razon.ts";

test("porcentaje con un decimal, redondeado a la mitad hacia arriba y sin flotantes", () => {
  assert.equal(porcentajeConUnDecimal(3, 7), "42.9");
  assert.equal(porcentajeConUnDecimal(1, 3), "33.3");
  assert.equal(porcentajeConUnDecimal(2, 3), "66.7");
  assert.equal(porcentajeConUnDecimal(1, 8), "12.5");
  assert.equal(porcentajeConUnDecimal(1, 16), "6.3", "6.25 → 6.3 (la mitad sube)");
  assert.equal(porcentajeConUnDecimal(0, 5), "0.0");
  assert.equal(porcentajeConUnDecimal(5, 5), "100.0");
  assert.equal(porcentajeConUnDecimal(7, 5), "140.0", "puede pasar de 100 (ocupación con más inscritos que cupo)");
});

test("sin base no hay porcentaje (null → «—»), y los conteos inválidos lanzan", () => {
  assert.equal(porcentajeConUnDecimal(0, 0), null);
  assert.equal(porcentajeConUnDecimal(4, 0), null);
  assert.throws(() => porcentajeConUnDecimal(-1, 3));
  assert.throws(() => porcentajeConUnDecimal(1.5, 3));
  assert.equal(oGuion(null), "—");
  assert.equal(oGuion("42.9"), "42.9");
  assert.equal(oGuion(0), "0");
});
