// V10 / EF-22: el lead que nace del bot entra en la primera etapa que NO es de cierre, la lea quien la lea. El bot solo miraba las banderas
// (`es_ganado`, `es_perdido`) y la landing además el papel (`tipo_sistema`): una etapa de cierre marcada solo por su papel recibía a los leads
// del bot. Ahora los dos usan `etapaInicialDeLeads`.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { conAlcance } from "../datos/alcance.ts";
import { etapaInicialDeLeads } from "../embudo/etapas.ts";
import { MessagingProvider, TransporteFalso, type EventoEntrante } from "../mensajeria/index.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { procesarEntrante } from "./entrante.ts";

let prisma: PrismaPruebas;
let org: OrganizacionDePrueba;
let etapaBuena = "";

before(async () => {
  prisma = crearPrismaDePruebas();
  org = await sembrarOrganizacion(prisma);
  // La primera por orden es una etapa de cierre marcada SOLO por su papel (sin banderas); la siguiente es la de entrada.
  await prisma.etapa_pipeline.update({ where: { id: org.etapaInicialId }, data: { tipo_sistema: "inscrito", orden: 1 } });
  etapaBuena = (await prisma.etapa_pipeline.create({ data: { organizacion_id: org.organizacionId, nombre: "Entrada", orden: 2, tipo_sistema: "nuevo" } })).id;
});

after(async () => {
  await prisma.$disconnect();
});

test("EF-22: la etapa inicial salta una etapa de cierre marcada solo por su papel (inscrito o perdido)", async () => {
  const e = await etapaInicialDeLeads(conAlcance(prisma, org.organizacionId));
  assert.equal(e?.id, etapaBuena);
  await prisma.etapa_pipeline.update({ where: { id: etapaBuena }, data: { orden: 3 } });
  const perdida = await prisma.etapa_pipeline.create({ data: { organizacion_id: org.organizacionId, nombre: "Se fue", orden: 2, tipo_sistema: "perdido" } });
  assert.equal((await etapaInicialDeLeads(conAlcance(prisma, org.organizacionId)))?.id, etapaBuena, "ni «inscrito» (orden 1) ni «perdido» (orden 2)");
  await prisma.etapa_pipeline.update({ where: { id: perdida.id }, data: { eliminado_en: new Date() } });
  await prisma.etapa_pipeline.update({ where: { id: etapaBuena }, data: { orden: 2 } });
});

test("EF-22: un lead que nace del bot no cae en una etapa de cierre", async () => {
  const transporte = new TransporteFalso();
  const idMensaje = String(randomInt(1_000_000, 2_000_000_000));
  const evento: EventoEntrante = {
    chatwootAccountId: org.chatwootAccountId,
    chatwootInboxId: org.chatwootInboxId,
    chatwootConversacionId: randomInt(1, 2_000_000_000),
    idMensaje,
    contenido: "Hola",
    estadoConversacion: "pending",
    contacto: { nombre: "Contacto", telefono: `+52155${randomInt(10_000_000, 99_999_999)}` },
    creadoEn: null,
    llave: { proveedor: "chatwoot", id: idMensaje },
    numeroReceptor: null,
    crudo: null,
  };
  const r = await procesarEntrante({ prisma, mensajeria: new MessagingProvider({ transporte }) }, evento);
  assert.equal(r.resultado, "procesado");
  const conv = await conAlcance(prisma, org.organizacionId).conversacion.findFirstOrThrow({ where: { chatwoot_conversacion_id: evento.chatwootConversacionId }, include: { lead: true } });
  assert.equal(conv.lead.etapa_id, etapaBuena, "el lead nace en la etapa de entrada, no en «inscrito»");
});
