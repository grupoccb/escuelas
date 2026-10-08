// WH: la «forma» de un evento deja constancia SIN guardar su contenido (nombres, teléfonos, texto libre que puede mencionar salud).

import { test } from "node:test";
import assert from "node:assert/strict";
import { formaDe, formaDeBytes, huella, idSeguro } from "./forma.ts";

const CENTINELA = "CENTINELA-SALUD-ALERGIA-5215512345678";

test("la forma conserva claves, tipos y largos, y NUNCA un valor de texto (salvo palabras de control cortas)", () => {
  const forma = formaDe({
    event: "message_created",
    message_type: "incoming",
    content: CENTINELA,
    sender: { name: "María López", phone_number: "+5215512345678", extra: [CENTINELA, 1, null] },
    id: 77,
    enorme: 1e300,
    flag: true,
  });
  const texto = JSON.stringify(forma);
  for (const prohibido of [CENTINELA, "María", "López", "5215512345678"]) assert.ok(!texto.includes(prohibido), `no debe contener «${prohibido}»`);
  assert.equal(forma["event"], "message_created", "una palabra de control corta se conserva");
  assert.equal(forma["message_type"], "incoming");
  assert.equal(forma["content"], `texto(${CENTINELA.length})`);
  assert.equal(forma["id"], "entero");
  assert.equal(forma["enorme"], "decimal", "1e300 no es un entero seguro");
  assert.equal(forma["flag"], true);
});

test("una clave de control con un valor largo o raro NO se conserva (podría ser un dato)", () => {
  assert.equal(formaDe({ event: "x".repeat(200) })["event"], "texto(200)");
  assert.equal(formaDe({ event: "con espacios y datos" })["event"], "texto(20)");
});

test("acota: profundidad, claves, elementos de lista y tamaño total; las claves raras se limpian", () => {
  const profundo: Record<string, unknown> = {};
  let cursor = profundo;
  for (let i = 0; i < 20; i++) {
    const siguiente: Record<string, unknown> = {};
    cursor["n"] = siguiente;
    cursor = siguiente;
  }
  assert.ok(JSON.stringify(formaDe(profundo)).includes("…"));
  const muchas: Record<string, unknown> = {};
  for (let i = 0; i < 500; i++) muchas[`clave_${i}_${"x".repeat(30)}`] = "valor";
  assert.ok(JSON.stringify(formaDe(muchas)).length <= 3000 + 200);
  assert.deepEqual((formaDe({ lista: Array.from({ length: 100 }, () => 1) })["lista"] as { lista: number }).lista, 100);
  assert.deepEqual(Object.keys(formaDe({ "clave\u0000rara\n": 1 })), ["clave?rara?"]);
});

test("un valor que no es objeto, un cuerpo vacío y la huella y el id seguro", () => {
  assert.deepEqual(formaDe(null), { valor: null });
  assert.deepEqual(formaDe([1, 2]), { lista: 2, elementos: ["entero", "entero"] });
  assert.deepEqual(formaDeBytes(Buffer.alloc(0)), { bytes: 0, vacio: true, empieza_con: null });
  assert.deepEqual(formaDeBytes(Buffer.from('{"a":')), { bytes: 5, vacio: false, empieza_con: "{" });
  assert.equal(huella("a"), huella(Buffer.from("a")));
  assert.notEqual(huella("a"), huella("b"));
  assert.equal(huella("a").length, 32);
  assert.equal(idSeguro("SM\u0000abc\n"), "SMabc");
  assert.equal(idSeguro("x".repeat(500))!.length, 120);
  assert.equal(idSeguro(""), null);
  assert.equal(idSeguro(1e300), null);
  assert.equal(idSeguro(42), "42");
  assert.equal(idSeguro({}), null);
});
