import assert from "node:assert/strict";
import { test } from "node:test";
import { primerPago } from "./resumen.ts";

const p = (inscripcion: string, mensualidad: string, mesesGratis = 0) => ({ inscripcion, mensualidad, mesesGratis });

test("suma inscripción y mensualidad de cada niño, al centavo", () => {
  assert.equal(primerPago([p("500.00", "585.00"), p("600.00", "702.00")]), "2387.00");
  assert.equal(primerPago([p("0.10", "0.20")]), "0.30");
});

test("sin precio de alguno, sin niños o con meses gratis no hay primer pago que decir", () => {
  assert.equal(primerPago([]), null);
  assert.equal(primerPago([p("500.00", "585.00"), null]), null);
  assert.equal(primerPago([p("500.00", "585.00", 1)]), null);
});
