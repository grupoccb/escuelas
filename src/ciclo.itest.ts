// EA-01 / EA-07: el barrido periódico NO se envenena. Un lead borrado a medias, una bandeja sin
// cuenta de Chatwoot o cualquier otro error persistente de UN elemento no detiene a las demás
// conversaciones, ni a otras organizaciones, ni a la recuperación de F1-01 que vive en el motor.
// Contra Postgres real y el transporte falso.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "./testutil/prisma-pruebas.ts";
import { altaConAlcance, conAlcance } from "./datos/alcance.ts";
import { barrerEspera, TIEMPO_ESPERA_MS } from "./captacion/espera.ts";
import { procesarEntrante } from "./captacion/entrante.ts";
import { correrCiclo } from "./ciclo.ts";
import { ENVIO_INCIERTO, MessagingProvider, ReenviadorTwilioFalso, TransporteFalso, crearBordeTwilio, type EventoEntrante } from "./mensajeria/index.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "./testutil/semilla.ts";
import { conGanchos, soloOrganizaciones } from "./testutil/carrera.ts";

let prisma: PrismaPruebas;
let siguiente = randomInt(1_000_000, 2_000_000_000);

before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

const MIN = 60_000;
/** 8-oct-2026 10:00 hora de Ciudad de México (UTC-6). El contacto deja de contestar. */
const T0 = new Date("2026-10-08T16:00:00Z");
const despues = (ms: number): Date => new Date(T0.getTime() + ms);

/** Un contacto que saluda y da su nombre en T0 y se queda callado: captura a medias. */
async function contactoAMedias(o: OrganizacionDePrueba, bandeja?: { cuenta: number; inbox: number }) {
  const transporte = new TransporteFalso();
  const mensajeria = new MessagingProvider({ transporte, reloj: () => T0 });
  const conversacion = randomInt(1, 2_000_000_000);
  const telefono = `+5255${randomInt(10_000_000, 99_999_999)}`;
  let conversacionId = "";
  for (const texto of ["Hola", "Ana"]) {
    const id = String(siguiente++);
    const evento: EventoEntrante = {
      chatwootAccountId: bandeja?.cuenta ?? o.chatwootAccountId,
      chatwootInboxId: bandeja?.inbox ?? o.chatwootInboxId,
      chatwootConversacionId: conversacion,
      idMensaje: id,
      contenido: texto,
      estadoConversacion: "pending",
      contacto: { nombre: "Mamá", telefono },
      creadoEn: null,
      llave: { proveedor: "chatwoot", id },
      numeroReceptor: null,
      crudo: null,
    };
    conversacionId = (await procesarEntrante({ prisma, mensajeria, reloj: () => T0 }, evento)).conversacionId!;
  }
  const db = conAlcance(prisma, o.organizacionId);
  const conv = await db.conversacion.findUniqueOrThrow({ where: { id: conversacionId } });
  return { conversacionId, leadId: conv.lead_id };
}

/** Un mensaje que un proceso muerto dejó en `enviando` hace 1 h: el motor debe recuperarlo (F1-01). */
async function mensajeAMedias(o: OrganizacionDePrueba, conversacionId: string) {
  const db = conAlcance(prisma, o.organizacionId);
  const m = await db.mensaje.create({
    data: altaConAlcance({ conversacion_id: conversacionId, direccion: "saliente" as const, estatus: "enviando" as const, cuerpo: "a medias", proveedor: "chatwoot" }),
  });
  await db.mensaje.updateMany({ where: { id: m.id }, data: { actualizado_en: new Date(despues(40 * MIN).getTime() - 60 * MIN) } });
  return m.id;
}

const visible = async (o: OrganizacionDePrueba, conversacionId: string) =>
  (await conAlcance(prisma, o.organizacionId).conversacion.findUniqueOrThrow({ where: { id: conversacionId } })).visible_a_asesores_en !== null;

const borrarLead = (o: OrganizacionDePrueba, leadId: string) =>
  conAlcance(prisma, o.organizacionId).lead.update({ where: { id: leadId }, data: { eliminado_en: new Date() } });

test("EA-01: un lead borrado a medias no detiene a las demás conversaciones, ni a otra organización, ni a la recuperación del motor", async () => {
  const a = await sembrarOrganizacion(prisma, "Ciclo");
  const b = await sembrarOrganizacion(prisma, "Ciclo");
  // El borrado va PRIMERO (la consulta ordena por creación), las demás detrás.
  const borrado = await contactoAMedias(a);
  const normalA = await contactoAMedias(a);
  const normalB = await contactoAMedias(b);
  const mensajeB = await mensajeAMedias(b, normalB.conversacionId);
  await borrarLead(a, borrado.leadId);

  const transporte = new TransporteFalso();
  const ahora = despues(40 * MIN);
  const r = await correrCiclo({ prisma: soloOrganizaciones(prisma, [a.organizacionId, b.organizacionId]), mensajeria: new MessagingProvider({ transporte, reloj: () => ahora }), reloj: () => ahora });

  assert.equal(r.errores, 0, "un lead borrado no es un error: simplemente no existe para el sistema");
  assert.equal(await visible(a, borrado.conversacionId), false, "del lead borrado no se avisa");
  assert.equal(await visible(a, normalA.conversacionId), true);
  assert.equal(await visible(b, normalB.conversacionId), true, "la otra organización sí avisó");
  const m = await conAlcance(prisma, b.organizacionId).mensaje.findUniqueOrThrow({ where: { id: mensajeB } });
  assert.deepEqual([m.estatus, m.error], ["fallido", ENVIO_INCIERTO], "el motor corrió: recuperó el envío a medias de la otra organización");

  // Y sigue igual en los tics siguientes: nada se queda en bucle.
  const otra = await correrCiclo({ prisma: soloOrganizaciones(prisma, [a.organizacionId, b.organizacionId]), mensajeria: new MessagingProvider({ transporte, reloj: () => despues(41 * MIN) }), reloj: () => despues(41 * MIN) });
  assert.equal(otra.errores, 0);
});

test("EA-01: un lead que se borra DESPUÉS de elegir la conversación tampoco rompe nada (se vuelve a comprobar en la transacción)", async () => {
  const o = await sembrarOrganizacion(prisma, "Ciclo");
  const borrado = await contactoAMedias(o);
  const normal = await contactoAMedias(o);
  // El lead se borra justo después de leer las conversaciones vencidas y antes de la transacción de aviso.
  let borrado1 = false;
  const raiz = conGanchos(prisma, {
    modelo: "conversacion",
    operacion: "findMany",
    cuando: (args) => (args["where"] as { visible_a_asesores_en?: unknown } | undefined)?.visible_a_asesores_en === null,
    despues: async () => {
      if (borrado1) return;
      borrado1 = true;
      await borrarLead(o, borrado.leadId);
    },
  });
  const ahora = despues(40 * MIN);
  const r = await barrerEspera({ prisma: raiz, mensajeria: new MessagingProvider({ transporte: new TransporteFalso(), reloj: () => ahora }), organizacionId: o.organizacionId, reloj: () => ahora });
  assert.equal(borrado1, true);
  assert.deepEqual(r, { avisadas: 1, errores: 0 });
  assert.equal(await visible(o, borrado.conversacionId), false);
  assert.equal(await visible(o, normal.conversacionId), true);
});

test("EA-07: una bandeja sin cuenta de Chatwoot no envenena el barrido: se cuenta el error y siguen las demás", async () => {
  const a = await sembrarOrganizacion(prisma, "Ciclo");
  const b = await sembrarOrganizacion(prisma, "Ciclo");
  // Una segunda bandeja de la organización A que perdió su cuenta (no aprovisionada).
  const dbA = conAlcance(prisma, a.organizacionId);
  const canal = await dbA.canal_whatsapp.create({ data: altaConAlcance({ vertical_id: a.verticalId, nombre_publico: "Sin cuenta" }) });
  const inboxHuerfana = randomInt(1_000_000, 2_000_000_000);
  await dbA.bandeja_chatwoot.create({
    data: altaConAlcance({ canal_whatsapp_id: canal.id, nombre: "Sin cuenta", chatwoot_account_id: a.chatwootAccountId, chatwoot_inbox_id: inboxHuerfana }),
  });
  const envenenada = await contactoAMedias(a, { cuenta: a.chatwootAccountId, inbox: inboxHuerfana });
  await dbA.bandeja_chatwoot.updateMany({ where: { chatwoot_inbox_id: inboxHuerfana }, data: { chatwoot_account_id: null } });
  const normalA = await contactoAMedias(a);
  const normalB = await contactoAMedias(b);
  const mensajeB = await mensajeAMedias(b, normalB.conversacionId);

  const ahora = despues(40 * MIN);
  // Chatwoot no deja abrir en el primer ciclo: las visibles quedan por abrir (paso 2 del barrido).
  const transporte = new TransporteFalso();
  transporte.fallarSi = (e) => e.tipo === "abrir";
  const mensajeria = new MessagingProvider({ transporte, reloj: () => ahora });
  const raiz = soloOrganizaciones(prisma, [a.organizacionId, b.organizacionId]);
  const r = await correrCiclo({ prisma: raiz, mensajeria, reloj: () => ahora });
  assert.ok(r.errores >= 1, "el error se cuenta");
  assert.equal(await visible(a, normalA.conversacionId), true, "la otra conversación de la misma organización siguió");
  assert.equal(await visible(b, normalB.conversacionId), true, "la otra organización siguió");
  const m = await conAlcance(prisma, b.organizacionId).mensaje.findUniqueOrThrow({ where: { id: mensajeB } });
  assert.equal(m.estatus, "fallido", "y el motor corrió");

  // Al minuto siguiente Chatwoot responde: la envenenada vuelve a fallar (cada minuto), pero la
  // otra conversación de su organización se abre igual y la otra organización también.
  transporte.fallarSi = undefined;
  const otro = await correrCiclo({ prisma: raiz, mensajeria: new MessagingProvider({ transporte, reloj: () => despues(50 * MIN) }), reloj: () => despues(50 * MIN) });
  assert.ok(otro.errores >= 1, "el fallo persiste");
  const abierta = async (o: OrganizacionDePrueba, id: string) =>
    (await conAlcance(prisma, o.organizacionId).conversacion.findUniqueOrThrow({ where: { id } })).abierta_para_asesores_en !== null;
  assert.equal(await abierta(a, normalA.conversacionId), true, "la reapertura de la sana no se detuvo por la envenenada");
  assert.equal(await abierta(b, normalB.conversacionId), true);
  assert.equal(await abierta(a, envenenada.conversacionId), false);
  assert.equal(TIEMPO_ESPERA_MS, 30 * MIN);
});

test("EA-07: si el barrido de espera lanza por completo, el motor corre igual (el ciclo los aísla)", async () => {
  const o = await sembrarOrganizacion(prisma, "Ciclo");
  const contacto = await contactoAMedias(o);
  const mensaje = await mensajeAMedias(o, contacto.conversacionId);
  // La consulta de organizaciones falla una vez, solo para la espera (el motor la repite después).
  let fallos = 0;
  const raiz = conGanchos(soloOrganizaciones(prisma, [o.organizacionId]), {
    modelo: "organizacion",
    operacion: "findMany",
    antes: async () => {
      if (fallos++ === 0) throw new Error("la base se cayó un instante");
    },
  });
  const ahora = despues(40 * MIN);
  const r = await correrCiclo({ prisma: raiz, mensajeria: new MessagingProvider({ transporte: new TransporteFalso(), reloj: () => ahora }), reloj: () => ahora });
  assert.equal(r.espera, null);
  assert.ok(r.motor, "el motor corrió");
  assert.equal(r.errores, 1);
  const m = await conAlcance(prisma, o.organizacionId).mensaje.findUniqueOrThrow({ where: { id: mensaje } });
  assert.equal(m.estatus, "fallido", "la recuperación de F1-01 no se detuvo");
});

test("EA-07: una organización cuya consulta falla no detiene a otra (aislamiento por organización)", async () => {
  const a = await sembrarOrganizacion(prisma, "Ciclo");
  const b = await sembrarOrganizacion(prisma, "Ciclo");
  const deA = await contactoAMedias(a);
  const deB = await contactoAMedias(b);
  // Las organizaciones se recorren por antigüedad: la primera consulta de conversaciones es la de A.
  let consultas = 0;
  const raiz = conGanchos(soloOrganizaciones(prisma, [a.organizacionId, b.organizacionId]), {
    modelo: "conversacion",
    operacion: "findMany",
    cuando: (args) => (args["where"] as { visible_a_asesores_en?: unknown } | undefined)?.visible_a_asesores_en === null,
    antes: async () => {
      if (consultas++ === 0) throw new Error("falló la consulta de la organización A");
    },
  });
  const ahora = despues(40 * MIN);
  const r = await barrerEspera({ prisma: raiz, mensajeria: new MessagingProvider({ transporte: new TransporteFalso(), reloj: () => ahora }), reloj: () => ahora });
  assert.equal(r.errores, 1);
  assert.equal(r.avisadas, 1);
  assert.equal(await visible(a, deA.conversacionId), false);
  assert.equal(await visible(b, deB.conversacionId), true);
});

test("EA-07: si el motor lanza por completo, el ciclo no lanza: la espera ya hizo lo suyo y el error se cuenta", async () => {
  const o = await sembrarOrganizacion(prisma, "Ciclo");
  const contacto = await contactoAMedias(o);
  // La espera consulta las organizaciones primero; el motor es la segunda consulta.
  let consultas = 0;
  const raiz = conGanchos(soloOrganizaciones(prisma, [o.organizacionId]), {
    modelo: "organizacion",
    operacion: "findMany",
    antes: async () => {
      if (++consultas === 2) throw new Error("la base se cayó al empezar el motor");
    },
  });
  const ahora = despues(40 * MIN);
  const r = await correrCiclo({ prisma: raiz, mensajeria: new MessagingProvider({ transporte: new TransporteFalso(), reloj: () => ahora }), reloj: () => ahora });
  assert.equal(r.motor, null);
  assert.deepEqual(r.espera, { avisadas: 1, errores: 0 });
  assert.equal(r.errores, 1);
  assert.equal(await visible(o, contacto.conversacionId), true);
});

test("EA-01: la conversación de un lead borrado que quedó por abrir no se abre en Chatwoot", async () => {
  const o = await sembrarOrganizacion(prisma, "Ciclo");
  const contacto = await contactoAMedias(o);
  const raiz = soloOrganizaciones(prisma, [o.organizacionId]);
  const transporte = new TransporteFalso();
  transporte.fallarSi = (e) => e.tipo === "abrir";
  const t1 = despues(40 * MIN);
  await correrCiclo({ prisma: raiz, mensajeria: new MessagingProvider({ transporte, reloj: () => t1 }), reloj: () => t1 });
  assert.equal(await visible(o, contacto.conversacionId), true);

  await borrarLead(o, contacto.leadId);
  transporte.fallarSi = undefined;
  const t2 = despues(50 * MIN);
  const r = await correrCiclo({ prisma: raiz, mensajeria: new MessagingProvider({ transporte, reloj: () => t2 }), reloj: () => t2 });
  assert.equal(r.errores, 0);
  assert.equal(transporte.envios.filter((e) => e.tipo === "abrir").length, 0);
});

test("EA-03: el ciclo reenvía los eventos de Twilio pendientes aunque la espera o el motor fallen, y si el barrido de Twilio falla el resto corre", async () => {
  const o = await sembrarOrganizacion(prisma, "Ciclo");
  const contacto = await contactoAMedias(o);
  const raiz = soloOrganizaciones(prisma, [o.organizacionId]);
  const ahora = despues(40 * MIN);
  const reenviador = new ReenviadorTwilioFalso();
  const borde = crearBordeTwilio({ prisma: raiz, reenviador, reloj: () => ahora });
  const db = conAlcance(prisma, o.organizacionId);
  await db.evento_twilio.create({
    data: altaConAlcance({
      tipo: "entrante" as const,
      id_mensaje: `SM${siguiente++}`,
      estado_mensaje: "",
      estado_proceso: "fallido" as const,
      reclamado_en: new Date(ahora.getTime() - 10 * MIN),
      cuerpo: new Uint8Array(Buffer.from("MessageSid=SMx&Body=hola")),
      cabeceras: {},
    }),
  });
  const mensajeria = new MessagingProvider({ transporte: new TransporteFalso(), reloj: () => ahora });
  const r = await correrCiclo({ prisma: raiz, mensajeria, twilio: borde, reloj: () => ahora });
  assert.equal(r.twilio?.reenviados, 1);
  assert.equal(reenviador.enviados.length, 1);
  assert.equal(await visible(o, contacto.conversacionId), true, "y la espera también corrió");

  // Si el barrido de Twilio lanza, la espera y el motor ya corrieron y el ciclo no lanza.
  const roto = { ...borde, reenviarPendientes: async () => { throw new Error("Twilio revienta"); } };
  const otro = await correrCiclo({ prisma: raiz, mensajeria, twilio: roto, reloj: () => ahora });
  assert.equal(otro.twilio, null);
  assert.equal(otro.errores, 1);
  assert.ok(otro.espera && otro.motor);
});
