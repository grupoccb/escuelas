import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { EVENTOS, problemaDeContrasenaNueva, textoDeDesfase, tituloDeEvento } from "./mensajeria.ts";

test("el desfase se dice en la unidad más natural", () => {
  assert.equal(textoDeDesfase(0), "en el momento");
  assert.equal(textoDeDesfase(-1440), "1 día antes");
  assert.equal(textoDeDesfase(-4320), "3 días antes");
  assert.equal(textoDeDesfase(-120), "2 horas antes");
  assert.equal(textoDeDesfase(60), "1 hora después");
  assert.equal(textoDeDesfase(90), "90 minutos después");
});

test("todo evento disparador conocido tiene título y sentido", () => {
  for (const [clave, e] of Object.entries(EVENTOS)) {
    assert.ok(e.titulo.length > 5, clave);
    assert.ok(e.sentido === "antes" || e.sentido === "despues", clave);
  }
  assert.equal(tituloDeEvento("inventado_nuevo"), "inventado nuevo");
});

test("la contraseña nueva pide al menos 10 caracteres antes de molestar al servidor", () => {
  assert.notEqual(problemaDeContrasenaNueva("corta"), null);
  assert.equal(problemaDeContrasenaNueva("suficientemente-larga"), null);
});

test("el módulo de cada evento de la interfaz es el mismo que el del servidor (src/modulos/index.ts), y ninguno falta", () => {
  const fuente = readFileSync(resolve(import.meta.dirname, "../../../../src/modulos/index.ts"), "utf8");
  const bloque = /MODULO_DE_EVENTO = \{([^}]*)\}/.exec(fuente)![1]!;
  const delServidor = Object.fromEntries([...bloque.matchAll(/(\w+): "(\w+)"/g)].map((m) => [m[1]!, m[2]!]));
  assert.deepEqual(Object.fromEntries(Object.entries(EVENTOS).map(([k, v]) => [k, v.modulo])), delServidor);
});
