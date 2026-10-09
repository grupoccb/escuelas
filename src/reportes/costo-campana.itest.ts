// I2: el costo por alumno inscrito por campaña. El gasto lo captura a mano el administrador; el reporte divide en centavos exactos y sin dividir entre cero.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeFinanzas, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { sembrarFamilia } from "../testutil/semilla.ts";
import type { ReporteDeCostoPorCampana } from "./costo-campana.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;
let a: string;
let b: string;
let c: string;
let grupo: string;

before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeFinanzas(prisma, "Costo por campaña");
  const campana = async (nombre: string, origen: "facebook" | "instagram" | "tiktok") => (await prisma.campana.create({ data: { organizacion_id: m.org.organizacionId, nombre, origen } })).id;
  [a, b, c] = [await campana("Campaña A", "facebook"), await campana("Campaña B", "instagram"), await campana("Campaña C", "tiktok")];
  grupo = (await m.programa()).grupoId;
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

const gasto = (campanaId: string, fecha: string, monto: unknown, nota?: string, cliente = m.admin) => cliente.post<{ id: string; monto: string; fecha: string; error?: unknown }>(`/api/campanas/${campanaId}/gastos`, { fecha, monto, ...(nota ? { nota } : {}) });
const reporte = (qs = "", cliente = m.admin) => cliente.get<ReporteDeCostoPorCampana>(`/api/reportes/costo-por-alumno${qs}`);
let n = 0;
async function lead(campanaId: string, creado: string, o: { clase?: "asistio" | "agendada"; inscripcion?: "activa" | "baja" } = {}) {
  const fam = await sembrarFamilia(prisma, m.org, {});
  await prisma.lead.update({ where: { id: fam.leadId }, data: { campana_id: campanaId, creado_en: new Date(creado) } });
  if (o.clase) await prisma.clase_muestra.create({ data: { organizacion_id: m.org.organizacionId, lead_id: fam.leadId, prospecto_id: fam.prospectoId, grupo_id: grupo, fecha_hora: new Date(creado), estatus: o.clase, agendada_por: "usuario", agendada_por_usuario_id: m.adminId } });
  if (o.inscripcion) {
    const alumno = await prisma.alumno.create({ data: { organizacion_id: m.org.organizacionId, nombre: `A${++n}`, apellidos: "Prueba", fecha_nacimiento: new Date("2018-01-01") } });
    const g = await prisma.grupo.findUniqueOrThrow({ where: { id: grupo }, select: { programa_id: true } });
    const base = { organizacion_id: m.org.organizacionId, alumno_id: alumno.id, grupo_id: grupo, programa_id: g.programa_id, lead_id: fam.leadId, prospecto_id: fam.prospectoId, fecha_inscripcion: new Date(creado.slice(0, 10)), fecha_inicio: new Date(creado.slice(0, 10)), precio_inscripcion_aplicado: "100.00", precio_mensualidad_aplicado: "200.00", dia_corte_pago: 5 };
    await prisma.inscripcion.create({ data: o.inscripcion === "baja" ? { ...base, estatus: "baja", fecha_baja: new Date(creado.slice(0, 10)), motivo_baja_id: m.motivoBaja } : base });
  }
}

test("el administrador captura el gasto a mano: dinero exacto como texto, sin número JSON, sin monto cero ni fecha futura; el asesor y recepción no", async () => {
  const ok = await gasto(a, "2026-10-03", "1000.00", "Anuncios de la primera semana");
  assert.equal(ok.estado, 201, JSON.stringify(ok.cuerpo));
  assert.deepEqual([ok.cuerpo.monto, ok.cuerpo.fecha], ["1000.00", "2026-10-03"]);
  assert.equal((await gasto(a, "2026-10-10", "333.33")).estado, 201);
  assert.equal((await gasto(a, "2026-09-01", "200.00")).estado, 201, "fuera del rango de los reportes de octubre");
  assert.equal((await gasto(a, "2026-10-10", 12.5)).estado, 400, "un número JSON es un flotante");
  assert.equal((await gasto(a, "2026-10-10", "10.005")).estado, 400);
  assert.equal((await gasto(a, "2026-10-10", "0.00")).estado, 400);
  assert.equal((await gasto(a, "2027-12-31", "10.00")).estado, 400, "fecha futura");
  assert.equal((await gasto(randomUuidInexistente(), "2026-10-10", "10.00")).estado, 404);
  assert.equal((await gasto(a, "2026-10-10", "10.00", undefined, m.asesorNorte)).estado, 403);
  assert.equal((await gasto(a, "2026-10-10", "10.00", undefined, m.recepcion)).estado, 403);
  const lista = await m.admin.get<{ datos: { monto: string }[]; total: string }>(`/api/campanas/${a}/gastos?desde=2026-10-01&hasta=2026-10-31`);
  assert.deepEqual([lista.cuerpo.datos.length, lista.cuerpo.total], [2, "1333.33"]);
  assert.ok(await prisma.registro_cambio.findFirst({ where: { entidad_tipo: "gasto_campana", entidad_id: ok.cuerpo.id } }), "queda registrado quién lo capturó");
});
const randomUuidInexistente = () => "00000000-0000-4000-8000-0000000000bb";

test("costo por lead, por clase muestra y por alumno inscrito: en centavos exactos, redondeando la mitad hacia arriba; sin divisor, null y «—» (nunca una división por cero)", async () => {
  // Campaña A (octubre): 3 leads; 2 con clase (1 asistida); 2 inscripciones activas (y 1 baja que no cuenta).
  await lead(a, "2026-10-04T16:00:00Z", { clase: "asistio", inscripcion: "activa" });
  await lead(a, "2026-10-05T16:00:00Z", { clase: "agendada", inscripcion: "activa" });
  await lead(a, "2026-10-06T16:00:00Z", { inscripcion: "baja" });
  // Fuera del rango: no cuenta en octubre.
  await lead(a, "2026-09-02T16:00:00Z", { inscripcion: "activa" });
  // Campaña B: gasto pero ningún lead.
  assert.equal((await gasto(b, "2026-10-08", "500.00")).estado, 201);
  // Campaña C: leads sin gasto.
  await lead(c, "2026-10-09T16:00:00Z");
  await lead(c, "2026-10-10T16:00:00Z");
  const r = (await reporte("?desde=2026-10-01&hasta=2026-10-31")).cuerpo;
  const fila = (id: string) => r.filas.find((f) => f.campana.id === id)!;
  const fa = fila(a);
  assert.deepEqual([fa.gasto, fa.leads, fa.clases_muestra, fa.clases_asistidas, fa.inscripciones_activas], ["1333.33", 3, 2, 1, 2]);
  assert.deepEqual([fa.costo_por_lead, fa.costo_por_clase_muestra, fa.costo_por_alumno], ["444.44", "666.67", "666.67"], "1333.33 / 3 = 444.4433…; 1333.33 / 2 = 666.665 → 666.67");
  assert.equal(fa.costo_por_alumno_texto, "666.67");
  const fb = fila(b);
  assert.deepEqual([fb.gasto, fb.leads, fb.costo_por_lead, fb.costo_por_clase_muestra, fb.costo_por_alumno, fb.costo_por_alumno_texto, fb.costo_por_lead_texto], ["500.00", 0, null, null, null, "—", "—"], "sin leads ni inscripciones: «—», no una división por cero");
  const fc = fila(c);
  assert.deepEqual([fc.gasto, fc.leads, fc.costo_por_lead, fc.costo_por_alumno], ["0.00", 2, "0.00", null]);
  // El total suma y divide con los totales.
  assert.deepEqual([r.total.gasto, r.total.leads, r.total.inscripciones_activas, r.total.costo_por_alumno], ["1833.33", 5, 2, "916.67"]);
  // Sin rango cuenta todo (el gasto de septiembre y la inscripción de septiembre).
  const todo = (await reporte()).cuerpo;
  assert.deepEqual([fila2(todo, a).gasto, fila2(todo, a).inscripciones_activas], ["1533.33", 3]);
  // Una sola campaña.
  assert.equal((await reporte(`?desde=2026-10-01&hasta=2026-10-31&campana_id=${a}`)).cuerpo.filas.length, 1);
  assert.equal((await reporte("?desde=2026-10-31&hasta=2026-10-01")).estado, 400);
});
const fila2 = (r: ReporteDeCostoPorCampana, id: string) => r.filas.find((f) => f.campana.id === id)!;

test("borrar un gasto es una baja lógica que saca el monto del reporte; solo el administrador ve costos; y no hay fuga entre organizaciones", async () => {
  const g = await gasto(b, "2026-10-20", "250.00");
  const antes = fila2((await reporte("?desde=2026-10-01&hasta=2026-10-31")).cuerpo, b).gasto;
  assert.equal((await m.recepcion.delete(`/api/campanas/${b}/gastos/${g.cuerpo.id}`)).estado, 403);
  assert.equal((await m.admin.delete(`/api/campanas/${b}/gastos/${g.cuerpo.id}`)).estado, 204);
  assert.equal(await prisma.gasto_campana.count({ where: { id: g.cuerpo.id } }), 1, "la fila sigue ahí");
  assert.equal((await prisma.gasto_campana.findFirstOrThrow({ where: { id: g.cuerpo.id } })).eliminado_en !== null, true);
  const despues = fila2((await reporte("?desde=2026-10-01&hasta=2026-10-31")).cuerpo, b).gasto;
  assert.equal(antes, "750.00");
  assert.equal(despues, "500.00");
  assert.equal((await m.admin.delete(`/api/campanas/${b}/gastos/${g.cuerpo.id}`)).estado, 404);
  assert.equal((await reporte("", m.asesorNorte)).estado, 403);
  assert.equal((await reporte("", m.recepcion)).estado, 403);
  assert.equal((await reporte("", m.maestro)).estado, 403);
  const otro = await mundoDeFinanzas(prisma, "Costo ajeno");
  try {
    assert.equal((await reporte("", otro.admin)).cuerpo.filas.length, 0);
    assert.equal((await gasto(a, "2026-10-10", "10.00", undefined, otro.admin)).estado, 404);
  } finally {
    await otro.cerrar();
  }
});

test("el rango es por DÍA LOCAL: un lead creado a las 22:00 locales del último día del mes (ya es el mes siguiente en UTC) cuenta en ese mes y no en el siguiente", async () => {
  const d = (await prisma.campana.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Campaña D", origen: "facebook" } })).id;
  await lead(d, "2026-11-01T04:00:00Z"); // 31 de octubre, 22:00 en la Ciudad de México (UTC−6)
  await lead(d, "2026-11-01T07:00:00Z"); // 1 de noviembre, 01:00 locales
  const octubre = fila2((await reporte("?desde=2026-10-01&hasta=2026-10-31")).cuerpo, d);
  const noviembre = fila2((await reporte("?desde=2026-11-01&hasta=2026-11-30")).cuerpo, d);
  assert.deepEqual([octubre.leads, noviembre.leads], [1, 1]);
});

test("la base protege el gasto aunque el código se equivoque (SQL directo): monto positivo, no se edita y no se borra; solo la baja lógica, que no se revierte", async () => {
  const g = await gasto(a, "2026-10-12", "75.50", "Prueba de blindaje");
  assert.equal(g.estado, 201);
  const rechaza = async (sql: string, defensa: RegExp) => assert.rejects(() => prisma.$executeRawUnsafe(sql, g.cuerpo.id), (e: Error) => defensa.test(e.message), sql);
  await rechaza(`UPDATE gasto_campana SET monto = 1 WHERE id = $1::uuid`, /gasto_campana_inmutable/);
  await rechaza(`UPDATE gasto_campana SET fecha = '2026-01-01' WHERE id = $1::uuid`, /gasto_campana_inmutable/);
  await rechaza(`UPDATE gasto_campana SET nota = 'otra' WHERE id = $1::uuid`, /gasto_campana_inmutable/);
  await rechaza(`DELETE FROM gasto_campana WHERE id = $1::uuid`, /gasto_campana_inmutable/);
  await assert.rejects(() => prisma.$executeRawUnsafe(`INSERT INTO gasto_campana (organizacion_id, campana_id, fecha, monto) VALUES ($1::uuid, $2::uuid, current_date, 0)`, m.org.organizacionId, a), /gasto_campana_monto_check/);
  await assert.rejects(() => prisma.$executeRawUnsafe(`INSERT INTO gasto_campana (organizacion_id, campana_id, fecha, monto) VALUES ($1::uuid, $2::uuid, current_date, -5)`, m.org.organizacionId, a), /gasto_campana_monto_check/);
  assert.equal((await m.admin.delete(`/api/campanas/${a}/gastos/${g.cuerpo.id}`)).estado, 204);
  await rechaza(`UPDATE gasto_campana SET eliminado_en = NULL WHERE id = $1::uuid`, /gasto_campana_inmutable/);
  // Una campaña de otra organización no se puede ligar (llave foránea compuesta).
  const otro = await mundoDeFinanzas(prisma, "Gasto ajeno");
  try {
    const ajena = (await prisma.campana.create({ data: { organizacion_id: otro.org.organizacionId, nombre: "Ajena", origen: "otro" } })).id;
    await assert.rejects(() => prisma.$executeRawUnsafe(`INSERT INTO gasto_campana (organizacion_id, campana_id, fecha, monto) VALUES ($1::uuid, $2::uuid, current_date, 10)`, m.org.organizacionId, ajena), /gasto_campana_campana_id_organizacion_id_fkey|foreign key/i);
  } finally {
    await otro.cerrar();
  }
});

test("concurrencia: 25 capturas simultáneas del mismo gasto no pierden ni inventan un centavo (el reporte suma exacto)", async () => {
  const e = (await prisma.campana.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Campaña E", origen: "tiktok" } })).id;
  const montos = Array.from({ length: 25 }, (_, i) => `${100 + i}.${String((i * 7) % 100).padStart(2, "0")}`);
  const rs = await Promise.all(montos.map((x) => gasto(e, "2026-10-15", x)));
  assert.ok(rs.every((r) => r.estado === 201), JSON.stringify(rs.filter((r) => r.estado !== 201).map((r) => r.cuerpo)));
  const esperado = montos.reduce((acc, x) => acc + BigInt(x.replace(".", "")), 0n);
  const texto = `${esperado / 100n}.${String(esperado % 100n).padStart(2, "0")}`;
  assert.equal(fila2((await reporte("?desde=2026-10-01&hasta=2026-10-31")).cuerpo, e).gasto, texto);
  assert.equal((await m.admin.get<{ total: string }>(`/api/campanas/${e}/gastos`)).cuerpo.total, texto);
});

test("una clase REAGENDADA no cuenta (la nueva ocupa su lugar y sí cuenta): el costo por clase muestra no se infla", async () => {
  const f = (await prisma.campana.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Campaña F", origen: "facebook" } })).id;
  await lead(f, "2026-10-14T16:00:00Z", { clase: "agendada" });
  const l2 = await prisma.lead.findFirstOrThrow({ where: { campana_id: f } });
  await prisma.clase_muestra.create({ data: { organizacion_id: m.org.organizacionId, lead_id: l2.id, prospecto_id: (await prisma.prospecto.findFirstOrThrow({ where: { lead_id: l2.id } })).id, grupo_id: grupo, fecha_hora: new Date("2026-10-13T16:00:00Z"), estatus: "reagendada", agendada_por: "usuario", agendada_por_usuario_id: m.adminId } });
  assert.equal((await m.admin.post(`/api/campanas/${f}/gastos`, { fecha: "2026-10-14", monto: "100.00" })).estado, 201);
  const fila = fila2((await reporte("?desde=2026-10-01&hasta=2026-10-31")).cuerpo, f);
  assert.deepEqual([fila.leads, fila.clases_muestra, fila.costo_por_clase_muestra], [1, 1, "100.00"]);
});

test("EK-I04: el alta de un gasto es idempotente con clave: el reintento y la carrera de 20 envíos iguales dejan UN gasto; la misma clave con otro monto es 409; sin clave todo sigue igual", async () => {
  const nueva = (await prisma.campana.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Campaña idempotente", origen: "facebook" } })).id;
  const enviar = (clave: string | undefined, monto = "777.77") => m.admin.post<{ id: string; repetido?: boolean }>(`/api/campanas/${nueva}/gastos`, { fecha: "2026-10-03", monto, nota: "Idempotente", ...(clave ? { clave_idempotencia: clave } : {}) });
  const primero = await enviar("gasto-clave-0001");
  assert.equal(primero.estado, 201, JSON.stringify(primero.cuerpo));
  const otra = await enviar("gasto-clave-0001");
  assert.deepEqual([otra.estado, otra.cuerpo.id, otra.cuerpo.repetido], [200, primero.cuerpo.id, true], "el reintento devuelve el mismo gasto");
  assert.equal((await enviar("gasto-clave-0001", "1.00")).estado, 409, "la misma clave con otro contenido");
  const rafaga = await Promise.all(Array.from({ length: 20 }, () => enviar("gasto-clave-0002")));
  assert.deepEqual([...new Set(rafaga.map((r) => r.estado))].sort(), [200, 201], "uno crea y el resto recibe el mismo");
  assert.equal(new Set(rafaga.map((r) => r.cuerpo.id)).size, 1);
  assert.equal(rafaga.filter((r) => r.estado === 201).length, 1);
  // Sin clave: dos envíos iguales son dos gastos (el contrato anterior).
  assert.equal((await enviar(undefined)).estado, 201);
  assert.equal((await enviar(undefined)).estado, 201);
  const lista = await m.admin.get<{ datos: unknown[]; total: string }>(`/api/campanas/${nueva}/gastos`);
  assert.deepEqual([lista.cuerpo.datos.length, lista.cuerpo.total], [4, "3111.08"], "777.77 × 4: la clave 1, la clave 2 y los dos sin clave");
  // Dado de baja, la clave queda libre (se puede volver a capturar).
  await m.admin.delete(`/api/campanas/${nueva}/gastos/${primero.cuerpo.id}`);
  assert.equal((await enviar("gasto-clave-0001")).estado, 201);
  assert.equal((await m.admin.post(`/api/campanas/${nueva}/gastos`, { fecha: "2026-10-03", monto: "1.00", clave_idempotencia: "corta" })).estado, 400, "clave inválida");
});

test("EK-I03: «clases asistidas» cuenta SOLO las que asistieron (no las no asistidas ni las agendadas) (las no asistidas, agendadas y canceladas sí cuentan como clases muestra; solo las reagendadas no)", async () => {
  const nueva = (await prisma.campana.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Campaña de asistencias", origen: "tiktok" } })).id;
  for (const estatus of ["asistio", "no_asistio", "agendada", "cancelada", "asistio", "reagendada"] as const) {
    const fam = await sembrarFamilia(prisma, m.org, {});
    await prisma.lead.update({ where: { id: fam.leadId }, data: { campana_id: nueva, creado_en: new Date("2026-10-07T16:00:00Z") } });
    await prisma.clase_muestra.create({ data: { organizacion_id: m.org.organizacionId, lead_id: fam.leadId, prospecto_id: fam.prospectoId, grupo_id: grupo, fecha_hora: new Date("2026-10-07T18:00:00Z"), estatus, agendada_por: "usuario", agendada_por_usuario_id: m.adminId } });
  }
  const f = (await reporte(`?campana_id=${nueva}`)).cuerpo.filas[0]!;
  assert.deepEqual([f.leads, f.clases_muestra, f.clases_asistidas], [6, 5, 2]);
});
