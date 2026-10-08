// Configuración por organización contra Postgres real: valores por defecto sin fila, lectura,
// aislamiento, una sola fila viva por organización y el seed de la demo.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { esViolacionUnica } from "../datos/prisma.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { conAlcance } from "../datos/alcance.ts";
import { fijarConfiguracion, sembrarOrganizacion } from "../testutil/semilla.ts";
import { CONFIGURACION_POR_DEFECTO, leerConfiguracion } from "./index.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

test("sin fila: los valores por defecto (3 automáticos por día, 1 de marketing cada 7 días)", async () => {
  const o = await sembrarOrganizacion(prisma, "ConfigVacia");
  const c = await leerConfiguracion(conAlcance(prisma, o.organizacionId));
  assert.deepEqual(c, { maxAutomaticosPorDia: 3, maxMarketingPorVentana: 1, ventanaMarketingDias: 7, sucursalSinPrograma: "ofrecer_otra", cotizacionVigenciaDias: 7, listaEsperaOfertaHoras: 48 });
  assert.deepEqual(c, CONFIGURACION_POR_DEFECTO);
  // El objeto devuelto es una copia: modificarlo no cambia los defaults.
  c.maxAutomaticosPorDia = 99;
  assert.equal(CONFIGURACION_POR_DEFECTO.maxAutomaticosPorDia, 3);
});

test("los defaults del código coinciden con los de las columnas de la base", async () => {
  const o = await sembrarOrganizacion(prisma, "ConfigColumnas");
  const fila = await prisma.configuracion_organizacion.create({ data: { organizacion_id: o.organizacionId } });
  assert.deepEqual(await leerConfiguracion(conAlcance(prisma, o.organizacionId)), CONFIGURACION_POR_DEFECTO);
  assert.deepEqual([fila.max_automaticos_por_dia, fila.max_marketing_por_ventana, fila.ventana_marketing_dias, fila.sucursal_sin_programa, fila.cotizacion_vigencia_dias, fila.lista_espera_oferta_horas], [3, 1, 7, "ofrecer_otra", 7, 48]);
});

test("lee lo que la organización fijó, y un cambio surte efecto en la siguiente lectura", async () => {
  const o = await sembrarOrganizacion(prisma, "ConfigFijada");
  const db = conAlcance(prisma, o.organizacionId);
  await fijarConfiguracion(prisma, o.organizacionId, { max_automaticos_por_dia: 5, max_marketing_por_ventana: 2, ventana_marketing_dias: 14 });
  assert.deepEqual(await leerConfiguracion(db), { maxAutomaticosPorDia: 5, maxMarketingPorVentana: 2, ventanaMarketingDias: 14, sucursalSinPrograma: "ofrecer_otra", cotizacionVigenciaDias: 7, listaEsperaOfertaHoras: 48 });
  await fijarConfiguracion(prisma, o.organizacionId, { sucursal_sin_programa: "avisar_asesor" });
  assert.equal((await leerConfiguracion(db)).sucursalSinPrograma, "avisar_asesor");
  await fijarConfiguracion(prisma, o.organizacionId, { max_automaticos_por_dia: 1 });
  assert.equal((await leerConfiguracion(db)).maxAutomaticosPorDia, 1);
});

test("aislamiento: la configuración de una organización no se ve desde otra", async () => {
  const a = await sembrarOrganizacion(prisma, "ConfigA");
  const b = await sembrarOrganizacion(prisma, "ConfigB");
  await fijarConfiguracion(prisma, a.organizacionId, { max_automaticos_por_dia: 9 });
  assert.equal((await leerConfiguracion(conAlcance(prisma, a.organizacionId))).maxAutomaticosPorDia, 9);
  assert.equal((await leerConfiguracion(conAlcance(prisma, b.organizacionId))).maxAutomaticosPorDia, 3);
});

test("una sola fila viva por organización; una fila borrada no cuenta y deja crear otra", async () => {
  const o = await sembrarOrganizacion(prisma, "ConfigUnica");
  const primera = await prisma.configuracion_organizacion.create({ data: { organizacion_id: o.organizacionId } });
  await assert.rejects(prisma.configuracion_organizacion.create({ data: { organizacion_id: o.organizacionId } }), (e) => esViolacionUnica(e));
  await prisma.configuracion_organizacion.update({ where: { id: primera.id }, data: { eliminado_en: new Date() } });
  await prisma.configuracion_organizacion.create({ data: { organizacion_id: o.organizacionId, max_automaticos_por_dia: 2 } });
  assert.equal((await leerConfiguracion(conAlcance(prisma, o.organizacionId))).maxAutomaticosPorDia, 2);
});

test("la base rechaza topes negativos o una ventana de marketing fuera de 1 a 365 días", async () => {
  const o = await sembrarOrganizacion(prisma, "ConfigCheck");
  for (const mala of [{ max_automaticos_por_dia: -1 }, { max_marketing_por_ventana: -1 }, { ventana_marketing_dias: 0 }, { ventana_marketing_dias: 366 }]) {
    await assert.rejects(prisma.configuracion_organizacion.create({ data: { organizacion_id: o.organizacionId, ...mala } }), /configuracion_organizacion_topes_check/);
  }
  // Cero es válido: apaga lo automático de esa organización.
  await prisma.configuracion_organizacion.create({ data: { organizacion_id: o.organizacionId, max_automaticos_por_dia: 0 } });
});

test("el seed de la demo deja a la organización con su fila de configuración con los valores por defecto (idempotente)", async () => {
  const prefijo = randomBytes(4).toString("hex");
  const aOrganizacionNueva = (sql: string): string => sql.replace(/00000000-0000-4000-8000-000000000(\d{3})/g, `${prefijo}-0000-4000-8000-000000000$1`).replaceAll("escuela-demo", `escuela-${prefijo}`);
  const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await cliente.connect();
  try {
    const demo = aOrganizacionNueva(readFileSync("prisma/seed/demo.sql", "utf8"));
    await cliente.query(demo);
    await cliente.query(demo);
  } finally {
    await cliente.end();
  }
  const orgId = `${prefijo}-0000-4000-8000-000000000001`;
  const filas = await prisma.configuracion_organizacion.findMany({ where: { organizacion_id: orgId } });
  assert.equal(filas.length, 1);
  assert.deepEqual(await leerConfiguracion(conAlcance(prisma, orgId)), CONFIGURACION_POR_DEFECTO);
});
