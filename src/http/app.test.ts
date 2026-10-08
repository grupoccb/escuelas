import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { crearApp, type AppDeps } from "./app.ts";
import { firmarCuerpoChatwoot } from "../mensajeria/chatwoot/webhook.ts";
import { readFileSync } from "node:fs";
import { EstadosEntregaChatwoot, type CambioDeEstado, type EventoEntrante, type EventoTomaDeConversacion } from "../mensajeria/index.ts";
import { payloadMensajeEntrante } from "../mensajeria/chatwoot/fixtures.ts";
import { escucharSinReuso } from "../testutil/servidor.ts";

const SECRETO = "secreto-de-prueba";
const AHORA = new Date("2026-10-07T18:00:00Z");

function deps(extra: Partial<AppDeps> = {}): AppDeps & { recibidos: EventoEntrante[]; estados: CambioDeEstado[]; tomas: EventoTomaDeConversacion[] } {
  const recibidos: EventoEntrante[] = [];
  const estados: CambioDeEstado[] = [];
  const tomas: EventoTomaDeConversacion[] = [];
  return {
    recibidos,
    estados,
    tomas,
    registrarTomaDeConversacion: async (t) => {
      tomas.push(t);
      return "tomada";
    },
    estadosEntrega: new EstadosEntregaChatwoot(),
    registrarEstadoEntrega: async (c) => {
      estados.push(c);
      return "actualizado";
    },
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
  const server = escucharSinReuso(crearApp(d));
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

const ESTADO_LEIDO = readFileSync(new URL("../mensajeria/chatwoot/payload-estado-leido.json", import.meta.url), "utf8");

test("un cambio de estado de entrega firmado se registra (P3)", async () => {
  const d = deps();
  const r = await pedir(d, "POST", "/webhooks/chatwoot", ESTADO_LEIDO, firmado(ESTADO_LEIDO));
  assert.deepEqual([r.status, r.body], [200, { ok: true, resultado: "actualizado" }]);
  assert.equal(d.estados.length, 1);
  assert.equal(d.estados[0]!.estado, "leido");
  assert.equal(d.recibidos.length, 0, "no es un mensaje del contacto");
});

test("un cambio de estado sin firma válida se rechaza y no se registra (invariante 9)", async () => {
  const d = deps();
  const r = await pedir(d, "POST", "/webhooks/chatwoot", ESTADO_LEIDO, firmado(ESTADO_LEIDO, undefined, "otro-secreto"));
  assert.equal(r.status, 401);
  assert.equal(d.estados.length, 0);
});

test("si registrar el estado falla responde 500 para que Chatwoot reintente", async () => {
  const d = deps({ registrarEstadoEntrega: async () => { throw new Error("base caída"); } });
  const r = await pedir(d, "POST", "/webhooks/chatwoot", ESTADO_LEIDO, firmado(ESTADO_LEIDO));
  assert.equal(r.status, 500);
});

const fixtureJson = (nombre: string): string => readFileSync(new URL(`../mensajeria/chatwoot/payload-${nombre}.json`, import.meta.url), "utf8");

test("A3: una asignación a un asesor, firmada, registra la toma de la conversación", async () => {
  const d = deps();
  const cuerpo = fixtureJson("conversacion-asignada");
  const r = await pedir(d, "POST", "/webhooks/chatwoot", cuerpo, firmado(cuerpo));
  assert.deepEqual([r.status, r.body], [200, { ok: true, resultado: "tomada" }]);
  assert.deepEqual(d.tomas.map((t) => [t.via, t.chatwootConversacionId]), [["asignacion", 11]]);
  assert.equal(d.recibidos.length + d.estados.length, 0);
});

test("A3: el primer mensaje de un asesor registra la toma; el del bot y abrir o resolver no", async () => {
  const d = deps();
  const asesor = fixtureJson("mensaje-asesor");
  assert.equal((await pedir(d, "POST", "/webhooks/chatwoot", asesor, firmado(asesor))).status, 200);
  assert.deepEqual(d.tomas.map((t) => t.via), ["mensaje"]);

  for (const nombre of ["mensaje-bot", "nota-bot", "conversacion-abierta", "conversacion-estado-cambiado", "conversacion-resuelta", "conversacion-bot-suelta"]) {
    const cuerpo = fixtureJson(nombre);
    const r = await pedir(d, "POST", "/webhooks/chatwoot", cuerpo, firmado(cuerpo));
    assert.deepEqual([r.status, r.body], [200, { ok: true, resultado: "ignorado" }], nombre);
  }
  assert.equal(d.tomas.length, 1, "solo el mensaje del asesor");
});

test("A3: una toma sin firma válida se rechaza y no apaga al bot (invariante 9)", async () => {
  const d = deps();
  const cuerpo = fixtureJson("conversacion-asignada");
  const r = await pedir(d, "POST", "/webhooks/chatwoot", cuerpo, firmado(cuerpo, undefined, "otro-secreto"));
  assert.equal(r.status, 401);
  assert.equal(d.tomas.length, 0);
});

test("A3: si registrar la toma falla responde 500 para que Chatwoot reintente", async () => {
  const d = deps({ registrarTomaDeConversacion: async () => { throw new Error("base caída"); } });
  const cuerpo = fixtureJson("conversacion-asignada");
  assert.equal((await pedir(d, "POST", "/webhooks/chatwoot", cuerpo, firmado(cuerpo))).status, 500);
});

test("B5: quitar el asesor, firmado, registra la desasignación; sin el manejador (o sin firma) no pasa nada", async () => {
  const desasignaciones: number[] = [];
  const d = deps({ registrarDesasignacion: async (e) => { desasignaciones.push(e.chatwootConversacionId); return "desasignada"; } });
  const cuerpo = fixtureJson("conversacion-desasignada");
  const r = await pedir(d, "POST", "/webhooks/chatwoot", cuerpo, firmado(cuerpo));
  assert.deepEqual([r.status, r.body], [200, { ok: true, resultado: "desasignada" }]);
  assert.deepEqual(desasignaciones, [11]);
  assert.equal(d.tomas.length, 0, "desasignar no es tomar");

  assert.equal((await pedir(d, "POST", "/webhooks/chatwoot", cuerpo, firmado(cuerpo, undefined, "otro-secreto"))).status, 401);
  assert.deepEqual(desasignaciones, [11]);

  const sin = deps();
  assert.deepEqual((await pedir(sin, "POST", "/webhooks/chatwoot", cuerpo, firmado(cuerpo))).body, { ok: true, resultado: "ignorado" });

  const falla = deps({ registrarDesasignacion: async () => { throw new Error("base caída"); } });
  assert.equal((await pedir(falla, "POST", "/webhooks/chatwoot", cuerpo, firmado(cuerpo))).status, 500);
});

// ── EB-05: HSTS con la configuración REAL (no con un valor que solo el test pasa a mano) ─────────

async function cabecera(extra: Partial<AppDeps>, nombre: string): Promise<string | null> {
  const server = escucharSinReuso(crearApp(deps(extra)));
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/salud`);
    await res.arrayBuffer();
    return res.headers.get(nombre);
  } finally {
    server.close();
  }
}

test("HSTS: con NODE_ENV=production (cookie segura por defecto) o ORIGEN_PUBLICO https o COOKIE_SEGURA=true se emite; sin nada de eso, no", async () => {
  const api = { prisma: {} as never };
  const hsts = (entorno: NodeJS.ProcessEnv, conApi = true) => cabecera({ entorno, ...(conApi ? { api } : {}) }, "strict-transport-security");
  assert.match((await hsts({ NODE_ENV: "production" })) ?? "", /max-age=\d+/, "producción: la cookie es Secure por defecto, así que HSTS también");
  assert.match((await hsts({ ORIGEN_PUBLICO: "https://app.escuela.example" })) ?? "", /includeSubDomains/);
  assert.match((await hsts({ COOKIE_SEGURA: "true" })) ?? "", /max-age/);
  assert.equal(await hsts({ NODE_ENV: "production", COOKIE_SEGURA: "false", ORIGEN_PUBLICO: "http://localhost:3000" }), null, "la demo en http no manda HSTS");
  assert.equal(await hsts({}), null);
  assert.equal(await hsts({ ORIGEN_PUBLICO: "http://localhost:3000" }), null);
  // Sin API montada también se respeta un origen https.
  assert.match((await hsts({ ORIGEN_PUBLICO: "https://app.escuela.example" }, false)) ?? "", /max-age/);
});
