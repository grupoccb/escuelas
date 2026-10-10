import assert from "node:assert/strict";
import { test } from "node:test";
import { leerBorrador, olvidarBorradores, ponerBorrador } from "./borradores.ts";

test("un borrador se recupera para la misma persona y la misma clave, y no para otra persona", () => {
  olvidarBorradores();
  ponerBorrador("u1", "registro:c1", { alumno: { nombre: "Sofía" } });
  assert.deepEqual(leerBorrador("u1", "registro:c1"), { alumno: { nombre: "Sofía" } });
  assert.equal(leerBorrador("u2", "registro:c1"), undefined, "otra persona en el mismo teléfono no ve el borrador");
  assert.equal(leerBorrador("u1", "registro:c2"), undefined);
});

test("poner `undefined` quita el borrador; cerrar sesión los borra todos", () => {
  olvidarBorradores();
  ponerBorrador("u1", "a", 1);
  ponerBorrador("u1", "b", 2);
  ponerBorrador("u1", "a", undefined);
  assert.equal(leerBorrador("u1", "a"), undefined);
  assert.equal(leerBorrador("u1", "b"), 2);
  olvidarBorradores();
  assert.equal(leerBorrador("u1", "b"), undefined);
});
