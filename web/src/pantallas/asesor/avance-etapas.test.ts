import assert from "node:assert/strict";
import { test } from "node:test";
import type { Etapa } from "../../api/tipos.ts";
import { pasosDeAvance } from "./avance-etapas.ts";

const e = (id: string, nombre: string, orden: number, extra: Partial<Etapa> = {}): Etapa => ({ id, nombre, orden, tipo_sistema: null, es_ganado: false, es_perdido: false, dias_alerta_sin_movimiento: null, ...extra });
const ETAPAS = [e("i", "Cierre", 4, { tipo_sistema: "inscrito", es_ganado: true }), e("a", "Primera", 1), e("p", "Salida", 5, { es_perdido: true }), e("b", "Segunda", 2), e("c", "Tercera", 3)];

test("una barra por etapa abierta, en su orden y sin la de perdido", () => {
  assert.deepEqual(pasosDeAvance(ETAPAS, "b").map((p) => p.nombre), ["Primera", "Segunda", "Tercera", "Cierre"]);
});

test("las anteriores van hechas, la actual marcada y las demás pendientes", () => {
  assert.deepEqual(pasosDeAvance(ETAPAS, "c").map((p) => p.estado), ["hecho", "hecho", "actual", "pendiente"]);
  assert.deepEqual(pasosDeAvance(ETAPAS, "a").map((p) => p.estado), ["actual", "pendiente", "pendiente", "pendiente"]);
  assert.deepEqual(pasosDeAvance(ETAPAS, "i").map((p) => p.estado), ["hecho", "hecho", "hecho", "actual"]);
});

test("un lead perdido no tiene etapa actual: todas apagadas", () => {
  assert.deepEqual(pasosDeAvance(ETAPAS, "p").map((p) => p.estado), ["perdido", "perdido", "perdido", "perdido"]);
});

test("una etapa que no está en la lista deja todo pendiente; sin etapas, nada", () => {
  assert.deepEqual(pasosDeAvance(ETAPAS, "x").map((p) => p.estado), ["pendiente", "pendiente", "pendiente", "pendiente"]);
  assert.deepEqual(pasosDeAvance([], "x"), []);
});

test("listaConY junta con comas y «y», sin repetidos ni vacíos", async () => {
  const { listaConY } = await import("./avance-etapas.ts");
  assert.equal(listaConY([]), "");
  assert.equal(listaConY(["A"]), "A");
  assert.equal(listaConY(["A", "B"]), "A y B");
  assert.equal(listaConY(["A", "B", "A", null, "C"]), "A, B y C");
});
