// K4 con Postgres real: la lectura «lista» (migraciones de verdad), las métricas del canal calculadas desde datos reales, y que NINGÚN log de los flujos
// completos (bot, landing, webhooks de Chatwoot y Twilio, API, fallas) lleve un teléfono completo.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { fileURLToPath } from "node:url";
import { crearApp } from "../http/app.ts";
import { procesarEntrante } from "../captacion/entrante.ts";
import { estadoDeMigraciones } from "../datos/sistema.ts";
import { barrerFinanzas } from "../finanzas/barrido.ts";
import { EstadosEntregaChatwoot, MessagingProvider, ReenviadorTwilioFalso, TransporteFalso, crearBordeTwilio, registrarEstadoEntrega } from "../mensajeria/index.ts";
import { payloadMensajeEntrante } from "../mensajeria/chatwoot/fixtures.ts";
import { firmarCuerpoChatwoot } from "../mensajeria/chatwoot/webhook.ts";
import { crearManejadorDeInesperados } from "../webhooks/inesperado.ts";
import { PARAMETROS_PRUEBA } from "../auth/contrasena.ts";
import { colectarLogs } from "../testutil/logs.ts";
import { escenarioBot } from "../testutil/bot.ts";
import { mundoDeFinanzas } from "../testutil/finanzas.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { escucharSinReuso, puertoDe } from "../testutil/servidor.ts";
import { sembrarDocumentosLegales, sembrarFamilia, sembrarOrganizacion } from "../testutil/semilla.ts";
import { RegistroDeMetricas } from "./registro.ts";
import { estadoDelBarrido, registrarCiclo } from "./proceso.ts";
import { leerMigracionesEsperadas } from "./salud.ts";
import { recolectarDeLaBase, crearRecolector } from "./recolector.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 20);
});
after(async () => {
  await prisma.$disconnect();
});

const DIR_MIGRACIONES = fileURLToPath(new URL("../../prisma/migrations", import.meta.url));

test("/salud/lista con la base real: base, migraciones al día (las del código contra _prisma_migrations) y barrido; con una migración que falta, 503 sin detalles", async () => {
  const esperadas = leerMigracionesEsperadas(DIR_MIGRACIONES)!;
  assert.ok(esperadas.length > 20);
  const estado = await estadoDeMigraciones(prisma);
  assert.deepEqual(esperadas.filter((m) => !estado.aplicadas.includes(m)), [], "la base de pruebas tiene todas las migraciones");
  assert.deepEqual(estado.sinTerminar, []);

  registrarCiclo(0);
  const montar = (migraciones: () => string[]) =>
    crearApp({
      pingDb: async () => {},
      secretoWebhookChatwoot: "x",
      procesarEntrante: async () => ({ resultado: "x" }),
      registrarTomaDeConversacion: async () => "x",
      estadosEntrega: new EstadosEntregaChatwoot(),
      registrarEstadoEntrega: async () => "x",
      salud: { estadoDeMigraciones: () => estadoDeMigraciones(prisma), migracionesEsperadas: migraciones, barrido: estadoDelBarrido, chatwoot: async () => true },
    });
  for (const [migraciones, estatus, migracionesComp] of [[() => esperadas, 200, "ok"], [() => [...esperadas, "99999999999999_no_existe_todavia"], 503, "falla"]] as const) {
    const server = escucharSinReuso(montar(migraciones));
    try {
      const r = await fetch(`http://127.0.0.1:${await puertoDe(server)}/salud/lista`);
      assert.equal(r.status, estatus);
      const cuerpo = (await r.json()) as { listo: boolean; comprobaciones: Record<string, string> };
      assert.equal(cuerpo.comprobaciones["migraciones"], migracionesComp);
      assert.equal(cuerpo.comprobaciones["base"], "ok");
      assert.equal(cuerpo.comprobaciones["chatwoot"], "ok");
      assert.deepEqual(Object.keys(cuerpo).sort(), ["comprobaciones", "degradado", "listo"], "ni versiones, ni nombres de migraciones, ni URLs");
    } finally {
      server.close();
    }
  }
});

test("métricas del canal desde la base: mensajes por estado, bloqueados por motivo, entregas fallidas, tareas pendientes por tipo, ejecuciones omitidas, cargos vencidos, eventos inesperados", async () => {
  const m = await mundoDeFinanzas(prisma, "Métricas");
  const b = await escenarioBot(prisma, { nombre: "Métricas bot" });
  const ids = [m.org.organizacionId, b.org.organizacionId];
  const leer = async (): Promise<RegistroDeMetricas> => {
    const r = new RegistroDeMetricas();
    for (const [nombre, tipo] of [["inscripciones_mensajes", "gauge"], ["inscripciones_mensajes_bloqueados", "gauge"], ["inscripciones_entregas_fallidas", "gauge"], ["inscripciones_ejecuciones_automatizacion", "gauge"], ["inscripciones_ejecuciones_omitidas", "gauge"], ["inscripciones_tareas_pendientes", "gauge"], ["inscripciones_cargos_vencidos", "gauge"], ["inscripciones_eventos_inesperados", "gauge"], ["inscripciones_organizaciones", "gauge"]] as const) r.declarar(nombre, tipo, "x");
    await recolectarDeLaBase(prisma, r, ids);
    return r;
  };
  try {
    const antes = await leer();
    assert.equal(antes.leer("inscripciones_organizaciones"), 2);
    // Mensajes: una conversación del bot (el contacto escribe y el sistema contesta; con el reloj fuera de la ventana el saliente queda bloqueado por ventana).
    const c = b.contacto();
    await c.escribe("Hola", new Date("2026-10-07T18:00:00Z"));
    // Cargos vencidos: una inscripción con su cargo y el barrido un mes después.
    const ins = await m.inscribir();
    m.reloj.ahora = new Date("2027-02-01T16:00:00Z");
    await barrerFinanzas({ prisma, reloj: () => m.reloj.ahora, organizacionId: m.org.organizacionId });
    // Una constancia de evento inesperado (organización conocida) y una tarea pendiente de un tipo.
    const tarea = await prisma.tarea_asesor.create({ data: { organizacion_id: m.org.organizacionId, lead_id: null, tipo: "evento_inesperado", descripcion: "x" } });
    assert.ok(tarea.id);
    await prisma.evento_inesperado.create({ data: { organizacion_id: m.org.organizacionId, origen: "chatwoot", clave: `k4-${randomBytes(4).toString("hex")}`, causa: "forma_inesperada", detalle: "x", forma: {} } });
    const despues = await leer();
    const entrantes = despues.leer("inscripciones_mensajes", { direccion: "entrante", estatus: "recibido" }) - antes.leer("inscripciones_mensajes", { direccion: "entrante", estatus: "recibido" });
    assert.equal(entrantes, 1, "un mensaje entrante");
    const salientes = despues.muestras().filter((x) => x.nombre === "inscripciones_mensajes" && x.etiquetas["direccion"] === "saliente").reduce((n, x) => n + x.valor, 0);
    assert.ok(salientes >= 1, "el bot contestó o dejó el saliente en algún estado");
    assert.ok(despues.leer("inscripciones_cargos_vencidos") - antes.leer("inscripciones_cargos_vencidos") >= 2, "la inscripción y la mensualidad vencieron");
    assert.equal(despues.leer("inscripciones_tareas_pendientes", { tipo: "evento_inesperado" }) - antes.leer("inscripciones_tareas_pendientes", { tipo: "evento_inesperado" }), 1);
    assert.equal(despues.leer("inscripciones_eventos_inesperados", { origen: "chatwoot" }) - antes.leer("inscripciones_eventos_inesperados", { origen: "chatwoot" }), 1);
    // Un mensaje fallido y uno bloqueado por motivo.
    const conv = await b.db.conversacion.findFirstOrThrow({ where: { lead_id: (await c.conversacion()).lead_id } });
    await prisma.mensaje.create({ data: { organizacion_id: b.org.organizacionId, conversacion_id: conv.id, direccion: "saliente", estatus: "fallido", origen: "automatizacion", cuerpo: "x", proveedor: "chatwoot", error: "x" } });
    await prisma.mensaje.create({ data: { organizacion_id: b.org.organizacionId, conversacion_id: conv.id, direccion: "saliente", estatus: "bloqueado", origen: "automatizacion", cuerpo: "x", proveedor: "chatwoot", motivo_bloqueo: "fuera_de_horario" } });
    const final = await leer();
    assert.equal(final.leer("inscripciones_entregas_fallidas") - despues.leer("inscripciones_entregas_fallidas"), 1);
    assert.equal(final.leer("inscripciones_mensajes_bloqueados", { motivo: "fuera_de_horario" }) - despues.leer("inscripciones_mensajes_bloqueados", { motivo: "fuera_de_horario" }), 1);
    // Ninguna etiqueta lleva datos de una persona.
    const texto = final.texto();
    assert.ok(!texto.includes(c.telefono) && !texto.includes(ins.tutorId) && !/\d{10,}/.test(texto.replace(/ \d+(\.\d+)?$/gm, "")), "solo conteos por conjuntos cerrados");
  } finally {
    await m.cerrar();
  }
});

test("el recolector comparte una sola consulta entre lecturas simultáneas, la cachea y calcula la edad del barrido en cada lectura", async () => {
  let reloj = 1_000_000;
  const registro = new RegistroDeMetricas();
  for (const n of ["inscripciones_mensajes", "inscripciones_mensajes_bloqueados", "inscripciones_entregas_fallidas", "inscripciones_ejecuciones_automatizacion", "inscripciones_ejecuciones_omitidas", "inscripciones_tareas_pendientes", "inscripciones_cargos_vencidos", "inscripciones_eventos_inesperados", "inscripciones_organizaciones"]) registro.declarar(n, "gauge", "x");
  registro.declarar("inscripciones_barrido_edad_segundos", "gauge", "x");
  let corridas = 0;
  const raizContada = new Proxy(prisma, { get: (t, k, r) => { if (k === "organizacion") corridas++; return Reflect.get(t, k, r) as unknown; } });
  const org = await sembrarOrganizacion(prisma, "Recolector");
  const rec = crearRecolector({ prisma: raizContada, cacheMs: 10_000, reloj: () => reloj, registro, soloOrganizaciones: [org.organizacionId] });
  await Promise.all([rec.texto(), rec.texto(), rec.texto()]);
  const tras = corridas;
  assert.ok(tras >= 1);
  await rec.texto();
  assert.equal(corridas, tras, "dentro del caché no vuelve a consultar");
  reloj += 11_000;
  await rec.texto();
  assert.ok(corridas > tras, "pasado el caché, sí");
  assert.match(registro.texto(), /^inscripciones_barrido_edad_segundos \d+$/m);
});

// ── Ningún teléfono completo en ningún log ──────────────────────────────────────────────────────────

test("recorre los flujos (bot, landing, webhooks de Chatwoot y Twilio, API, fallas) y NINGÚN log lleva un teléfono completo", async () => {
  const logs = colectarLogs();
  const tel = (): string => `55${randomInt(10_000_000, 99_999_999)}`; // 10 dígitos
  const telefonos: string[] = [];
  const nuevo = (): string => {
    const t = tel();
    telefonos.push(t);
    return t;
  };
  try {
    // 1. El bot: un contacto conversa (su teléfono entra por Chatwoot).
    const b = await escenarioBot(prisma, { nombre: "Logs bot", programas: [{ sucursal: 0, nombre: "P", edadMin: 3, edadMax: 12, grupos: [{ nombre: "G", cupoMaximo: 5, horarios: [[1, 960, 1020]] }], precio: { inscripcion: "500.00", mensualidad: "300.00" } }] });
    const c = b.contacto();
    telefonos.push(c.telefono.replace(/^\+/, ""), c.telefono);
    for (const t of ["Hola", "Luis", "8", "1", "1"]) await c.escribe(t, new Date("2026-11-02T18:00:00Z"));

    // 2. La API: iniciar sesión, buscar un lead por su teléfono, un error al buscar con basura.
    const m = await mundoDeFinanzas(prisma, "Logs api");
    const fam = await sembrarFamilia(prisma, m.org, { sucursalId: m.norte });
    telefonos.push(fam.telefono!, fam.telefono!.replace(/^\+/, ""), fam.telefono!.replace(/^\+52/, ""));
    assert.equal((await m.admin.get(`/api/leads?telefono=${encodeURIComponent(fam.telefono!)}`)).estado, 200);
    await m.admin.get(`/api/leads?telefono=${encodeURIComponent(fam.telefono! + "'; --")}`);
    await m.admin.post("/api/familias/buscar", { telefono: fam.telefono });

    // 3. La app con los webhooks y la landing.
    const org = await sembrarOrganizacion(prisma, "Logs webhooks");
    const docs = await sembrarDocumentosLegales(prisma, org);
    const slug = `lg-${randomBytes(4).toString("hex")}`;
    const numeroCanal = `whatsapp:+1555${randomInt(1_000_000, 9_999_999)}`;
    await prisma.vertical.update({ where: { id: org.verticalId }, data: { slug } });
    await prisma.canal_whatsapp.update({ where: { id: org.canalId }, data: { numero_whatsapp: numeroCanal } });
    const transporte = new TransporteFalso();
    const reloj = (): Date => new Date("2026-10-07T18:00:00Z");
    const borde = crearBordeTwilio({ prisma, reenviador: new ReenviadorTwilioFalso() });
    const app = crearApp({
      pingDb: async () => {},
      secretoWebhookChatwoot: "secreto",
      procesarEntrante: (e) => procesarEntrante({ prisma, mensajeria: new MessagingProvider({ transporte, reloj }), reloj }, e),
      registrarTomaDeConversacion: async () => "x",
      estadosEntrega: new EstadosEntregaChatwoot(),
      registrarEstadoEntrega: (cambio) => registrarEstadoEntrega({ prisma }, cambio),
      twilio: { authToken: "token", publicBaseUrl: "https://e.example", borde },
      inesperados: crearManejadorDeInesperados(prisma),
      landing: { prisma },
      api: { prisma, parametrosHash: PARAMETROS_PRUEBA, cookieSegura: false, origenesPermitidos: [] },
    });
    const server = escucharSinReuso(app);
    try {
      const url = `http://127.0.0.1:${await puertoDe(server)}`;
      const ts = String(Math.floor(Date.now() / 1000));
      const chatwoot = (cuerpo: string, firma?: string) => fetch(`${url}/webhooks/chatwoot`, { method: "POST", headers: { "x-chatwoot-timestamp": ts, "x-chatwoot-signature": firma ?? firmarCuerpoChatwoot("secreto", ts, Buffer.from(cuerpo)) }, body: cuerpo });
      const t1 = nuevo();
      // normal, con firma inválida, con un dato que la base rechaza (NUL dentro del identificador: el detalle del error NO debe filtrar el teléfono) y JSON roto
      await chatwoot(JSON.stringify(payloadMensajeEntrante({ id: randomInt(1e8, 9e8), cuenta: org.chatwootAccountId, bandeja: org.chatwootInboxId, conversacion: randomInt(1e8, 9e8), telefono: `+52${t1}` })));
      await chatwoot(JSON.stringify(payloadMensajeEntrante({ id: 5, telefono: `+52${t1}` })), "sha256=" + "0".repeat(64));
      const t2 = nuevo();
      await chatwoot(JSON.stringify(payloadMensajeEntrante({ id: randomInt(1e8, 9e8), cuenta: org.chatwootAccountId, bandeja: org.chatwootInboxId, conversacion: randomInt(1e8, 9e8), telefono: `+52${t2}`, sourceId: `SM\u0000${t2}`, canal: "Channel::TwilioSms" })));
      await chatwoot(`{"telefono":"+52${nuevo()}"`);
      // Twilio: entrante válido con From, y otro con firma inválida
      const ruta = "/webhooks/twilio/entrantes";
      const t3 = nuevo();
      const cuerpo = new URLSearchParams({ MessageSid: `SM${randomBytes(12).toString("hex")}`, To: numeroCanal, From: `whatsapp:+52${t3}`, Body: "Hola" }).toString();
      const p = [...new URLSearchParams(cuerpo)].sort(([a], [b2]) => (a < b2 ? -1 : 1));
      const firma = createHmac("sha1", "token").update(`https://e.example${ruta}` + p.map(([k, v]) => k + v).join("")).digest("base64");
      assert.equal((await fetch(`${url}${ruta}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": firma }, body: cuerpo })).status, 200);
      await fetch(`${url}${ruta}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": "mala" }, body: cuerpo });
      // Landing: envío válido, repetido, e inválido
      const t4 = nuevo();
      const envio = (telefono: string) => fetch(`${url}/l/${slug}`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ nombre_alumno: "Mateo", edad: "8", sucursal_id: org.sucursales[0]!.id, telefono, nombre_contacto: "Rosa", acepta_aviso: "on", documento_id: docs.avisoPrivacidad, version: "1" }).toString() });
      await envio(`${t4.slice(0, 2)} ${t4.slice(2, 6)} ${t4.slice(6)}`);
      await envio(t4);
      await envio(`${t4}x`);
    } finally {
      server.close();
    }
    await m.cerrar();
  } finally {
    logs.detener();
  }
  const todo = logs.texto();
  assert.ok(todo.length > 1000, "los flujos sí escribieron logs");
  for (const t of new Set(telefonos)) {
    const digitos = t.replace(/\D/g, "");
    assert.ok(!todo.includes(digitos), `un log lleva el teléfono completo ${t.slice(0, 4)}…${t.slice(-2)}`);
    if (digitos.length === 10) assert.ok(!todo.includes(`${digitos.slice(0, 2)} ${digitos.slice(2, 6)} ${digitos.slice(6)}`));
  }
  assert.match(todo, /\+52\*+\d{4}/, "sí hay teléfonos enmascarados");
});
