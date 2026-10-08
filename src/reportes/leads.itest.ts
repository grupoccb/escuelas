// Reporte de leads por campaña, sucursal y etapa, contra Postgres real: el conteo, los filtros,
// lo borrado y el aislamiento entre organizaciones. Y el comando que Eduardo corre.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { crearPrisma, type PrismaClient } from "../datos/prisma.ts";
import { conAlcance } from "../datos/alcance.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { reporteLeads, SIN_CAMPANA, SIN_SUCURSAL } from "./leads.ts";

let prisma: PrismaClient;
let A: OrganizacionDePrueba;
let B: OrganizacionDePrueba;
let etapaContactado: string;
let campanaUno: string;
let campanaDos: string;

before(async () => {
  prisma = crearPrisma();
  A = await sembrarOrganizacion(prisma, "ReporteA");
  B = await sembrarOrganizacion(prisma, "ReporteB");
  etapaContactado = (await prisma.etapa_pipeline.create({ data: { organizacion_id: A.organizacionId, nombre: "Contactado", orden: 2 } })).id;
  campanaUno = (await prisma.campana.create({ data: { organizacion_id: A.organizacionId, nombre: "Campaña Uno", origen: "facebook" } })).id;
  campanaDos = (await prisma.campana.create({ data: { organizacion_id: A.organizacionId, nombre: "Campaña Dos", origen: "tiktok" } })).id;

  const lead = (extra: { campana?: string; sucursal?: string; etapa?: string; creado?: string; borrado?: boolean }) =>
    prisma.lead.create({
      data: {
        organizacion_id: A.organizacionId,
        vertical_interes_id: A.verticalId,
        etapa_id: extra.etapa ?? A.etapaInicialId,
        telefono: `+5255${randomInt(10_000_000, 99_999_999)}`,
        campana_id: extra.campana ?? null,
        sucursal_interes_id: extra.sucursal ?? null,
        ...(extra.creado ? { creado_en: new Date(extra.creado) } : {}),
        ...(extra.borrado ? { eliminado_en: new Date() } : {}),
      },
    });
  const [norte, sur] = A.sucursales.map((s) => s.id) as [string, string];
  // Campaña Uno: 3 en Norte/Nueva, 1 en Norte/Contactado, 2 en Sur/Nueva
  for (let i = 0; i < 3; i++) await lead({ campana: campanaUno, sucursal: norte, creado: "2026-10-02T12:00:00Z" });
  await lead({ campana: campanaUno, sucursal: norte, etapa: etapaContactado, creado: "2026-10-03T12:00:00Z" });
  for (let i = 0; i < 2; i++) await lead({ campana: campanaUno, sucursal: sur, creado: "2026-10-20T12:00:00Z" });
  // Campaña Dos: 1 en Sur/Contactado
  await lead({ campana: campanaDos, sucursal: sur, etapa: etapaContactado, creado: "2026-10-21T12:00:00Z" });
  // Sin campaña y sin sucursal: 4
  for (let i = 0; i < 4; i++) await lead({ creado: "2026-10-05T12:00:00Z" });
  // Borrado: no cuenta
  await lead({ campana: campanaUno, sucursal: norte, borrado: true });
  // Otra organización: no se mezcla
  for (let i = 0; i < 7; i++) {
    await prisma.lead.create({ data: { organizacion_id: B.organizacionId, vertical_interes_id: B.verticalId, etapa_id: B.etapaInicialId, telefono: `+5255${randomInt(10_000_000, 99_999_999)}` } });
  }
});

after(async () => {
  await prisma.$disconnect();
});

const db = () => conAlcance(prisma, A.organizacionId);
const fila = (r: Awaited<ReturnType<typeof reporteLeads>>, campana: string, sucursal: string, etapa: string) =>
  r.filas.find((f) => f.campana === campana && f.sucursal === sucursal && f.etapa === etapa)?.leads;

test("cuenta los leads por campaña, sucursal y etapa; lo borrado y otras organizaciones no cuentan", async () => {
  const r = await reporteLeads(db());
  const [norte, sur] = A.sucursales.map((s) => s.nombre) as [string, string];
  assert.equal(fila(r, "Campaña Uno", norte, "Primera"), 3);
  assert.equal(fila(r, "Campaña Uno", norte, "Contactado"), 1);
  assert.equal(fila(r, "Campaña Uno", sur, "Primera"), 2);
  assert.equal(fila(r, "Campaña Dos", sur, "Contactado"), 1);
  assert.equal(fila(r, SIN_CAMPANA, SIN_SUCURSAL, "Primera"), 4);
  assert.equal(r.total, 11);
  assert.equal(r.filas.reduce((s, f) => s + f.leads, 0), r.total);
});

test("el resumen por etapa sigue el orden del embudo", async () => {
  const r = await reporteLeads(db());
  assert.deepEqual(r.porEtapa.map((e) => [e.etapa, e.leads]), [["Primera", 9], ["Contactado", 2]]);
});

test("las filas salen ordenadas por campaña, sucursal y etapa del embudo", async () => {
  const r = await reporteLeads(db());
  const campanas = r.filas.map((f) => f.campana);
  assert.deepEqual(campanas, [...campanas].sort((a, b) => a.localeCompare(b, "es-MX")));
  const norte = r.filas.filter((f) => f.campana === "Campaña Uno" && f.sucursal === A.sucursales[0]!.nombre);
  assert.deepEqual(norte.map((f) => f.etapa), ["Primera", "Contactado"]);
});

test("filtro por fechas: desde inclusive, hasta exclusive", async () => {
  const r = await reporteLeads(db(), { desde: new Date("2026-10-01T00:00:00Z"), hasta: new Date("2026-10-10T00:00:00Z") });
  assert.equal(r.total, 3 + 1 + 4);
  const soloTarde = await reporteLeads(db(), { desde: new Date("2026-10-20T12:00:00Z") });
  assert.equal(soloTarde.total, 3, "los de las 12:00 exactas entran");
  assert.equal((await reporteLeads(db(), { hasta: new Date("2026-10-02T12:00:00Z") })).total, 0);
});

test("filtro por vertical", async () => {
  assert.equal((await reporteLeads(db(), { verticalSlug: "vertical-prueba" })).total, 11);
  await assert.rejects(reporteLeads(db(), { verticalSlug: "no-existe" }), /No existe la vertical/);
});

test("aislamiento: cada organización ve solo lo suyo", async () => {
  const b = await reporteLeads(conAlcance(prisma, B.organizacionId));
  assert.equal(b.total, 7);
  assert.deepEqual(b.filas.map((f) => f.campana), [SIN_CAMPANA]);
});

test("una campaña borrada después de captar leads no los pierde: se nombra como eliminada", async () => {
  const org = await sembrarOrganizacion(prisma, "ReporteC");
  const campana = await prisma.campana.create({ data: { organizacion_id: org.organizacionId, nombre: "Se borrará", origen: "otro" } });
  await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, etapa_id: org.etapaInicialId, campana_id: campana.id } });
  await prisma.campana.update({ where: { id: campana.id }, data: { eliminado_en: new Date() } });
  const r = await reporteLeads(conAlcance(prisma, org.organizacionId));
  assert.equal(r.total, 1);
  assert.equal(r.filas[0]!.campana, "(campaña eliminada)");
});

test("comando: npm run reporte:leads imprime el reporte (texto y JSON) y valida los argumentos", () => {
  const correr = (...args: string[]) =>
    spawnSync(process.execPath, ["scripts/reporte-leads.ts", ...args], { env: process.env, encoding: "utf8" });

  const texto = correr("--organizacion", A.organizacionId);
  assert.equal(texto.status, 0, texto.stderr);
  assert.match(texto.stdout, /Campaña Uno/);
  assert.match(texto.stdout, /Total: 11/);

  const json = correr("--organizacion", A.organizacionId, "--json", "--desde", "2026-10-20");
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).total, 3);

  const sinOrg = correr();
  assert.equal(sinOrg.status, 1, "con varias organizaciones exige indicar cuál");
  assert.match(sinOrg.stderr, /--organizacion/);
  const fechaMala = correr("--organizacion", A.organizacionId, "--desde", "ayer");
  assert.equal(fechaMala.status, 1);
  assert.match(fechaMala.stderr, /AAAA-MM-DD/);
});
