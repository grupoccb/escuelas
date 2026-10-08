// Rutas del borde de Twilio con un borde de mentira: autenticación (403), códigos de respuesta,
// y que nada interno sale hacia Twilio. La lógica de reintentos está en borde.itest.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { crearApp, type AppDeps } from "./app.ts";
import type { EntradaBorde, ResultadoBorde } from "../mensajeria/index.ts";
import { escucharSinReuso } from "../testutil/servidor.ts";

const TOKEN = "token-de-prueba";
const BASE = "https://escuela.example.test";

function firma(token: string, url: string, cuerpo: string): string {
  const p = Object.fromEntries(new URLSearchParams(cuerpo));
  let datos = url;
  for (const k of Object.keys(p).sort()) datos += k + p[k];
  return createHmac("sha1", token).update(datos).digest("base64");
}

function montar(extra: { resultado?: ResultadoBorde | Error; token?: string | null; base?: string | null } = {}) {
  const llamadas: EntradaBorde[] = [];
  const deps: AppDeps = {
    pingDb: async () => {},
    secretoWebhookChatwoot: "s",
    procesarEntrante: async () => ({ resultado: "procesado" }),
    registrarTomaDeConversacion: async () => "tomada",
    estadosEntrega: { interpretar: () => null },
    registrarEstadoEntrega: async () => "actualizado",
    twilio: {
      authToken: extra.token === undefined ? TOKEN : extra.token,
      publicBaseUrl: extra.base === undefined ? BASE : extra.base,
      borde: {
        procesar: async (e) => {
          llamadas.push(e);
          if (extra.resultado instanceof Error) throw extra.resultado;
          return extra.resultado ?? "reenviado";
        },
        reenviarPendientes: async () => ({ reenviados: 0, fallidos: 0, abandonados: 0, errores: 0 }),
        reenviarSinRegistro: async () => true,
        alertas: { organizacionDesconocida: 0, eventosAbandonados: 0 },
      },
    },
  };
  return { deps, llamadas };
}

async function post(deps: AppDeps, ruta: string, cuerpo: string, encabezados: Record<string, string> = {}) {
  const server = escucharSinReuso(crearApp(deps));
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${ruta}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...encabezados },
      body: cuerpo,
    });
    return { status: res.status, texto: await res.text(), tipo: res.headers.get("content-type") };
  } finally {
    server.close();
  }
}

const CUERPO = "Body=Hola&From=whatsapp%3A%2B5215512345678&MessageSid=SM1&To=whatsapp%3A%2B14155238886";
const firmado = (ruta: string, cuerpo = CUERPO, token = TOKEN) => ({ "x-twilio-signature": firma(token, `${BASE}${ruta}`, cuerpo) });

test("entrantes con firma válida: 200 con TwiML vacío y el borde recibe los parámetros y el cuerpo crudo", async () => {
  const { deps, llamadas } = montar();
  const r = await post(deps, "/webhooks/twilio/entrantes", CUERPO, firmado("/webhooks/twilio/entrantes"));
  assert.equal(r.status, 200);
  assert.match(r.tipo ?? "", /xml/);
  assert.match(r.texto, /<Response\/>$/);
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0]!.tipo, "entrante");
  assert.equal(llamadas[0]!.cuerpo.toString(), CUERPO);
  assert.equal(llamadas[0]!.params["MessageSid"], "SM1");
  assert.equal(llamadas[0]!.cabeceras["content-type"], "application/x-www-form-urlencoded");
});

test("estados con firma válida: 200 vacío", async () => {
  const { deps, llamadas } = montar();
  const cuerpo = "MessageSid=SM1&MessageStatus=delivered";
  const r = await post(deps, "/webhooks/twilio/estados", cuerpo, firmado("/webhooks/twilio/estados", cuerpo));
  assert.deepEqual([r.status, r.texto], [200, ""]);
  assert.equal(llamadas[0]!.tipo, "estado");
});

test("la query string forma parte de lo firmado", async () => {
  const { deps, llamadas } = montar();
  const ruta = "/webhooks/twilio/entrantes?canal=uno";
  assert.equal((await post(deps, ruta, CUERPO, firmado(ruta))).status, 200);
  assert.equal((await post(deps, ruta, CUERPO, firmado("/webhooks/twilio/entrantes"))).status, 403);
  assert.equal(llamadas.length, 1);
});

test("firma inválida, ausente, de otro token, de otra URL o con el cuerpo alterado: 403 sin cuerpo y el borde no se entera", async () => {
  const { deps, llamadas } = montar();
  const ruta = "/webhooks/twilio/entrantes";
  const casos: [string, string, Record<string, string>][] = [
    ["sin firma", CUERPO, {}],
    ["firma basura", CUERPO, { "x-twilio-signature": "AAAA" }],
    ["otro token", CUERPO, firmado(ruta, CUERPO, "otro-token")],
    ["otra ruta", CUERPO, firmado("/webhooks/twilio/estados")],
    ["cuerpo alterado", CUERPO.replace("Hola", "Hola!"), firmado(ruta)],
    ["parámetro agregado", `${CUERPO}&Extra=1`, firmado(ruta)],
  ];
  for (const [nombre, cuerpo, enc] of casos) {
    const r = await post(deps, ruta, cuerpo, enc);
    assert.deepEqual([r.status, r.texto], [403, ""], nombre);
  }
  assert.equal(llamadas.length, 0);
});

test("sin token o sin URL pública configurados se rechaza todo, aunque la firma sea correcta", async () => {
  const ruta = "/webhooks/twilio/entrantes";
  for (const extra of [{ token: null }, { token: "" }, { base: null }, { base: "" }]) {
    const { deps, llamadas } = montar(extra);
    assert.equal((await post(deps, ruta, CUERPO, firmado(ruta))).status, 403, JSON.stringify(extra));
    assert.equal(llamadas.length, 0);
  }
  const sinBorde: AppDeps = { ...montar().deps };
  delete sinBorde.twilio;
  assert.equal((await post(sinBorde, ruta, CUERPO, firmado(ruta))).status, 403);
});

test("respuestas del borde (WH): en curso 503, reenvío fallido 502, falla del momento 503; sin identificador y datos inesperados 200 (antes 400 y 500); duplicado y organización desconocida 200", async () => {
  const ruta = "/webhooks/twilio/entrantes";
  const esperados: [ResultadoBorde | Error, number][] = [
    ["sin_identificador", 200],
    ["en_curso", 503],
    ["fallo_reenvio", 502],
    [Object.assign(new Error("Timed out fetching a new connection from the connection pool"), { code: "P2024" }), 503],
    [new Error("detalle interno: contraseña de la base"), 200],
    ["duplicado", 200],
    ["organizacion_desconocida", 200],
    ["reenviado_sin_organizacion", 200],
  ];
  for (const [resultado, status] of esperados) {
    const { deps } = montar({ resultado });
    const r = await post(deps, ruta, CUERPO, firmado(ruta));
    assert.equal(r.status, status, String(resultado));
    if (status >= 500) assert.equal(r.texto, "", "nada interno hacia Twilio");
    assert.ok(!r.texto.includes("contraseña"));
  }
});

test("un cuerpo mayor al límite se rechaza con 413, vacío, sin llegar al borde", async () => {
  const { deps, llamadas } = montar();
  const grande = `Body=${"a".repeat(150_000)}&MessageSid=SM1`;
  const ruta = "/webhooks/twilio/entrantes";
  const r = await post(deps, ruta, grande, firmado(ruta, grande));
  assert.deepEqual([r.status, r.texto], [413, ""]);
  assert.equal(llamadas.length, 0);
});

test("sólo POST: un GET a la ruta no existe", async () => {
  const { deps } = montar();
  const server = escucharSinReuso(crearApp(deps));
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/webhooks/twilio/entrantes`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});
