import assert from "node:assert/strict";
import { test } from "node:test";
import { contieneTodas, plegar } from "./texto.ts";

test("plegar quita acentos, diéresis y mayúsculas; la ñ queda n", () => {
  assert.equal(plegar("Ángel Báez Ñúñez"), "angel baez nunez");
  assert.equal(plegar("PINGÜINO"), "pinguino");
  assert.equal(plegar("   "), "   ");
});

test("contieneTodas: cada palabra, en cualquier orden, sin acentos ni mayúsculas", () => {
  assert.equal(contieneTodas("Lucía Báez Ñúñez Ángel Inés", "LUCIA baez"), true);
  assert.equal(contieneTodas("Lucía Báez Ñúñez Ángel Inés", "nunez angel"), true);
  assert.equal(contieneTodas("Lucía Báez", "baez ramirez"), false);
  assert.equal(contieneTodas("Lucía Báez", "   "), true);
  assert.equal(contieneTodas("Lucía Báez", "ucía"), true);
});
