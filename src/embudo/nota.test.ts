// V13-fix EV-26: la nota obligatoria cuenta letras y dígitos, no caracteres invisibles ni signos de relleno.
import { test } from "node:test";
import assert from "node:assert/strict";
import { caracteresUtiles, normalizarNota } from "./nota.ts";

test("los invisibles y los signos no cuentan: ancho cero, blanco braille, relleno hangul, puntos", () => {
  const casos: [string, string][] = [
    ["espacio de ancho cero ×10", "\u200B".repeat(10)],
    ["unión de ancho cero y no-unión", "\u200C\u200D\u2060\uFEFF".repeat(3)],
    ["blanco braille ×10", "\u2800".repeat(10)],
    ["relleno hangul ×10", "\u3164".repeat(10)],
    ["relleno hangul de media anchura ×10", "\uFFA0".repeat(10)],
    ["puntos ×10", ".".repeat(10)],
    ["guiones y signos", "-_-_-_-_-_-_ ¡!¿?"],
    ["espacios de varios anchos", "\u00A0\u2003\u2009\u3000".repeat(3)],
    ["control", "\u0000\u0007\u001F".repeat(4)],
  ];
  for (const [nombre, texto] of casos) {
    assert.equal(caracteresUtiles(normalizarNota(texto)), 0, nombre);
    assert.equal(normalizarNota(texto) === "" || /^[^\p{L}\p{N}]+$/u.test(normalizarNota(texto)), true, nombre);
  }
});

test("lo que sí cuenta: letras con acento, dígitos, mezcla con invisibles (que se quitan) y saltos de línea entre palabras", () => {
  assert.equal(caracteresUtiles(normalizarNota("Pagó en efectivo")), 14);
  assert.equal(caracteresUtiles(normalizarNota("1234567890")), 10);
  assert.equal(normalizarNota("  Pa\u200Bgó\u2800 hoy  "), "Pagó hoy");
  assert.equal(normalizarNota("línea uno\nlínea dos"), "línea uno línea dos");
  assert.equal(caracteresUtiles(normalizarNota("ñandú ¡sí!")), 7);
  assert.equal(normalizarNota(null), "");
  assert.equal(normalizarNota(undefined), "");
});
