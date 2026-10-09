import assert from "node:assert/strict";
import { test } from "node:test";
import { maximoDe, porcentajeDeBarra } from "./graficas.ts";

test("el largo de una barra se calcula con enteros, con un decimal", () => {
  assert.equal(porcentajeDeBarra(1n, 3n), "33.3");
  assert.equal(porcentajeDeBarra(2n, 3n), "66.6");
  assert.equal(porcentajeDeBarra(5n, 5n), "100.0");
  assert.equal(porcentajeDeBarra(0n, 5n), "0.0");
  assert.equal(porcentajeDeBarra(7n, 0n), "0.0");
  assert.equal(porcentajeDeBarra(9n, 5n), "100.0", "nunca pasa del 100 %");
  assert.equal(porcentajeDeBarra(123456789012345n, 246913578024690n), "50.0", "importes en centavos grandes sin perder exactitud");
  assert.equal(porcentajeDeBarra(-3n, 5n), "0.0");
});

test("el máximo de una lista", () => {
  assert.equal(maximoDe([]), 0n);
  assert.equal(maximoDe([3n, 9n, 2n]), 9n);
});
