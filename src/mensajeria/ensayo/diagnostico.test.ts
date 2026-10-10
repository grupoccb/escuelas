import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { calcularFirmaTwilio } from "../twilio/firma.ts";
import { diagnosticar, formatearDiagnostico, type PuertosDiagnostico } from "./diagnostico.ts";

const TOKEN = "f3e2d1c0b9a8f7e6d5c4b3a291807f6e";
const ORIGEN = "https://tunel-de-prueba.example.test";
const env = (): NodeJS.ProcessEnv => ({
  ENSAYO_LOCAL: "si",
  TWILIO_ACCOUNT_SID: `AC${"a1".repeat(16)}`,
  TWILIO_AUTH_TOKEN: TOKEN,
  TWILIO_WHATSAPP_NUMERO: "+14155238886",
  ORIGEN_PUBLICO: ORIGEN,
  ENSAYO_TWILIO_BLOQUEO_PREFIJO: "apagado-",
  CHATWOOT_URL_HOST: "http://chatwoot.local",
  CHATWOOT_ADMIN_TOKEN: "t",
  CHATWOOT_CUENTA: "c",
  CHATWOOT_BOT_NOMBRE: "b",
  CHATWOOT_WEBHOOK_SECRETO: "s",
});

/** Un fetch que contesta según la URL; la firma de /diagnostico se comprueba de verdad. */
function fetchDe(opciones: { backend?: number; chatwoot?: number; tunel?: number; tokenDelBackend?: string; urlDelBackend?: string }): typeof fetch {
  return (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = String(entrada);
    const res = (status: number): Response => new Response("", { status });
    if (url === "http://backend.local/salud") return res(opciones.backend ?? 200);
    if (url === "http://chatwoot.local/api") return res(opciones.chatwoot ?? 200);
    if (url === `${ORIGEN}/salud`) {
      if (opciones.tunel === undefined) throw new Error("sin ruta al host");
      return res(opciones.tunel);
    }
    if (url === `${ORIGEN}/webhooks/twilio/diagnostico`) {
      const cuerpo = String(init?.body ?? "");
      const params = Object.fromEntries(new URLSearchParams(cuerpo));
      const esperada = calcularFirmaTwilio(opciones.tokenDelBackend ?? TOKEN, `${opciones.urlDelBackend ?? ORIGEN}/webhooks/twilio/diagnostico`, params);
      const recibida = (init?.headers as Record<string, string>)["x-twilio-signature"];
      return res(esperada === recibida ? 200 : 403);
    }
    throw new Error(`URL inesperada ${url}`);
  }) as typeof fetch;
}

const puertos = (o: Parameters<typeof fetchDe>[0] = {}, extra: Partial<PuertosDiagnostico> = {}): PuertosDiagnostico => ({
  fetch: fetchDe(o),
  bandejaTwilio: async () => ({ enChatwoot: true, enBase: true }),
  dentroDeChatwoot: async () => ({ ipDeApiTwilio: "104.18.1.1", frontendUrl: ORIGEN }),
  ...extra,
});

const por = (c: Awaited<ReturnType<typeof diagnosticar>>, nombre: string) => c.filter((x) => x.nombre === nombre);

test("todo bien: cada comprobación en ✔ y solo la consola de Twilio queda «a mano»", async () => {
  const c = await diagnosticar(env(), puertos({ tunel: 200 }), { backendUrl: "http://backend.local" });
  assert.deepEqual(c.filter((x) => x.ok === false), []);
  assert.deepEqual(c.filter((x) => x.ok === null).map((x) => x.nombre), ["Consola de Twilio (a mano)"]);
  assert.ok(por(c, "Firma contra la URL pública")[0]!.ok);
  const { texto, todoBien } = formatearDiagnostico(c);
  assert.ok(todoBien);
  assert.match(texto, /✔ Backend/);
  assert.ok(!texto.includes(TOKEN), "el token no sale");
});

test("faltan variables: ✘ por cada una con qué hacer, y no se intenta el túnel", async () => {
  const c = await diagnosticar({ CHATWOOT_URL_HOST: "http://chatwoot.local" }, puertos({}), { backendUrl: "http://backend.local" });
  assert.ok(por(c, "Variables de .env").length >= 4);
  assert.ok(por(c, "Variables de .env").every((x) => x.ok === false));
  assert.ok(por(c, "Variables de .env")[0]!.queHacer, "la primera lleva qué hacer (las demás cuelgan de ella)");
  assert.equal(por(c, "Túnel").length, 0);
});

test("túnel apagado o con otra dirección: ✘ y dice cómo reconfigurar en un comando", async () => {
  const c = await diagnosticar(env(), puertos({}), { backendUrl: "http://backend.local" });
  const t = por(c, "Túnel")[0]!;
  assert.equal(t.ok, false);
  assert.match(t.queHacer!, /npm run ensayo:preparar -- --url/);
  assert.equal(por(c, "Firma contra la URL pública").length, 0);
});

test("el túnel apunta al backend (no al borde del ensayo): 404 con el consejo del puerto 3100", async () => {
  const c = await diagnosticar(env(), puertos({ tunel: 404 }), { backendUrl: "http://backend.local" });
  assert.match(por(c, "Túnel")[0]!.queHacer!, /3100/);
});

test("el backend firma contra otra URL u otro token: ✘ en la firma, con el comando para arreglarlo", async () => {
  for (const o of [{ urlDelBackend: "http://localhost:3000" }, { tokenDelBackend: "otro-token-distinto" }]) {
    const c = await diagnosticar(env(), puertos({ tunel: 200, ...o }), { backendUrl: "http://backend.local" });
    const f = por(c, "Firma contra la URL pública")[0]!;
    assert.equal(f.ok, false);
    assert.match(f.queHacer!, /ensayo:preparar -- --url https:\/\/tunel-de-prueba/);
    assert.ok(!JSON.stringify(c).includes(TOKEN));
  }
});

test("Chatwoot con Twilio bloqueado, con otra URL o sin bandeja, y backend caído: cada uno en su ✘", async () => {
  const c = await diagnosticar(
    env(),
    puertos({ backend: 503, tunel: 200 }, { dentroDeChatwoot: async () => ({ ipDeApiTwilio: "127.0.0.1", frontendUrl: "http://localhost:3001" }), bandejaTwilio: async () => ({ enChatwoot: false, enBase: false }) }),
    { backendUrl: "http://backend.local" },
  );
  for (const n of ["Backend", "Chatwoot sin el bloqueo de Twilio", "Chatwoot conoce la URL pública", "Bandeja de WhatsApp"]) assert.equal(por(c, n)[0]!.ok, false, n);
  assert.match(por(c, "Chatwoot sin el bloqueo de Twilio")[0]!.queHacer!, /ENSAYO_TWILIO_BLOQUEO_PREFIJO/);
  assert.equal(formatearDiagnostico(c).todoBien, false);
});

test("sin Docker no se inventa nada: queda «a mano», no ✘", async () => {
  const c = await diagnosticar(env(), puertos({ tunel: 200 }, { dentroDeChatwoot: async () => null, bandejaTwilio: async () => null }), { backendUrl: "http://backend.local" });
  assert.equal(por(c, "Chatwoot sin el bloqueo de Twilio")[0]!.ok, null);
  assert.equal(por(c, "Bandeja de WhatsApp")[0]!.ok, null);
});

test("responde rápido aunque el túnel se cuelgue: el plazo corta cada llamada", async () => {
  const colgado = createServer(() => {}).listen(0, "127.0.0.1");
  await new Promise<void>((ok) => colgado.once("listening", ok));
  const puerto = (colgado.address() as { port: number }).port;
  const inicio = Date.now();
  const c = await diagnosticar({ ...env(), CHATWOOT_URL_HOST: `http://127.0.0.1:${puerto}` }, { fetch, bandejaTwilio: async () => null, dentroDeChatwoot: async () => null, plazoMs: 300 }, { backendUrl: `http://127.0.0.1:${puerto}` });
  colgado.closeAllConnections();
  colgado.close();
  assert.ok(Date.now() - inicio < 3000);
  assert.equal(por(c, "Backend")[0]!.ok, false);
});
