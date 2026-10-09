import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModuloId } from "../../api/tipos.ts";
import { explicarCambioDeModulo, type ModuloDeLista } from "./modulos.ts";

const m = (id: ModuloId, requiere: ModuloId[], encendido: boolean, obligatorio = false): ModuloDeLista => ({ id, nombre: id.toUpperCase(), incluye: "x", requiere, obligatorio, encendido });

test("la captación no tiene bloqueo (su interruptor simplemente no se mueve)", () => {
  const todos = [m("captacion", [], true, true), m("cotizador", ["captacion"], true)];
  assert.equal(explicarCambioDeModulo(todos[0]!, todos), null);
});

test("no se puede encender lo que le falta su base: se dice cuál enciende primero", () => {
  const todos = [m("captacion", [], true, true), m("inscripcion", ["captacion"], false), m("finanzas", ["inscripcion"], false), m("tableros", ["inscripcion", "finanzas"], false)];
  assert.equal(explicarCambioDeModulo(todos[1]!, todos), null);
  assert.equal(explicarCambioDeModulo(todos[2]!, todos), "Para encenderlo, primero enciende: INSCRIPCION.");
  assert.equal(explicarCambioDeModulo(todos[3]!, todos), "Para encenderlo, primero enciende: INSCRIPCION, FINANZAS.");
});

test("no se puede apagar lo que otro encendido necesita: se dice cuál apaga primero", () => {
  const todos = [m("captacion", [], true, true), m("inscripcion", ["captacion"], true), m("finanzas", ["inscripcion"], true), m("operacion", ["inscripcion"], false)];
  assert.equal(explicarCambioDeModulo(todos[1]!, todos), "Para apagarlo, primero apaga: FINANZAS.", "el apagado (operación) no estorba");
  assert.equal(explicarCambioDeModulo(todos[2]!, todos), null);
});
