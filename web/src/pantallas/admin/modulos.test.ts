import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModuloId } from "../../api/tipos.ts";
import { explicarCambioDeModulo, porApagarAntes, porEncenderAntes, queCambia, QUE_CAMBIA, type ModuloDeLista } from "./modulos.ts";

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

const REAL = (apagados: ModuloId[] = []): ModuloDeLista[] =>
  [m("captacion", [], true, true), m("cotizador", ["captacion"], true), m("clase_muestra", ["captacion"], true), m("inscripcion", ["captacion", "cotizador"], true), m("operacion", ["inscripcion"], true), m("finanzas", ["inscripcion"], true), m("tableros", ["inscripcion", "finanzas", "clase_muestra"], true)].map((x) => (apagados.includes(x.id) ? { ...x, encendido: false } : x));

test("la cadena de dependencias se dice completa y en el orden en que se apaga (V7: antes solo decía «primero apaga: Inscripción»)", () => {
  const todos = REAL();
  assert.deepEqual(porApagarAntes("cotizador", todos).map((x) => x.id), ["tableros", "finanzas", "operacion", "inscripcion"]);
  assert.equal(explicarCambioDeModulo(todos[1]!, todos), "Para apagarlo, primero apaga: TABLEROS, FINANZAS, OPERACION, INSCRIPCION.");
  assert.deepEqual(porApagarAntes("tableros", todos), [], "lo que nadie necesita se apaga solo");
  assert.deepEqual(porApagarAntes("clase_muestra", todos).map((x) => x.id), ["tableros"]);
  // Lo que ya está apagado no estorba, ni lo que cuelga de ello.
  assert.deepEqual(porApagarAntes("cotizador", REAL(["tableros", "finanzas", "operacion"])).map((x) => x.id), ["inscripcion"]);
});

test("para encender se dice lo que falta, en cadena y en el orden en que se enciende", () => {
  const todos = REAL(["cotizador", "inscripcion", "operacion", "finanzas", "tableros"]);
  assert.deepEqual(porEncenderAntes("tableros", todos).map((x) => x.id), ["cotizador", "inscripcion", "finanzas"]);
  assert.equal(explicarCambioDeModulo(todos.find((x) => x.id === "operacion")!, todos), "Para encenderlo, primero enciende: COTIZADOR, INSCRIPCION.");
  assert.deepEqual(porEncenderAntes("cotizador", todos), []);
});

test("cada módulo que se apaga dice qué pierde y cada uno que se enciende qué gana, para alguien de la escuela (sin términos técnicos)", () => {
  for (const [id, textos] of Object.entries(QUE_CAMBIA)) {
    for (const t of [textos.enciende, textos.apaga]) {
      assert.ok(t.length > 30 && t.endsWith("."), id);
      assert.ok(!/_|\bAPI\b|\bid\b|undefined/i.test(t), `${id}: ${t}`);
    }
  }
  assert.match(queCambia("finanzas", false), /Recepción pierde/);
  assert.match(queCambia("finanzas", true), /Recepción cobra/);
  assert.equal(queCambia("captacion", false), "");
});
