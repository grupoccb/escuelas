// K3: revisión de seguridad como pruebas que se pueden volver a correr. Cada prueba ataca la app REAL (HTTP, Postgres) y exige que el ataque no funcione:
// CORS, cabeceras en todas las rutas, inyección (SQL, NUL, CRLF, prototipo), asignación masiva, tamaños, sesiones y que ningún secreto llegue a un log.
// Lo que ya probaron las etapas B (sesiones, CSRF, límites, no-fuga entre organizaciones) no se repite aquí.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { crearApp } from "../http/app.ts";
import { procesarEntrante } from "../captacion/entrante.ts";
import { EstadosEntregaChatwoot, MessagingProvider, TransporteFalso } from "../mensajeria/index.ts";
import { payloadMensajeEntrante } from "../mensajeria/chatwoot/fixtures.ts";
import { firmarCuerpoChatwoot } from "../mensajeria/chatwoot/webhook.ts";
import { crearManejadorDeInesperados } from "../webhooks/inesperado.ts";
import { escucharSinReuso, puertoDe } from "../testutil/servidor.ts";
import { sembrarOrganizacion } from "../testutil/semilla.ts";
import { randomInt } from "node:crypto";
import { mundoDeFinanzas, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { colectarLogs } from "../testutil/logs.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarUsuario } from "../testutil/api.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;
before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeFinanzas(prisma, "Seguridad");
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

/* eslint-disable @typescript-eslint/no-explicit-any -- internos de Express 5 */
function rutasGet(stack: any[], prefijo = ""): string[] {
  const salida: string[] = [];
  for (const capa of stack) {
    if (capa.route) {
      if (capa.route.methods["get"]) salida.push(`${prefijo}${capa.route.path}`);
    } else if (capa.handle?.stack) {
      const golpe = (capa.matchers as ((p: string) => { path?: string } | false)[]).map((x) => x("/api/yo") || x("/l/x") || x("/x")).find(Boolean);
      salida.push(...rutasGet(capa.handle.stack, prefijo + ((golpe && golpe.path) || "")));
    }
  }
  return salida;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const UUID_CERO = "00000000-0000-4000-8000-000000000000";

test("CORS: la API nunca concede acceso a otro origen (ni preflight, ni credenciales)", async () => {
  const origen = "https://sitio-malo.example";
  for (const ruta of ["/api/yo", "/api/leads", "/api/sesion", "/salud", "/webhooks/chatwoot"]) {
    const pre = await fetch(`${m.api.base}${ruta}`, { method: "OPTIONS", headers: { origin: origen, "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
    for (const h of ["access-control-allow-origin", "access-control-allow-credentials", "access-control-allow-methods", "access-control-allow-headers"]) assert.equal(pre.headers.get(h), null, `${ruta}: preflight con ${h}`);
    const get = await fetch(`${m.api.base}${ruta}`, { headers: { origin: origen } });
    assert.equal(get.headers.get("access-control-allow-origin"), null, `${ruta}: GET con Origin ajeno`);
    assert.equal(get.headers.get("access-control-allow-credentials"), null);
  }
});

test("cabeceras de seguridad en TODA respuesta: API, landing, salud, webhooks rechazados, 404 y errores", async () => {
  const slug = (await prisma.vertical.findFirstOrThrow({ where: { organizacion_id: m.org.organizacionId } })).slug;
  const peticiones: [string, RequestInit][] = [
    ["/api/yo", {}],
    ["/api/ruta-inexistente", {}],
    ["/salud", {}],
    [`/l/${slug}`, {}],
    ["/l/no-existe-esta-vertical", {}],
    ["/webhooks/chatwoot", { method: "POST", body: "{}" }],
    ["/webhooks/twilio/entrantes", { method: "POST", body: "a=b" }],
    ["/api/sesion", { method: "POST", headers: { "content-type": "application/json" }, body: "{" }],
  ];
  for (const [ruta, init] of peticiones) {
    const r = await fetch(`${m.api.base}${ruta}`, init);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff", ruta);
    assert.equal(r.headers.get("x-frame-options"), "DENY", ruta);
    assert.equal(r.headers.get("referrer-policy"), "no-referrer", ruta);
    assert.equal(r.headers.get("x-powered-by"), null, `${ruta}: no anuncia Express`);
    await r.arrayBuffer();
  }
  const api = await fetch(`${m.api.base}/api/yo`);
  assert.match(api.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  assert.equal(api.headers.get("cache-control"), "no-store");
  await api.arrayBuffer();
});

test("inyección: parámetros hostiles (SQL, NUL, CRLF, Unicode, números enormes, fechas imposibles) en TODAS las rutas GET no dan 5xx ni tocan las tablas", async () => {
  const falsa = crearApp({
    pingDb: async () => {},
    secretoWebhookChatwoot: "x",
    procesarEntrante: async () => ({ resultado: "x" }),
    registrarTomaDeConversacion: async () => "x",
    estadosEntrega: { interpretar: () => null },
    registrarEstadoEntrega: async () => "x",
    api: { prisma: {} as never },
  });
  const rutas = rutasGet((falsa as unknown as { router: { stack: any[] } }).router.stack) // eslint-disable-line @typescript-eslint/no-explicit-any
    .filter((r) => r.startsWith("/api/"));
  assert.ok(rutas.length > 50, `recorrió ${rutas.length} rutas GET`);
  const antes = { lead: await prisma.lead.count({ where: { organizacion_id: m.org.organizacionId } }), tutor: await prisma.tutor.count({ where: { organizacion_id: m.org.organizacionId } }), usuario: await prisma.usuario.count({ where: { organizacion_id: m.org.organizacionId } }) };
  const hostiles = [
    "q=%27%3B%20DROP%20TABLE%20lead%3B--&telefono=%00&estatus=%27%20OR%20%271%27%3D%271&limite=-1&pagina=99999999999999999999",
    "q=%E2%80%AE%00%0D%0AX-Inyectado%3A%201&desde=2026-13-45&hasta=%3Cscript%3Ealert(1)%3C%2Fscript%3E&orden=%3Bselect%20pg_sleep(5)",
    "tutor_id=%27&alumno_id=%00&limite=1e9&pagina=0&campos=__proto__&motivo=%0D%0A",
    "telefono=" + encodeURIComponent("+52" + "9".repeat(5000)) + "&q=" + encodeURIComponent("á".repeat(10_000)),
  ];
  const malas: string[] = [];
  const admin = m.admin;
  for (const plantilla of rutas) {
    const ruta = plantilla.replace(/:[A-Za-z_]+/g, UUID_CERO);
    for (const q of hostiles) {
      const r = await admin.get(`${ruta}?${q}`);
      if (r.estado >= 500) malas.push(`${plantilla}?${q.slice(0, 40)} → ${r.estado}`);
      const rr = await admin.get(`${ruta.replace(UUID_CERO, "%27%3B%20DROP%20TABLE%20lead%3B--")}`);
      if (rr.estado >= 500) malas.push(`${plantilla} con id hostil → ${rr.estado}`);
    }
  }
  assert.deepEqual(malas, []);
  assert.deepEqual({ lead: await prisma.lead.count({ where: { organizacion_id: m.org.organizacionId } }), tutor: await prisma.tutor.count({ where: { organizacion_id: m.org.organizacionId } }), usuario: await prisma.usuario.count({ where: { organizacion_id: m.org.organizacionId } }) }, antes);
});

test("asignación masiva y contaminación de prototipo: campos que el cliente no debe poder fijar se rechazan o se ignoran, y Object.prototype queda intacto", async () => {
  const otra = await sembrarUsuario(prisma, m.org.organizacionId, { rol: "asesor", sucursales: [m.norte] });
  // organizacion_id, rol y contraseña por la puerta equivocada.
  const r1 = await m.admin.patch(`/api/usuarios/${otra.id}`, { organizacion_id: UUID_CERO });
  assert.equal(r1.estado, 400, "un campo desconocido es 400");
  assert.equal((await prisma.usuario.findFirstOrThrow({ where: { id: otra.id } })).organizacion_id, m.org.organizacionId);
  // Un asesor no se sube a administrador, ni a sí mismo ni a otro.
  const asesor = m.api.cliente();
  assert.equal((await asesor.login(m.org.slug, otra.correo, otra.contrasena)).estado, 201);
  assert.equal((await asesor.patch(`/api/usuarios/${otra.id}`, { rol: "administrador" })).estado, 403);
  assert.equal((await prisma.usuario.findFirstOrThrow({ where: { id: otra.id } })).rol, "asesor");
  // __proto__ / constructor / prototype en cuerpos JSON (login, alta, pago): ni 5xx ni contaminación.
  for (const cuerpo of ['{"__proto__":{"rol":"administrador","admin":true},"correo":"a@b.test","contrasena":"x"}', '{"constructor":{"prototype":{"rol":"administrador"}}}', '{"a":{"__proto__":{"polluted":"si"}}}']) {
    for (const [metodo, ruta] of [["POST", "/api/sesion"], ["POST", "/api/usuarios"], ["POST", "/api/pagos"], ["PATCH", `/api/usuarios/${otra.id}`]] as const) {
      const r = await m.admin.pedir(metodo, ruta, cuerpo);
      assert.ok(r.estado < 500, `${metodo} ${ruta}: ${r.estado}`);
    }
  }
  const limpio: Record<string, unknown> = {};
  assert.equal(limpio["rol"], undefined);
  assert.equal(limpio["admin"], undefined);
  assert.equal(limpio["polluted"], undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, "polluted"), false);
});

test("tamaños: un cuerpo desmedido se corta con 413 sin llegar a la lógica (API, webhooks y landing)", async () => {
  const enorme = "x".repeat(3 * 1024 * 1024);
  const api = await m.admin.pedir("POST", "/api/pagos", JSON.stringify({ relleno: enorme }));
  assert.equal(api.estado, 413);
  const cw = await fetch(`${m.api.base}/webhooks/chatwoot`, { method: "POST", body: enorme });
  assert.ok([401, 413].includes(cw.status), `webhook de Chatwoot: ${cw.status}`);
  const tw = await fetch(`${m.api.base}/webhooks/twilio/entrantes`, { method: "POST", body: enorme });
  assert.ok([403, 413].includes(tw.status), `webhook de Twilio: ${tw.status}`);
  const slug = (await prisma.vertical.findFirstOrThrow({ where: { organizacion_id: m.org.organizacionId } })).slug;
  const l = await fetch(`${m.api.base}/l/${slug}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "nombre_alumno=" + enorme });
  assert.ok([400, 413, 422].includes(l.status), `landing: ${l.status}`);
  assert.equal((await m.admin.get("/api/yo")).estado, 200, "el servidor sigue sano");
});

test("sesión: el token es largo y aleatorio, no se acepta uno fijado de antemano (fijación), la cookie no sirve tras cerrar sesión y cada login es otra sesión", async () => {
  const u = await sembrarUsuario(prisma, m.org.organizacionId, { rol: "recepcion", sucursales: [m.norte] });
  const a = m.api.cliente();
  const b = m.api.cliente();
  assert.equal((await a.login(m.org.slug, u.correo, u.contrasena)).estado, 201);
  assert.equal((await b.login(m.org.slug, u.correo, u.contrasena)).estado, 201);
  assert.notEqual(a.cookieDeSesion, b.cookieDeSesion, "otra sesión, otro token");
  assert.ok((a.cookieDeSesion ?? "").length >= 40, "al menos 256 bits codificados");
  // Fijación: quien llega con un token que él inventó no queda autenticado, ni tras iniciar sesión se conserva ese token.
  const fijado = "A".repeat(43);
  const c = m.api.cliente();
  c.cookieDeSesion = fijado;
  assert.equal((await c.get("/api/yo")).estado, 401);
  assert.equal((await c.login(m.org.slug, u.correo, u.contrasena)).estado, 201);
  assert.notEqual(c.cookieDeSesion, fijado, "el login emite un token nuevo");
  // Cierre: el token viejo deja de valer aunque alguien lo haya copiado.
  const copiado = a.cookieDeSesion!;
  assert.equal((await a.delete("/api/sesion")).estado, 204);
  const ladron = m.api.cliente();
  ladron.cookieDeSesion = copiado;
  assert.equal((await ladron.get("/api/yo")).estado, 401);
});

test("ningún secreto llega a un log: ni la contraseña (buena o mala), ni el token de sesión, ni la firma o el cuerpo de un webhook", async () => {
  const logs = colectarLogs();
  try {
    const u = await sembrarUsuario(prisma, m.org.organizacionId, { rol: "asesor", sucursales: [m.norte] });
    const mala = `CENTINELA-CLAVE-${randomBytes(6).toString("hex")}`;
    const c = m.api.cliente();
    await c.login(m.org.slug, u.correo, mala);
    await c.login(m.org.slug, "no-existe@prueba.test", mala);
    assert.equal((await c.login(m.org.slug, u.correo, u.contrasena)).estado, 201);
    const token = c.cookieDeSesion!;
    await c.get("/api/yo");
    await c.post("/api/yo/contrasena", { actual: u.contrasena, nueva: `CENTINELA-NUEVA-${randomBytes(6).toString("hex")}x1` });
    const cuerpoSecreto = `CENTINELA-CUERPO-${randomBytes(6).toString("hex")}`;
    await fetch(`${m.api.base}/webhooks/chatwoot`, { method: "POST", headers: { "x-chatwoot-signature": "sha256=" + "a".repeat(64), "x-chatwoot-timestamp": "1" }, body: cuerpoSecreto });
    await fetch(`${m.api.base}/webhooks/twilio/entrantes`, { method: "POST", headers: { "x-twilio-signature": "FIRMA-CENTINELA" }, body: cuerpoSecreto });
    const todo = logs.texto();
    for (const secreto of [mala, u.contrasena, token, cuerpoSecreto, "FIRMA-CENTINELA", "CENTINELA-NUEVA"]) assert.ok(!todo.includes(secreto), `un log contiene «${secreto.slice(0, 18)}…»`);
    assert.ok(todo.includes("login_exitoso") || todo.includes("login_fallido") || todo.length > 0, "el colector sí vio logs");
  } finally {
    logs.detener();
  }
});

test("las exportaciones CSV llevan un Content-Disposition seguro (sin saltos de línea ni comillas sueltas) y no se guardan en cachés", async () => {
  const r = await m.admin.descargar("/api/exportaciones/leads");
  assert.equal(r.estado, 200);
  const cd = r.cabeceras.get("content-disposition") ?? "";
  assert.match(cd, /^attachment; filename="[A-Za-z0-9._-]+"; filename\*=UTF-8''[A-Za-z0-9._%-]+$/);
  assert.ok(!/[\r\n]/.test(cd));
  assert.match(r.cabeceras.get("cache-control") ?? "", /no-store|no-cache|private/);
  assert.equal(r.cabeceras.get("x-content-type-options"), "nosniff");
});

test("EF-19: un NUL en cualquier campo del evento (referral, ctwa_clid, id del mensaje, contenido, nombre) nunca da 500: 200 con constancia", async () => {
  const org = await sembrarOrganizacion(prisma, "NUL");
  const reloj = (): Date => new Date("2026-10-07T18:00:00Z");
  const app = crearApp({
    pingDb: async () => {},
    secretoWebhookChatwoot: "secreto",
    procesarEntrante: (e) => procesarEntrante({ prisma, mensajeria: new MessagingProvider({ transporte: new TransporteFalso(), reloj }), reloj }, e),
    registrarTomaDeConversacion: async () => "x",
    estadosEntrega: new EstadosEntregaChatwoot(),
    registrarEstadoEntrega: async () => "x",
    inesperados: crearManejadorDeInesperados(prisma),
  });
  const server = escucharSinReuso(app);
  try {
    const url = `http://127.0.0.1:${await puertoDe(server)}`;
    const ts = String(Math.floor(Date.now() / 1000));
    const base = () => ({ id: randomInt(1e8, 9e8), cuenta: org.chatwootAccountId, bandeja: org.chatwootInboxId, conversacion: randomInt(1e8, 9e8) });
    const casos: Record<string, Record<string, unknown>> = {
      "referral.source_id": { referral: { source_id: "a\u0000b", source_url: "https://ejemplo.test", ctwa_clid: "ok" } },
      "ctwa_clid": { referral: { source_id: "ok", ctwa_clid: "a\u0000b" } },
      "referral.headline": { referral: { source_id: "ok", headline: "Oferta\u0000", body: "x\u0000" } },
      "id del mensaje": { sourceId: "SM\u0000x", canal: "Channel::TwilioSms" },
      "contenido": { content: "Hola\u0000mundo" },
      "nombre": { nombre: "Ana\u0000" },
    };
    for (const [nombre, extra] of Object.entries(casos)) {
      const cuerpo = JSON.stringify(payloadMensajeEntrante({ ...base(), ...extra }));
      const r = await fetch(`${url}/webhooks/chatwoot`, { method: "POST", headers: { "x-chatwoot-timestamp": ts, "x-chatwoot-signature": firmarCuerpoChatwoot("secreto", ts, Buffer.from(cuerpo)) }, body: cuerpo });
      assert.equal(r.status, 200, `${nombre}: ${r.status}`);
      await r.arrayBuffer();
    }
  } finally {
    server.close();
  }
});
