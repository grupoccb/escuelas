// WH, regla 5 de Eduardo: «un webhook nunca responde 500 por un dato inesperado». La app HTTP REAL (Chatwoot, Twilio, landing), el procesamiento real contra
// Postgres y payloads hostiles FIRMADOS correctamente (la firma es válida: el dato es lo raro). Se exige, por cada punto de entrada:
//   · nunca 500; un dato inesperado → 2xx con UNA constancia (`evento_inesperado`) y una tarea para el asesor, una sola vez aunque el evento se repita;
//   · una falla transitoria SIMULADA (y una real: la base inalcanzable) → 5xx, y NO deja constancia (el proveedor reintenta);
//   · la constancia no lleva el contenido del evento (nombres, teléfonos, texto libre).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomInt } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { crearPrisma } from "../datos/prisma.ts";
import { crearApp, type AppDeps } from "../http/app.ts";
import { escucharSinReuso, puertoDe } from "../testutil/servidor.ts";
import { conGanchos, soloOrganizaciones } from "../testutil/carrera.ts";
import { sembrarDocumentosLegales, sembrarOrganizacion, type DocumentosLegalesSembrados, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { procesarEntrante } from "../captacion/entrante.ts";
import { registrarDesasignacionDeConversacion, registrarTomaDeConversacion } from "../captacion/toma.ts";
import { EstadosEntregaChatwoot, MessagingProvider, ReenviadorTwilioFalso, TransporteFalso, crearBordeTwilio, registrarEstadoEntrega, type BordeTwilio } from "../mensajeria/index.ts";
import { firmarCuerpoChatwoot } from "../mensajeria/chatwoot/webhook.ts";
import { payloadMensajeEntrante } from "../mensajeria/chatwoot/fixtures.ts";
import { MAX_INTENTOS_REENVIO, RECLAMO_TWILIO_VENCE_MS } from "../mensajeria/twilio/borde.ts";
import { crearManejadorDeInesperados } from "./inesperado.ts";
import { huella } from "./forma.ts";
import { levantarApi, sembrarUsuario } from "../testutil/api.ts";

const SECRETO = "secreto-de-prueba";
const TOKEN = "token-de-prueba";
const BASE = "https://escuela.example.test";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

const ahoraS = (): string => String(Math.floor(Date.now() / 1000));
const unico = (): string => randomBytes(6).toString("hex");

/** Una falla del MOMENTO (la base saturada) con la forma de las de Prisma. */
const DEL_MOMENTO = (): Error => Object.assign(new Error("Timed out fetching a new connection from the connection pool"), { code: "P2024" });

interface Opciones {
  procesarEntrante?: AppDeps["procesarEntrante"];
  borde?: BordeTwilio;
  reenviador?: ReenviadorTwilioFalso;
  prismaLanding?: PrismaPruebas;
}

async function montar(o: Opciones = {}) {
  const transporte = new TransporteFalso();
  const mensajeria = new MessagingProvider({ transporte });
  const reenviador = o.reenviador ?? new ReenviadorTwilioFalso();
  const borde = o.borde ?? crearBordeTwilio({ prisma, reenviador });
  const app = crearApp({
    pingDb: async () => {},
    secretoWebhookChatwoot: SECRETO,
    procesarEntrante: o.procesarEntrante ?? ((e) => procesarEntrante({ prisma, mensajeria }, e)),
    registrarTomaDeConversacion: (e) => registrarTomaDeConversacion({ prisma }, e),
    registrarDesasignacion: (e) => registrarDesasignacionDeConversacion({ prisma }, e),
    estadosEntrega: new EstadosEntregaChatwoot(),
    registrarEstadoEntrega: (c) => registrarEstadoEntrega({ prisma }, c),
    twilio: { authToken: TOKEN, publicBaseUrl: BASE, borde },
    inesperados: crearManejadorDeInesperados(prisma),
    landing: { prisma: o.prismaLanding ?? prisma },
  });
  const server = escucharSinReuso(app);
  const port = await puertoDe(server);
  const url = `http://127.0.0.1:${port}`;

  /** POST a Chatwoot, firmado con el secreto (o con la firma que se diga). */
  async function chatwoot(cuerpo: string | Buffer): Promise<{ estado: number; cuerpo: unknown }> {
    const bytes = typeof cuerpo === "string" ? Buffer.from(cuerpo) : cuerpo;
    const ts = ahoraS();
    const res = await fetch(`${url}/webhooks/chatwoot`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-chatwoot-timestamp": ts, "x-chatwoot-signature": firmarCuerpoChatwoot(SECRETO, ts, bytes) },
      body: new Uint8Array(bytes),
    });
    const texto = await res.text();
    let json: unknown = texto;
    try {
      json = JSON.parse(texto);
    } catch {
      // no era JSON
    }
    return { estado: res.status, cuerpo: json };
  }

  /** POST a Twilio con firma válida (algoritmo documentado por Twilio, independiente de la implementación). */
  async function twilio(ruta: string, cuerpo: Buffer): Promise<{ estado: number; texto: string }> {
    const p = new Map<string, string[]>();
    for (const [k, v] of new URLSearchParams(cuerpo.toString("utf8"))) p.set(k, [...(p.get(k) ?? []), v]);
    let datos = `${BASE}${ruta}`;
    for (const k of [...p.keys()].sort()) for (const v of p.get(k)!.sort()) datos += k + v;
    const firma = createHmac("sha1", TOKEN).update(datos).digest("base64");
    const res = await fetch(`${url}${ruta}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": firma }, body: new Uint8Array(cuerpo) });
    return { estado: res.status, texto: await res.text() };
  }

  return { url, chatwoot, twilio, reenviador, borde, cerrar: () => server.close() };
}

// ── Lo que se lee de la base ────────────────────────────────────────────────────────────────────────────

const constancias = (origen: "chatwoot" | "twilio_entrante" | "twilio_estado" | "landing" | "barrido_twilio", clave: string) => prisma.evento_inesperado.findMany({ where: { origen, clave, eliminado_en: null } });
const tareas = (organizacionId: string) => prisma.tarea_asesor.findMany({ where: { organizacion_id: organizacionId, tipo: "evento_inesperado" }, orderBy: { creado_en: "asc" } });
const SIN_CONTENIDO = ["CENTINELA", "5215512345678", "María", "Soto"];
const sinContenido = (valor: unknown, quien: string): void => {
  const texto = JSON.stringify(valor);
  for (const prohibido of SIN_CONTENIDO) assert.ok(!texto.includes(prohibido), `${quien}: la constancia no debe llevar «${prohibido}»`);
};

// ── Chatwoot ────────────────────────────────────────────────────────────────────────────────────────────

test("WH Chatwoot: JSON roto, cuerpo vacío y JSON que no es un objeto, con firma válida → nunca 500; 200 con UNA constancia (sin organización) aunque se repita", async () => {
  const m = await montar();
  try {
    const marca = unico();
    const cuerpos = [`{"event": "message_created", "content": "CENTINELA ${marca}`, `[1, 2, "CENTINELA ${marca}"]`, `null`, `"CENTINELA ${marca}"`, `${randomInt(10_000, 99_999)}`];
    for (const c of cuerpos) {
      const clave = `sha:${huella(Buffer.from(c))}`;
      const antes = (await constancias("chatwoot", clave))[0]?.intentos ?? 0; // un cuerpo fijo (como `null`) ya tiene constancia de corridas anteriores
      for (let i = 0; i < 3; i++) {
        const r = await m.chatwoot(c);
        assert.deepEqual([r.estado, r.cuerpo], [200, { ok: true, resultado: "inesperado" }], c);
      }
      const filas = await constancias("chatwoot", clave);
      assert.equal(filas.length, 1, `una sola constancia: ${c}`);
      assert.equal(filas[0]!.intentos, antes + 3, "los reintentos solo suman intentos");
      assert.equal(filas[0]!.organizacion_id, null, "no se puede atar a ninguna organización");
      assert.ok(filas[0]!.causa === "json_invalido" || filas[0]!.causa === "forma_inesperada", filas[0]!.causa);
      sinContenido(filas[0], c);
    }
    // El cuerpo vacío (no hay nada que leer) también es un dato inesperado, no un 500.
    const vacio = await m.chatwoot("");
    assert.deepEqual([vacio.estado, vacio.cuerpo], [200, { ok: true, resultado: "inesperado" }]);
    assert.ok((await constancias("chatwoot", `sha:${huella(Buffer.alloc(0))}`)).length === 1);
    // Y la firma sigue mandando: sin firma válida no se registra nada (invariante 9).
    const falsa = await fetch(`${m.url}/webhooks/chatwoot`, { method: "POST", headers: { "x-chatwoot-timestamp": ahoraS(), "x-chatwoot-signature": "sha256=00" }, body: "{" });
    assert.equal(falsa.status, 401);
  } finally {
    m.cerrar();
  }
});

test("WH Chatwoot: un mensaje entrante ILEGIBLE (tipos erróneos, números enormes, campos nulos o ausentes) no se pierde en silencio: 200, constancia con la organización y tarea para el asesor, una sola vez", async () => {
  const o = await sembrarOrganizacion(prisma, "WH ilegible");
  const m = await montar();
  try {
    const n0 = randomInt(100_000_000, 900_000_000);
    const base = (id: unknown) => ({ ...payloadMensajeEntrante({ id: 1, cuenta: o.chatwootAccountId, bandeja: o.chatwootInboxId, conversacion: 5, content: "CENTINELA Soto" }), id });
    const variantes: [string, unknown][] = [
      ["id como texto", base(String(n0 + 1))],
      ["id nulo", base(null)],
      ["id enorme", base(1e300)],
      ["id con decimales", base(12.5)],
      ["conversación enorme", { ...base(n0 + 2), conversation: { id: 1e300, channel: "Channel::Api", status: "pending", meta: {} } }],
      ["sin conversación", { ...base(n0 + 3), conversation: null }],
      ["sin cuenta legible", { ...base(n0 + 4), account: { id: "no" } }],
    ];
    for (const [nombre, payload] of variantes) {
      const cuerpo = JSON.stringify(payload);
      const antes = await tareas(o.organizacionId);
      const r = await m.chatwoot(cuerpo);
      assert.deepEqual([r.estado, r.cuerpo], [200, { ok: true, resultado: "inesperado" }], nombre);
      const r2 = await m.chatwoot(cuerpo); // el reintento del proveedor
      assert.equal(r2.estado, 200, nombre);
      const p = payload as { id: unknown; account: { id: unknown } };
      const clave = typeof p.id === "number" && Number.isSafeInteger(p.id) ? `msg:${p.id}` : `sha:${huella(Buffer.from(cuerpo))}`;
      const filas = await constancias("chatwoot", clave);
      assert.equal(filas.length, 1, `una constancia: ${nombre}`);
      assert.equal(filas[0]!.intentos, 2, nombre);
      assert.equal(filas[0]!.causa, "forma_inesperada", nombre);
      sinContenido(filas[0], nombre);
      if (typeof p.account.id === "number") {
        assert.equal(filas[0]!.organizacion_id, o.organizacionId, `${nombre}: sabe de qué organización es`);
        const despues = await tareas(o.organizacionId);
        assert.ok(despues.length >= antes.length, nombre);
        assert.ok(despues.some((t) => t.id === filas[0]!.tarea_id), `${nombre}: tiene su tarea`);
      } else {
        assert.equal(filas[0]!.organizacion_id, null, `${nombre}: sin cuenta no hay organización`);
      }
    }
    const pendientes = await tareas(o.organizacionId);
    assert.ok(pendientes.every((t) => t.estado === "pendiente" && t.lead_id === null), "sin conversación conocida la tarea no cuelga de ningún lead (la ve el administrador)");
    assert.ok(pendientes.every((t) => !/CENTINELA|Soto/.test(t.descripcion)), "la tarea no lleva el contenido");
  } finally {
    m.cerrar();
  }
});

test("WH Chatwoot, procesamiento real: un identificador con NUL, números fuera de rango, nombres enormes y unicode raro → nunca 500; lo que la base rechaza deja constancia y tarea una sola vez", async () => {
  const o = await sembrarOrganizacion(prisma, "WH real");
  const m = await montar();
  try {
    const conv = randomInt(10_000_000, 90_000_000);
    const evento = (extra: Record<string, unknown>) => payloadMensajeEntrante({ id: randomInt(10_000_000, 900_000_000), cuenta: o.chatwootAccountId, bandeja: o.chatwootInboxId, conversacion: conv, ...extra });
    // 1. Un mensaje normal crea el lead y la conversación (así las siguientes constancias cuelgan de un lead).
    assert.equal((await m.chatwoot(JSON.stringify(evento({ nombre: "Mamá", content: "Hola" })))).estado, 200);
    const conversacion = await prisma.conversacion.findFirstOrThrow({ where: { organizacion_id: o.organizacionId, chatwoot_conversacion_id: conv } });

    // 2. Lo que la base RECHAZA: el identificador del proveedor con un NUL. Dos eventos distintos de la MISMA conversación: dos constancias, UNA tarea pendiente.
    const sid = (n: string) => `SM${n}\u0000${unico()}`;
    const a = JSON.stringify(evento({ sourceId: sid("a"), canal: "Channel::TwilioSms" }));
    const b = JSON.stringify(evento({ sourceId: sid("b"), canal: "Channel::TwilioSms" }));
    for (const cuerpo of [a, b]) {
      const r = await m.chatwoot(cuerpo);
      assert.deepEqual([r.estado, r.cuerpo], [200, { ok: true, resultado: "inesperado" }]);
    }
    const filas = await prisma.evento_inesperado.findMany({ where: { organizacion_id: o.organizacionId, origen: "chatwoot" }, orderBy: { creado_en: "asc" } });
    assert.equal(filas.length, 2);
    assert.ok(filas.every((f) => f.causa === "texto_con_nul" && f.conversacion_id === conversacion.id && f.lead_id === conversacion.lead_id), JSON.stringify(filas.map((f) => f.causa)));
    const pendientes = await tareas(o.organizacionId);
    assert.equal(pendientes.length, 1, "una pendiente por conversación aunque lleguen varios eventos raros");
    assert.deepEqual([pendientes[0]!.lead_id, pendientes[0]!.conversacion_id, pendientes[0]!.estado], [conversacion.lead_id, conversacion.id, "pendiente"]);
    assert.equal(filas[0]!.tarea_id, pendientes[0]!.id);
    assert.equal(filas[1]!.tarea_id, pendientes[0]!.id, "la segunda reutiliza la tarea de la conversación");

    // 3. El mismo evento repetido, uno tras otro y a la vez: sigue habiendo UNA constancia y UNA tarea por evento.
    const rs = await Promise.all(Array.from({ length: 5 }, () => m.chatwoot(a)));
    assert.ok(rs.every((r) => r.estado === 200));
    const despuesDeLaRafaga = await prisma.evento_inesperado.findMany({ where: { organizacion_id: o.organizacionId, origen: "chatwoot" } });
    assert.equal(despuesDeLaRafaga.length, 2);
    assert.equal(despuesDeLaRafaga.reduce((n, f) => n + f.intentos, 0), 2 + 5, "cada reintento suma un intento");
    assert.equal((await tareas(o.organizacionId)).length, 1);

    // 4. Datos raros que SÍ se procesan o se rechazan: nunca 500, sea cual sea el resultado.
    const hostiles: [string, Record<string, unknown>][] = [
      ["nombre enorme", { nombre: "Á".repeat(5000) }],
      ["unicode raro (derecha a izquierda, combinantes, emoji)", { nombre: "‮oñaḿ́́ 👨‍👩‍👧‍👦 ￿", content: "​​" }],
      ["teléfono ilegible", { telefono: "abc" }],
      ["teléfono nulo", { telefono: null }],
      ["teléfono con NUL", { telefono: "+52155\u000012345" }],
      ["nombre con NUL", { nombre: "Ana\u0000María" }],
      ["contenido nulo", { content: null }],
      ["contenido de 200 KB", { content: "x".repeat(200_000) }],
      ["conversación fuera de rango de la base", { conversacion: 4_000_000_000 }],
      ["cuenta y bandeja desconocidas", { cuenta: 1, bandeja: 1 }],
    ];
    for (const [nombre, extra] of hostiles) {
      const r = await m.chatwoot(JSON.stringify(evento({ conversacion: randomInt(10_000_000, 90_000_000), ...extra })));
      assert.ok(r.estado === 200, `${nombre}: ${r.estado}`);
    }
  } finally {
    m.cerrar();
  }
});

test("WH Chatwoot: la bandeja sin aprovisionar y las demás fallas por datos del procesamiento se atrapan (200); las del momento dan 503 y NO dejan constancia", async () => {
  const o = await sembrarOrganizacion(prisma, "WH causas");
  const cuerpo = (id: number) => JSON.stringify(payloadMensajeEntrante({ id, cuenta: o.chatwootAccountId, bandeja: o.chatwootInboxId, conversacion: 31 }));
  const casos: [string, () => unknown, number, string | null][] = [
    ["restricción de la base (llave foránea real)", () => prisma.lead.create({ data: { organizacion_id: o.organizacionId, vertical_interes_id: "00000000-0000-4000-8000-0000000000ff", etapa_id: "00000000-0000-4000-8000-0000000000fe" } }), 200, "restriccion_base"],
    ["registro inexistente (lead borrado o ajeno)", () => prisma.lead.findUniqueOrThrow({ where: { id: "00000000-0000-4000-8000-0000000000fa" } }), 200, "registro_inexistente"],
    ["tipo incorrecto", () => prisma.campana.create({ data: { organizacion_id: o.organizacionId, nombre: 5 as never, origen: "otro" } }), 200, "dato_invalido"],
    ["un error propio", () => { throw new TypeError("Cannot read properties of undefined"); }, 200, "error_interno"],
    ["falla del momento: pool agotado", () => { throw DEL_MOMENTO(); }, 503, null],
    ["falla del momento: interbloqueo", () => { throw Object.assign(new Error("deadlock detected"), { code: "40P01" }); }, 503, null],
  ];
  let id = randomInt(100_000_000, 900_000_000);
  for (const [nombre, falla, estado, causa] of casos) {
    const evento = ++id;
    const m = await montar({ procesarEntrante: async () => { await falla(); return { resultado: "procesado" }; } });
    try {
      const r = await m.chatwoot(cuerpo(evento));
      assert.equal(r.estado, estado, nombre);
      const filas = await constancias("chatwoot", `chatwoot:${evento}`);
      if (causa) {
        assert.equal(filas.length, 1, nombre);
        assert.equal(filas[0]!.causa, causa, nombre);
        assert.equal(filas[0]!.organizacion_id, o.organizacionId);
        assert.ok(filas[0]!.tarea_id, `${nombre}: con tarea`);
        assert.doesNotMatch(filas[0]!.detalle, /\n|invocation|data:/, "el detalle no arrastra la consulta ni los datos");
      } else {
        assert.equal(filas.length, 0, `${nombre}: el reintento del proveedor es lo que resuelve; no hay constancia`);
        assert.deepEqual(r.cuerpo, { ok: false });
      }
    } finally {
      m.cerrar();
    }
  }
});

test("WH Chatwoot: la bandeja de la conversación sin aprovisionar (BandejaSinAprovisionar real, al despachar) deja constancia y tarea, no un 500 que Chatwoot repetiría sin fin", async () => {
  const o = await sembrarOrganizacion(prisma, "WH sin aprovisionar");
  // La conversación pertenece a una bandeja SIN cuenta de Chatwoot (el aprovisionamiento no se ha hecho): `leerConversacion` lanza al despachar.
  const otroCanal = await prisma.canal_whatsapp.create({ data: { organizacion_id: o.organizacionId, vertical_id: o.verticalId, nombre_publico: "Canal sin aprovisionar" } });
  const sinCuenta = await prisma.bandeja_chatwoot.create({ data: { organizacion_id: o.organizacionId, canal_whatsapp_id: otroCanal.id, nombre: "Sin cuenta", chatwoot_account_id: null, chatwoot_inbox_id: null } });
  const lead = await prisma.lead.create({ data: { organizacion_id: o.organizacionId, vertical_interes_id: o.verticalId, etapa_id: o.etapaInicialId, telefono: "+5255" + randomInt(10_000_000, 99_999_999) } });
  const conv = await prisma.conversacion.create({ data: { organizacion_id: o.organizacionId, bandeja_chatwoot_id: sinCuenta.id, lead_id: lead.id, chatwoot_conversacion_id: 4242 } });
  const mensajeria = new MessagingProvider({ transporte: new TransporteFalso() });
  const m = await montar({
    procesarEntrante: async () => {
      // Lo que haría procesarEntrante después de registrar el mensaje: despachar lo pendiente de ESA conversación.
      await mensajeria.despachar(((await import("../datos/alcance.ts")).conAlcance)(prisma, o.organizacionId), conv.id);
      return { resultado: "procesado" };
    },
  });
  try {
    const evento = randomInt(100_000_000, 900_000_000);
    const r = await m.chatwoot(JSON.stringify(payloadMensajeEntrante({ id: evento, cuenta: o.chatwootAccountId, bandeja: o.chatwootInboxId, conversacion: 4242 })));
    // La conversación 4242 de la bandeja con cuenta no existe (la del test está en la otra bandeja): la constancia sale con la organización, sin conversación.
    assert.equal(r.estado, 200);
    const filas = await constancias("chatwoot", `chatwoot:${evento}`);
    assert.equal(filas.length, 1);
    assert.equal(filas[0]!.causa, "bandeja_sin_aprovisionar");
    assert.equal(filas[0]!.organizacion_id, o.organizacionId);
    assert.ok(filas[0]!.tarea_id);
  } finally {
    m.cerrar();
  }
});

test("WH Chatwoot: la base INALCANZABLE de verdad (no simulada) es una falla del momento → 503 y sin constancia", async () => {
  const o = await sembrarOrganizacion(prisma, "WH base caída");
  // Un cliente apuntado a un puerto cerrado: sus consultas fallan como lo haría una base caída.
  const caida = crearPrisma("postgresql://inscripciones:inscripciones@127.0.0.1:1/inexistente_pruebas?connect_timeout=2");
  const m = await montar({ procesarEntrante: (e) => procesarEntrante({ prisma: caida, mensajeria: new MessagingProvider({ transporte: new TransporteFalso() }) }, e) });
  try {
    const evento = randomInt(100_000_000, 900_000_000);
    const r = await m.chatwoot(JSON.stringify(payloadMensajeEntrante({ id: evento, cuenta: o.chatwootAccountId, bandeja: o.chatwootInboxId, conversacion: 9 })));
    assert.equal(r.estado, 503);
    assert.equal((await constancias("chatwoot", `chatwoot:${evento}`)).length, 0);
  } finally {
    m.cerrar();
    await caida.$disconnect();
  }
});

// ── Twilio ──────────────────────────────────────────────────────────────────────────────────────────────

async function escuela(): Promise<OrganizacionDePrueba & { numero: string }> {
  const numero = `whatsapp:+1555${randomInt(1_000_000, 9_999_999)}`;
  const o = await sembrarOrganizacion(prisma, "WH Twilio");
  await prisma.canal_whatsapp.update({ where: { id: o.canalId }, data: { numero_whatsapp: numero } });
  return { ...o, numero };
}
const entrante = (o: { numero: string }, sid: string, extra = ""): Buffer =>
  Buffer.from(`MessageSid=${sid}&SmsMessageSid=${sid}&To=${encodeURIComponent(o.numero)}&From=${encodeURIComponent("whatsapp:+5215512345678")}&Body=CENTINELA+Mar%C3%ADa&ProfileName=Mar%C3%ADa${extra}`);

test("WH Twilio entrantes: sin MessageSid, cuerpo vacío, MessageSid con NUL o gigante, con firma válida → nunca 500; 200 + constancia + tarea; el mensaje de la familia se reenvía igual a Chatwoot", async () => {
  const o = await escuela();
  const m = await montar();
  try {
    const ruta = "/webhooks/twilio/entrantes";
    // Sin MessageSid: no se puede deduplicar ni reenviar con garantías → constancia + tarea (la escuela se resuelve por `To`), 200 TwiML, sin reenviar.
    const sinSid = Buffer.from(`Body=CENTINELA&To=${encodeURIComponent(o.numero)}&From=whatsapp%3A%2B5215512345678&marca=${unico()}`);
    for (let i = 0; i < 2; i++) {
      const r = await m.twilio(ruta, sinSid);
      assert.equal(r.estado, 200);
      assert.match(r.texto, /<Response\/>/);
    }
    const f1 = await constancias("twilio_entrante", `sha:${huella(sinSid)}`);
    assert.equal(f1.length, 1);
    assert.deepEqual([f1[0]!.causa, f1[0]!.organizacion_id, f1[0]!.intentos], ["sin_identificador", o.organizacionId, 2]);
    sinContenido(f1[0], "sin MessageSid");
    assert.equal(m.reenviador.enviados.length, 0);

    // Cuerpo vacío: tampoco 500.
    const vacio = await m.twilio(ruta, Buffer.alloc(0));
    assert.equal(vacio.estado, 200);

    // MessageSid con NUL: la base rechaza el texto. No es una falla del momento: constancia + tarea y el mensaje SE REENVÍA igual (no se pierde por un dato raro).
    const conNul = entrante(o, `SM%00${unico()}`);
    const r = await m.twilio(ruta, conNul);
    assert.equal(r.estado, 200);
    assert.equal(m.reenviador.enviados.length, 1, "se reenvió tal cual, sin registro");
    assert.deepEqual(Buffer.from(m.reenviador.enviados[0]!.cuerpo), conNul);
    const filas = await prisma.evento_inesperado.findMany({ where: { organizacion_id: o.organizacionId, origen: "twilio_entrante", causa: "texto_con_nul" } });
    assert.equal(filas.length, 1);
    assert.ok(filas[0]!.tarea_id);
    sinContenido(filas[0], "MessageSid con NUL");
    const tarea = await prisma.tarea_asesor.findUniqueOrThrow({ where: { id: filas[0]!.tarea_id! } });
    assert.deepEqual([tarea.lead_id, tarea.tipo, tarea.estado], [null, "evento_inesperado", "pendiente"]);

    // Si Chatwoot tampoco recibe el reenvío, sí hay que reintentar: 502.
    const sidSucio = entrante(o, `SM%00${unico()}`);
    m.reenviador.fallarSi = () => true;
    assert.equal((await m.twilio(ruta, sidSucio)).estado, 502);
    m.reenviador.fallarSi = undefined;

    // MessageSid gigante (el índice de la base no lo aguanta), Unicode raro y campos repetidos: ningún 500.
    for (const cuerpo of [entrante(o, "SM" + "9".repeat(9000)), entrante(o, "SM‮💥" + unico()), Buffer.from(`MessageSid=SM${unico()}&MessageSid=SM${unico()}&To=${encodeURIComponent(o.numero)}`), Buffer.from(`__proto__=1&constructor=2&MessageSid=SM${unico()}&To=${encodeURIComponent(o.numero)}`)]) {
      const rr = await m.twilio(ruta, cuerpo);
      assert.ok(rr.estado === 200, `${cuerpo.toString().slice(0, 30)}: ${rr.estado}`);
    }
  } finally {
    m.cerrar();
  }
});

test("WH Twilio estados: un MessageStatus raro y un MessageSid inválido → nunca 500; una falla del momento del borde → 503 sin constancia", async () => {
  const o = await escuela();
  const m = await montar();
  try {
    const ruta = "/webhooks/twilio/estados";
    for (const status of ["delivered", "", "x".repeat(5000), "\u0000", "💥"]) {
      const cuerpo = Buffer.from(`MessageSid=SM${unico()}&MessageStatus=${encodeURIComponent(status)}&From=${encodeURIComponent(o.numero)}&To=whatsapp%3A%2B5215512345678`);
      const r = await m.twilio(ruta, cuerpo);
      assert.ok(r.estado === 200, `${JSON.stringify(status).slice(0, 20)}: ${r.estado}`);
    }
    const conNul = Buffer.from(`MessageSid=SM%00${unico()}&MessageStatus=sent&From=${encodeURIComponent(o.numero)}`);
    assert.equal((await m.twilio(ruta, conNul)).estado, 200);
    assert.ok((await prisma.evento_inesperado.findMany({ where: { organizacion_id: o.organizacionId, origen: "twilio_estado" } })).length >= 1);
  } finally {
    m.cerrar();
  }
  // Falla del momento: el borde lanza lo que lanzaría la base saturada.
  const sid = `SM${unico()}`;
  const roto: BordeTwilio = { ...crearBordeTwilio({ prisma, reenviador: new ReenviadorTwilioFalso() }), procesar: async () => { throw DEL_MOMENTO(); } };
  const m2 = await montar({ borde: roto });
  try {
    for (const ruta of ["/webhooks/twilio/entrantes", "/webhooks/twilio/estados"]) {
      const r = await m2.twilio(ruta, Buffer.from(`MessageSid=${sid}&MessageStatus=sent&To=${encodeURIComponent(o.numero)}`));
      assert.equal(r.estado, 503, ruta);
      assert.equal(r.texto, "", "nada interno hacia Twilio");
    }
    assert.equal((await constancias("twilio_entrante", sid)).length + (await constancias("twilio_estado", `${sid}:sent`)).length, 0);
  } finally {
    m2.cerrar();
  }
});

test("WH barrido del borde: un evento que agota sus reintentos o cuyos datos hacen fallar el barrido deja constancia + tarea (antes solo un log), una sola vez", async () => {
  const o = await escuela();
  const reenviador = new ReenviadorTwilioFalso();
  const ahora = new Date();
  const crear = (extra: Record<string, unknown>) =>
    prisma.evento_twilio.create({
      data: { organizacion_id: o.organizacionId, proveedor: "twilio", tipo: "entrante", id_mensaje: `SM${unico()}`, estado_mensaje: "", numero_receptor: o.numero, estado_proceso: "fallido", reclamado_en: new Date(ahora.getTime() - 3 * RECLAMO_TWILIO_VENCE_MS), cuerpo: new Uint8Array(Buffer.from("MessageSid=x")), cabeceras: {}, ...extra } as never,
    });

  // 1. Agotó sus reintentos → `abandonado` + constancia + tarea.
  const agotado = await crear({ intentos: MAX_INTENTOS_REENVIO });
  const soloEstas = soloOrganizaciones(prisma, [o.organizacionId]);
  const borde = crearBordeTwilio({ prisma: soloEstas, reenviador, reloj: () => ahora });
  for (let i = 0; i < 2; i++) await borde.reenviarPendientes();
  assert.equal((await prisma.evento_twilio.findUniqueOrThrow({ where: { id: agotado.id } })).estado_proceso, "abandonado");
  const f1 = await constancias("barrido_twilio", `evento_twilio:${agotado.id}`);
  assert.equal(f1.length, 1, "una constancia aunque el barrido corra de nuevo");
  assert.deepEqual([f1[0]!.causa, f1[0]!.organizacion_id], ["reenvio_abandonado", o.organizacionId]);
  assert.ok(f1[0]!.tarea_id);

  // 2. Sus datos hacen lanzar al barrido (una restricción de la base al reclamarlo): se abandona con constancia, en vez de fallar cada minuto para siempre.
  const raro = await crear({ intentos: 1 });
  const conFalla = conGanchos(soloEstas, {
    modelo: "evento_twilio",
    operacion: "updateMany",
    cuando: (args) => (args["where"] as { id?: string } | undefined)?.id === raro.id && (args["data"] as { estado_proceso?: string } | undefined)?.estado_proceso === "procesando",
    antes: async () => {
      throw Object.assign(new Error("Foreign key constraint violated"), { code: "P2003" });
    },
  });
  const r = await crearBordeTwilio({ prisma: conFalla, reenviador, reloj: () => ahora }).reenviarPendientes();
  assert.ok(r.errores >= 1);
  assert.equal((await prisma.evento_twilio.findUniqueOrThrow({ where: { id: raro.id } })).estado_proceso, "abandonado");
  const f2 = await constancias("barrido_twilio", `evento_twilio:${raro.id}`);
  assert.equal(f2.length, 1);
  assert.equal(f2[0]!.causa, "restriccion_base");

  // 3. Una falla del MOMENTO en el barrido NO abandona el evento: se reintenta en el siguiente.
  const transitorio = await crear({ intentos: 1 });
  const caida = conGanchos(soloEstas, {
    modelo: "evento_twilio",
    operacion: "updateMany",
    cuando: (args) => (args["where"] as { id?: string } | undefined)?.id === transitorio.id && (args["data"] as { estado_proceso?: string } | undefined)?.estado_proceso === "procesando",
    antes: async () => {
      throw DEL_MOMENTO();
    },
  });
  await crearBordeTwilio({ prisma: caida, reenviador, reloj: () => ahora }).reenviarPendientes();
  assert.equal((await prisma.evento_twilio.findUniqueOrThrow({ where: { id: transitorio.id } })).estado_proceso, "fallido");
  assert.equal((await constancias("barrido_twilio", `evento_twilio:${transitorio.id}`)).length, 0);
});

// ── Landing ─────────────────────────────────────────────────────────────────────────────────────────────

async function mundoLanding(): Promise<{ org: OrganizacionDePrueba; slug: string; docs: DocumentosLegalesSembrados }> {
  const org = await sembrarOrganizacion(prisma, "WH landing");
  const slug = `v-${randomBytes(5).toString("hex")}`;
  await prisma.vertical.update({ where: { id: org.verticalId }, data: { slug, nombre: "Vertical Uno" } });
  const docs = await sembrarDocumentosLegales(prisma, org);
  return { org, slug, docs };
}
const formulario = (w: { org: OrganizacionDePrueba; docs: DocumentosLegalesSembrados }, cambio: Record<string, string> = {}): string =>
  new URLSearchParams({ nombre_alumno: "Mateo Soto", edad: "8", sucursal_id: w.org.sucursales[0]!.id, telefono: `55 ${randomInt(1000, 9999)} ${randomInt(1000, 9999)}`, nombre_contacto: "Rosa", acepta_aviso: "on", documento_id: w.docs.avisoPrivacidad, version: "1", ...cambio }).toString();
const enviarLanding = (url: string, slug: string, cuerpo: string) =>
  fetch(`${url}/l/${slug}`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Prueba/1.0" }, body: cuerpo });

test("WH landing: campos hostiles (NUL, enormes, unicode raro, tipos repetidos) → nunca 500", async () => {
  const w = await mundoLanding();
  const m = await montar();
  try {
    const hostiles: Record<string, string>[] = [
      { nombre_alumno: "Ana\u0000María" },
      { nombre_alumno: "Á".repeat(10_000) },
      { nombre_alumno: "‮oñam 👨‍👩‍👧‍👦￿" },
      { edad: "99999999999999999999" },
      { edad: "-1" },
      { edad: "NaN" },
      { telefono: "\u000055 1234 5678" },
      { telefono: "9".repeat(500) },
      { nombre_contacto: "R\u0000osa" },
      { sucursal_id: "no-es-un-uuid" },
      { sucursal_id: "00000000-0000-4000-8000-0000000000ff" },
      { documento_id: "x".repeat(5000) },
      { version: "1e300" },
    ];
    for (const h of hostiles) {
      const r = await enviarLanding(m.url, w.slug, formulario(w, h));
      await r.arrayBuffer();
      assert.ok(r.status < 500, `${JSON.stringify(h).slice(0, 40)}: ${r.status}`);
    }
    const get = await fetch(`${m.url}/l/${w.slug}?c=${"x".repeat(5000)}&s=%00&utm_source=%00%00&org=%00`);
    await get.arrayBuffer();
    assert.ok(get.status < 500, `GET: ${get.status}`);
  } finally {
    m.cerrar();
  }
});

test("WH landing, falla por datos al registrar el envío: 422 con el formulario y un mensaje general, UNA constancia y UNA tarea aunque se repita; del momento: 503 sin constancia", async () => {
  const w = await mundoLanding();
  const lanzar = (error: () => Error) =>
    conGanchos(prisma, {
      modelo: "etapa_pipeline",
      operacion: "findFirst",
      cuando: () => true,
      antes: async () => {
        throw error();
      },
    });

  const porDatos = await montar({ prismaLanding: lanzar(() => Object.assign(new Error("Unique constraint failed on the fields: (`telefono`)"), { code: "P2002" })) });
  try {
    const cuerpo = formulario(w, { nombre_alumno: "Mateo Soto CENTINELA" });
    for (let i = 0; i < 3; i++) {
      const r = await enviarLanding(porDatos.url, w.slug, cuerpo);
      const html = await r.text();
      assert.equal(r.status, 422);
      assert.match(html, /No pudimos registrar tu solicitud/);
      assert.ok(!html.includes("Unique constraint") && !html.includes("P2002"), "nada interno hacia la persona");
    }
    const filas = await prisma.evento_inesperado.findMany({ where: { organizacion_id: w.org.organizacionId, origen: "landing" } });
    assert.equal(filas.length, 1);
    assert.deepEqual([filas[0]!.causa, filas[0]!.intentos], ["restriccion_base", 3]);
    sinContenido(filas[0], "landing");
    assert.equal((await tareas(w.org.organizacionId)).length, 1);
  } finally {
    porDatos.cerrar();
  }

  const w2 = await mundoLanding();
  const delMomento = await montar({ prismaLanding: lanzar(DEL_MOMENTO) });
  try {
    const r = await enviarLanding(delMomento.url, w2.slug, formulario(w2));
    await r.arrayBuffer();
    assert.equal(r.status, 503);
    assert.equal(r.headers.get("retry-after"), "10");
    assert.equal((await prisma.evento_inesperado.findMany({ where: { organizacion_id: w2.org.organizacionId } })).length, 0);
    const get = await fetch(`${delMomento.url}/l/${w2.slug}`);
    await get.arrayBuffer();
    assert.ok(get.status < 500 || get.status === 503);
  } finally {
    delMomento.cerrar();
  }
});

// ── La tarea sin lead la ve el administrador por la API ─────────────────────────────────────────────────

test("WH tarea: la del evento que no se pudo atar a ningún lead (lead_id nulo) la lista y la resuelve el administrador; el asesor de una sucursal no la ve", async () => {
  const o = await sembrarOrganizacion(prisma, "WH tarea sin lead");
  const m = await montar();
  const api = levantarApi(prisma);
  try {
    // Un mensaje ilegible de una conversación que no existe: constancia + tarea sin lead.
    const evento = randomInt(100_000_000, 900_000_000);
    const r = await m.chatwoot(JSON.stringify({ ...payloadMensajeEntrante({ id: evento, cuenta: o.chatwootAccountId, bandeja: o.chatwootInboxId, conversacion: 77 }), conversation: null }));
    assert.equal(r.estado, 200);
    const [fila] = await constancias("chatwoot", `msg:${evento}`);
    assert.ok(fila?.tarea_id);

    const admin = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
    const asesor = await sembrarUsuario(prisma, o.organizacionId, { rol: "asesor", sucursales: [o.sucursales[0]!.id] });
    const comoAdmin = api.cliente();
    assert.equal((await comoAdmin.login(o.slug, admin.correo, admin.contrasena)).estado, 201);
    const lista = await comoAdmin.get<{ datos: { id: string; tipo: string; lead_id: string | null; conversacion_id: string | null; estado: string }[] }>("/api/tareas?tipo=evento_inesperado&limite=100");
    assert.equal(lista.estado, 200);
    assert.deepEqual(lista.cuerpo.datos.map((x) => [x.id, x.tipo, x.lead_id, x.estado]), [[fila.tarea_id, "evento_inesperado", null, "pendiente"]]);

    const comoAsesor = api.cliente();
    assert.equal((await comoAsesor.login(o.slug, asesor.correo, asesor.contrasena)).estado, 201);
    assert.deepEqual((await comoAsesor.get<{ datos: unknown[] }>("/api/tareas?tipo=evento_inesperado&limite=100")).cuerpo.datos, [], "sin lead no hay sucursal: solo el administrador");
    assert.equal((await comoAsesor.patch(`/api/tareas/${fila.tarea_id}`, { estado: "hecha" })).estado, 404);

    const resuelta = await comoAdmin.patch<{ estado: string }>(`/api/tareas/${fila.tarea_id}`, { estado: "hecha" });
    assert.deepEqual([resuelta.estado, resuelta.cuerpo.estado], [200, "hecha"]);
  } finally {
    m.cerrar();
    await api.cerrar();
  }
});
