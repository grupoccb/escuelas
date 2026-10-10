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
import { sembrarDocumentosLegales, sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { registrarEnvioDeLanding, type Landing } from "./landing.ts";
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

// V13-fix EV-42: antes, «falla sin el arreglo» era solo porque el archivo no compilaba sin `etapaInicialDeLeads`. Estas dos comprobaciones fallan por ASERCIÓN si la regla vuelve a mirar solo las
// banderas (probado revirtiendo `etapaInicialDeLeads` a esa regla: el bot y la landing dejan al lead en «inscrito»).
test("EV-42 EF-22: la landing también deja al lead nuevo en la etapa de entrada, no en una etapa de cierre marcada solo por su papel", async () => {
  const docs = await sembrarDocumentosLegales(prisma, org);
  const landing: Landing = { organizacionId: org.organizacionId, verticalId: org.verticalId, nombre: "Escuela", colorMarca: null, logoUrl: null, sucursales: [], aviso: null };
  const telefono = `+5255${randomInt(10_000_000, 99_999_999)}`;
  const r = await registrarEnvioDeLanding(prisma, landing, { nombreAlumno: "Luz", edad: 7, sucursalId: null, telefono, nombreContacto: "Ana", documentoId: docs.avisoPrivacidad, version: 1 }, { codigo: null, sucursalId: null, utm: {} }, { ip: null, agenteUsuario: null }, new Date());
  assert.ok(r.ok, JSON.stringify(r));
  const lead = await conAlcance(prisma, org.organizacionId).lead.findFirstOrThrow({ where: { id: r.leadId }, include: { etapa: true } });
  assert.equal(lead.etapa_id, etapaBuena, "la landing no deja al lead en «inscrito»");
  assert.equal(lead.etapa.tipo_sistema, "nuevo");
});

test("EV-42 EF-22: una etapa de cierre marcada con la bandera (es_ganado / es_perdido) tampoco es la inicial", async () => {
  const db = conAlcance(prisma, org.organizacionId);
  for (const bandera of ["es_ganado", "es_perdido"] as const) {
    const cierre = await prisma.etapa_pipeline.create({ data: { organizacion_id: org.organizacionId, nombre: `Cierre por ${bandera}`, orden: 0, [bandera]: true } });
    try {
      assert.equal((await etapaInicialDeLeads(db))?.id, etapaBuena, `${bandera} con orden 0 se salta`);
    } finally {
      await prisma.etapa_pipeline.update({ where: { id: cierre.id }, data: { eliminado_en: new Date() } });
    }
  }
});
