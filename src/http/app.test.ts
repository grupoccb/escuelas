import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { crearApp, type AppDeps } from "./app.ts";
import { firmarCuerpoChatwoot } from "../mensajeria/chatwoot/webhook.ts";
import type { EventoEntrante } from "../mensajeria/index.ts";
import { payloadMensajeEntrante } from "../mensajeria/chatwoot/fixtures.ts";

const SECRETO = "secreto-de-prueba";
const AHORA = new Date("2026-10-07T18:00:00Z");

function deps(extra: Partial<AppDeps> = {}): AppDeps & { recibidos: EventoEntrante[] } {
  const recibidos: EventoEntrante[] = [];
  return {
    recibidos,
    pingDb: async () => {},
    secretoWebhookChatwoot: SECRETO,
    procesarEntrante: async (e) => {
      recibidos.push(e);
      return { resultado: "procesado" };
    },
    reloj: () => AHORA,
    ...extra,
  };
}

async function pedir(
  d: AppDeps,
  metodo: "GET" | "POST",
  ruta: string,
  cuerpo?: string,
  encabezados: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  const server = crearApp(d).listen(0);
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${ruta}`, {
      method: metodo,
      headers: { "content-type": "application/json", ...encabezados },
      ...(cuerpo !== undefined ? { body: cuerpo } : {}),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    server.close();
  }
}

function firmado(cuerpo: string, timestamp = String(Math.floor(AHORA.getTime() / 1000)), secreto = SECRETO) {
  return {
    "x-chatwoot-timestamp": timestamp,
    "x-chatwoot-signature": firmarCuerpoChatwoot(secreto, timestamp, Buffer.from(cuerpo)),
  };
}

test("/salud responde 200 cuando la base contesta", async () => {
  const r = await pedir(deps(), "GET", "/salud");
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, db: "ok" });
});

test("/salud responde 503 cuando la base falla", async () => {
  const r = await pedir(deps({ pingDb: async () => { throw new Error("caída"); } }), "GET", "/salud");
  assert.equal(r.status, 503);
  assert.deepEqual(r.body, { ok: false, db: "sin conexión" });
});

test("webhook con firma válida: procesa el mensaje del contacto", async () => {
  const d = deps();
  const cuerpo = JSON.stringify(payloadMensajeEntrante({ id: 77, content: "Hola" }));
  const r = await pedir(d, "POST", "/webhooks/chatwoot", cuerpo, firmado(cuerpo));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, resultado: "procesado" });
  assert.equal(d.recibidos.length, 1);
  assert.equal(d.recibidos[0]!.idMensaje, "77");
  assert.equal(d.recibidos[0]!.contenido, "Hola");
});

test("webhook sin firma, con firma de otro secreto o con el cuerpo alterado: 401 y no procesa", async () => {
  const d = deps();
  const cuerpo = JSON.stringify(payloadMensajeEntrante({ id: 78 }));
  const casos: Record<string, string>[] = [
    {},
    firmado(cuerpo, undefined, "otro-secreto"),
    firmado(cuerpo.replace("78", "79")),
  ];
  for (const encabezados of casos) {
    const r = await pedir(d, "POST", "/webhooks/chatwoot", cuerpo, encabezados);
    assert.equal(r.status, 401);
  }
  assert.equal(d.recibidos.length, 0);
});

test("webhook con timestamp de hace más de 5 minutos: 401", async () => {
  const d = deps();
  const cuerpo = JSON.stringify(payloadMensajeEntrante({ id: 80 }));
  const viejo = String(Math.floor(AHORA.getTime() / 1000) - 301);
  const r = await pedir(d, "POST", "/webhooks/chatwoot", cuerpo, firmado(cuerpo, viejo));
  assert.equal(r.status, 401);
  assert.equal(d.recibidos.length, 0);
});

test("sin secreto configurado se rechaza todo", async () => {
  const d = deps({ secretoWebhookChatwoot: null });
  const cuerpo = JSON.stringify(payloadMensajeEntrante({ id: 81 }));
  const r = await pedir(d, "POST", "/webhooks/chatwoot", cuerpo, firmado(cuerpo));
  assert.equal(r.status, 401);
});

test("eventos que no son mensajes del contacto se ignoran con 200", async () => {
  const d = deps();
  const saliente = JSON.stringify(payloadMensajeEntrante({ id: 82, message_type: "outgoing" }));
  const r = await pedir(d, "POST", "/webhooks/chatwoot", saliente, firmado(saliente));
  assert.deepEqual([r.status, r.body], [200, { ok: true, resultado: "ignorado" }]);
  assert.equal(d.recibidos.length, 0);
});

test("si el procesamiento falla responde 500 para que Chatwoot reintente", async () => {
  const d = deps({ procesarEntrante: async () => { throw new Error("base caída"); } });
  const cuerpo = JSON.stringify(payloadMensajeEntrante({ id: 83 }));
  const r = await pedir(d, "POST", "/webhooks/chatwoot", cuerpo, firmado(cuerpo));
  assert.equal(r.status, 500);
});
