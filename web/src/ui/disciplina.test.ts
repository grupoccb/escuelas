import assert from "node:assert/strict";
import { test } from "node:test";
import { colorDeDisciplina, iniciales } from "./disciplina.ts";

test("las iniciales son hasta dos letras, sin las palabras menores, y «?» si no hay nombre", () => {
  assert.equal(iniciales("Escuela de prueba"), "EP");
  assert.equal(iniciales("Adela Administradora"), "AA");
  assert.equal(iniciales("Matías"), "M");
  assert.equal(iniciales("ana maría del valle"), "AM");
  assert.equal(iniciales("  de la  "), "DL","si todo son palabras menores, se usan igual");
  assert.equal(iniciales(""), "?");
  assert.equal(iniciales("   "), "?");
});

test("el color de la disciplina es el hex del dato, normalizado; lo que no es un hex válido da null (color neutro)", () => {
  assert.equal(colorDeDisciplina("#C2410C"), "#c2410c");
  assert.equal(colorDeDisciplina("  #1f5fbf "), "#1f5fbf");
  assert.equal(colorDeDisciplina("#abc"), "#abc");
  assert.equal(colorDeDisciplina("#aabbccdd"), "#aabbccdd");
  for (const malo of [null, undefined, "", "rojo", "1f5fbf", "#12345", "#ggg", "oklch(0.6 0.16 35)", "red; background: url(x)"]) assert.equal(colorDeDisciplina(malo as string | null | undefined), null, String(malo));
});
