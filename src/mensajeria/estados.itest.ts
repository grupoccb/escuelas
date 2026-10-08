// Estados de entrega guardados por mensaje, contra Postgres real. Los mensajes salen por
// MessagingProvider con el transporte falso; los cambios llegan como los entregaría Chatwoot.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { crearPrisma, type PrismaClient } from "../datos/prisma.ts";
import { conAlcance } from "../datos/alcance.ts";
import { procesarEntrante } from "../captacion/entrante.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { MessagingProvider, TransporteFalso, registrarEstadoEntrega, type CambioDeEstado, type EventoEntrante } from "./index.ts";

let prisma: PrismaClient;
let org: OrganizacionDePrueba;
let otra: OrganizacionDePrueba;
let siguiente = randomInt(1_000_000, 2_000_000_000);

before(async () => {
  prisma = crearPrisma();
  org = await sembrarOrganizacion(prisma, "Estados");
  otra = await sembrarOrganizacion(prisma, "EstadosOtra");
});

after(async () => {
  await prisma.$disconnect();
});

/** Manda un mensaje real por MessagingProvider y devuelve el mensaje saliente guardado. */
async function mensajeEnviado() {
  const transporte = new TransporteFalso();
  const deps = { prisma, mensajeria: new MessagingProvider({ transporte }) };
  const idMensaje = String(siguiente++);
  const evento: EventoEntrante = {
    chatwootAccountId: org.chatwootAccountId,
    chatwootInboxId: org.chatwootInboxId,
    chatwootConversacionId: randomInt(1, 2_000_000_000),
    idMensaje,
    contenido: "Hola",
    estadoConversacion: "pending",
    contacto: { nombre: "C", telefono: `+52155${randomInt(10_000_000, 99_999_999)}` },
    creadoEn: null,
    llave: { proveedor: "chatwoot", id: idMensaje },
    numeroReceptor: null,
    crudo: null,
  };
  const { conversacionId } = await procesarEntrante(deps, evento);
  const m = await conAlcance(prisma, org.organizacionId).mensaje.findFirstOrThrow({
    where: { conversacion_id: conversacionId, direccion: "saliente", estatus: "enviado" },
  });
  return m;
}

const cambio = (m: { id_externo: string | null }, estado: CambioDeEstado["estado"], extra: Partial<CambioDeEstado> = {}): CambioDeEstado => ({
  proveedor: "chatwoot",
  idExterno: m.id_externo!,
  idProveedor: null,
  estado,
  ocurrioEn: null,
  errorCodigo: null,
  errorTexto: null,
  bandeja: { chatwootAccountId: org.chatwootAccountId, chatwootInboxId: org.chatwootInboxId },
  ...extra,
});

const registrar = (c: CambioDeEstado, reloj?: () => Date) => registrarEstadoEntrega({ prisma, ...(reloj ? { reloj } : {}) }, c);
const releer = (id: string) => conAlcance(prisma, org.organizacionId).mensaje.findUniqueOrThrow({ where: { id } });

test("enviado → entregado → leído: cada estado se guarda en el mensaje, con su hora", async () => {
  const m = await mensajeEnviado();
  const t1 = new Date("2026-10-08T16:00:00Z");
  const t2 = new Date("2026-10-08T16:05:00Z");

  assert.equal(await registrar(cambio(m, "enviado")), "sin_cambio");
  assert.equal(await registrar(cambio(m, "entregado", { ocurrioEn: t1, idProveedor: "SMabc" })), "actualizado");
  let r = await releer(m.id);
  assert.equal(r.estatus, "entregado");
  assert.equal(r.entregado_en?.toISOString(), t1.toISOString());
  assert.equal(r.id_proveedor, "SMabc");

  assert.equal(await registrar(cambio(m, "leido", { ocurrioEn: t2 })), "actualizado");
  r = await releer(m.id);
  assert.equal(r.estatus, "leido");
  assert.equal(r.leido_en?.toISOString(), t2.toISOString());
  assert.equal(r.entregado_en?.toISOString(), t1.toISOString(), "la hora de entrega no se pisa");
});

test("idempotente y sin retrocesos: repetir o recibir fuera de orden no cambia nada", async () => {
  const m = await mensajeEnviado();
  await registrar(cambio(m, "leido"));
  assert.equal(await registrar(cambio(m, "leido")), "sin_cambio");
  assert.equal(await registrar(cambio(m, "entregado")), "sin_cambio");
  assert.equal(await registrar(cambio(m, "enviado")), "sin_cambio");
  assert.equal(await registrar(cambio(m, "fallido", { errorCodigo: 1, errorTexto: "x" })), "sin_cambio");
  const r = await releer(m.id);
  assert.equal(r.estatus, "leido");
  assert.equal(r.error, null);
});

test("un 'leído' sin el 'entregado' intermedio también marca la entrega", async () => {
  const m = await mensajeEnviado();
  const t = new Date("2026-10-08T17:00:00Z");
  await registrar(cambio(m, "leido", { ocurrioEn: t }));
  const r = await releer(m.id);
  assert.equal(r.entregado_en?.toISOString(), t.toISOString());
  assert.equal(r.leido_en?.toISOString(), t.toISOString());
});

test("fallido guarda el código y el texto de Twilio; una entrega posterior lo reemplaza y limpia el error", async () => {
  const m = await mensajeEnviado();
  await registrar(cambio(m, "fallido", { errorCodigo: 63016, errorTexto: "63016 - Fuera de la ventana de 24 h" }));
  let r = await releer(m.id);
  assert.equal(r.estatus, "fallido");
  assert.equal(r.error_codigo, 63016);
  assert.equal(r.error, "63016 - Fuera de la ventana de 24 h");

  await registrar(cambio(m, "entregado"));
  r = await releer(m.id);
  assert.equal(r.estatus, "entregado");
  assert.equal(r.error, null);
  assert.equal(r.error_codigo, null);
});

test("sin hora en el evento se usa la de recepción", async () => {
  const m = await mensajeEnviado();
  const ahora = new Date("2026-10-08T18:30:00Z");
  await registrar(cambio(m, "entregado"), () => ahora);
  assert.equal((await releer(m.id)).entregado_en?.toISOString(), ahora.toISOString());
});

test("otra fuente puede encontrar el mensaje por el id del proveedor (MessageSid)", async () => {
  const m = await mensajeEnviado();
  const sid = `SM${randomUUID().replaceAll("-", "")}`;
  await registrar(cambio(m, "enviado", { idProveedor: sid }));
  assert.equal((await releer(m.id)).id_proveedor, sid);
  const deOtraFuente = cambio({ id_externo: "no-existe" }, "entregado", { idProveedor: sid });
  assert.equal(await registrar(deOtraFuente), "actualizado");
  assert.equal((await releer(m.id)).estatus, "entregado");
});

test("mensaje o bandeja desconocidos no lanzan", async () => {
  assert.equal(await registrar(cambio({ id_externo: "999999999" }, "entregado")), "mensaje_desconocido");
  assert.equal(await registrar(cambio({ id_externo: "1" }, "entregado", { bandeja: { chatwootAccountId: 1, chatwootInboxId: 1 } })), "bandeja_desconocida");
  assert.equal(await registrar(cambio({ id_externo: "1" }, "entregado", { bandeja: null })), "bandeja_desconocida");
});

test("aislamiento: un evento de la bandeja de otra organización no toca mensajes de esta", async () => {
  const m = await mensajeEnviado();
  const deOtra = cambio(m, "leido", { bandeja: { chatwootAccountId: otra.chatwootAccountId, chatwootInboxId: otra.chatwootInboxId } });
  assert.equal(await registrar(deOtra), "mensaje_desconocido");
  assert.equal((await releer(m.id)).estatus, "enviado");
});
