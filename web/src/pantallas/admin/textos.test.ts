import assert from "node:assert/strict";
import { test } from "node:test";
import { revisarHuecos, vistaPrevia } from "./textos.ts";

test("la vista previa llena los huecos con datos de ejemplo y deja vacío el que no conoce", () => {
  assert.equal(vistaPrevia("Mucho gusto. ¿Qué edad tiene {nombre}?"), "Mucho gusto. ¿Qué edad tiene Sofía?");
  assert.equal(vistaPrevia("Responde con el número:\n{lista}"), "Responde con el número:\n1. Primera opción\n2. Segunda opción");
  assert.equal(vistaPrevia("Hola {inventado}."), "Hola .");
});

test("se avisa de los huecos que sobran y de los obligatorios que faltan", () => {
  assert.deepEqual(revisarHuecos("Hola {nombre} {edad}", ["nombre"], []), { sobran: ["edad"], faltan: [] });
  assert.deepEqual(revisarHuecos("Elige una", ["lista"], ["lista"]), { sobran: [], faltan: ["lista"] });
  assert.deepEqual(revisarHuecos("Elige:\n{lista}", ["lista"], ["lista"]), { sobran: [], faltan: [] });
});
