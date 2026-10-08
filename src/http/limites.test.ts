// Protección de las rutas públicas (B6): límite por IP, 429 con Retry-After, el webhook firmado
// legítimo no se ahoga, otra IP no se afecta, `trust proxy` configurable y tope de cuerpo por ruta.
// Sin base de datos: webhooks con un borde de mentira.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { crearApp, type AppDeps } from "./app.ts";
import { limitesDesdeEntorno } from "./config-limites.ts";
import { LimitadorDeTasa, perfilPorMinuto } from "./limite.ts";
import { firmarCuerpoChatwoot } from "../mensajeria/chatwoot/webhook.ts";
import { escucharSinReuso } from "../testutil/servidor.ts";

const TOKEN = "token-de-prueba";
const BASE = "https://escuela.example.test";
const SECRETO = "secreto-de-prueba";
const AHORA = new Date("2026-10-07T18:00:00Z");
const CUERPO_TWILIO = "Body=Hola&From=whatsapp%3A%2B5215512345678&MessageSid=SM1&To=whatsapp%3A%2B14155238886";

function firmaTwilio(ruta: string, cuerpo = CUERPO_TWILIO): string {
  const p = Object.fromEntries(new URLSearchParams(cuerpo));
  let datos = `${BASE}${ruta}`;
  for (const k of Object.keys(p).sort()) datos += k + p[k];
  return createHmac("sha1", TOKEN).update(datos).digest("base64");
}
const firmaChatwoot = (cuerpo: string, secreto = SECRETO) => {
  const ts = String(Math.floor(AHORA.getTime() / 1000));
  return { "x-chatwoot-timestamp": ts, "x-chatwoot-signature": firmarCuerpoChatwoot(secreto, ts, Buffer.from(cuerpo)) };
};

interface Opciones {
  fallos?: number;
  techo?: number;
  confiarEnProxy?: AppDeps["confiarEnProxy"];
}

function montar(o: Opciones = {}) {
  let borde = 0;
  let entrantes = 0;
  const limites = { ...limitesDesdeEntorno({}), webhookFallos: perfilPorMinuto(o.fallos ?? 5), webhook: perfilPorMinuto(o.techo ?? 6000) };
  const app = crearApp({
    pingDb: async () => {},
    secretoWebhookChatwoot: SECRETO,
    procesarEntrante: async () => {
      entrantes++;
      return { resultado: "procesado" };
    },
    registrarTomaDeConversacion: async () => "tomada",
    estadosEntrega: { interpretar: () => null },
    registrarEstadoEntrega: async () => "actualizado",
    reloj: () => AHORA,
    limites,
    limitador: new LimitadorDeTasa(),
    ...(o.confiarEnProxy !== undefined ? { confiarEnProxy: o.confiarEnProxy } : {}),
    twilio: {
      authToken: TOKEN,
      publicBaseUrl: BASE,
      borde: {
        procesar: async () => {
          borde++;
          return "reenviado";
        },
        reenviarPendientes: async () => ({ reenviados: 0, fallidos: 0, abandonados: 0, errores: 0 }),
        alertas: { organizacionDesconocida: 0, eventosAbandonados: 0 },
      },
    },
  });
  const server = escucharSinReuso(app);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const twilio = async (ip: string | null, valida: boolean, ruta = "/webhooks/twilio/entrantes") => {
    const res = await fetch(`${base}${ruta}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": valida ? firmaTwilio(ruta) : "firma-falsa", ...(ip ? { "x-forwarded-for": ip } : {}) },
      body: CUERPO_TWILIO,
    });
    const texto = await res.text();
    return { estado: res.status, reintentar: res.headers.get("retry-after"), texto };
  };
  const chatwoot = async (ip: string | null, valida: boolean) => {
    const cuerpo = JSON.stringify({ event: "x" });
    const res = await fetch(`${base}/webhooks/chatwoot`, {
      method: "POST",
      headers: { "content-type": "application/json", ...firmaChatwoot(cuerpo, valida ? SECRETO : "otro"), ...(ip ? { "x-forwarded-for": ip } : {}) },
      body: cuerpo,
    });
    await res.arrayBuffer();
    return { estado: res.status, reintentar: res.headers.get("retry-after") };
  };
  return { base, twilio, chatwoot, llamadasAlBorde: () => borde, entrantes: () => entrantes, cerrar: () => server.close() };
}

test("ráfaga de webhooks FIRMADOS legítimos (200 seguidos desde una IP): ninguno se rechaza por el límite", async () => {
  const m = montar({ fallos: 5 });
  try {
    for (let i = 0; i < 200; i++) assert.equal((await m.twilio(null, true)).estado, 200, `twilio ${i}`);
    for (let i = 0; i < 100; i++) assert.equal((await m.chatwoot(null, true)).estado, 200, `chatwoot ${i}`);
    assert.equal(m.llamadasAlBorde(), 200);
  } finally {
    m.cerrar();
  }
});

test("firmas inválidas en ráfaga: tras el cupo, 429 con Retry-After y sin cuerpo, y ya no llegan ni al borde", async () => {
  const m = montar({ fallos: 5 });
  try {
    for (let i = 0; i < 5; i++) assert.equal((await m.twilio(null, false)).estado, 403, `intento ${i + 1}`);
    const r = await m.twilio(null, false);
    assert.equal(r.estado, 429);
    assert.ok(Number(r.reintentar) >= 1, `Retry-After ${r.reintentar}`);
    assert.equal(r.texto, "");
    assert.equal(m.llamadasAlBorde(), 0);
    // Y Chatwoot, que tiene su propio cupo, sigue aceptando lo legítimo de la misma IP.
    assert.equal((await m.chatwoot(null, true)).estado, 200);
  } finally {
    m.cerrar();
  }
});

test("el cupo de fallos es por IP: otra IP (detrás de un proxy de confianza) no se afecta, y lo firmado legítimo pasa aunque la IP ya agotó sus fallos", async () => {
  const m = montar({ fallos: 3, confiarEnProxy: 1 });
  try {
    const atacante = "203.0.113.66";
    const legitima = "198.51.100.10";
    for (let i = 0; i < 3; i++) assert.equal((await m.twilio(atacante, false)).estado, 403);
    assert.equal((await m.twilio(atacante, false)).estado, 429);
    assert.equal((await m.twilio(legitima, true)).estado, 200, "otra IP, intacta");
    assert.equal((await m.twilio(legitima, false)).estado, 403, "y sus propios fallos cuentan aparte");
    assert.equal((await m.twilio(atacante, true)).estado, 200, "lo firmado y legítimo NUNCA espera por los fallos (EB-04), venga de la IP que venga");
  } finally {
    m.cerrar();
  }
});

test("sin `trust proxy`, X-Forwarded-For NO sirve para esquivar el límite (la IP es la de la conexión)", async () => {
  const m = montar({ fallos: 3 });
  try {
    for (let i = 0; i < 3; i++) assert.equal((await m.twilio(`10.0.0.${i + 1}`, false)).estado, 403);
    assert.equal((await m.twilio("10.9.9.9", false)).estado, 429, "cambiar la cabecera no da cupo nuevo");
  } finally {
    m.cerrar();
  }
});

test("el techo de webhooks por IP frena una inundación aunque esté bien firmada, con Retry-After", async () => {
  const m = montar({ techo: 20 });
  try {
    const estados: number[] = [];
    for (let i = 0; i < 25; i++) estados.push((await m.twilio(null, true)).estado);
    assert.equal(estados.filter((e) => e === 200).length, 20);
    assert.equal(estados.filter((e) => e === 429).length, 5);
    assert.ok(Number((await m.twilio(null, true)).reintentar) >= 1);
  } finally {
    m.cerrar();
  }
});

test("las dos rutas de Twilio y la de Chatwoot llevan cupos separados", async () => {
  const m = montar({ fallos: 2 });
  try {
    for (let i = 0; i < 2; i++) await m.twilio(null, false);
    assert.equal((await m.twilio(null, false)).estado, 429);
    assert.equal((await m.twilio(null, true, "/webhooks/twilio/estados")).estado, 200, "estados: otro cupo");
    assert.equal((await m.chatwoot(null, false)).estado, 401);
  } finally {
    m.cerrar();
  }
});

test("tope de cuerpo por ruta: 413 si lo pasa (Twilio 100 KB, Chatwoot 1 MB)", async () => {
  const m = montar();
  try {
    const grande = await fetch(`${m.base}/webhooks/twilio/entrantes`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "x" },
      body: "a=".padEnd(101 * 1024, "x"),
    });
    assert.equal(grande.status, 413);
    const cw = await fetch(`${m.base}/webhooks/chatwoot`, { method: "POST", headers: { "content-type": "application/json" }, body: "x".repeat(1024 * 1024 + 10) });
    assert.equal(cw.status, 413);
  } finally {
    m.cerrar();
  }
});

test("sin límites configurados (los demás tests de la app) nada se limita", async () => {
  const app = crearApp({
    pingDb: async () => {},
    secretoWebhookChatwoot: SECRETO,
    procesarEntrante: async () => ({ resultado: "procesado" }),
    registrarTomaDeConversacion: async () => "tomada",
    estadosEntrega: { interpretar: () => null },
    registrarEstadoEntrega: async () => "actualizado",
  });
  const server = escucharSinReuso(app);
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (let i = 0; i < 40; i++) {
      const r = await fetch(`${base}/webhooks/chatwoot`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      await r.arrayBuffer();
      assert.equal(r.status, 401);
    }
  } finally {
    server.close();
  }
});

test("EB-04: 31 firmas inválidas de otra gente (misma IP, p. ej. un balanceador sin TRUST_PROXY) NO agotan el límite del tráfico firmado legítimo", async () => {
  const m = montar({ fallos: 30 });
  try {
    for (let i = 0; i < 30; i++) assert.equal((await m.twilio(null, false)).estado, 403);
    assert.equal((await m.twilio(null, false)).estado, 429, "el atacante agotó SU cupo de fallos");
    assert.equal((await m.chatwoot(null, false)).estado, 401, "cada ruta tiene el suyo");
    for (let i = 0; i < 50; i++) assert.equal((await m.twilio(null, true)).estado, 200, `legítimo ${i}`);
    for (let i = 0; i < 50; i++) assert.equal((await m.twilio(null, true, "/webhooks/twilio/estados")).estado, 200, `legítimo estados ${i}`);
    assert.equal(m.llamadasAlBorde(), 100);
    // Y los rechazos no gastan el techo del tráfico válido: con techo 10, 30 rechazos y 10 válidos entran.
  } finally {
    m.cerrar();
  }
  const m2 = montar({ fallos: 100, techo: 10 });
  try {
    for (let i = 0; i < 40; i++) await m2.twilio(null, false);
    const estados: number[] = [];
    for (let i = 0; i < 12; i++) estados.push((await m2.twilio(null, true)).estado);
    assert.equal(estados.filter((e) => e === 200).length, 10, "los rechazos no gastaron el techo de lo válido");
  } finally {
    m2.cerrar();
  }
});
