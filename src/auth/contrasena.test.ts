import { test } from "node:test";
import assert from "node:assert/strict";
import { PARAMETROS_PRUEBA, hashContrasena, hashFicticio, problemasDeContrasena, verificarContrasena } from "./contrasena.ts";
import { hashDeToken, nuevoToken } from "./sesiones.ts";

test("hash: formato scrypt con sus parámetros, sal distinta cada vez y nunca contiene la contraseña", async () => {
  const a = await hashContrasena("una contraseña larga", PARAMETROS_PRUEBA);
  const b = await hashContrasena("una contraseña larga", PARAMETROS_PRUEBA);
  assert.match(a, /^scrypt\$1024\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.notEqual(a, b, "la sal es por hash");
  assert.ok(!a.includes("larga"));
});

test("verificar: acierta con la correcta, falla con otra, con vacía y con mayúsculas distintas", async () => {
  const h = await hashContrasena("Correcta-1234", PARAMETROS_PRUEBA);
  assert.equal(await verificarContrasena("Correcta-1234", h), true);
  assert.equal(await verificarContrasena("correcta-1234", h), false);
  assert.equal(await verificarContrasena("", h), false);
  assert.equal(await verificarContrasena("Correcta-12345", h), false);
});

test("verificar: el hash recuerda sus parámetros (uno barato y uno por defecto conviven)", async () => {
  const barato = await hashContrasena("secreto-largo-1", PARAMETROS_PRUEBA);
  assert.equal(await verificarContrasena("secreto-largo-1", barato), true);
  assert.equal(await verificarContrasena("secreto-largo-1", await hashFicticio()), false);
});

test("la misma contraseña con otra composición Unicode (NFC/NFD) entra", async () => {
  const h = await hashContrasena("contraseña-ñandú-1", PARAMETROS_PRUEBA);
  assert.equal(await verificarContrasena("contraseña-ñandú-1".normalize("NFD"), h), true);
});

test("un hash ilegible o con parámetros absurdos se rechaza sin reventar", async () => {
  assert.equal(await verificarContrasena("x", "basura"), false);
  assert.equal(await verificarContrasena("x", "scrypt$4294967296$8$1$AAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), false);
  assert.equal(await verificarContrasena("x", "scrypt$1024$8$1$AA$AA"), false);
  await assert.rejects(hashContrasena("x", { N: 1000, r: 8, p: 1 }), /fuera de rango/);
});

test("política: mínimo 10 caracteres, máximo 128, ni el correo ni el nombre, ni un solo carácter repetido", () => {
  assert.deepEqual(problemasDeContrasena("abcdefghij"), []);
  assert.equal(problemasDeContrasena("corta").length, 1);
  assert.equal(problemasDeContrasena("a".repeat(129)).length >= 1, true);
  assert.deepEqual(problemasDeContrasena("ana@ejemplo.com", { correo: "Ana@Ejemplo.com" }), ["La contraseña no puede ser el correo"]);
  assert.deepEqual(problemasDeContrasena("María Pérez", { nombre: "maría pérez" }), ["La contraseña no puede ser el nombre"]);
  assert.deepEqual(problemasDeContrasena("aaaaaaaaaaaa"), ["La contraseña es demasiado simple"]);
});

test("token de sesión: 32 bytes aleatorios en base64url y su hash es un SHA-256 hexadecimal", () => {
  const t = nuevoToken();
  assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(nuevoToken(), t);
  assert.match(hashDeToken(t), /^[0-9a-f]{64}$/);
  assert.equal(hashDeToken(t), hashDeToken(t));
  assert.notEqual(hashDeToken(t), t);
});

test("K3: las contraseñas más comunes (y la de la demo, que es pública) se rechazan aunque cumplan el largo, sin importar mayúsculas", () => {
  for (const c of ["1234567890", "Password123", "QWERTYUIOP", "Demo-local-2026!", "administrador123", "Inscripciones1"]) {
    assert.deepEqual(problemasDeContrasena(c), ["Esa contraseña es de las más usadas: elige otra"], c);
  }
  assert.deepEqual(problemasDeContrasena("caballo-grapa-nube-77"), []);
});
