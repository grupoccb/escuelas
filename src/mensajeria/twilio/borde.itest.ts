// El borde de Twilio de punta a punta: la app HTTP real, la firma real (con un token falso), el
// borde con Postgres real y un reenviador falso. Sin Twilio ni Chatwoot (invariante 11).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomInt } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../testutil/prisma-pruebas.ts";
import { altaConAlcance, conAlcance } from "../../datos/alcance.ts";
import { crearApp } from "../../http/app.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../../testutil/semilla.ts";
import { Barrera, conGanchos, soloOrganizaciones } from "../../testutil/carrera.ts";
import { MAX_INTENTOS_REENVIO, RECLAMO_TWILIO_VENCE_MS, crearBordeTwilio } from "./borde.ts";
import { ReenviadorTwilioFalso } from "./reenviador.ts";
import { escucharSinReuso, puertoDe } from "../../testutil/servidor.ts";

const TOKEN = "token-de-prueba";
const BASE = "https://escuela.example.test";
const ENTRANTES = "/webhooks/twilio/entrantes";
const ESTADOS = "/webhooks/twilio/estados";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

/** Firma independiente de la implementación bajo prueba (algoritmo documentado por Twilio). */
function firmar(url: string, cuerpo: Buffer): string {
  const p: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(cuerpo.toString("utf8"))) p[k] = v;
  let datos = url;
  for (const k of Object.keys(p).sort()) datos += k + p[k];
  return createHmac("sha1", TOKEN).update(datos).digest("base64");
}

/** Una organización con su canal con número de WhatsApp (por el que Twilio resuelve la organización). */
async function escuela(numero = `whatsapp:+1555${randomInt(1_000_000, 9_999_999)}`): Promise<OrganizacionDePrueba & { numero: string }> {
  const o = await sembrarOrganizacion(prisma, "Borde");
  await prisma.canal_whatsapp.update({ where: { id: o.canalId }, data: { numero_whatsapp: numero } });
  return { ...o, numero };
}

async function entorno(opciones: { normalizarFromAlReenviar?: boolean; reenviarSinOrganizacion?: boolean; reloj?: () => Date; prisma?: PrismaPruebas } = {}) {
  const reenviador = new ReenviadorTwilioFalso();
  const borde = crearBordeTwilio({ reenviador, ...opciones, prisma: opciones.prisma ?? prisma });
  const app = crearApp({
    pingDb: async () => {},
    secretoWebhookChatwoot: "s",
    procesarEntrante: async () => ({ resultado: "procesado" }),
    registrarTomaDeConversacion: async () => "tomada",
    estadosEntrega: { interpretar: () => null },
    registrarEstadoEntrega: async () => "actualizado",
    twilio: { authToken: TOKEN, publicBaseUrl: BASE, borde },
  });
  const server = escucharSinReuso(app);
  const port = await puertoDe(server);
  /** POST firmado (o con la firma que se diga) a la ruta; devuelve el estado HTTP. */
  const enviar = async (ruta: string, cuerpo: Buffer, firma: string | null = firmar(`${BASE}${ruta}`, cuerpo)) => {
    const res = await fetch(`http://127.0.0.1:${port}${ruta}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...(firma ? { "x-twilio-signature": firma } : {}) },
      body: new Uint8Array(cuerpo),
    });
    await res.arrayBuffer();
    return res.status;
  };
  return { reenviador, borde, enviar, cerrar: () => server.close() };
}

/** Cuerpo de un entrante de anuncio, con codificaciones raras a propósito para comprobar los bytes. */
function entrante(o: { numero: string }, sid: string, from = "whatsapp:+5215512345678"): Buffer {
  return Buffer.from(
    [
      `SmsMessageSid=${sid}`,
      "NumMedia=0",
      "ProfileName=Mam%c3%a1+de+Sof%C3%ADa", // minúsculas y mayúsculas en el hex, + por espacio
      "MessageType=text",
      `WaId=5215512345678`,
      "Body=Hola%2C+quiero+informes",
      `To=${encodeURIComponent(o.numero)}`,
      `MessageSid=${sid}`,
      `From=${encodeURIComponent(from)}`,
      "ReferralNumMedia=0",
      "ReferralSourceId=120200000000001",
      "ReferralSourceType=ad",
      "ReferralSourceUrl=https%3A%2F%2Ffb.me%2Fabc",
      "ReferralHeadline=Clase+muestra+gratis",
      "ReferralBody=Ven+a+conocernos",
      "ReferralCtwaClid=AffXyz_-123%2Fabc%3D%3D",
      "ApiVersion=2010-04-01",
    ].join("&"),
  );
}

const estado = (o: { numero: string }, sid: string, status: string) =>
  Buffer.from(`MessageSid=${sid}&MessageStatus=${status}&From=${encodeURIComponent(o.numero)}&To=whatsapp%3A%2B5215512345678&AccountSid=ACfalso`);

const sidNuevo = () => `SM${randomInt(100_000_000, 999_999_999)}${randomInt(100_000_000, 999_999_999)}`;

test("firma válida: pasa y se reenvía el cuerpo BYTE A BYTE, con los Referral* y From sin tocar", async () => {
  const o = await escuela();
  const e = await entorno();
  try {
    const cuerpo = entrante(o, sidNuevo());
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 200);
    assert.equal(e.reenviador.enviados.length, 1);
    const enviado = e.reenviador.enviados[0]!;
    assert.equal(enviado.tipo, "entrante");
    assert.ok(Buffer.compare(enviado.cuerpo, cuerpo) === 0, "los bytes del cuerpo son idénticos");
    const texto = enviado.cuerpo.toString();
    for (const clave of ["ReferralSourceId=120200000000001", "ReferralCtwaClid=AffXyz_-123%2Fabc%3D%3D", "ReferralHeadline=Clase+muestra+gratis", "From=whatsapp%3A%2B5215512345678"]) {
      assert.ok(texto.includes(clave), clave);
    }
    assert.equal(enviado.cabeceras["content-type"], "application/x-www-form-urlencoded");
    assert.ok(enviado.cabeceras["x-twilio-signature"]);
  } finally {
    e.cerrar();
  }
});

test("firma inválida, ausente o de otro cuerpo: 403 y nada se reenvía ni se guarda", async () => {
  const o = await escuela();
  const e = await entorno();
  try {
    const sid = sidNuevo();
    const cuerpo = entrante(o, sid);
    assert.equal(await e.enviar(ENTRANTES, cuerpo, null), 403);
    assert.equal(await e.enviar(ENTRANTES, cuerpo, "AAAAAAAAAAAAAAAAAAAAAAAAAAA="), 403);
    assert.equal(await e.enviar(ENTRANTES, cuerpo, firmar(`${BASE}${ENTRANTES}`, Buffer.from(cuerpo.toString().replace("Hola", "Adios")))), 403);
    assert.equal(e.reenviador.enviados.length, 0);
    assert.equal(await conAlcance(prisma, o.organizacionId).evento_twilio.count({ where: { id_mensaje: sid } }), 0);
  } finally {
    e.cerrar();
  }
});

test("un reintento de Twilio (mismo MessageSid) llega a Chatwoot UNA sola vez", async () => {
  const o = await escuela();
  const e = await entorno();
  try {
    const cuerpo = entrante(o, sidNuevo());
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 200);
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 200, "al reintento Twilio también recibe 200");
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 200);
    assert.equal(e.reenviador.enviados.length, 1);
  } finally {
    e.cerrar();
  }
});

test("reintentos simultáneos: uno solo reenvía y los demás no reenvían (duplicado o en curso)", async () => {
  const o = await escuela();
  const e = await entorno();
  try {
    for (let vuelta = 0; vuelta < 4; vuelta++) {
      e.reenviador.demoraMs = 30;
      const cuerpo = entrante(o, sidNuevo());
      const antes = e.reenviador.enviados.length;
      const estados = await Promise.all(Array.from({ length: 6 }, () => e.enviar(ENTRANTES, cuerpo)));
      assert.equal(e.reenviador.enviados.length - antes, 1, `vuelta ${vuelta}`);
      assert.ok(estados.every((s) => s === 200 || s === 503), `vuelta ${vuelta}: ${estados}`);
      assert.equal(estados.filter((s) => s === 200).length >= 1, true);
    }
  } finally {
    e.cerrar();
  }
});

test("estados: cada MessageStatus de un mismo MessageSid se reenvía una vez, y un estado repetido no", async () => {
  const o = await escuela();
  const e = await entorno();
  try {
    const sid = sidNuevo();
    for (const s of ["sent", "delivered", "delivered", "read", "sent"]) assert.equal(await e.enviar(ESTADOS, estado(o, sid, s)), 200);
    assert.deepEqual(
      e.reenviador.enviados.map((p) => new URLSearchParams(p.cuerpo.toString()).get("MessageStatus")),
      ["sent", "delivered", "read"],
    );
    assert.ok(e.reenviador.enviados.every((p) => p.tipo === "estado"));
    // Un entrante con el mismo sid es otro evento.
    assert.equal(await e.enviar(ENTRANTES, entrante(o, sid)), 200);
    assert.equal(e.reenviador.enviados.length, 4);
  } finally {
    e.cerrar();
  }
});

test("la organización sale del número de la escuela: entrantes por To, estados por From; con +521 en el número también", async () => {
  const nacional = String(randomInt(1_000_000_000, 9_999_999_999)); // 10 dígitos
  const mx = await escuela(`whatsapp:+52${nacional}`);
  const e = await entorno();
  try {
    const sidA = sidNuevo();
    // El receptor llega con el 1 de móvil: normalizarTelefono() lo colapsa.
    const cuerpo = entrante({ numero: `whatsapp:+521${nacional}` }, sidA);
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 200);
    const sidB = sidNuevo();
    assert.equal(await e.enviar(ESTADOS, estado({ numero: `whatsapp:+521${nacional}` }, sidB, "delivered")), 200);
    assert.equal(e.reenviador.enviados.length, 2);
    const eventos = await conAlcance(prisma, mx.organizacionId).evento_twilio.findMany({ where: { id_mensaje: { in: [sidA, sidB] } }, orderBy: { tipo: "asc" } });
    assert.deepEqual(eventos.map((x) => [x.tipo, x.estado_proceso, x.numero_receptor]), [
      ["entrante", "reenviado", `whatsapp:+52${nacional}`],
      ["estado", "reenviado", `whatsapp:+52${nacional}`],
    ]);
  } finally {
    e.cerrar();
  }
});

test("aislamiento: el evento queda en la organización dueña del número, no en otra", async () => {
  const a = await escuela();
  const b = await escuela();
  const e = await entorno();
  try {
    const sid = sidNuevo();
    assert.equal(await e.enviar(ENTRANTES, entrante(b, sid)), 200);
    assert.equal(await conAlcance(prisma, b.organizacionId).evento_twilio.count({ where: { id_mensaje: sid } }), 1);
    assert.equal(await conAlcance(prisma, a.organizacionId).evento_twilio.count({ where: { id_mensaje: sid } }), 0);
  } finally {
    e.cerrar();
  }
});

test("EA-05: número receptor desconocido: se reenvía IGUAL a Chatwoot (sin registro) y queda una alerta visible; el mensaje no se pierde", async () => {
  await escuela();
  const e = await entorno();
  try {
    const cuerpo = entrante({ numero: "whatsapp:+15559990000" }, sidNuevo());
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 200);
    assert.equal(e.reenviador.enviados.length, 1, "se reenvió: antes de A7 Chatwoot lo habría recibido");
    assert.ok(Buffer.compare(e.reenviador.enviados[0]!.cuerpo, cuerpo) === 0, "byte a byte");
    assert.equal(e.borde.alertas.organizacionDesconocida, 1, "alerta contada");
    const sinTo = Buffer.from("MessageSid=SM123&Body=hola");
    assert.equal(await e.enviar(ENTRANTES, sinTo), 200);
    assert.equal(e.reenviador.enviados.length, 2);
    assert.equal(e.borde.alertas.organizacionDesconocida, 2);
    // Sin organización no hay dónde guardar el evento.
    assert.equal(await prisma.evento_twilio.count({ where: { id_mensaje: "SM123" } }), 0);

    // Si el reenvío falla, 502: Twilio puede reintentar.
    e.reenviador.fallarSi = () => true;
    assert.equal(await e.enviar(ENTRANTES, entrante({ numero: "whatsapp:+15559990000" }, sidNuevo())), 502);
  } finally {
    e.cerrar();
  }
});

test("EA-05: sin destino de reenvío (opción apagada) el receptor desconocido solo alerta: 200 y no se reenvía", async () => {
  await escuela();
  const e = await entorno({ reenviarSinOrganizacion: false });
  try {
    assert.equal(await e.enviar(ENTRANTES, entrante({ numero: "whatsapp:+15559990000" }, sidNuevo())), 200);
    assert.equal(e.reenviador.enviados.length, 0);
    assert.equal(e.borde.alertas.organizacionDesconocida, 1);
  } finally {
    e.cerrar();
  }
});

// ---------------------------------------------------------------------------------------------
// EA-03: durabilidad. El evento se guarda ANTES de reenviarlo y un barrido lo reintenta.

const SEG = 1000;

test("EA-03: el cuerpo y las cabeceras se guardan al reclamar y se borran al reenviar", async () => {
  const o = await escuela();
  let ahora = new Date("2026-10-08T18:00:00Z");
  const e = await entorno({ reloj: () => ahora });
  try {
    const sid = sidNuevo();
    const cuerpo = entrante(o, sid);
    e.reenviador.fallarSi = () => true;
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 502);
    const db = conAlcance(prisma, o.organizacionId);
    const fallido = await db.evento_twilio.findFirstOrThrow({ where: { id_mensaje: sid } });
    assert.equal(fallido.estado_proceso, "fallido");
    assert.ok(fallido.cuerpo && Buffer.compare(Buffer.from(fallido.cuerpo), cuerpo) === 0, "el cuerpo guardado es idéntico");
    assert.equal((fallido.cabeceras as Record<string, string>)["content-type"], "application/x-www-form-urlencoded");

    e.reenviador.fallarSi = undefined;
    ahora = new Date(ahora.getTime() + 61 * SEG);
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 200);
    const hecho = await db.evento_twilio.findFirstOrThrow({ where: { id_mensaje: sid } });
    assert.deepEqual([hecho.estado_proceso, hecho.cuerpo, hecho.cabeceras], ["reenviado", null, null], "ya reenviado: no se conservan datos de contacto");
  } finally {
    e.cerrar();
  }
});

test("EA-03: un reenvío fallido se reintenta SOLO (barrido), sin que Twilio vuelva a llamar; el reintento de Twilio después es un duplicado", async () => {
  const o = await escuela();
  let ahora = new Date("2026-10-08T18:00:00Z");
  const e = await entorno({ reloj: () => ahora, prisma: soloOrganizaciones(prisma, [o.organizacionId]) });
  try {
    const sid = sidNuevo();
    const cuerpo = entrante(o, sid);
    e.reenviador.fallarSi = () => true; // Chatwoot caído o en despliegue
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 502);

    // Todavía no ha pasado el tiempo mínimo entre intentos: no se toca.
    ahora = new Date(ahora.getTime() + 30 * SEG);
    assert.deepEqual(await e.borde.reenviarPendientes(), { reenviados: 0, fallidos: 0, abandonados: 0, errores: 0 });

    // Chatwoot vuelve; el barrido del minuto siguiente lo reenvía.
    e.reenviador.fallarSi = undefined;
    ahora = new Date(ahora.getTime() + 60 * SEG);
    assert.deepEqual(await e.borde.reenviarPendientes(), { reenviados: 1, fallidos: 0, abandonados: 0, errores: 0 });
    assert.equal(e.reenviador.enviados.length, 1);
    assert.ok(Buffer.compare(e.reenviador.enviados[0]!.cuerpo, cuerpo) === 0, "el cuerpo reenviado es el original");
    assert.equal(e.reenviador.enviados[0]!.cabeceras["content-type"], "application/x-www-form-urlencoded");
    const db = conAlcance(prisma, o.organizacionId);
    const hecho = await db.evento_twilio.findFirstOrThrow({ where: { id_mensaje: sid } });
    assert.deepEqual([hecho.estado_proceso, hecho.intentos, hecho.error, hecho.cuerpo], ["reenviado", 2, null, null]);

    // Idempotente: otro barrido no repite, y un reintento tardío de Twilio es un duplicado.
    assert.deepEqual(await e.borde.reenviarPendientes(), { reenviados: 0, fallidos: 0, abandonados: 0, errores: 0 });
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 200);
    assert.equal(e.reenviador.enviados.length, 1, "llegó a Chatwoot una sola vez");
  } finally {
    e.cerrar();
  }
});

test("EA-03: el reclamo de un proceso que murió (`procesando` vencido) también lo reenvía el barrido", async () => {
  const o = await escuela();
  const ahora = new Date("2026-10-08T18:00:00Z");
  const e = await entorno({ reloj: () => new Date(ahora.getTime() + 2 * RECLAMO_TWILIO_VENCE_MS), prisma: soloOrganizaciones(prisma, [o.organizacionId]) });
  try {
    const sid = sidNuevo();
    const cuerpo = entrante(o, sid);
    const db = conAlcance(prisma, o.organizacionId);
    // Un proceso reclamó (guardando el cuerpo) y murió antes de reenviar.
    await db.evento_twilio.create({
      data: altaConAlcance({
        tipo: "entrante" as const,
        id_mensaje: sid,
        estado_mensaje: "",
        estado_proceso: "procesando" as const,
        reclamado_en: ahora,
        cuerpo: new Uint8Array(cuerpo),
        cabeceras: { "content-type": "application/x-www-form-urlencoded" },
      }),
    });
    const r = await e.borde.reenviarPendientes();
    assert.equal(r.reenviados, 1);
    assert.ok(Buffer.compare(e.reenviador.enviados[0]!.cuerpo, cuerpo) === 0);
    assert.equal((await db.evento_twilio.findFirstOrThrow({ where: { id_mensaje: sid } })).estado_proceso, "reenviado");
  } finally {
    e.cerrar();
  }
});

test("EA-03: un reclamo reciente (en curso) y lo ya reenviado no se tocan", async () => {
  const o = await escuela();
  const ahora = new Date("2026-10-08T18:00:00Z");
  const e = await entorno({ reloj: () => new Date(ahora.getTime() + 30 * SEG), prisma: soloOrganizaciones(prisma, [o.organizacionId]) });
  try {
    const db = conAlcance(prisma, o.organizacionId);
    const base = { tipo: "entrante" as const, estado_mensaje: "", reclamado_en: ahora, cuerpo: new Uint8Array(Buffer.from("MessageSid=x")), cabeceras: {} };
    await db.evento_twilio.create({ data: altaConAlcance({ ...base, id_mensaje: sidNuevo(), estado_proceso: "procesando" as const }) });
    await db.evento_twilio.create({ data: altaConAlcance({ ...base, id_mensaje: sidNuevo(), estado_proceso: "reenviado" as const }) });
    assert.deepEqual(await e.borde.reenviarPendientes(), { reenviados: 0, fallidos: 0, abandonados: 0, errores: 0 });
    assert.equal(e.reenviador.enviados.length, 0);
  } finally {
    e.cerrar();
  }
});

test("EA-03: tras MAX_INTENTOS_REENVIO el evento queda `abandonado`, con alerta, y ya no se reintenta", async () => {
  const o = await escuela();
  let ahora = new Date("2026-10-08T18:00:00Z");
  const e = await entorno({ reloj: () => ahora, prisma: soloOrganizaciones(prisma, [o.organizacionId]) });
  try {
    const sid = sidNuevo();
    const cuerpo = entrante(o, sid);
    e.reenviador.fallarSi = () => true;
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 502);
    for (let i = 0; i < MAX_INTENTOS_REENVIO + 3; i++) {
      ahora = new Date(ahora.getTime() + 61 * SEG);
      await e.borde.reenviarPendientes();
    }
    const db = conAlcance(prisma, o.organizacionId);
    const fila = await db.evento_twilio.findFirstOrThrow({ where: { id_mensaje: sid } });
    assert.equal(fila.estado_proceso, "abandonado");
    assert.equal(fila.intentos, MAX_INTENTOS_REENVIO);
    assert.match(fila.error ?? "", /Abandonado tras/);
    assert.ok(fila.cuerpo, "el cuerpo se conserva para que una persona lo rescate");
    assert.equal(e.borde.alertas.eventosAbandonados, 1, "una sola alerta, no una por barrido");

    // Ni el barrido ni un reintento de Twilio lo vuelven a intentar.
    const antes = e.reenviador.enviados.length;
    e.reenviador.fallarSi = undefined;
    ahora = new Date(ahora.getTime() + 61 * SEG);
    assert.equal((await e.borde.reenviarPendientes()).reenviados, 0);
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 200);
    assert.equal(e.reenviador.enviados.length, antes);
  } finally {
    e.cerrar();
  }
});

test("EA-03 (carrera real): dos barridos a la vez sobre el mismo evento pendiente lo reenvían UNA vez", async () => {
  const o = await escuela();
  const ahora = new Date("2026-10-08T18:00:00Z");
  const barrera = new Barrera(2);
  const raiz = conGanchos(soloOrganizaciones(prisma, [o.organizacionId]), {
    modelo: "evento_twilio",
    operacion: "findMany",
    despues: () => barrera.esperar(),
  });
  const e = await entorno({ reloj: () => new Date(ahora.getTime() + 2 * RECLAMO_TWILIO_VENCE_MS), prisma: raiz });
  try {
    const sid = sidNuevo();
    const db = conAlcance(prisma, o.organizacionId);
    await db.evento_twilio.create({
      data: altaConAlcance({ tipo: "entrante" as const, id_mensaje: sid, estado_mensaje: "", estado_proceso: "fallido" as const, reclamado_en: ahora, cuerpo: new Uint8Array(entrante(o, sid)), cabeceras: {} }),
    });
    e.reenviador.demoraMs = 50;
    const [a, b] = await Promise.all([e.borde.reenviarPendientes(), e.borde.reenviarPendientes()]);
    assert.equal(barrera.completa, true, "los dos leyeron el mismo evento pendiente antes de reclamarlo");
    assert.equal(a.reenviados + b.reenviados, 1);
    assert.equal(e.reenviador.enviados.length, 1);
  } finally {
    e.cerrar();
  }
});

test("EA-03/EA-07: el barrido sigue aunque una organización falle", async () => {
  const a = await escuela();
  const b = await escuela();
  const ahora = new Date("2026-10-08T18:00:00Z");
  let consultas = 0;
  const raiz = conGanchos(soloOrganizaciones(prisma, [a.organizacionId, b.organizacionId]), {
    modelo: "evento_twilio",
    operacion: "findMany",
    antes: async () => {
      if (consultas++ === 0) throw new Error("falló la consulta de la primera organización");
    },
  });
  const e = await entorno({ reloj: () => new Date(ahora.getTime() + 2 * RECLAMO_TWILIO_VENCE_MS), prisma: raiz });
  try {
    const sid = sidNuevo();
    await conAlcance(prisma, b.organizacionId).evento_twilio.create({
      data: altaConAlcance({ tipo: "entrante" as const, id_mensaje: sid, estado_mensaje: "", estado_proceso: "fallido" as const, reclamado_en: ahora, cuerpo: new Uint8Array(entrante(b, sid)), cabeceras: {} }),
    });
    const r = await e.borde.reenviarPendientes();
    assert.equal(r.errores, 1);
    assert.equal(r.reenviados, 1, "la otra organización sí se atendió");
  } finally {
    e.cerrar();
  }
});

test("sin MessageSid no hay cómo descartar reintentos: no se reenvía; WH: se responde 200 (antes 400) y queda constancia (ver inesperados.itest.ts)", async () => {
  const o = await escuela();
  const e = await entorno();
  try {
    const cuerpo = Buffer.from(`Body=hola&To=${encodeURIComponent(o.numero)}&From=whatsapp%3A%2B5215512345678`);
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 200);
    assert.equal(e.reenviador.enviados.length, 0);
  } finally {
    e.cerrar();
  }
});

test("si el reenvío falla: 502, el evento NO queda procesado y el reintento de Twilio sí llega; después, ya no", async () => {
  const o = await escuela();
  const e = await entorno();
  try {
    const sid = sidNuevo();
    const cuerpo = entrante(o, sid);
    e.reenviador.fallarSi = () => true;
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 502);
    const db = conAlcance(prisma, o.organizacionId);
    const fallido = await db.evento_twilio.findFirstOrThrow({ where: { id_mensaje: sid } });
    assert.deepEqual([fallido.estado_proceso, fallido.intentos], ["fallido", 1]);
    assert.match(fallido.error ?? "", /reenv/i);
    assert.equal(e.reenviador.enviados.length, 0);

    e.reenviador.fallarSi = undefined;
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 200, "el reintento reclama el evento fallido");
    assert.equal(e.reenviador.enviados.length, 1);
    const hecho = await db.evento_twilio.findFirstOrThrow({ where: { id_mensaje: sid } });
    assert.deepEqual([hecho.estado_proceso, hecho.intentos, hecho.error], ["reenviado", 2, null]);
    assert.ok(hecho.reenviado_en);

    assert.equal(await e.enviar(ENTRANTES, cuerpo), 200);
    assert.equal(e.reenviador.enviados.length, 1, "ya reenviado: un tercer intento no vuelve a llegar");
  } finally {
    e.cerrar();
  }
});

test("un reclamo de un proceso que murió (más de 60 s en `procesando`) se reclama de nuevo; uno reciente no", async () => {
  const o = await escuela();
  let ahora = new Date("2026-10-08T18:00:00Z");
  const e = await entorno({ reloj: () => ahora });
  try {
    const sid = sidNuevo();
    const cuerpo = entrante(o, sid);
    // Un proceso reclamó y murió: la fila queda `procesando`.
    await conAlcance(prisma, o.organizacionId).evento_twilio.create({
      data: altaConAlcance({ tipo: "entrante" as const, id_mensaje: sid, estado_mensaje: "", estado_proceso: "procesando" as const, reclamado_en: ahora }),
    });
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 503, "reclamo reciente: otro proceso lo está reenviando");
    assert.equal(e.reenviador.enviados.length, 0);

    ahora = new Date(ahora.getTime() + RECLAMO_TWILIO_VENCE_MS + 1000);
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 200);
    assert.equal(e.reenviador.enviados.length, 1);
  } finally {
    e.cerrar();
  }
});

test("EA-08 (A7l): varios reintentos que encuentran el MISMO reclamo vencido a la vez: solo uno lo reclama y reenvía", async () => {
  const o = await escuela();
  const ahora = new Date("2026-10-08T18:00:00Z");
  // Carrera forzada: los tres leen la fila vencida (`procesando` hace > 60 s) ANTES de que cualquiera
  // la reclame de nuevo. Sin la comparación del estado y la hora leídos, los tres la ganarían.
  const barrera = new Barrera(3);
  const raiz = conGanchos(prisma, {
    modelo: "evento_twilio",
    operacion: "findFirst",
    despues: () => barrera.esperar(),
  });
  const e = await entorno({ reloj: () => new Date(ahora.getTime() + RECLAMO_TWILIO_VENCE_MS + 5000), prisma: raiz });
  try {
    const sid = sidNuevo();
    const cuerpo = entrante(o, sid);
    await conAlcance(prisma, o.organizacionId).evento_twilio.create({
      data: altaConAlcance({ tipo: "entrante" as const, id_mensaje: sid, estado_mensaje: "", estado_proceso: "procesando" as const, reclamado_en: ahora }),
    });
    e.reenviador.demoraMs = 50;
    const estados = await Promise.all([e.enviar(ENTRANTES, cuerpo), e.enviar(ENTRANTES, cuerpo), e.enviar(ENTRANTES, cuerpo)]);
    assert.equal(barrera.completa, true, "los tres leyeron la misma fila vencida antes de reclamarla");
    assert.equal(e.reenviador.enviados.length, 1, `estados ${estados}`);
    assert.equal(estados.filter((s) => s === 200).length, 1);
    assert.deepEqual(estados.filter((s) => s !== 200), [503, 503]);
  } finally {
    e.cerrar();
  }
});

test("EA-20: un reclamo vencido cuya hora se escribió por SQL con microsegundos también se reclama de nuevo (el candado compara un contador)", async () => {
  const o = await escuela();
  const ahora = new Date("2026-10-08T18:00:00Z");
  const e = await entorno({ reloj: () => new Date(ahora.getTime() + RECLAMO_TWILIO_VENCE_MS + 5000) });
  try {
    const sid = sidNuevo();
    const cuerpo = entrante(o, sid);
    const creado = await conAlcance(prisma, o.organizacionId).evento_twilio.create({
      data: altaConAlcance({ tipo: "entrante" as const, id_mensaje: sid, estado_mensaje: "", estado_proceso: "procesando" as const, reclamado_en: ahora }),
    });
    // Como lo dejaría un `now()` de SQL: microsegundos que un `Date` de JavaScript no puede representar.
    await prisma.$executeRaw`UPDATE evento_twilio SET reclamado_en = '2026-10-08T18:00:00.123456Z'::timestamptz WHERE id = ${creado.id}::uuid`;
    assert.equal(await e.enviar(ENTRANTES, cuerpo), 200, "se reclamó pese a los microsegundos");
    assert.equal(e.reenviador.enviados.length, 1);
    const hecho = await conAlcance(prisma, o.organizacionId).evento_twilio.findFirstOrThrow({ where: { id_mensaje: sid } });
    assert.deepEqual([hecho.estado_proceso, hecho.intentos], ["reenviado", 2]);
  } finally {
    e.cerrar();
  }
});

test("`From` se normaliza antes de reenviar SOLO si se enciende la opción (apagada por defecto)", async () => {
  const o = await escuela();
  const apagada = await entorno();
  const encendida = await entorno({ normalizarFromAlReenviar: true });
  try {
    const cuerpo = entrante(o, sidNuevo(), "whatsapp:+5215512345678");
    assert.equal(await apagada.enviar(ENTRANTES, cuerpo), 200);
    assert.ok(apagada.reenviador.enviados[0]!.cuerpo.equals(cuerpo));

    const cuerpo2 = entrante(o, sidNuevo(), "whatsapp:+5215512345678");
    assert.equal(await encendida.enviar(ENTRANTES, cuerpo2), 200);
    const reenviado = encendida.reenviador.enviados[0]!.cuerpo.toString();
    assert.equal(reenviado, cuerpo2.toString().replace("From=whatsapp%3A%2B5215512345678", "From=whatsapp%3A%2B525512345678"));
    // Los estados no se tocan aunque la opción esté encendida.
    const est = estado(o, sidNuevo(), "read");
    assert.equal(await encendida.enviar(ESTADOS, est), 200);
    assert.ok(encendida.reenviador.enviados[1]!.cuerpo.equals(est));
  } finally {
    apagada.cerrar();
    encendida.cerrar();
  }
});
