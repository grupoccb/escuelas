import { test } from "node:test";
import assert from "node:assert/strict";
import { urlDeConversacion } from "./chatwoot.ts";

test("arma el enlace con cuenta, bandeja y conversación", () => {
  assert.equal(urlDeConversacion("https://chat.ejemplo.invalid", { cuenta_id: 1, bandeja_id: 3, conversacion_id: 42 }), "https://chat.ejemplo.invalid/app/accounts/1/inbox/3/conversations/42");
  assert.equal(urlDeConversacion("http://localhost:3001/", { cuenta_id: 1, bandeja_id: null, conversacion_id: 7 }), "http://localhost:3001/app/accounts/1/conversations/7");
});

test("sin URL pública o sin cuenta no hay enlace (no se inventa)", () => {
  assert.equal(urlDeConversacion(null, { cuenta_id: 1, bandeja_id: 3, conversacion_id: 42 }), null);
  assert.equal(urlDeConversacion("https://chat.ejemplo.invalid", { cuenta_id: null, bandeja_id: 3, conversacion_id: 42 }), null);
});
