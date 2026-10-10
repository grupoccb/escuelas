import { test } from "node:test";
import assert from "node:assert/strict";
import { cantidad, segun } from "./cantidad.ts";

test("una cantidad en palabras: singular solo con 1; 0 y el resto van en plural", () => {
  assert.equal(cantidad(1, "mensaje", "mensajes"), "1 mensaje");
  assert.equal(cantidad(0, "mensaje", "mensajes"), "0 mensajes");
  assert.equal(cantidad(7, "día", "días"), "7 días");
  assert.equal(segun(1, "lo usa", "lo usan"), "lo usa");
  assert.equal(segun(2, "lo usa", "lo usan"), "lo usan");
});
