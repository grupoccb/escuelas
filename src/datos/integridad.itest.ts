// Integridad en la base, no en el código: llaves foráneas compuestas entre organizaciones,
// CHECK, índices únicos parciales y seed de Fase 1. Usa el cliente SIN scope a propósito: lo
// que se prueba es que la base rechaza lo que el código ya no dejaría pasar.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { esViolacionUnica } from "./prisma.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";

let prisma: PrismaPruebas;
let A: OrganizacionDePrueba;
let B: OrganizacionDePrueba;
let leadA: string;
let leadB: string;
let conversacionB: string;
let plantillaB: string;
let automatizacionB: string;
let campanaB: string;
let programaB: string;
let grupoB: string;

/** Violación de llave foránea (P2003) o de CHECK/valor (P2004 / error crudo). */
const esViolacionFk = (e: unknown): boolean => (e as { code?: unknown }).code === "P2003";

before(async () => {
  prisma = crearPrismaDePruebas();
  A = await sembrarOrganizacion(prisma, "IntegridadA");
  B = await sembrarOrganizacion(prisma, "IntegridadB");
  leadA = (await prisma.lead.create({ data: { organizacion_id: A.organizacionId, vertical_interes_id: A.verticalId, etapa_id: A.etapaInicialId, telefono: "+525500001111" } })).id;
  leadB = (await prisma.lead.create({ data: { organizacion_id: B.organizacionId, vertical_interes_id: B.verticalId, etapa_id: B.etapaInicialId, telefono: "+525500002222" } })).id;
  conversacionB = (await prisma.conversacion.create({ data: { organizacion_id: B.organizacionId, bandeja_chatwoot_id: B.bandejaId, lead_id: leadB, chatwoot_conversacion_id: 1 } })).id;
  plantillaB = (await prisma.plantilla_mensaje.create({ data: { organizacion_id: B.organizacionId, codigo: "p", content_sid: "HX1", categoria: "utility", clase_mensaje: "servicio" } })).id;
  automatizacionB = (await prisma.automatizacion.create({ data: { organizacion_id: B.organizacionId, nombre: "a", evento_disparador: "lead_sin_respuesta" } })).id;
  campanaB = (await prisma.campana.create({ data: { organizacion_id: B.organizacionId, nombre: "c", origen: "otro" } })).id;
  programaB = (await prisma.programa.create({ data: { organizacion_id: B.organizacionId, vertical_id: B.verticalId, sucursal_id: B.sucursales[0]!.id, nombre: "p", edad_min: 3, edad_max: 5 } })).id;
  grupoB = (await prisma.grupo.create({ data: { organizacion_id: B.organizacionId, programa_id: programaB, nombre: "g", cupo_maximo: 5 } })).id;
});

after(async () => {
  await prisma.$disconnect();
});

test("la base rechaza una referencia a una fila de otra organización (en cada tabla con referencias, catálogo incluido)", async () => {
  const org = A.organizacionId;
  const casos: [string, () => Promise<unknown>][] = [
    ["sucursal_vertical → sucursal ajena", () => prisma.sucursal_vertical.create({ data: { organizacion_id: org, sucursal_id: B.sucursales[0]!.id, vertical_id: A.verticalId } })],
    ["sucursal_vertical → vertical ajena", () => prisma.sucursal_vertical.create({ data: { organizacion_id: org, sucursal_id: A.sucursales[0]!.id, vertical_id: B.verticalId } })],
    ["canal_whatsapp → vertical ajena", () => prisma.canal_whatsapp.create({ data: { organizacion_id: org, vertical_id: B.verticalId, nombre_publico: "x" } })],
    ["canal_whatsapp → sucursal ajena", () => prisma.canal_whatsapp.create({ data: { organizacion_id: org, vertical_id: A.verticalId, sucursal_id: B.sucursales[0]!.id, nombre_publico: "x" } })],
    ["bandeja_chatwoot → canal ajeno", () => prisma.bandeja_chatwoot.create({ data: { organizacion_id: org, canal_whatsapp_id: B.canalId, nombre: "x" } })],
    ["campana → vertical ajena", () => prisma.campana.create({ data: { organizacion_id: org, nombre: "x", origen: "otro", vertical_id: B.verticalId } })],
    ["lead → vertical ajena", () => prisma.lead.create({ data: { organizacion_id: org, vertical_interes_id: B.verticalId, etapa_id: A.etapaInicialId } })],
    ["lead → etapa ajena", () => prisma.lead.create({ data: { organizacion_id: org, vertical_interes_id: A.verticalId, etapa_id: B.etapaInicialId } })],
    ["lead → sucursal ajena", () => prisma.lead.create({ data: { organizacion_id: org, vertical_interes_id: A.verticalId, etapa_id: A.etapaInicialId, sucursal_interes_id: B.sucursales[0]!.id } })],
    ["lead → campaña ajena", () => prisma.lead.create({ data: { organizacion_id: org, vertical_interes_id: A.verticalId, etapa_id: A.etapaInicialId, campana_id: campanaB } })],
    ["prospecto → lead ajeno", () => prisma.prospecto.create({ data: { organizacion_id: org, lead_id: leadB, vertical_interes_id: A.verticalId } })],
    ["interaccion → lead ajeno", () => prisma.interaccion.create({ data: { organizacion_id: org, lead_id: leadB, tipo: "nota" } })],
    ["interaccion → conversación ajena", () => prisma.interaccion.create({ data: { organizacion_id: org, lead_id: leadA, conversacion_id: conversacionB, tipo: "nota" } })],
    ["conversacion → lead ajeno", () => prisma.conversacion.create({ data: { organizacion_id: org, bandeja_chatwoot_id: A.bandejaId, lead_id: leadB, chatwoot_conversacion_id: 2 } })],
    ["conversacion → bandeja ajena", () => prisma.conversacion.create({ data: { organizacion_id: org, bandeja_chatwoot_id: B.bandejaId, lead_id: leadA, chatwoot_conversacion_id: 3 } })],
    ["mensaje → conversación ajena", () => prisma.mensaje.create({ data: { organizacion_id: org, conversacion_id: conversacionB, direccion: "entrante", estatus: "recibido", cuerpo: "x", proveedor: "p" } })],
    ["mensaje → plantilla ajena", async () => {
      const conv = await prisma.conversacion.create({ data: { organizacion_id: org, bandeja_chatwoot_id: A.bandejaId, lead_id: leadA, chatwoot_conversacion_id: 4 } });
      return prisma.mensaje.create({ data: { organizacion_id: org, conversacion_id: conv.id, plantilla_id: plantillaB, direccion: "saliente", estatus: "pendiente", cuerpo: "x", proveedor: "p" } });
    }],
    ["plantilla_mensaje → vertical ajena", () => prisma.plantilla_mensaje.create({ data: { organizacion_id: org, codigo: "q", content_sid: "HX2", categoria: "utility", clase_mensaje: "servicio", vertical_id: B.verticalId } })],
    ["automatizacion → plantilla ajena", () => prisma.automatizacion.create({ data: { organizacion_id: org, nombre: "x", evento_disparador: "lead_sin_respuesta", plantilla_id: plantillaB } })],
    ["automatizacion → vertical ajena", () => prisma.automatizacion.create({ data: { organizacion_id: org, nombre: "x", evento_disparador: "lead_sin_respuesta", vertical_id: B.verticalId } })],
    ["automatizacion_ejecucion → automatización ajena", () => prisma.automatizacion_ejecucion.create({ data: { organizacion_id: org, automatizacion_id: automatizacionB, entidad_tipo: "lead", entidad_id: leadA, programado_para: new Date() } })],
    ["tarea_asesor → lead ajeno", () => prisma.tarea_asesor.create({ data: { organizacion_id: org, lead_id: leadB, tipo: "revision_manual", descripcion: "x" } })],
    ["programa → vertical ajena", () => prisma.programa.create({ data: { organizacion_id: org, vertical_id: B.verticalId, sucursal_id: A.sucursales[0]!.id, nombre: "x", edad_min: 3, edad_max: 5 } })],
    ["programa → sucursal ajena", () => prisma.programa.create({ data: { organizacion_id: org, vertical_id: A.verticalId, sucursal_id: B.sucursales[0]!.id, nombre: "x", edad_min: 3, edad_max: 5 } })],
    ["grupo → programa ajeno", () => prisma.grupo.create({ data: { organizacion_id: org, programa_id: programaB, nombre: "x", cupo_maximo: 5 } })],
    ["grupo_horario → grupo ajeno", () => prisma.grupo_horario.create({ data: { organizacion_id: org, grupo_id: grupoB, dia_semana: 1, hora_inicio_min: 600, hora_fin_min: 660 } })],
    ["tarea_asesor → conversación ajena", () => prisma.tarea_asesor.create({ data: { organizacion_id: org, lead_id: leadA, conversacion_id: conversacionB, tipo: "revision_manual", descripcion: "x" } })],
  ];
  for (const [nombre, alta] of casos) {
    await assert.rejects(alta(), (e) => esViolacionFk(e), `debió rechazar: ${nombre}`);
  }
});

test("control: la misma operación dentro de la organización sí funciona", async () => {
  const conv = await prisma.conversacion.create({ data: { organizacion_id: A.organizacionId, bandeja_chatwoot_id: A.bandejaId, lead_id: leadA, chatwoot_conversacion_id: 10 } });
  const msg = await prisma.mensaje.create({ data: { organizacion_id: A.organizacionId, conversacion_id: conv.id, direccion: "entrante", estatus: "recibido", cuerpo: "hola", proveedor: "p", id_externo: "ctl-1" } });
  assert.equal(msg.organizacion_id, A.organizacionId);
});

test("las dos ventanas del invariante 5 son campos separados", async () => {
  const servicio = new Date("2026-10-08T10:00:00Z");
  const gratis = new Date("2026-10-10T10:00:00Z");
  const c = await prisma.conversacion.create({
    data: { organizacion_id: A.organizacionId, bandeja_chatwoot_id: A.bandejaId, lead_id: leadA, chatwoot_conversacion_id: 11, ventana_servicio_hasta: servicio, ventana_gratis_hasta: gratis },
  });
  assert.equal(c.ventana_servicio_hasta?.toISOString(), servicio.toISOString());
  assert.equal(c.ventana_gratis_hasta?.toISOString(), gratis.toISOString());
});

test("CHECK: ninguna automatización puede salir de 09:00–20:00 (invariante 14)", async () => {
  const base = { organizacion_id: A.organizacionId, nombre: "h", evento_disparador: "lead_sin_respuesta" as const };
  await prisma.automatizacion.create({ data: { ...base, hora_inicio_min: 600, hora_fin_min: 1080 } });
  await assert.rejects(prisma.automatizacion.create({ data: { ...base, hora_inicio_min: 480 } }), /automatizacion_horario_check/);
  await assert.rejects(prisma.automatizacion.create({ data: { ...base, hora_fin_min: 1260 } }), /automatizacion_horario_check/);
  await assert.rejects(prisma.automatizacion.create({ data: { ...base, hora_inicio_min: 900, hora_fin_min: 900 } }), /automatizacion_horario_check/);
  await assert.rejects(prisma.automatizacion.create({ data: { ...base, dias_permitidos: [7] } }), /automatizacion_dias_check/);
});

test("CHECK: el consentimiento solo acepta teléfonos normalizados (invariante 7)", async () => {
  const org = A.organizacionId;
  await prisma.consentimiento.create({ data: { organizacion_id: org, telefono: "+525512345678", estado: "opt_out", origen: "palabra_clave" } });
  await assert.rejects(prisma.consentimiento.create({ data: { organizacion_id: org, telefono: "+5215512345678", estado: "opt_out" } }), /consentimiento_telefono_e164_check/);
  await assert.rejects(prisma.consentimiento.create({ data: { organizacion_id: org, telefono: "5512345678", estado: "opt_out" } }), /consentimiento_telefono_e164_check/);
});

test("idempotencia de automatizaciones: (automatización, entidad, ocurrencia) es único (invariante 8)", async () => {
  const auto = await prisma.automatizacion.create({ data: { organizacion_id: A.organizacionId, nombre: "idem", evento_disparador: "lead_sin_respuesta" } });
  const datos = { organizacion_id: A.organizacionId, automatizacion_id: auto.id, entidad_tipo: "lead", entidad_id: leadA, programado_para: new Date() };
  await prisma.automatizacion_ejecucion.create({ data: datos });
  await assert.rejects(prisma.automatizacion_ejecucion.create({ data: datos }), (e) => esViolacionUnica(e));
  await prisma.automatizacion_ejecucion.create({ data: { ...datos, ocurrencia: 2 } });
});

test("índices parciales: un prospecto del bot por lead; una tarea pendiente por conversación y tipo; un número por canal", async () => {
  const prospecto = { organizacion_id: A.organizacionId, lead_id: leadA, vertical_interes_id: A.verticalId };
  await prisma.prospecto.create({ data: { ...prospecto, nombre: "uno" } });
  await assert.rejects(prisma.prospecto.create({ data: { ...prospecto, nombre: "dos" } }), (e) => esViolacionUnica(e));
  await prisma.prospecto.create({ data: { ...prospecto, nombre: "hermano", origen: "asesor" } });
  await assert.rejects(prisma.prospecto.create({ data: { ...prospecto, edad_declarada: 120, origen: "asesor" } }), /prospecto_edad_declarada_check/);

  const conv = await prisma.conversacion.create({ data: { organizacion_id: A.organizacionId, bandeja_chatwoot_id: A.bandejaId, lead_id: leadA, chatwoot_conversacion_id: 12 } });
  const tarea = { organizacion_id: A.organizacionId, lead_id: leadA, conversacion_id: conv.id, tipo: "sin_plantilla_apta" as const, descripcion: "t" };
  const t1 = await prisma.tarea_asesor.create({ data: tarea });
  await assert.rejects(prisma.tarea_asesor.create({ data: tarea }), (e) => esViolacionUnica(e));
  await prisma.tarea_asesor.update({ where: { id: t1.id }, data: { estado: "hecha" } });
  await prisma.tarea_asesor.create({ data: tarea });

  const numero = `whatsapp:+1555${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
  await prisma.canal_whatsapp.create({ data: { organizacion_id: A.organizacionId, vertical_id: A.verticalId, nombre_publico: "n1", numero_whatsapp: numero } });
  await assert.rejects(
    prisma.canal_whatsapp.create({ data: { organizacion_id: B.organizacionId, vertical_id: B.verticalId, nombre_publico: "n2", numero_whatsapp: numero } }),
    (e) => esViolacionUnica(e),
  );
});

test("seed de Fase 1: una vertical, dos sucursales, etapas y canal con su bandeja; correrlo dos veces no duplica", async () => {
  const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await cliente.connect();
  try {
    const sql = readFileSync("prisma/seed/demo.sql", "utf8");
    await cliente.query(sql);
    await cliente.query(sql);
    const ORG = "00000000-0000-4000-8000-000000000001";
    const cuenta = async (tabla: string): Promise<number> =>
      Number((await cliente.query(`SELECT count(*) FROM ${tabla} WHERE organizacion_id = $1 AND eliminado_en IS NULL`, [ORG])).rows[0].count);
    assert.equal(await cuenta("vertical"), 1);
    assert.equal(await cuenta("sucursal"), 2);
    assert.equal(await cuenta("sucursal_vertical"), 2);
    assert.equal(await cuenta("etapa_pipeline"), 7);
    assert.equal(await cuenta("canal_whatsapp"), 1);
    assert.equal(await cuenta("bandeja_chatwoot"), 1);
    const cierres = await cliente.query(`SELECT es_ganado, es_perdido FROM etapa_pipeline WHERE organizacion_id = $1 AND (es_ganado OR es_perdido)`, [ORG]);
    assert.equal(cierres.rowCount, 2);
  } finally {
    await cliente.end();
  }
});
