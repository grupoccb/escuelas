// I1: el reporte de clases muestra — agendadas, asistidas, no asistidas, canceladas y conversión (asistidas → inscritas) por fuente, vertical y sucursal, con rango de fechas
// por el DÍA LOCAL de la sucursal; permisos y alcance; y el comando.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeFinanzas, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { sembrarFamilia } from "../testutil/semilla.ts";
import type { ReporteDeClasesMuestra } from "./clases-muestra.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;
let grupoNorte: string;
let grupoSur: string;
let grupoOtraVertical: string;
let verticalB: string;

before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeFinanzas(prisma, "Reporte clases muestra");
  grupoNorte = (await m.programa({ sucursalId: m.norte })).grupoId;
  grupoSur = (await m.programa({ sucursalId: m.sur })).grupoId;
  verticalB = (await prisma.vertical.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Vertical B", slug: `vb-${randomUUID().slice(0, 6)}` } })).id;
  await prisma.sucursal_vertical.create({ data: { organizacion_id: m.org.organizacionId, sucursal_id: m.norte, vertical_id: verticalB } });
  const p = await prisma.programa.create({ data: { organizacion_id: m.org.organizacionId, vertical_id: verticalB, sucursal_id: m.norte, nombre: "Programa B", edad_min: 3, edad_max: 14 } });
  grupoOtraVertical = (await prisma.grupo.create({ data: { organizacion_id: m.org.organizacionId, programa_id: p.id, nombre: "Grupo B", cupo_maximo: 20 } })).id;
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

type Fuente = "facebook" | "presencial" | "landing" | "anuncio" | "directo";
let n = 0;
/** Una clase muestra de un prospecto nuevo con la fuente indicada; `inscrito` crea su inscripción (cualquier estatus). */
async function clase(o: { fuente: Fuente; grupo: string; cuando: string; estatus: "agendada" | "asistio" | "no_asistio" | "cancelada" | "reagendada"; inscrito?: boolean; sucursalId?: string }) {
  const fam = await sembrarFamilia(prisma, m.org, { sucursalId: o.sucursalId ?? m.norte });
  const campana = o.fuente === "facebook" || o.fuente === "presencial" ? await campanaDe(o.fuente) : null;
  await prisma.lead.update({
    where: { id: fam.leadId },
    data: { ...(campana ? { campana_id: campana } : {}), ...(o.fuente === "landing" ? { atribucion: { fuente: "landing" } } : {}), ...(o.fuente === "anuncio" ? { anuncio_id: `ad-${++n}`, ctwa_clid: `clid-${n}` } : {}) },
  });
  const c = await prisma.clase_muestra.create({ data: { organizacion_id: m.org.organizacionId, lead_id: fam.leadId, prospecto_id: fam.prospectoId, grupo_id: o.grupo, fecha_hora: new Date(o.cuando), estatus: o.estatus, agendada_por: "usuario", agendada_por_usuario_id: m.adminId } });
  if (o.inscrito) {
    const alumno = await prisma.alumno.create({ data: { organizacion_id: m.org.organizacionId, nombre: `A${++n}`, apellidos: "Prueba", fecha_nacimiento: new Date("2018-01-01") } });
    const g = await prisma.grupo.findUniqueOrThrow({ where: { id: o.grupo }, select: { programa_id: true } });
    await prisma.inscripcion.create({ data: { organizacion_id: m.org.organizacionId, alumno_id: alumno.id, grupo_id: o.grupo, programa_id: g.programa_id, lead_id: fam.leadId, prospecto_id: fam.prospectoId, fecha_inscripcion: new Date("2026-10-20"), fecha_inicio: new Date("2026-10-20"), precio_inscripcion_aplicado: "100.00", precio_mensualidad_aplicado: "200.00", dia_corte_pago: 5 } });
  }
  return c;
}
const campanas = new Map<string, string>();
async function campanaDe(origen: "facebook" | "presencial"): Promise<string> {
  const previa = campanas.get(origen);
  if (previa) return previa;
  const c = await prisma.campana.create({ data: { organizacion_id: m.org.organizacionId, nombre: `Campaña ${origen}`, origen } });
  campanas.set(origen, c.id);
  return c.id;
}
const reporte = (cliente: typeof m.admin, qs = "") => cliente.get<ReporteDeClasesMuestra & { error?: unknown }>(`/api/reportes/clases-muestra${qs}`);
const fila = (r: ReporteDeClasesMuestra, lista: "por_fuente" | "por_vertical" | "por_sucursal", clave: string) => r[lista].find((f) => f.clave === clave || f.nombre === clave);

test("cuenta agendadas, asistidas, no asistidas, canceladas y la conversión por fuente, vertical y sucursal; las reagendadas no cuentan (la nueva ocupa su lugar)", async () => {
  // Octubre de 2026. Mediodía local = 18:00Z.
  await clase({ fuente: "facebook", grupo: grupoNorte, cuando: "2026-10-05T22:00:00Z", estatus: "asistio", inscrito: true });
  await clase({ fuente: "facebook", grupo: grupoNorte, cuando: "2026-10-06T22:00:00Z", estatus: "asistio" });
  await clase({ fuente: "facebook", grupo: grupoNorte, cuando: "2026-10-07T22:00:00Z", estatus: "no_asistio" });
  await clase({ fuente: "facebook", grupo: grupoSur, cuando: "2026-10-08T22:00:00Z", estatus: "cancelada", sucursalId: m.sur });
  await clase({ fuente: "facebook", grupo: grupoNorte, cuando: "2026-10-09T22:00:00Z", estatus: "reagendada" });
  await clase({ fuente: "facebook", grupo: grupoNorte, cuando: "2026-10-12T22:00:00Z", estatus: "asistio", inscrito: true });
  await clase({ fuente: "presencial", grupo: grupoSur, cuando: "2026-10-10T22:00:00Z", estatus: "asistio", inscrito: true, sucursalId: m.sur });
  await clase({ fuente: "presencial", grupo: grupoSur, cuando: "2026-10-11T22:00:00Z", estatus: "asistio", inscrito: true, sucursalId: m.sur });
  await clase({ fuente: "landing", grupo: grupoOtraVertical, cuando: "2026-10-13T22:00:00Z", estatus: "asistio" });
  await clase({ fuente: "landing", grupo: grupoOtraVertical, cuando: "2026-10-14T22:00:00Z", estatus: "agendada" });
  await clase({ fuente: "anuncio", grupo: grupoNorte, cuando: "2026-10-15T22:00:00Z", estatus: "no_asistio" });
  await clase({ fuente: "directo", grupo: grupoNorte, cuando: "2026-10-16T22:00:00Z", estatus: "asistio", inscrito: true });
  const r = (await reporte(m.admin, "?desde=2026-10-01&hasta=2026-10-31")).cuerpo;
  assert.deepEqual([r.total.agendadas, r.total.asistidas, r.total.no_asistidas, r.total.canceladas, r.total.pendientes, r.total.inscritas, r.total.conversion], [11, 7, 2, 1, 1, 5, "71.4"]);
  const fb = fila(r, "por_fuente", "facebook")!;
  assert.deepEqual([fb.agendadas, fb.asistidas, fb.no_asistidas, fb.canceladas, fb.inscritas, fb.conversion], [5, 3, 1, 1, 2, "66.7"], "la reagendada no cuenta");
  assert.deepEqual([fila(r, "por_fuente", "presencial")!.asistidas, fila(r, "por_fuente", "presencial")!.conversion], [2, "100.0"], "el QR en sucursal es el origen «presencial»");
  assert.deepEqual([fila(r, "por_fuente", "landing")!.agendadas, fila(r, "por_fuente", "landing")!.pendientes, fila(r, "por_fuente", "landing")!.inscritas, fila(r, "por_fuente", "landing")!.conversion], [2, 1, 0, "0.0"]);
  assert.deepEqual([fila(r, "por_fuente", "anuncio")!.agendadas, fila(r, "por_fuente", "anuncio")!.conversion], [1, null], "sin asistidas no hay conversión (null → «—»), sin dividir entre cero");
  assert.equal(fila(r, "por_fuente", "directo")!.inscritas, 1);
  assert.deepEqual(r.por_vertical.map((v) => [v.nombre, v.agendadas]), [["Vertical B", 2], ["Vertical Prueba", 9]].sort((a, b) => (b[1] as number) - (a[1] as number)));
  assert.deepEqual([fila(r, "por_sucursal", "Norte")!.agendadas, fila(r, "por_sucursal", "Sur")!.agendadas], [8, 3]);
  // Filtros.
  const sur = (await reporte(m.admin, `?desde=2026-10-01&hasta=2026-10-31&sucursal_id=${m.sur}`)).cuerpo;
  assert.deepEqual([sur.total.agendadas, sur.por_sucursal.length], [3, 1]);
  const vb = (await reporte(m.admin, `?desde=2026-10-01&hasta=2026-10-31&vertical_id=${verticalB}`)).cuerpo;
  assert.equal(vb.total.agendadas, 2);
});

test("el rango es por el DÍA LOCAL de la sucursal: una clase a las 20:00 locales del 31 (02:00Z del 1.º) es de octubre, y el rango es inclusivo", async () => {
  const antes = (await reporte(m.admin, "?desde=2026-10-31&hasta=2026-10-31")).cuerpo.total.agendadas;
  await clase({ fuente: "directo", grupo: grupoNorte, cuando: "2026-11-01T02:00:00Z", estatus: "asistio" });
  await clase({ fuente: "directo", grupo: grupoNorte, cuando: "2026-11-01T06:00:00Z", estatus: "asistio" }); // 00:00 del 1 de noviembre local
  assert.equal((await reporte(m.admin, "?desde=2026-10-31&hasta=2026-10-31")).cuerpo.total.agendadas, antes + 1);
  assert.equal((await reporte(m.admin, "?desde=2026-11-01&hasta=2026-11-01")).cuerpo.total.agendadas >= 1, true);
  assert.equal((await reporte(m.admin, "?desde=2026-11-02&hasta=2026-10-01")).estado, 400, "rango invertido");
  assert.equal((await reporte(m.admin, "?desde=ayer")).estado, 400);
});

test("permisos y alcance: administrador y asesor sí (el asesor solo lo de SUS sucursales), recepción y maestro no, y no hay fuga entre organizaciones", async () => {
  const completo = (await reporte(m.admin, "?desde=2026-10-01&hasta=2026-10-31")).cuerpo;
  const norte = (await reporte(m.asesorNorte, "?desde=2026-10-01&hasta=2026-10-31")).cuerpo;
  assert.equal(norte.por_sucursal.length, 1);
  assert.equal(norte.por_sucursal[0]!.nombre, "Norte");
  assert.ok(norte.total.agendadas < completo.total.agendadas);
  const sur = (await reporte(m.asesorSur, "?desde=2026-10-01&hasta=2026-10-31")).cuerpo;
  assert.deepEqual(sur.por_sucursal.map((s) => s.nombre), ["Sur"]);
  // Pedir otra sucursal que no es suya no da nada (no un error que confirme que existe).
  assert.equal((await reporte(m.asesorSur, `?desde=2026-10-01&hasta=2026-10-31&sucursal_id=${m.norte}`)).cuerpo.total.agendadas, 0);
  assert.equal((await reporte(m.recepcion)).estado, 403);
  assert.equal((await reporte(m.maestro)).estado, 403);
  assert.equal((await m.api.cliente().get("/api/reportes/clases-muestra")).estado, 401);
  const otro = await mundoDeFinanzas(prisma, "Reporte clases ajeno");
  try {
    assert.equal((await reporte(otro.admin)).cuerpo.total.agendadas, 0);
  } finally {
    await otro.cerrar();
  }
});

test("el comando `npm run reporte:clases-muestra` imprime el mismo reporte (y --json)", () => {
  const env = { ...process.env, DATABASE_URL: process.env["DATABASE_URL"]! };
  const texto = execFileSync(process.execPath, ["scripts/reporte-clases-muestra.ts", "--organizacion", m.org.organizacionId, "--desde", "2026-10-01", "--hasta", "2026-10-31"], { env, encoding: "utf8" });
  assert.match(texto, /Por fuente/);
  assert.match(texto, /facebook/);
  const json = JSON.parse(execFileSync(process.execPath, ["scripts/reporte-clases-muestra.ts", "--organizacion", m.org.organizacionId, "--desde", "2026-10-01", "--hasta", "2026-10-31", "--json"], { env, encoding: "utf8" })) as ReporteDeClasesMuestra;
  assert.equal(json.total.agendadas, 12, "las 11 de octubre más la del 31 a las 20:00 locales");
});
