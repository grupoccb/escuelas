import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interpretarEventoChatwoot, firmarCuerpoChatwoot, verificarWebhookChatwoot } from "./webhook.ts";
import { payloadMensajeEntrante } from "./fixtures.ts";
import { AtribucionDesdeChatwoot } from "./atribucion.ts";

// Payload real de Chatwoot 4.18 local (Message#webhook_data con to_json), con nombres de
// vertical y sucursal reemplazados.
const REAL = JSON.parse(readFileSync(new URL("./payload-real.json", import.meta.url), "utf8"));

test("interpreta el payload real de Chatwoot 4.18", () => {
  assert.deepEqual(interpretarEventoChatwoot(REAL), {
    chatwootAccountId: 2,
    chatwootInboxId: 1,
    chatwootConversacionId: 1,
    idMensaje: "8",
    contenido: "2",
    estadoConversacion: "open",
    contacto: { nombre: "Contacto de prueba", telefono: "+5215560098129" },
    creadoEn: new Date("2026-10-08T02:56:14.769Z"),
    llave: { proveedor: "chatwoot", id: "8" },
    numeroReceptor: null,
    crudo: REAL,
  });
});

test("el fixture de los tests produce lo mismo que el payload real", () => {
  const real = interpretarEventoChatwoot(REAL)!;
  const fixture = interpretarEventoChatwoot(
    payloadMensajeEntrante({ id: 8, content: "2", cuenta: 2, bandeja: 1, conversacion: 1, estado: "open", telefono: "+5215560098129" }),
  )!;
  // El campo `crudo` es el documento original: por definición distinto entre los dos payloads.
  assert.deepEqual({ ...fixture, creadoEn: null, crudo: null }, { ...real, creadoEn: null, crudo: null });
});

test("sin teléfono en el remitente usa conversation.meta.sender", () => {
  const p = structuredClone(REAL);
  delete p.sender;
  assert.equal(interpretarEventoChatwoot(p)?.contacto.telefono, "+5215560098129");
});

test("ignora lo que no es un mensaje nuevo del contacto", () => {
  assert.equal(interpretarEventoChatwoot({ ...REAL, message_type: "outgoing" }), null);
  assert.equal(interpretarEventoChatwoot({ ...REAL, private: true }), null);
  assert.equal(interpretarEventoChatwoot({ ...REAL, event: "conversation_status_changed" }), null);
  assert.equal(interpretarEventoChatwoot({ ...REAL, id: "8" }), null);
  assert.equal(interpretarEventoChatwoot(null), null);
  assert.equal(interpretarEventoChatwoot([]), null);
});

test("contenido nulo (solo adjunto) llega como texto vacío", () => {
  assert.equal(interpretarEventoChatwoot({ ...REAL, content: null })?.contenido, "");
});

test("firma: mismo algoritmo que Chatwoot (HMAC-SHA256 de \"timestamp.cuerpo\")", () => {
  // Vector calculado aparte con: printf '1791400000.{"a":1}' | openssl dgst -sha256 -hmac secreto
  assert.equal(
    firmarCuerpoChatwoot("secreto", "1791400000", Buffer.from('{"a":1}')),
    "sha256=8c97e83720b1e07497418ac854b625e3e5ce4fc294d5f0b2716d4dc68363dabd",
  );
});

test("verificarWebhookChatwoot nunca lanza con encabezados raros", () => {
  const cuerpo = Buffer.from("{}");
  const peticion = (h: Record<string, string>) => ({ get: (n: string) => h[n] });
  const casos: Record<string, string>[] = [{}, { "x-chatwoot-signature": "x" }, { "x-chatwoot-timestamp": "abc", "x-chatwoot-signature": "sha256=00" }];
  for (const h of casos) {
    assert.equal(verificarWebhookChatwoot(peticion(h), cuerpo, "s"), false);
  }
});

test("llave de idempotencia: en un canal de Twilio es el MessageSid, no el id de Chatwoot (H2)", () => {
  const twilio = interpretarEventoChatwoot(payloadMensajeEntrante({ id: 41, canal: "Channel::TwilioSms", sourceId: "SMabc123" }))!;
  assert.deepEqual(twilio.llave, { proveedor: "twilio", id: "SMabc123" });
  // El mismo MessageSid reintentado llega con otro id de Chatwoot y produce la misma llave.
  const reintento = interpretarEventoChatwoot(payloadMensajeEntrante({ id: 99, canal: "Channel::TwilioSms", sourceId: "SMabc123" }))!;
  assert.deepEqual(reintento.llave, twilio.llave);
  assert.notEqual(reintento.idMensaje, twilio.idMensaje);
  // Una bandeja API no trae MessageSid: se usa el id de Chatwoot.
  assert.deepEqual(interpretarEventoChatwoot(payloadMensajeEntrante({ id: 7 }))!.llave, { proveedor: "chatwoot", id: "7" });
  // Un source_id en una bandeja que no es de Twilio no se toma por MessageSid.
  assert.deepEqual(interpretarEventoChatwoot(payloadMensajeEntrante({ id: 7, sourceId: "otro" }))!.llave, { proveedor: "chatwoot", id: "7" });
});

test("atribución vía A: lee content_attributes.referral tal como lo entregó Chatwoot 4.18", async () => {
  const referral = {
    source_id: "120200000000000001",
    source_type: "ad",
    source_url: "https://fb.me/anuncio",
    headline: "Titular",
    body: "Texto",
    ctwa_clid: "AffClid123",
  };
  const evento = interpretarEventoChatwoot(payloadMensajeEntrante({ canal: "Channel::TwilioSms", sourceId: "SM1", referral }))!;
  const atribucion = await new AtribucionDesdeChatwoot().obtener(evento);
  assert.deepEqual(atribucion, {
    anuncioId: "120200000000000001",
    ctwaClid: "AffClid123",
    anuncioTitulo: "Titular",
    tipoOrigen: "ad",
    urlOrigen: "https://fb.me/anuncio",
    crudo: referral,
  });
});

test("atribución vía A: sin referral, o sin source_id, no hay atribución", async () => {
  const fuente = new AtribucionDesdeChatwoot();
  assert.equal(await fuente.obtener(interpretarEventoChatwoot(payloadMensajeEntrante())!), null);
  const sinSource = interpretarEventoChatwoot(payloadMensajeEntrante({ referral: { ctwa_clid: "soloClid" } }))!;
  assert.equal(await fuente.obtener(sinSource), null);
});
