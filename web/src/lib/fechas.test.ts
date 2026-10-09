import { test } from "node:test";
import assert from "node:assert/strict";
import { diaDeSemana, edadEn, esFechaReal, formatearFecha, formatearFechaLarga, horaDeMinutos, hoyLocal, sumarDias } from "./fechas.ts";

test("formatos en español", () => {
  assert.equal(formatearFecha("2026-11-10"), "10 nov 2026");
  assert.equal(formatearFechaLarga("2026-11-10"), "martes 10 de noviembre");
  assert.equal(formatearFecha(null), "—");
  assert.equal(horaDeMinutos(960), "16:00");
  assert.equal(horaDeMinutos(545), "09:05");
});

test("el calendario no depende de la zona del navegador", () => {
  assert.equal(diaDeSemana("2026-10-11"), 0);
  assert.equal(sumarDias("2026-02-27", 2), "2026-03-01");
  assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(hoyLocal(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("edad y fechas reales", () => {
  assert.equal(edadEn("2018-05-04", "2026-05-03"), 7);
  assert.equal(edadEn("2018-05-04", "2026-05-04"), 8);
  assert.equal(edadEn("2030-01-01", "2026-05-04"), null);
  assert.equal(esFechaReal("2026-02-31"), false);
  assert.equal(esFechaReal("2024-02-29"), true);
});
