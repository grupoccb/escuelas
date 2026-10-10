import assert from "node:assert/strict";
import { test } from "node:test";
import { textoDeLugares } from "./etiquetas.ts";

test("V7: los lugares concuerdan en número («1 lugar», no «1 lugares»)", () => {
  assert.equal(textoDeLugares(1), "1 lugar");
  assert.equal(textoDeLugares(0), "0 lugares");
  assert.equal(textoDeLugares(2), "2 lugares");
  assert.equal(textoDeLugares(30), "30 lugares");
});

test("EV-15: el filtro de tareas no ofrece los tipos de un módulo apagado, y sin ninguno apagado ofrece todos", async () => {
  const { tiposDeTareaVisibles, TIPOS_DE_TAREA } = await import("./etiquetas.ts");
  assert.equal(tiposDeTareaVisibles([]).length, Object.keys(TIPOS_DE_TAREA).length);
  const sin = tiposDeTareaVisibles(["deuda_vencida", "cobranza_sin_canal", "no_existe"]).map(([k]) => k);
  assert.ok(!sin.includes("deuda_vencida") && !sin.includes("cobranza_sin_canal"));
  assert.ok(sin.includes("sin_plantilla_apta"));
  assert.equal(sin.length, Object.keys(TIPOS_DE_TAREA).length - 2);
});
