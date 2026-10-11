import assert from "node:assert/strict";
import { test } from "node:test";
import { alternar, avisoDeMovimiento, depurar, palabraDeSeleccion } from "./seleccion.ts";

test("alternar agrega y quita sin tocar el conjunto original", () => {
  const vacia: ReadonlySet<string> = new Set();
  const una = alternar(vacia, "a");
  assert.deepEqual([...una], ["a"]);
  assert.equal(vacia.size, 0, "el original no cambia");
  assert.deepEqual([...alternar(una, "b")], ["a", "b"]);
  assert.deepEqual([...alternar(una, "a")], []);
});

test("depurar suelta lo que ya no se ve y conserva el mismo conjunto si no hay nada que soltar", () => {
  const seleccion = new Set(["a", "b", "c"]);
  assert.equal(depurar(seleccion, new Set(["a", "b", "c", "d"])), seleccion);
  assert.deepEqual([...depurar(seleccion, new Set(["b"]))], ["b"]);
  assert.deepEqual([...depurar(seleccion, new Set())], []);
});

test("los textos de la barra y del aviso concuerdan en número", () => {
  assert.equal(palabraDeSeleccion(1), "seleccionado");
  assert.equal(palabraDeSeleccion(3), "seleccionados");
  assert.equal(avisoDeMovimiento({ nombre: "Familia X", cantidad: 1, etapa: "Etapa B" }), "Familia X pasó a Etapa B.");
  assert.equal(avisoDeMovimiento({ nombre: "Familia X", cantidad: 3, etapa: "Etapa B" }), "3 leads pasaron a Etapa B.");
});
