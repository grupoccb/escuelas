// G2: las cuentas puras — porcentaje de 30 días, racha de faltas por SESIONES con pase tomado y la decisión sobre la tarea.

import { test } from "node:test";
import assert from "node:assert/strict";
import { accionSobreLaTarea, calcularDerivados, presentarDerivados, type FilaDeAsistencia } from "./derivados.ts";

const f = (fecha: string, estatus: FilaDeAsistencia["estatus"]): FilaDeAsistencia => ({ fecha, estatus });
const HOY = "2026-11-18";

test("el porcentaje cuenta presentes entre presentes + faltas de los últimos 30 días; las justificadas no cuentan ni a favor ni en contra", () => {
  const d = calcularDerivados([f("2026-11-16", "presente"), f("2026-11-11", "presente"), f("2026-11-09", "falta"), f("2026-11-04", "justificada"), f("2026-11-02", "presente")], HOY);
  assert.deepEqual([d.presentes, d.faltas, d.justificadas, d.porcentaje], [3, 1, 1, 75]);
  assert.equal(calcularDerivados([f("2026-11-16", "presente"), f("2026-11-11", "falta"), f("2026-11-09", "falta")], HOY).porcentaje, 33.3, "un decimal");
  assert.equal(calcularDerivados([f("2026-11-16", "presente"), f("2026-11-11", "falta"), f("2026-11-09", "falta"), f("2026-11-04", "falta")], HOY).porcentaje, 25);
  assert.equal(calcularDerivados([f("2026-11-16", "presente")], HOY).porcentaje, 100);
  assert.equal(calcularDerivados([f("2026-11-16", "falta")], HOY).porcentaje, 0);
});

test("sin filas que cuenten no hay porcentaje (null, no 0 %): sin historia o solo justificadas", () => {
  assert.equal(calcularDerivados([], HOY).porcentaje, null);
  assert.equal(calcularDerivados([f("2026-11-16", "justificada")], HOY).porcentaje, null);
  assert.deepEqual(calcularDerivados([], HOY), { desde: "2026-10-20", hasta: HOY, presentes: 0, faltas: 0, justificadas: 0, porcentaje: null, rachaDeFaltas: 0, inicioDeRacha: null });
});

test("la ventana de 30 días incluye el día 29 anterior a hoy y deja fuera el 30; lo posterior a hoy no cuenta", () => {
  assert.equal(calcularDerivados([], HOY).desde, "2026-10-20");
  const d = calcularDerivados([f("2026-10-20", "presente"), f("2026-10-19", "falta"), f("2026-11-18", "presente"), f("2026-11-19", "falta")], HOY);
  assert.deepEqual([d.presentes, d.faltas], [2, 0], "el 20 de octubre entra (hoy − 29), el 19 no; el 19 de noviembre es futuro");
  // Mes de 28 días y cambio de año.
  assert.equal(calcularDerivados([], "2027-01-10").desde, "2026-12-12");
  assert.equal(calcularDerivados([], "2026-03-01").desde, "2026-01-31");
});

test("la racha: faltas consecutivas desde la sesión MÁS RECIENTE; presente la corta; justificada no suma ni corta; el orden de las filas no importa", () => {
  const filas = [f("2026-11-16", "falta"), f("2026-11-11", "falta"), f("2026-11-09", "falta"), f("2026-11-04", "presente"), f("2026-11-02", "falta")];
  const d = calcularDerivados(filas, HOY);
  assert.deepEqual([d.rachaDeFaltas, d.inicioDeRacha], [3, "2026-11-09"]);
  assert.deepEqual(calcularDerivados([...filas].reverse(), HOY), d, "mismo resultado con otro orden");
  assert.equal(calcularDerivados([f("2026-11-16", "presente"), f("2026-11-11", "falta"), f("2026-11-09", "falta")], HOY).rachaDeFaltas, 0, "volvió a asistir");
  // Justificada en medio: neutral.
  const con = calcularDerivados([f("2026-11-16", "falta"), f("2026-11-11", "justificada"), f("2026-11-09", "falta"), f("2026-11-04", "falta")], HOY);
  assert.deepEqual([con.rachaDeFaltas, con.inicioDeRacha], [3, "2026-11-04"]);
  assert.equal(calcularDerivados([f("2026-11-16", "justificada"), f("2026-11-11", "falta")], HOY).rachaDeFaltas, 1, "una justificada reciente no borra la racha");
  assert.equal(calcularDerivados([f("2026-11-16", "presente"), f("2026-11-11", "justificada")], HOY).rachaDeFaltas, 0);
});

test("la racha son SESIONES con pase tomado, no días del calendario: los huecos sin pase no suman ni rompen", () => {
  // Tres faltas con semanas sin pase de por medio (feriados, clases no dadas): siguen siendo tres consecutivas.
  const d = calcularDerivados([f("2026-09-07", "falta"), f("2026-10-12", "falta"), f("2026-11-16", "falta")], HOY);
  assert.equal(d.rachaDeFaltas, 3);
  // Y una racha vieja cuenta aunque haya salido de la ventana de 30 días (el porcentaje sí la ignora).
  assert.deepEqual([d.faltas, d.porcentaje], [1, 0]);
});

test("la tarea: se crea al llegar al umbral si no hay pendiente ni hubo una de esta racha; se resuelve sola bajo el umbral; si no, nada", () => {
  const e = (racha: number, hayPendiente = false, yaHubo = false) => accionSobreLaTarea({ racha, umbral: 3, hayPendiente, yaHuboTareaDeEstaRacha: yaHubo });
  assert.equal(e(2), "nada");
  assert.equal(e(3), "crear");
  assert.equal(e(7), "crear");
  assert.equal(e(3, true), "nada", "una pendiente por inscripción");
  assert.equal(e(5, true), "nada");
  assert.equal(e(3, false, true), "nada", "resuelta a mano con la racha vigente: no se vuelve a crear");
  assert.equal(e(2, true), "resolver", "bajó del umbral");
  assert.equal(e(0, true), "resolver", "volvió a asistir");
  assert.equal(e(0), "nada");
  // Umbral distinto: 1 crea con la primera falta.
  assert.equal(accionSobreLaTarea({ racha: 1, umbral: 1, hayPendiente: false, yaHuboTareaDeEstaRacha: false }), "crear");
});

test("presentarDerivados: la forma de la API y la bandera de riesgo según el umbral", () => {
  const d = calcularDerivados([f("2026-11-16", "falta"), f("2026-11-11", "falta")], HOY);
  assert.deepEqual(presentarDerivados(d, 3), { ventana: { desde: "2026-10-20", hasta: HOY }, porcentaje_30_dias: 0, presentes: 0, faltas: 2, justificadas: 0, racha_de_faltas: 2, inicio_de_racha: "2026-11-11", umbral_de_faltas: 3, en_riesgo: false });
  assert.equal(presentarDerivados(d, 2).en_riesgo, true);
});
