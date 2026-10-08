// Palabras de baja con consentimiento por organización, y tiempo de espera del bot.
// Contra Postgres real y el transporte falso (invariante 11).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { crearPrisma, type PrismaClient } from "../datos/prisma.ts";
import { conAlcance } from "../datos/alcance.ts";
import { MessagingProvider, TransporteFalso, type EventoEntrante } from "../mensajeria/index.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { procesarEntrante } from "./entrante.ts";
import { barrerTiemposDeEspera, TIEMPO_ESPERA_MS } from "./espera.ts";
import { normalizarTelefono } from "../lib/telefono.ts";
import { textos } from "./maquina.ts";

let prisma: PrismaClient;
let org: OrganizacionDePrueba;
let siguiente = randomInt(1_000_000, 2_000_000_000);

before(async () => {
  prisma = crearPrisma();
  org = await sembrarOrganizacion(prisma, "BajaEspera");
});

after(async () => {
  await prisma.$disconnect();
});

function entorno(
  telefono = `+52155${randomInt(10_000_000, 99_999_999)}`,
  bandeja = { cuenta: org.chatwootAccountId, inbox: org.chatwootInboxId },
) {
  const transporte = new TransporteFalso();
  const mensajeria = new MessagingProvider({ transporte });
  const conversacion = randomInt(1, 2_000_000_000);
  const deps = { prisma, mensajeria };
  const evento = (contenido: string, extra: Partial<EventoEntrante> = {}): EventoEntrante => {
    const idMensaje = extra.idMensaje ?? String(siguiente++);
    return {
      chatwootAccountId: bandeja.cuenta,
      chatwootInboxId: bandeja.inbox,
      chatwootConversacionId: conversacion,
      idMensaje,
      contenido,
      estadoConversacion: "pending",
      contacto: { nombre: "Contacto", telefono },
      creadoEn: null,
      llave: { proveedor: "chatwoot", id: idMensaje },
      numeroReceptor: null,
      crudo: null,
      ...extra,
    };
  };
  // El teléfono que queda guardado es el normalizado (invariante 7).
  return { transporte, mensajeria, deps, conversacion, evento, telefono: normalizarTelefono(telefono)! };
}

const db = (o: OrganizacionDePrueba = org) => conAlcance(prisma, o.organizacionId);
const mensajesAlContacto = (t: TransporteFalso) => t.envios.filter((e) => e.tipo === "mensaje");

async function conversacionDe(chatwootConversacionId: number, o: OrganizacionDePrueba = org) {
  return db(o).conversacion.findFirstOrThrow({
    where: { bandeja_chatwoot_id: o.bandejaId, chatwoot_conversacion_id: chatwootConversacionId },
    include: { lead: true, mensajes: { orderBy: { secuencia: "asc" } } },
  });
}

test("BAJA a mitad de la captura: se registra en el consentimiento y sale UNA sola confirmación", async () => {
  const { transporte, deps, conversacion, evento, telefono } = entorno();
  await procesarEntrante(deps, evento("Hola"));
  await procesarEntrante(deps, evento("Ana"));
  const antes = mensajesAlContacto(transporte).length;

  const r = await procesarEntrante(deps, evento("STOP"));
  assert.equal(r.resultado, "baja");

  const enviados = mensajesAlContacto(transporte);
  assert.equal(enviados.length, antes + 1);
  assert.equal(enviados.at(-1)!.texto, textos.confirmacionBaja);
  assert.ok(!transporte.envios.some((e) => e.tipo === "abrir"), "una baja no pasa la conversación a un asesor");

  const conv = await conversacionDe(conversacion);
  assert.equal(conv.estado, "opt_out");
  const consentimientos = await db().consentimiento.findMany({ where: { telefono } });
  assert.equal(consentimientos.length, 1);
  assert.equal(consentimientos[0]!.estado, "opt_out");
  assert.equal(consentimientos[0]!.alcance, "todo");
  assert.equal(consentimientos[0]!.origen, "palabra_clave");
  assert.equal(await db().interaccion.count({ where: { lead_id: conv.lead_id, tipo: "baja" } }), 1);
  const confirmacion = conv.mensajes.find((m) => m.cuerpo === textos.confirmacionBaja)!;
  assert.equal(confirmacion.origen, "confirmacion_baja");
  assert.equal(confirmacion.estatus, "enviado");
});

test("las cuatro palabras dan de baja", async () => {
  for (const palabra of ["BAJA", "Stop.", "cancelar", "NO MOLESTAR"]) {
    const { deps, evento, telefono } = entorno();
    assert.equal((await procesarEntrante(deps, evento(palabra))).resultado, "baja", palabra);
    assert.equal(await db().consentimiento.count({ where: { telefono, estado: "opt_out" } }), 1, palabra);
  }
});

test("confirmación única: un webhook repetido o una segunda baja no vuelven a contestar", async () => {
  const { transporte, deps, evento, telefono } = entorno();
  const primera = evento("BAJA");
  await procesarEntrante(deps, primera);
  const tras = mensajesAlContacto(transporte).length;
  assert.equal(tras, 1);

  assert.equal((await procesarEntrante(deps, primera)).resultado, "duplicado");
  assert.equal((await procesarEntrante(deps, evento("STOP"))).resultado, "baja");
  assert.equal((await procesarEntrante(deps, evento("stop"))).resultado, "baja");

  assert.equal(mensajesAlContacto(transporte).length, tras);
  assert.equal(await db().consentimiento.count({ where: { telefono } }), 1);
});

test("después de la baja el bot no contesta nada más, aunque el contacto siga escribiendo", async () => {
  const { transporte, deps, conversacion, evento } = entorno();
  await procesarEntrante(deps, evento("BAJA"));
  const tras = transporte.envios.length;
  await procesarEntrante(deps, evento("Hola, ¿siguen ahí?"));
  assert.equal(transporte.envios.length, tras);
  assert.equal((await conversacionDe(conversacion)).estado, "opt_out");
});

test("la baja es de toda la organización: en otra vertical, el mismo teléfono ya no recibe mensajes", async () => {
  const uno = entorno();
  const telefono = uno.telefono;
  await procesarEntrante(uno.deps, uno.evento("BAJA"));

  // Segunda vertical de la misma organización, con su canal y su bandeja.
  const vertical = await prisma.vertical.create({ data: { organizacion_id: org.organizacionId, nombre: "Otra", slug: `otra-${randomUUID().slice(0, 6)}` } });
  const canal = await prisma.canal_whatsapp.create({ data: { organizacion_id: org.organizacionId, vertical_id: vertical.id, nombre_publico: "Otra" } });
  const bandeja2 = { cuenta: org.chatwootAccountId, inbox: randomInt(1_000_000, 2_000_000_000) };
  await prisma.bandeja_chatwoot.create({
    data: { organizacion_id: org.organizacionId, canal_whatsapp_id: canal.id, nombre: "Otra", chatwoot_account_id: bandeja2.cuenta, chatwoot_inbox_id: bandeja2.inbox },
  });

  const dos = entorno(telefono, bandeja2); // mismo número, otra vertical
  await procesarEntrante(dos.deps, dos.evento("Hola"));
  assert.equal(dos.transporte.envios.length, 0, "no sale nada hacia un teléfono dado de baja");
  const bloqueados = await db().mensaje.findMany({ where: { conversacion: { lead: { telefono, vertical_interes_id: vertical.id } }, estatus: "bloqueado" } });
  assert.ok(bloqueados.length >= 1);
  assert.ok(bloqueados.every((m) => m.motivo_bloqueo === "opt_out"));
});

test("con un asesor atendiendo, la baja se registra pero el sistema no contesta (invariante 6) y se crea una tarea", async () => {
  const { transporte, deps, conversacion, evento, telefono } = entorno();
  await procesarEntrante(deps, evento("Hola"));
  await procesarEntrante(deps, evento("Ana"));
  await procesarEntrante(deps, evento("6"));
  await procesarEntrante(deps, evento("1"));
  assert.equal((await conversacionDe(conversacion)).estado, "en_atencion_humana");
  const tras = transporte.envios.length;

  await procesarEntrante(deps, evento("BAJA"));
  await procesarEntrante(deps, evento("STOP"));

  assert.equal(transporte.envios.length, tras);
  const conv = await conversacionDe(conversacion);
  assert.equal(conv.estado, "en_atencion_humana");
  assert.equal(await db().consentimiento.count({ where: { telefono, estado: "opt_out" } }), 1);
  assert.equal(await db().tarea_asesor.count({ where: { conversacion_id: conv.id, tipo: "revision_manual", estado: "pendiente" } }), 1);
});

test("tiempo de espera (30 min): la conversación se vuelve visible con una nota, pero NO pasa a atención humana", async () => {
  // Organización propia: el barrido con reloj futuro recoge toda conversación a medias de la organización.
  const o = await sembrarOrganizacion(prisma, "Espera");
  const { transporte, mensajeria, deps, conversacion, evento } = entorno(undefined, { cuenta: o.chatwootAccountId, inbox: o.chatwootInboxId });
  const inicio = new Date("2026-10-08T15:00:00Z");
  await procesarEntrante({ ...deps, reloj: () => inicio }, evento("Hola"));
  await procesarEntrante({ ...deps, reloj: () => inicio }, evento("Ana"));
  const alContacto = mensajesAlContacto(transporte).length;
  assert.equal(TIEMPO_ESPERA_MS, 30 * 60 * 1000);

  const justoAntes = new Date(inicio.getTime() + TIEMPO_ESPERA_MS - 1000);
  await barrerTiemposDeEspera({ prisma, mensajeria, organizacionId: o.organizacionId, reloj: () => justoAntes });
  const antes = await conversacionDe(conversacion, o);
  assert.equal(antes.visible_a_asesores_en, null, "todavía dentro del tiempo de espera");
  assert.ok(!transporte.envios.some((e) => e.tipo === "abrir"));

  const despues = new Date(inicio.getTime() + TIEMPO_ESPERA_MS + 1000);
  const hechas = await barrerTiemposDeEspera({ prisma, mensajeria, organizacionId: o.organizacionId, reloj: () => despues });
  assert.equal(hechas, 1);

  const conv = await conversacionDe(conversacion, o);
  assert.equal(conv.estado, "bot", "visible no es atendido");
  assert.equal(conv.paso_captacion, "edad");
  assert.equal(conv.pasar_a_asesor_pendiente, false);
  assert.equal(conv.visible_a_asesores_en?.toISOString(), despues.toISOString());
  assert.equal(mensajesAlContacto(transporte).length, alContacto, "no se le escribe al contacto");
  const nota = transporte.envios.find((e) => e.tipo === "nota_interna" && /dejó de contestar/.test(e.texto ?? ""));
  assert.ok(nota, "hay nota con datos parciales");
  assert.match(nota.texto!, /Nombre: Ana/);
  assert.match(nota.texto!, /Nadie la ha tomado/);
  assert.ok(transporte.envios.some((e) => e.tipo === "abrir"), "se abre en Chatwoot para que los asesores la vean");
  assert.ok(conv.abierta_para_asesores_en);
  assert.equal(await db(o).interaccion.count({ where: { lead_id: conv.lead_id, tipo: "pase_a_asesor" } }), 0, "no es un pase a asesor");

  // Idempotente: otro barrido no vuelve a avisar ni a escribir.
  const envios = transporte.envios.length;
  assert.equal(await barrerTiemposDeEspera({ prisma, mensajeria, organizacionId: o.organizacionId, reloj: () => despues }), 0);
  assert.equal(transporte.envios.length, envios);
});

test("tiempo de espera: no toca conversaciones recién creadas ni las que ya atiende una persona", async () => {
  const o = await sembrarOrganizacion(prisma, "EsperaDos");
  const bandeja = { cuenta: o.chatwootAccountId, inbox: o.chatwootInboxId };
  const nueva = entorno(undefined, bandeja);
  await procesarEntrante(nueva.deps, nueva.evento("Hola"));
  const humana = entorno(undefined, bandeja);
  for (const t of ["Hola", "Ana", "6", "1"]) await procesarEntrante(humana.deps, humana.evento(t));
  const deLaHumana = () => humana.transporte.envios.filter((e) => e.destino.chatwootConversacionId === humana.conversacion).length;
  const enviosHumana = deLaHumana();

  const muchoDespues = new Date(Date.now() + 10 * TIEMPO_ESPERA_MS);
  await barrerTiemposDeEspera({ prisma, mensajeria: nueva.mensajeria, organizacionId: o.organizacionId, reloj: () => new Date(Date.now() - 1000) });
  assert.equal((await conversacionDe(nueva.conversacion, o)).estado, "bot");
  await barrerTiemposDeEspera({ prisma, mensajeria: humana.mensajeria, organizacionId: o.organizacionId, reloj: () => muchoDespues });
  assert.equal(deLaHumana(), enviosHumana, "a la conversación que atiende una persona no se le manda nada");
});
