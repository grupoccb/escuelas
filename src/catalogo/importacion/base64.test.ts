// V13-fix EV-07: la validación del base64 de la carga del catálogo es lineal (antes, 1 M de espacios + «!» congelaba el servidor minutos).
import { test } from "node:test";
import assert from "node:assert/strict";
import { esBase64Valido } from "./base64.ts";

test("acepta base64 de verdad, con saltos de línea y espacios, y con 0, 1 o 2 «=» al final", () => {
  assert.equal(esBase64Valido(""), true);
  assert.equal(esBase64Valido("aG9sYQ=="), true);
  assert.equal(esBase64Valido("aG9sYQ"), true);
  assert.equal(esBase64Valido("aG9s\r\nYQ==\n"), true);
  assert.equal(esBase64Valido("  aG9s YQ==  "), true);
  assert.equal(esBase64Valido("YWJj"), true);
});

test("rechaza lo que no es base64", () => {
  for (const malo of ["aG9sYQ===", "aG9s!YQ", "aG=9s", "aG9sYQ==x", "é", "aG9s\u0000", "a b!"]) assert.equal(esBase64Valido(malo), false, JSON.stringify(malo));
});

test("EV-07: 1 000 000 de espacios seguidos de «!» se rechazan en menos de 100 ms (antes eran minutos), y también tabuladores, saltos y mezclas", () => {
  for (const relleno of [" ", "\t", "\n", " \n\t\r"]) {
    const texto = relleno.repeat(Math.ceil(1_000_000 / relleno.length)) + "!";
    const t0 = performance.now();
    assert.equal(esBase64Valido(texto), false);
    const ms = performance.now() - t0;
    assert.ok(ms < 100, `${JSON.stringify(relleno)}: ${ms.toFixed(1)} ms`);
  }
  // Y uno largo y válido (el tope del cuerpo es 8 MB) tampoco tarda.
  const largo = "QUJD".repeat(1_500_000);
  const t0 = performance.now();
  assert.equal(esBase64Valido(largo), true);
  assert.ok(performance.now() - t0 < 100);
});
