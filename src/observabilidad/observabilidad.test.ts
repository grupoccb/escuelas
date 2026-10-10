import { test } from "node:test";
import assert from "node:assert/strict";
import { crearApp, type AppDeps } from "../http/app.ts";
import { EstadosEntregaChatwoot } from "../mensajeria/index.ts";
import { firmarCuerpoChatwoot } from "../mensajeria/chatwoot/webhook.ts";
import { payloadMensajeEntrante } from "../mensajeria/chatwoot/fixtures.ts";
import { escucharSinReuso, puertoDe } from "../testutil/servidor.ts";
import { enmascararTelefono, enmascararTelefonosEnTexto, log } from "../lib/log.ts";
import { colectarLogs } from "../testutil/logs.ts";
import { RegistroDeMetricas, escaparEtiqueta } from "./registro.ts";
import { grupoDeRuta, metricas } from "./proceso.ts";
import { revisarListo } from "./salud.ts";

// ── Registro de métricas ───────────────────────────────────────────────────────────────────────────────

test("el texto de Prometheus lleva HELP y TYPE, las etiquetas ordenadas y escapadas, y es estable", () => {
  const r = new RegistroDeMetricas();
  r.declarar("cosas_total", "counter", "Cosas contadas.");
  r.conEtiquetas("cosas_total");
  r.declarar("nivel", "gauge", "Un nivel.");
  r.incrementar("cosas_total", { tipo: "b", origen: 'x"y\\z\n' });
  r.incrementar("cosas_total", { tipo: "b", origen: 'x"y\\z\n' }, 2);
  r.incrementar("cosas_total", { tipo: "a", origen: "ok" });
  r.fijar("nivel", 3.14159);
  const t = r.texto();
  assert.equal(t, `# HELP cosas_total Cosas contadas.\n# TYPE cosas_total counter\ncosas_total{origen="ok",tipo="a"} 1\ncosas_total{origen="x\\"y\\\\z\\n",tipo="b"} 3\n# HELP nivel Un nivel.\n# TYPE nivel gauge\nnivel 3.142\n`);
  assert.equal(r.texto(), t);
  assert.equal(escaparEtiqueta('a"b\\c\nd'), 'a\\"b\\\\c\\nd');
});

test("una métrica sin etiquetas existe en cero desde el principio y una con etiquetas no inventa la serie vacía", () => {
  const r = new RegistroDeMetricas();
  r.declarar("sin_etiquetas", "gauge", "x");
  r.declarar("con_etiquetas", "counter", "x");
  r.conEtiquetas("con_etiquetas");
  assert.match(r.texto(), /^sin_etiquetas 0$/m);
  assert.ok(!/^con_etiquetas\b/m.test(r.texto()));
});

test("no se puede usar una métrica sin declarar ni con nombres o etiquetas inválidos", () => {
  const r = new RegistroDeMetricas();
  assert.throws(() => r.incrementar("nada"), /sin declarar/);
  assert.throws(() => r.declarar("Mal-Nombre", "gauge", "x"), /inválido/);
  r.declarar("bien", "counter", "x");
  assert.throws(() => r.incrementar("bien", { "mala-etiqueta": "x" }), /Etiqueta inválida/);
});

test("el grupo de ruta es de un conjunto cerrado: nunca la ruta exacta (que puede llevar identificadores)", () => {
  assert.equal(grupoDeRuta("/api/leads/123"), "api");
  assert.equal(grupoDeRuta("/webhooks/chatwoot"), "webhooks");
  assert.equal(grupoDeRuta("/l/mi-vertical"), "landing");
  assert.equal(grupoDeRuta("/salud/lista"), "salud");
  assert.equal(grupoDeRuta("/metricas"), "metricas");
  assert.equal(grupoDeRuta("/leads/uuid-de-una-persona"), "web");
  assert.equal(grupoDeRuta("/lista"), "web");
});

// ── Lectura «lista» ─────────────────────────────────────────────────────────────────────────────────────

const ok = async (): Promise<void> => {};

test("revisarListo: base caída → no lista; migraciones sin terminar o faltantes → no lista; barrido atrasado → no lista", async () => {
  const ahora = 1_000_000_000;
  const sano = { pingDb: ok, estadoDeMigraciones: async () => ({ aplicadas: ["a", "b"], sinTerminar: [] }), migracionesEsperadas: () => ["a", "b"], barrido: () => ({ iniciadoEn: ahora - 600_000, ultimoCicloEn: ahora - 30_000 }), ahora: () => ahora };
  assert.deepEqual(await revisarListo(sano), { listo: true, degradado: false, comprobaciones: { base: "ok", migraciones: "ok", barrido: "ok", chatwoot: "no_aplica" } });
  const sinBase = await revisarListo({ ...sano, pingDb: async () => { throw new Error("x"); } });
  assert.deepEqual([sinBase.listo, sinBase.comprobaciones.base, sinBase.comprobaciones.migraciones], [false, "falla", "falla"]);
  assert.equal((await revisarListo({ ...sano, estadoDeMigraciones: async () => ({ aplicadas: ["a"], sinTerminar: [] }) })).comprobaciones.migraciones, "falla", "falta una migración que el código espera");
  assert.equal((await revisarListo({ ...sano, estadoDeMigraciones: async () => ({ aplicadas: ["a", "b"], sinTerminar: ["c"] }) })).comprobaciones.migraciones, "falla", "una migración quedó a medias");
  assert.equal((await revisarListo({ ...sano, estadoDeMigraciones: async () => { throw new Error("x"); } })).comprobaciones.migraciones, "falla");
  assert.equal((await revisarListo({ ...sano, barrido: () => ({ iniciadoEn: ahora - 3_600_000, ultimoCicloEn: ahora - 900_000 }) })).listo, false, "15 minutos sin ciclo");
  assert.equal((await revisarListo({ ...sano, barrido: () => ({ iniciadoEn: ahora - 60_000, ultimoCicloEn: null }) })).listo, true, "recién arrancado: aún no le toca el primer ciclo");
  assert.equal((await revisarListo({ ...sano, barrido: () => ({ iniciadoEn: ahora - 3_600_000, ultimoCicloEn: null }) })).listo, false, "arrancó hace una hora y nunca corrió");
  assert.equal((await revisarListo({ ...sano, migracionesEsperadas: () => null })).comprobaciones.migraciones, "ok", "sin referencia solo se exige que ninguna esté a medias");
});

test("revisarListo: Chatwoot caído deja el servicio «degradado» pero LISTO (no saca al backend del balanceador), salvo que se exija", async () => {
  const base = { pingDb: ok, chatwoot: async () => false };
  const r = await revisarListo(base);
  assert.deepEqual([r.listo, r.degradado, r.comprobaciones.chatwoot], [true, true, "falla"]);
  assert.equal((await revisarListo({ ...base, exigirChatwoot: true })).listo, false);
  assert.equal((await revisarListo({ pingDb: ok, chatwoot: async () => { throw new Error("x"); } })).comprobaciones.chatwoot, "falla");
  assert.equal((await revisarListo({ pingDb: ok, chatwoot: async () => true })).degradado, false);
});

// ── HTTP: /salud/lista, /metricas y los contadores ──────────────────────────────────────────────────────

function dependencias(extra: Partial<AppDeps> = {}): AppDeps {
  return {
    pingDb: ok,
    secretoWebhookChatwoot: "secreto-de-prueba",
    procesarEntrante: async () => ({ resultado: "procesado" }),
    registrarTomaDeConversacion: async () => "tomada",
    estadosEntrega: new EstadosEntregaChatwoot(),
    registrarEstadoEntrega: async () => "actualizado",
    ...extra,
  };
}

async function con<T>(d: AppDeps, fn: (url: string) => Promise<T>): Promise<T> {
  const server = escucharSinReuso(crearApp(d));
  try {
    return await fn(`http://127.0.0.1:${await puertoDe(server)}`);
  } finally {
    server.close();
  }
}

test("/metricas: sin token configurado no existe (404); con él exige Bearer y responde en formato Prometheus sin caché", async () => {
  await con(dependencias(), async (url) => assert.equal((await fetch(`${url}/metricas`)).status, 404));
  const m = { token: "t".repeat(40), texto: async () => "# HELP x y\n# TYPE x gauge\nx 1\n" };
  await con(dependencias({ metricas: m }), async (url) => {
    assert.equal((await fetch(`${url}/metricas`)).status, 401);
    assert.equal((await fetch(`${url}/metricas`, { headers: { authorization: "Bearer mal" } })).status, 401);
    assert.equal((await fetch(`${url}/metricas`, { headers: { authorization: `Basic ${m.token}` } })).status, 401);
    assert.equal((await fetch(`${url}/metricas?token=${m.token}`)).status, 401, "el token no va en la URL");
    const r = await fetch(`${url}/metricas`, { headers: { authorization: `Bearer ${m.token}` } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type") ?? "", /^text\/plain;.*version=0\.0\.4/);
    assert.equal(r.headers.get("cache-control"), "no-store");
    assert.equal(await r.text(), "# HELP x y\n# TYPE x gauge\nx 1\n");
  });
  await con(dependencias({ metricas: { token: "t".repeat(40), texto: async () => { throw new Error("la base dijo password=secreta"); } } }), async (url) => {
    const r = await fetch(`${url}/metricas`, { headers: { authorization: `Bearer ${"t".repeat(40)}` } });
    assert.equal(r.status, 503);
    assert.ok(!(await r.text()).includes("secreta"));
  });
});

test("los contadores de webhooks distinguen aceptados, rechazados, inesperados y reintentos; y las respuestas HTTP se cuentan por grupo y clase", async () => {
  const antes = (origen: string, resultado: string): number => metricas.leer("inscripciones_webhooks_total", { origen, resultado });
  const a0 = antes("chatwoot", "aceptado");
  const r0 = antes("chatwoot", "rechazado");
  const i0 = antes("chatwoot", "inesperado");
  const t0 = antes("chatwoot", "reintentar");
  const http0 = metricas.leer("inscripciones_http_respuestas_total", { grupo: "webhooks", clase: "4xx" });
  const ts = String(Math.floor(Date.now() / 1000));
  const enviar = (url: string, cuerpo: string, firma?: string) => fetch(`${url}/webhooks/chatwoot`, { method: "POST", headers: { "x-chatwoot-timestamp": ts, "x-chatwoot-signature": firma ?? firmarCuerpoChatwoot("secreto-de-prueba", ts, Buffer.from(cuerpo)) }, body: cuerpo });
  await con(dependencias(), async (url) => {
    assert.equal((await enviar(url, JSON.stringify(payloadMensajeEntrante({ id: 1 })))).status, 200);
    assert.equal((await enviar(url, JSON.stringify(payloadMensajeEntrante({ id: 2 })), "sha256=" + "0".repeat(64))).status, 401);
    assert.equal((await enviar(url, "{")).status, 200, "JSON roto firmado: dato inesperado, nunca 500");
  });
  await con(dependencias({ procesarEntrante: async () => { throw Object.assign(new Error("Timed out fetching a new connection from the connection pool"), { code: "P2024" }); } }), async (url) => {
    assert.equal((await enviar(url, JSON.stringify(payloadMensajeEntrante({ id: 3 })))).status, 503);
  });
  assert.equal(antes("chatwoot", "aceptado") - a0, 1);
  assert.equal(antes("chatwoot", "rechazado") - r0, 1);
  assert.equal(antes("chatwoot", "inesperado") - i0, 1);
  assert.equal(antes("chatwoot", "reintentar") - t0, 1);
  assert.equal(metricas.leer("inscripciones_http_respuestas_total", { grupo: "webhooks", clase: "4xx" }) - http0, 1);
  const texto = metricas.texto();
  assert.match(texto, /inscripciones_webhooks_total\{origen="chatwoot",resultado="aceptado"\} \d+/);
});

// ── Teléfonos en los logs ───────────────────────────────────────────────────────────────────────────────

test("el log enmascara cualquier teléfono, venga como campo, dentro de un error o pegado a «whatsapp:»", () => {
  assert.equal(enmascararTelefono("+525512345678"), "+52******5678");
  assert.equal(enmascararTelefonosEnTexto("Falló +525512345678 y whatsapp:+5215512345678 y 5512345678."), "Falló +52******5678 y whatsapp:+52*******5678 y 551***5678.");
  const logs = colectarLogs();
  try {
    log.info("prueba", { telefono: "+525512345678", detalle: "no se pudo enviar a 5512345678", nested: { a: ["whatsapp:+5215512345678"] }, error: new Error("falló el envío a +525512345678") });
    log.error("otra", { error: "P2002 en telefono=5512345678" });
  } finally {
    logs.detener();
  }
  const todo = logs.texto();
  for (const completo of ["525512345678", "5512345678", "5215512345678"]) assert.ok(!todo.includes(completo), `el log trae «${completo}»`);
  assert.match(todo, /\+52\*\*\*\*\*\*5678/);
});

test("el enmascarado no toca lo que no es un teléfono: UUID, fechas, identificadores con letras, números cortos", () => {
  const sano = "lead 0053c588-a9dd-4cab-9367-9cf6e3aaf712 el 2026-10-09T07:00:00.000Z SM0123456789abcdef0123456789abcdef folio 12345 (9 dígitos: 123456789)";
  assert.equal(enmascararTelefonosEnTexto(sano), sano);
});

test("V10 / EK-21: el enmascarado ve también los teléfonos escritos con separadores, y sigue sin tocar fechas con hora, IP, UUID, listas de números ni importes", () => {
  const mascara = enmascararTelefonosEnTexto;
  assert.equal(mascara("llamó 55 1234 5678 ayer"), "llamó 551***5678 ayer");
  assert.equal(mascara("(55) 1234-5678"), "551***5678");
  assert.equal(mascara("55-1234-5678"), "551***5678");
  assert.equal(mascara("55.1234.5678"), "551***5678");
  assert.equal(mascara("+52 55 1234 5678"), "+52******5678");
  assert.equal(mascara("+52 1 55 1234 5678"), "+52*******5678");
  assert.equal(mascara("a 55 1234 5678, b 56 8765 4321."), "a 551***5678, b 568***4321.");
  assert.equal(mascara("tel:55 1234 5678;"), "tel:551***5678;");
  // Lo que NO es un teléfono queda tal cual.
  for (const sano of [
    "pasó el 2026-10-09 03:18:02 en el servidor",
    "el 2026-10-09 a las 03:18",
    "desde 192.168.100.200 y 10.0.0.1",
    "lead 0053c588-a9dd-4cab-9367-9cf6e3aaf712",
    "ids 10 20 30 40 50 y 1 2 3",
    "total $1 234 567 pesos",
    "versión 1.2.3.4",
    "paso 12 de 34 5678",
    "SM0123456789abcdef0123456789abcdef",
  ]) assert.equal(mascara(sano), sano, sano);
  // Ni un teléfono con separadores llega completo a un log.
  const logs = colectarLogs();
  try {
    log.error("prueba", { detalle: "no se pudo avisar al (55) 1234-5678", error: new Error("falló para 55 8765 4321") });
  } finally {
    logs.detener();
  }
  const todo = logs.texto();
  assert.ok(!todo.includes("1234-5678") && !todo.includes("8765 4321"), todo);
});
