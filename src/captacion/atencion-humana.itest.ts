// A3 + F1-02: `en_atencion_humana` se activa cuando una PERSONA toma la conversación en Chatwoot
// (se la asigna o manda el primer mensaje), aunque el contacto no escriba. Contra Postgres real y
// el transporte falso. Los eventos son los reales de Chatwoot 4.18 (payload-*.json).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { crearPrisma, type PrismaClient } from "../datos/prisma.ts";
import { conAlcance } from "../datos/alcance.ts";
import { correrAutomatizaciones } from "../automatizaciones/motor.ts";
import {
  interpretarTomaDeConversacion,
  MessagingProvider,
  TransporteFalso,
  type EventoEntrante,
  type EventoTomaDeConversacion,
} from "../mensajeria/index.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { procesarEntrante } from "./entrante.ts";
import { barrerTiemposDeEspera } from "./espera.ts";
import { registrarTomaDeConversacion } from "./toma.ts";

let prisma: PrismaClient;
let siguiente = randomInt(1_000_000, 2_000_000_000);

before(() => {
  prisma = crearPrisma();
});
after(async () => {
  await prisma.$disconnect();
});

const HORA = 60 * 60 * 1000;
/** 8-oct-2026 10:00 hora de Ciudad de México. */
const T0 = new Date("2026-10-08T16:00:00Z");
const en = (base: Date, horas: number): Date => new Date(base.getTime() + horas * HORA);

const fixture = (nombre: string): unknown => JSON.parse(readFileSync(new URL(`../mensajeria/chatwoot/payload-${nombre}.json`, import.meta.url), "utf8"));

/** Un evento de toma, apuntando a la conversación dada. Parte del payload real de Chatwoot. */
function toma(o: OrganizacionDePrueba, conversacion: number, via: "asignacion" | "mensaje"): EventoTomaDeConversacion {
  const real = interpretarTomaDeConversacion(fixture(via === "asignacion" ? "conversacion-asignada" : "mensaje-asesor"));
  assert.ok(real, "el payload real es una toma");
  return { ...real, chatwootAccountId: o.chatwootAccountId, chatwootInboxId: o.chatwootInboxId, chatwootConversacionId: conversacion };
}

async function escenario() {
  const o = await sembrarOrganizacion(prisma, "Atencion");
  const db = conAlcance(prisma, o.organizacionId);
  const transporte = new TransporteFalso();
  const mensajeria = new MessagingProvider({ transporte, reloj: () => T0 });
  const conversacion = randomInt(1, 2_000_000_000);
  const telefono = `+5255${randomInt(10_000_000, 99_999_999)}`;
  const evento = (contenido: string, extra: Partial<EventoEntrante> = {}): EventoEntrante => {
    const id = String(siguiente++);
    return {
      chatwootAccountId: o.chatwootAccountId,
      chatwootInboxId: o.chatwootInboxId,
      chatwootConversacionId: conversacion,
      idMensaje: id,
      contenido,
      estadoConversacion: "pending",
      contacto: { nombre: "Mamá", telefono },
      creadoEn: null,
      llave: { proveedor: "chatwoot", id },
      numeroReceptor: null,
      crudo: null,
      ...extra,
    };
  };
  // El contacto escribe en T0 y se queda a mitad de la captura.
  const deps = { prisma, mensajeria, reloj: () => T0 };
  for (const m of ["Hola", "Ana"]) await procesarEntrante(deps, evento(m));
  const conv = () => db.conversacion.findFirstOrThrow({ where: { bandeja_chatwoot_id: o.bandejaId, chatwoot_conversacion_id: conversacion } });

  const plantilla = await prisma.plantilla_mensaje.create({
    data: {
      organizacion_id: o.organizacionId,
      codigo: "reenganche",
      content_sid: "HX00000000000000000000000000000000",
      categoria: "utility",
      estado_aprobacion: "aprobada",
      cuerpo_referencia: "Hola, quedó pendiente tu consulta sobre {{1}}.",
      variables: [{ pos: 1, nombre: "nombre_vertical" }] as never,
    },
  });
  const automatizacion = await prisma.automatizacion.create({
    data: { organizacion_id: o.organizacionId, nombre: "Reenganche", evento_disparador: "lead_sin_respuesta", offset_minutos: 1500, plantilla_id: plantilla.id },
  });
  const transporteMotor = new TransporteFalso();
  const motor = (ahora: Date) =>
    correrAutomatizaciones({ prisma, mensajeria: new MessagingProvider({ transporte: transporteMotor, reloj: () => ahora }), reloj: () => ahora, organizacionId: o.organizacionId });
  return { o, db, transporte, mensajeria, conversacion, evento, deps, conv, automatizacion, transporteMotor, motor };
}

test("asignársela a un asesor activa la atención humana, cancela el pase pendiente y deja constancia", async () => {
  const s = await escenario();
  await s.db.conversacion.updateMany({ where: { id: (await s.conv()).id }, data: { pasar_a_asesor_pendiente: true, motivo_pase_asesor: "falla_envio" } });

  assert.equal(await registrarTomaDeConversacion({ prisma }, toma(s.o, s.conversacion, "asignacion")), "tomada");
  const conv = await s.conv();
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(conv.pasar_a_asesor_pendiente, false);
  const pases = await s.db.interaccion.findMany({ where: { conversacion_id: conv.id, tipo: "pase_a_asesor" } });
  assert.equal(pases.length, 1);
  assert.deepEqual(pases[0]!.datos, { motivo: "persona_tomo_conversacion", via: "asignacion", agente_chatwoot_id: 2 });
});

test("el primer mensaje de un asesor también la toma; la asignación que llega después no cambia nada (idempotente)", async () => {
  const s = await escenario();
  assert.equal(await registrarTomaDeConversacion({ prisma }, toma(s.o, s.conversacion, "mensaje")), "tomada");
  assert.equal(await registrarTomaDeConversacion({ prisma }, toma(s.o, s.conversacion, "asignacion")), "sin_cambio");
  assert.equal(await registrarTomaDeConversacion({ prisma }, toma(s.o, s.conversacion, "mensaje")), "sin_cambio");
  const conv = await s.conv();
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(await s.db.interaccion.count({ where: { conversacion_id: conv.id, tipo: "pase_a_asesor" } }), 1);
});

test("una toma de una conversación o bandeja desconocida no hace nada; una baja se queda en baja", async () => {
  const s = await escenario();
  assert.equal(await registrarTomaDeConversacion({ prisma }, toma(s.o, s.conversacion + 1, "asignacion")), "conversacion_desconocida");
  assert.equal(await registrarTomaDeConversacion({ prisma }, { ...toma(s.o, s.conversacion, "asignacion"), chatwootInboxId: 1 }), "bandeja_desconocida");
  assert.equal((await s.conv()).estado, "bot");

  await procesarEntrante(s.deps, s.evento("BAJA"));
  assert.equal((await s.conv()).estado, "opt_out");
  assert.equal(await registrarTomaDeConversacion({ prisma }, toma(s.o, s.conversacion, "asignacion")), "sin_cambio");
  assert.equal((await s.conv()).estado, "opt_out", "la baja no se pisa");
});

test("F1-02 (invariante 6): el asesor se la asigna y el contacto NO escribe: ninguna automatización sale", async () => {
  // (a) El reenganche ya estaba programado cuando el asesor la tomó.
  const a = await escenario();
  await a.db.automatizacion_ejecucion.create({
    data: { organizacion_id: a.o.organizacionId, automatizacion_id: a.automatizacion.id, entidad_tipo: "conversacion", entidad_id: (await a.conv()).id, ocurrencia: 1, programado_para: en(T0, 25) },
  });
  await registrarTomaDeConversacion({ prisma }, toma(a.o, a.conversacion, "asignacion"));
  const ra = await a.motor(en(T0, 26));
  assert.equal(ra.enviadas, 0);
  assert.equal(a.transporteMotor.envios.length, 0, "no sale nada");
  const [ea] = await a.db.automatizacion_ejecucion.findMany();
  assert.deepEqual([ea!.estatus, ea!.motivo_omision], ["omitido", "atencion_humana"]);

  // (b) Aún no estaba programado: ni siquiera se programa. Con el primer mensaje del asesor como señal.
  const b = await escenario();
  await registrarTomaDeConversacion({ prisma }, toma(b.o, b.conversacion, "mensaje"));
  const rb = await b.motor(en(T0, 26));
  assert.equal(rb.programadas + rb.enviadas, 0);
  assert.equal(b.transporteMotor.envios.length, 0);
  assert.equal(await b.db.automatizacion_ejecucion.count(), 0);

  // (c) El aviso de los 30 min tampoco corre sobre algo que una persona ya tomó.
  const c = await escenario();
  await registrarTomaDeConversacion({ prisma }, toma(c.o, c.conversacion, "asignacion"));
  const enviosAntes = c.transporte.envios.length;
  assert.equal(await barrerTiemposDeEspera({ prisma, mensajeria: c.mensajeria, organizacionId: c.o.organizacionId, reloj: () => en(T0, 1) }), 0);
  assert.equal(c.transporte.envios.length, enviosAntes);
  assert.equal((await c.conv()).visible_a_asesores_en, null);
});

test("sin la señal de Chatwoot (el sistema no se entera), el reenganche SÍ sale: el hueco que reportó F1-02", async () => {
  // Control negativo: demuestra que el test anterior mide algo. Sin toma registrada, la conversación
  // sigue en `bot` y el motor manda la plantilla.
  const s = await escenario();
  const r = await s.motor(en(T0, 26));
  assert.equal(r.enviadas, 1);
});

test("una toma y un mensaje del contacto a la vez: gane quien gane, queda en atención humana y el bot no contesta de más", async () => {
  for (let i = 0; i < 5; i++) {
    const s = await escenario();
    await Promise.all([
      registrarTomaDeConversacion({ prisma }, toma(s.o, s.conversacion, "asignacion")),
      procesarEntrante(s.deps, s.evento("7")),
    ]);
    assert.equal((await s.conv()).estado, "en_atencion_humana", `vuelta ${i}`);
    // A partir de aquí el sistema no manda nada más.
    const envios = s.transporte.envios.length;
    await procesarEntrante(s.deps, s.evento("¿Hola?"));
    assert.equal(s.transporte.envios.length, envios);
  }
});

test("resolver no devuelve el bot: si el contacto vuelve a escribir (Chatwoot la reabre como pendiente con el mismo asesor), el sistema calla", async () => {
  const s = await escenario();
  await registrarTomaDeConversacion({ prisma }, toma(s.o, s.conversacion, "asignacion"));
  const envios = s.transporte.envios.length;
  const r = await procesarEntrante(s.deps, s.evento("Sigo aquí", { estadoConversacion: "pending", asignadaAPersona: true }));
  assert.equal(r.resultado, "sin_automatizacion");
  assert.equal(s.transporte.envios.length, envios);
  assert.equal((await s.conv()).estado, "en_atencion_humana");
  // Y el aviso de los 30 min ni el reenganche se activan por mucho que pase el tiempo.
  await barrerTiemposDeEspera({ prisma, mensajeria: s.mensajeria, organizacionId: s.o.organizacionId, reloj: () => en(T0, 100) });
  assert.equal((await s.motor(en(T0, 100))).enviadas, 0);
});
