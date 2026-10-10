import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearFormulario, verificarFirmaTwilio } from "../twilio/firma.ts";
import { entranteDePrueba } from "./entrante-de-prueba.ts";

const base = { origen: "https://t.example.test", token: "0123456789abcdef0123456789abcdef", sid: `AC${"1".repeat(32)}`, numeroEscuela: "whatsapp:+14155238886", texto: "Hola" };

test("arma un entrante que la firma de Twilio valida contra la URL pública, respetando la forma +521 o +52 que se pidió", () => {
  for (const desde of ["+5215512345678", "+525512345678"]) {
    const p = entranteDePrueba({ ...base, desde });
    assert.equal(p.url, "https://t.example.test/webhooks/twilio/entrantes");
    const params = parsearFormulario(Buffer.from(p.cuerpo));
    assert.equal(params["From"], `whatsapp:${desde}`);
    assert.equal(params["To"], "whatsapp:+14155238886");
    assert.ok(verificarFirmaTwilio(base.token, p.url, params, p.firma));
    assert.ok(!verificarFirmaTwilio(base.token, "http://localhost:3000/webhooks/twilio/entrantes", params, p.firma));
  }
});

test("cada llamada trae su propio MessageSid y un celular inválido se rechaza con un mensaje claro", () => {
  const a = parsearFormulario(Buffer.from(entranteDePrueba({ ...base, desde: "+525512345678" }).cuerpo))["MessageSid"];
  const b = parsearFormulario(Buffer.from(entranteDePrueba({ ...base, desde: "+525512345678" }).cuerpo))["MessageSid"];
  assert.notEqual(a, b);
  assert.throws(() => entranteDePrueba({ ...base, desde: "hola" }), /no es un celular válido/);
});
