import assert from "node:assert/strict";
import { test } from "node:test";
import { EVENTOS_DISPARADORES, problemaDeDesfase, problemaDeDias, problemaDeHorario } from "./ajustes.ts";

test("un aviso «antes» del evento no acepta un desfase positivo y uno «después» no acepta uno negativo", () => {
  assert.equal(problemaDeDesfase("clase_muestra_proxima", -1440), null);
  assert.equal(problemaDeDesfase("clase_muestra_proxima", 0), null);
  assert.match(problemaDeDesfase("clase_muestra_proxima", 30)!, /ANTES/);
  assert.equal(problemaDeDesfase("cargo_vencido", 1440), null);
  assert.match(problemaDeDesfase("cargo_vencido", -5)!, /DESPUÉS/);
  assert.match(problemaDeDesfase("cargo_por_vencer", 1)!, /ANTES/);
  assert.match(problemaDeDesfase("lead_frio", -1)!, /DESPUÉS/);
});

test("el desfase es un entero acotado a 60 días", () => {
  assert.notEqual(problemaDeDesfase("cargo_vencido", 1.5), null);
  assert.notEqual(problemaDeDesfase("cargo_vencido", 60 * 24 * 60 + 1), null);
  assert.equal(problemaDeDesfase("cargo_vencido", 60 * 24 * 60), null);
  assert.equal(EVENTOS_DISPARADORES.every((e) => problemaDeDesfase(e, 0) === null), true, "cero sirve para todos");
});

test("el horario de envío nunca sale de 09:00 a 20:00 (invariante 14) y empieza antes de terminar", () => {
  assert.equal(problemaDeHorario(540, 1200), null);
  assert.equal(problemaDeHorario(600, 900), null);
  assert.notEqual(problemaDeHorario(539, 900), null);
  assert.notEqual(problemaDeHorario(600, 1201), null);
  assert.notEqual(problemaDeHorario(900, 900), null);
  assert.notEqual(problemaDeHorario(1000, 900), null);
});

test("los días: al menos uno, de 0 a 6, sin repetir", () => {
  assert.equal(problemaDeDias([1, 2, 3]), null);
  assert.notEqual(problemaDeDias([]), null);
  assert.notEqual(problemaDeDias([7]), null);
  assert.notEqual(problemaDeDias([-1]), null);
  assert.notEqual(problemaDeDias([1, 1]), null);
});
