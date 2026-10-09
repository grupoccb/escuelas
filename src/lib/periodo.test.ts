import { test } from "node:test";
import assert from "node:assert/strict";
import { diasEntre, esPeriodo, mesesEntre, nombreDelPeriodo, periodoDe, sumarMeses } from "./periodo.ts";

test("periodoDe y esPeriodo", () => {
  assert.equal(periodoDe("2026-11-30"), "2026-11");
  assert.throws(() => periodoDe("2026-02-30"));
  assert.ok(esPeriodo("2026-01") && esPeriodo("2026-12"));
  for (const mal of ["2026-13", "2026-00", "2026-1", "26-01", "2026-01-01", ""]) assert.equal(esPeriodo(mal), false, mal);
});

test("sumarMeses cruza años en los dos sentidos", () => {
  assert.equal(sumarMeses("2026-11", 1), "2026-12");
  assert.equal(sumarMeses("2026-12", 1), "2027-01");
  assert.equal(sumarMeses("2026-01", -1), "2025-12");
  assert.equal(sumarMeses("2026-03", 24), "2028-03");
  assert.equal(sumarMeses("2026-03", 0), "2026-03");
});

test("mesesEntre", () => {
  assert.equal(mesesEntre("2026-11", "2027-02"), 3);
  assert.equal(mesesEntre("2027-02", "2026-11"), -3);
  assert.equal(mesesEntre("2026-05", "2026-05"), 0);
});

test("diasEntre cuenta días de calendario (bisiestos y cambio de año)", () => {
  assert.equal(diasEntre("2026-10-01", "2026-10-31"), 30);
  assert.equal(diasEntre("2028-02-28", "2028-03-01"), 2);
  assert.equal(diasEntre("2026-12-31", "2027-01-01"), 1);
  assert.equal(diasEntre("2026-10-10", "2026-10-01"), -9);
});

test("nombreDelPeriodo", () => {
  assert.equal(nombreDelPeriodo("2026-11"), "noviembre de 2026");
  assert.equal(nombreDelPeriodo("2027-01"), "enero de 2027");
});
