import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EstadosEntregaChatwoot, codigoDeError } from "./chatwoot/estados.ts";
import { siguienteEstatus } from "./estados.ts";

// Eventos reales que Chatwoot 4.18 entregó al Agent Bot en la prueba de N2 (docs/evidencia-n2).
const LEIDO = JSON.parse(readFileSync(new URL("./chatwoot/payload-estado-leido.json", import.meta.url), "utf8"));
const FALLIDO = JSON.parse(readFileSync(new URL("./chatwoot/payload-estado-fallido.json", import.meta.url), "utf8"));
const fuente = new EstadosEntregaChatwoot();

test("interpreta un 'leído' real de Chatwoot 4.18", () => {
  assert.deepEqual(fuente.interpretar(LEIDO), {
    proveedor: "chatwoot",
    idExterno: "42",
    idProveedor: "SMn2saliente00000000000000000001",
    estado: "leido",
    ocurrioEn: new Date("2026-10-08T03:45:31.685Z"),
    errorCodigo: null,
    errorTexto: null,
    bandeja: { chatwootAccountId: 2, chatwootInboxId: 2 },
  });
});

test("interpreta un 'fallido' real con el código de error de Twilio", () => {
  const c = fuente.interpretar(FALLIDO)!;
  assert.equal(c.estado, "fallido");
  assert.equal(c.errorCodigo, 63016);
  assert.equal(c.errorTexto, "63016 - Fuera de la ventana de 24 h");
});

test("sent, delivered, read y failed se traducen", () => {
  for (const [chatwoot, esperado] of [["sent", "enviado"], ["delivered", "entregado"], ["read", "leido"], ["failed", "fallido"]] as const) {
    const p = structuredClone(LEIDO);
    p.conversation.messages[0].status = chatwoot;
    assert.equal(fuente.interpretar(p)?.estado, esperado, chatwoot);
  }
});

test("no son cambios de estado: mensajes nuevos, del contacto, notas privadas, estados desconocidos, payloads raros", () => {
  assert.equal(fuente.interpretar({ ...LEIDO, event: "message_created" }), null);
  assert.equal(fuente.interpretar({ ...LEIDO, message_type: "incoming" }), null);
  assert.equal(fuente.interpretar({ ...LEIDO, private: true }), null);
  const desconocido = structuredClone(LEIDO);
  desconocido.conversation.messages[0].status = "progress";
  assert.equal(fuente.interpretar(desconocido), null);
  const sinLista = structuredClone(LEIDO);
  sinLista.conversation.messages = [];
  assert.equal(fuente.interpretar(sinLista), null);
  for (const raro of [null, undefined, 3, "x", [], {}]) assert.equal(fuente.interpretar(raro), null);
});

test("código de error: del texto de Chatwoot, o nulo", () => {
  assert.equal(codigoDeError("63016 - Fuera de la ventana"), 63016);
  assert.equal(codigoDeError("Error code: 63024"), 63024);
  assert.equal(codigoDeError("Failed to open TCP connection to api.twilio.com:443"), null);
  assert.equal(codigoDeError(null), null);
});

test("los estados solo avanzan; fallido no pisa lo ya entregado; la entrega real reemplaza a un fallo", () => {
  const casos: [Parameters<typeof siguienteEstatus>[0], Parameters<typeof siguienteEstatus>[1], string | null][] = [
    ["enviando", "enviado", "enviado"],
    ["enviado", "enviado", null],
    ["enviado", "entregado", "entregado"],
    ["enviado", "leido", "leido"],
    ["entregado", "leido", "leido"],
    ["entregado", "enviado", null],
    ["leido", "entregado", null],
    ["leido", "enviado", null],
    ["leido", "leido", null],
    ["enviado", "fallido", "fallido"],
    ["enviando", "fallido", "fallido"],
    ["entregado", "fallido", null],
    ["leido", "fallido", null],
    ["fallido", "entregado", "entregado"],
    ["fallido", "leido", "leido"],
    ["recibido", "entregado", null],
    ["bloqueado", "entregado", null],
  ];
  for (const [actual, estado, esperado] of casos) assert.equal(siguienteEstatus(actual, estado), esperado, `${actual} + ${estado}`);
});
