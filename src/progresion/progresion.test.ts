// G3: el siguiente peldaño es una regla pura sobre las filas de la vertical.

import { test } from "node:test";
import assert from "node:assert/strict";
import { siguienteNivel, type NivelDeVertical } from "./progresion.ts";

const n = (orden: number): NivelDeVertical => ({ id: `n${orden}`, nombre: `Peldaño ${orden}`, orden, colorHex: null, horasMinimas: 0, clasesMinimas: orden * 10, requisitosTexto: null });

test("siguienteNivel: sin nivel actual es el primero; con uno, el de orden inmediatamente mayor; en el último no hay siguiente", () => {
  const niveles = [n(3), n(1), n(2)]; // en desorden a propósito
  assert.equal(siguienteNivel(niveles, null)?.id, "n1");
  assert.equal(siguienteNivel(niveles, n(1))?.id, "n2");
  assert.equal(siguienteNivel(niveles, n(2))?.id, "n3");
  assert.equal(siguienteNivel(niveles, n(3)), null);
  assert.equal(siguienteNivel([], null), null);
});

test("siguienteNivel: los órdenes no tienen que ser consecutivos (se borró un peldaño) ni empezar en 1", () => {
  const niveles = [n(0), n(5), n(20)];
  assert.equal(siguienteNivel(niveles, null)?.id, "n0");
  assert.equal(siguienteNivel(niveles, n(0))?.id, "n5");
  assert.equal(siguienteNivel(niveles, n(5))?.id, "n20");
  assert.equal(siguienteNivel(niveles, { orden: 7 })?.id, "n20", "un nivel actual que ya no está en la lista: el siguiente mayor");
});
