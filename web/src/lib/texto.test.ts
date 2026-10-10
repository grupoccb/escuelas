import { test } from "node:test";
import assert from "node:assert/strict";
import { coincide, plegar } from "./texto.ts";

test("se busca sin importar mayúsculas ni acentos", () => {
  assert.equal(plegar("Ángel Núñez"), "angel nunez");
  assert.ok(coincide("Contraseñas y roles", "contrasenas"));
  assert.ok(coincide("Usuarios y roles", "ROLES usuarios"), "todas las palabras, en cualquier orden");
  assert.ok(coincide("lo que sea", ""), "una búsqueda vacía lo encuentra todo");
  assert.equal(coincide("Precios", "promociones"), false);
});
