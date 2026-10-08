import { test } from "node:test";
import assert from "node:assert/strict";
import { mensajeriaDesdeEntorno } from "./index.ts";

test("sin credenciales de Chatwoot y fuera de producción: transporte falso", () => {
  assert.equal(mensajeriaDesdeEntorno({}).transporte, "falso");
  assert.equal(mensajeriaDesdeEntorno({ NODE_ENV: "development" }).transporte, "falso");
});

test("con credenciales: transporte de Chatwoot", () => {
  const m = mensajeriaDesdeEntorno({ CHATWOOT_URL: "http://chatwoot:3000", CHATWOOT_BOT_TOKEN: "t", CHATWOOT_WEBHOOK_SECRETO: "s" });
  assert.equal(m.transporte, "chatwoot");
  assert.equal(m.secretoWebhookChatwoot, "s");
});

test("NODE_ENV=production sin credenciales: no arranca (F1-11)", () => {
  assert.throws(() => mensajeriaDesdeEntorno({ NODE_ENV: "production" }), /CHATWOOT_URL/);
  assert.throws(() => mensajeriaDesdeEntorno({ NODE_ENV: "production", CHATWOOT_URL: "http://x" }), /CHATWOOT_BOT_TOKEN/);
  assert.throws(() => mensajeriaDesdeEntorno({ NODE_ENV: "production", CHATWOOT_BOT_TOKEN: "t" }), /CHATWOOT_URL/);
});

test("NODE_ENV=production con credenciales arranca normal", () => {
  const m = mensajeriaDesdeEntorno({ NODE_ENV: "production", CHATWOOT_URL: "http://chatwoot:3000", CHATWOOT_BOT_TOKEN: "t" });
  assert.equal(m.transporte, "chatwoot");
});
