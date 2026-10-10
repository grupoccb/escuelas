import { test } from "node:test";
import assert from "node:assert/strict";
import { cantidad, segun } from "./cantidad.ts";

test("una cantidad en palabras: singular solo con 1; 0 y el resto van en plural", () => {
  assert.equal(cantidad(1, "grupo", "grupos"), "1 grupo");
  assert.equal(cantidad(0, "grupo", "grupos"), "0 grupos");
  assert.equal(cantidad(2, "inscripción vigente", "inscripciones vigentes"), "2 inscripciones vigentes");
  assert.equal(segun(1, "pásala", "pásalas"), "pásala");
  assert.equal(segun(5, "pásala", "pásalas"), "pásalas");
});
