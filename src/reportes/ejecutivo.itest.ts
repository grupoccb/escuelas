// I3: el reporte ejecutivo — activos por vertical y sucursal, altas y bajas del mes, deserción, ingreso mensual recurrente, cartera vencida y ocupación por grupo con la fuente real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { InscripcionesActivas } from "../catalogo/cupo.ts";
import { deDecimal, deTexto, sumar } from "../lib/dinero.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { OcupacionFija } from "../testutil/semilla.ts";
import { cuadratura } from "../finanzas/cuadratura.ts";
import { estadoDeCuentaDeFamilia } from "../finanzas/estado-cuenta.ts";
import { levantarApi, sembrarUsuario } from "../testutil/api.ts";
import { mundoDeFinanzas, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { estadoDeOcupacion, type ReporteEjecutivo } from "./ejecutivo.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;
const ids: Record<string, string> = {};
let grupoNorte: string;
let grupoSur: string;
let grupoVacio: string;

before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeFinanzas(prisma, "Ejecutivo");
  grupoNorte = (await m.programa({ sucursalId: m.norte, cupo: 4, mensualidad: "1000.00" })).grupoId;
  grupoSur = (await m.programa({ sucursalId: m.sur, cupo: 2, mensualidad: "777.77" })).grupoId;
  grupoVacio = (await m.programa({ sucursalId: m.norte, cupo: 10, mensualidad: "500.00" })).grupoId;
  // Octubre: cinco inscripciones (tres en el norte, dos en el sur).
  m.reloj.ahora = new Date("2026-10-05T16:00:00Z");
  for (const [clave, grupo] of [["A1", grupoNorte], ["A2", grupoNorte], ["A3", grupoNorte], ["B1", grupoSur], ["B2", grupoSur]] as const) ids[clave] = (await m.inscribir({ grupoId: grupo })).inscripcionId;
  m.reloj.ahora = new Date("2026-10-20T16:00:00Z");
  assert.equal((await m.admin.post(`/api/inscripciones/${ids["A3"]}/baja`, { motivo_baja_id: m.motivoBaja })).estado, 200);
  // Noviembre: dos altas, una baja y una congelada.
  m.reloj.ahora = new Date("2026-11-10T16:00:00Z");
  ids["A4"] = (await m.inscribir({ grupoId: (await m.programa({ sucursalId: m.norte, cupo: 3, mensualidad: "1000.00" })).grupoId })).inscripcionId;
  assert.equal((await m.admin.post(`/api/inscripciones/${ids["B1"]}/baja`, { motivo_baja_id: m.motivoBaja })).estado, 200);
  assert.equal((await m.admin.post(`/api/inscripciones/${ids["A2"]}/congelar`)).estado, 200);
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});
const reporte = (qs = "", cliente = m.admin) => cliente.get<ReporteEjecutivo & { error?: unknown }>(`/api/reportes/ejecutivo${qs}`);

test("estadoDeOcupacion: a reventar desde el 90 %, vacío hasta el 25 %", () => {
  assert.equal(estadoDeOcupacion(9, 10), "a_reventar");
  assert.equal(estadoDeOcupacion(10, 10), "a_reventar");
  assert.equal(estadoDeOcupacion(12, 10), "a_reventar", "más inscritos que cupo (se bajó el cupo)");
  assert.equal(estadoDeOcupacion(8, 10), "normal");
  assert.equal(estadoDeOcupacion(3, 10), "normal");
  assert.equal(estadoDeOcupacion(2, 8), "vacio", "25 % justo");
  assert.equal(estadoDeOcupacion(0, 10), "vacio");
});

test("activos, altas, bajas, deserción e ingreso mensual recurrente de noviembre, en cifras exactas", async () => {
  const r = (await reporte("?mes=2026-11")).cuerpo;
  assert.equal(r.mes, "2026-11");
  // Activas hoy: A1 y A4 (norte), B2 (sur). A2 está congelada, A3 y B1 de baja.
  assert.deepEqual([r.activos.total_alumnos, r.activos.total_inscripciones], [3, 3]);
  const norte = r.activos.por_vertical_y_sucursal.find((f) => f.sucursal.nombre === "Norte")!;
  const sur = r.activos.por_vertical_y_sucursal.find((f) => f.sucursal.nombre === "Sur")!;
  assert.deepEqual([norte.alumnos, norte.inscripciones, norte.ingreso_mensual_recurrente], [2, 2, "2000.00"]);
  assert.deepEqual([sur.alumnos, sur.inscripciones, sur.ingreso_mensual_recurrente], [1, 1, "777.77"]);
  assert.equal(r.ingreso_mensual_recurrente, "2777.77");
  // Altas: A4 (noviembre). Bajas: B1 (noviembre). Base al 1.º de noviembre: A1, A2, B1, B2 (A3 se dio de baja en octubre).
  assert.deepEqual([r.altas_del_mes, r.bajas_del_mes, r.base_al_inicio_del_mes, r.desercion, r.desercion_texto], [1, 1, 4, "25.0", "25.0 %"]);
  const octubre = (await reporte("?mes=2026-10")).cuerpo;
  assert.deepEqual([octubre.altas_del_mes, octubre.bajas_del_mes, octubre.base_al_inicio_del_mes, octubre.desercion], [5, 1, 0, null], "sin base no hay deserción (null → «—»)");
  assert.equal(octubre.desercion_texto, "—");
});

test("cartera vencida: la suma de los saldos de lo vencido y sus renglones de antigüedad cuadran con una suma independiente", async () => {
  const r = (await reporte("?mes=2026-11")).cuerpo;
  const abiertos = await prisma.cargo.findMany({ where: { organizacion_id: m.org.organizacionId, estatus: { in: ["pendiente", "vencido"] }, fecha_vencimiento: { lt: new Date("2026-11-10") } }, select: { monto_final: true, monto_pagado: true } });
  const esperado = sumar(...abiertos.map((c) => deDecimal(c.monto_final) - deDecimal(c.monto_pagado)));
  assert.ok(esperado > 0n);
  assert.equal(deTexto(r.cartera_vencida.total), esperado);
  const renglones = sumar(...Object.values(r.cartera_vencida.antiguedad).map(deTexto));
  assert.equal(renglones, esperado);
  // Un pago reduce la cartera exactamente por su monto.
  const t = (await prisma.tutor_alumno.findFirstOrThrow({ where: { alumno: { inscripciones: { some: { id: ids["A1"]! } } } }, select: { tutor_id: true } })).tutor_id;
  assert.equal((await m.recepcion.post("/api/pagos", { tutor_id: t, monto: "100.00", metodo: "efectivo" })).estado, 201);
  const despues = (await reporte("?mes=2026-11")).cuerpo;
  assert.equal(deTexto(despues.cartera_vencida.total), esperado - 10000n);
});

test("ocupación por grupo con la FUENTE REAL: las inscripciones activas; a reventar y vacío; y una fuente distinta cambia el reporte sin tocar el código", async () => {
  const r = (await reporte("?mes=2026-11")).cuerpo;
  const grupo = (id: string) => r.ocupacion_por_grupo.find((g) => g.grupo.id === id)!;
  assert.deepEqual([grupo(grupoNorte).ocupados, grupo(grupoNorte).cupo_maximo, grupo(grupoNorte).ocupacion, grupo(grupoNorte).estado], [1, 4, "25.0", "vacio"], "solo A1 está activa en ese grupo");
  assert.deepEqual([grupo(grupoSur).ocupados, grupo(grupoSur).ocupacion, grupo(grupoSur).estado], [1, "50.0", "normal"]);
  assert.deepEqual([grupo(grupoVacio).ocupados, grupo(grupoVacio).ocupacion, grupo(grupoVacio).estado], [0, "0.0", "vacio"]);
  // Más ocupados primero.
  assert.equal(r.ocupacion_por_grupo[0]!.ocupacion, "50.0");
  // La misma cuenta que la fuente de la inscripción y el cotizador.
  const db = m.db;
  assert.equal(await new InscripcionesActivas().ocupados(db, grupoNorte), 1);
  // Otra fuente (inyectada) manda: el reporte no cuenta por su cuenta.
  const fija = new OcupacionFija();
  fija.fijar(grupoSur, 2);
  fija.fijar(grupoVacio, 10);
  const api = levantarApi(prisma, { reloj: () => m.reloj.ahora, fuenteOcupacion: fija });
  try {
    const u = await sembrarUsuario(prisma, m.org.organizacionId, { rol: "administrador" });
    const c = api.cliente();
    await c.login(m.org.slug, u.correo, u.contrasena);
    const x = (await c.get<ReporteEjecutivo>("/api/reportes/ejecutivo?mes=2026-11")).cuerpo;
    const g = (id: string) => x.ocupacion_por_grupo.find((y) => y.grupo.id === id)!;
    assert.deepEqual([g(grupoSur).estado, g(grupoSur).ocupacion, g(grupoVacio).estado, g(grupoNorte).ocupados], ["a_reventar", "100.0", "a_reventar", 0]);
  } finally {
    await api.cerrar();
  }
});

test("cartera vencida: coincide con la suma de lo vencido de los estados de cuenta de todas las familias, y la cuadratura del dinero sigue limpia", async () => {
  const r = (await reporte("?mes=2026-11")).cuerpo;
  const tutores = await prisma.tutor.findMany({ where: { organizacion_id: m.org.organizacionId }, select: { id: true } });
  let porEstadoDeCuenta = 0n;
  for (const t of tutores) porEstadoDeCuenta += deTexto((await estadoDeCuentaDeFamilia(m.db, t.id, m.reloj.ahora)).resumen.vencido);
  assert.ok(porEstadoDeCuenta > 0n);
  assert.equal(deTexto(r.cartera_vencida.total), porEstadoDeCuenta, "el tablero y los estados de cuenta cuentan lo mismo");
  assert.deepEqual((await cuadratura(m.db)).discrepancias, []);
});

test("permisos: el administrador ve todo; el asesor, solo SUS sucursales (inscripciones, cartera y grupos); recepción y maestro no ven el dinero del negocio; el mes inválido es 400; sin sesión 401; otra organización no ve nada", async () => {
  const todo = (await reporte("?mes=2026-11")).cuerpo;
  const norte = (await reporte("?mes=2026-11", m.asesorNorte));
  const sur = (await reporte("?mes=2026-11", m.asesorSur));
  assert.deepEqual([norte.estado, sur.estado], [200, 200]);
  assert.deepEqual(norte.cuerpo.activos.por_vertical_y_sucursal.map((f) => f.sucursal.nombre), ["Norte"]);
  assert.deepEqual(sur.cuerpo.activos.por_vertical_y_sucursal.map((f) => f.sucursal.nombre), ["Sur"]);
  assert.deepEqual([norte.cuerpo.activos.total_alumnos, norte.cuerpo.ingreso_mensual_recurrente, sur.cuerpo.activos.total_alumnos, sur.cuerpo.ingreso_mensual_recurrente], [2, "2000.00", 1, "777.77"]);
  assert.equal(deTexto(norte.cuerpo.cartera_vencida.total) + deTexto(sur.cuerpo.cartera_vencida.total), deTexto(todo.cartera_vencida.total), "lo de cada sucursal suma lo de la escuela");
  assert.ok(norte.cuerpo.ocupacion_por_grupo.every((g) => g.sucursal.nombre === "Norte") && sur.cuerpo.ocupacion_por_grupo.every((g) => g.sucursal.nombre === "Sur"));
  assert.deepEqual([norte.cuerpo.altas_del_mes, norte.cuerpo.bajas_del_mes, sur.cuerpo.altas_del_mes, sur.cuerpo.bajas_del_mes], [1, 0, 0, 1]);
  assert.equal((await reporte("", m.recepcion)).estado, 403);
  assert.equal((await reporte("", m.maestro)).estado, 403);
  assert.equal((await m.api.cliente().get("/api/reportes/ejecutivo")).estado, 401);
  assert.equal((await reporte("?mes=2026-13")).estado, 400);
  assert.equal((await reporte("?mes=noviembre")).estado, 400);
  assert.equal((await reporte("")).cuerpo.mes, "2026-11", "por omisión, el mes en curso en la zona de la sucursal");
  const otro = await mundoDeFinanzas(prisma, "Ejecutivo ajeno");
  try {
    const x = (await reporte("?mes=2026-11", otro.admin)).cuerpo;
    assert.deepEqual([x.activos.total_alumnos, x.ocupacion_por_grupo.length, x.ingreso_mensual_recurrente, x.cartera_vencida.total], [0, 0, "0.00", "0.00"]);
  } finally {
    await otro.cerrar();
  }
});

test("ocupación por grupo SIN importes: cada rol ve sus grupos (el maestro, solo los que imparte); el JSON no trae dinero ni salud", async () => {
  const ocupacion = (cliente: typeof m.admin) => cliente.get<{ datos: ReporteEjecutivo["ocupacion_por_grupo"] }>("/api/reportes/ocupacion");
  const admin = await ocupacion(m.admin);
  assert.equal(admin.estado, 200);
  const ids = admin.cuerpo.datos.map((g) => g.grupo.id);
  assert.ok([grupoNorte, grupoSur, grupoVacio].every((g) => ids.includes(g)));
  assert.ok((await ocupacion(m.asesorNorte)).cuerpo.datos.every((g) => g.sucursal.nombre === "Norte"));
  assert.ok((await ocupacion(m.recepcion)).cuerpo.datos.every((g) => g.sucursal.nombre === "Norte"), "recepción de la sucursal norte");
  // Un maestro que imparte UN grupo ve solo ese grupo.
  const u = await sembrarUsuario(prisma, m.org.organizacionId, { rol: "maestro" });
  await prisma.instructor.create({ data: { organizacion_id: m.org.organizacionId, usuario_id: u.id, nombre: "Maestro del reporte" } });
  const instructor = await prisma.instructor.findFirstOrThrow({ where: { usuario_id: u.id } });
  await prisma.grupo.update({ where: { id: grupoSur }, data: { instructor_id: instructor.id } });
  const maestro = m.api.cliente();
  assert.equal((await maestro.login(m.org.slug, u.correo, u.contrasena)).estado, 201);
  const suyo = await ocupacion(maestro);
  assert.equal(suyo.estado, 200);
  assert.deepEqual(suyo.cuerpo.datos.map((g) => g.grupo.id), [grupoSur]);
  assert.deepEqual([suyo.cuerpo.datos[0]!.ocupados, suyo.cuerpo.datos[0]!.cupo_maximo, suyo.cuerpo.datos[0]!.ocupacion], [1, 2, "50.0"]);
  assert.doesNotMatch(JSON.stringify(suyo.cuerpo), /monto|precio|ingreso|cartera|saldo|salud|alergia/i, "el maestro no ve importes");
  assert.equal((await maestro.get("/api/reportes/ejecutivo")).estado, 403);
  assert.equal((await m.api.cliente().get("/api/reportes/ocupacion")).estado, 401);
});

test("el ingreso mensual recurrente usa la mensualidad CONGELADA: precio de lista menos el descuento fijo de mensualidad con el que se inscribió", async () => {
  const otro = await mundoDeFinanzas(prisma, "Ejecutivo descuento");
  try {
    const p = await prisma.promocion.create({ data: { organizacion_id: otro.org.organizacionId, nombre: "Descuento fijo", codigo: `D${randomUUID().slice(0, 8)}`, vigencia_desde: new Date("2020-01-01"), condicion_tipo: "sin_condicion", acumulable: true, prioridad: 5 } });
    await prisma.promocion_beneficio.create({ data: { organizacion_id: otro.org.organizacionId, promocion_id: p.id, tipo: "descuento_mensualidad", modo: "monto_fijo", valor: "50.00" } });
    const { grupoId } = await otro.programa({ mensualidad: "1000.00" });
    await otro.inscribir({ grupoId });
    await prisma.promocion.update({ where: { id: p.id }, data: { activo: false } });
    await otro.inscribir({ grupoId }); // esta ya sin la promoción: 1000.00
    const r = (await otro.admin.get<ReporteEjecutivo>("/api/reportes/ejecutivo?mes=2026-11")).cuerpo;
    assert.equal(r.ingreso_mensual_recurrente, "1950.00", "950.00 (con el descuento congelado) + 1000.00");
    assert.equal(r.activos.por_vertical_y_sucursal[0]!.ingreso_mensual_recurrente, "1950.00");
  } finally {
    await otro.cerrar();
  }
});

test("los bordes del mes: una alta o una baja del día 1 y del último día cuentan en el mes; la del día anterior y la del siguiente, no", async () => {
  const otro = await mundoDeFinanzas(prisma, "Ejecutivo bordes");
  try {
    const { grupoId } = await otro.programa({ cupo: 20 });
    const dia = (fecha: string) => void (otro.reloj.ahora = new Date(`${fecha}T16:00:00Z`));
    const ids: Record<string, string> = {};
    for (const f of ["2026-10-31", "2026-11-01", "2026-11-30", "2026-12-01"]) {
      dia(f);
      ids[f] = (await otro.inscribir({ grupoId })).inscripcionId;
    }
    // Bajas: la del 31 de octubre y la del 1.º de diciembre quedan fuera de noviembre; las del 1.º y el 30 de noviembre, dentro.
    for (const [f, quien] of [["2026-10-31", "2026-10-31"], ["2026-11-01", "2026-11-01"], ["2026-11-30", "2026-11-30"], ["2026-12-01", "2026-12-01"]] as const) {
      dia(f);
      assert.equal((await otro.admin.post(`/api/inscripciones/${ids[quien]}/baja`, { motivo_baja_id: otro.motivoBaja })).estado, 200);
    }
    dia("2026-12-15");
    const r = (await otro.admin.get<ReporteEjecutivo>("/api/reportes/ejecutivo?mes=2026-11")).cuerpo;
    assert.deepEqual([r.altas_del_mes, r.bajas_del_mes], [2, 2], "altas: 1 y 30 de noviembre; bajas: 1 y 30 de noviembre");
    assert.equal(r.base_al_inicio_del_mes, 0, "la del 31 de octubre se dio de baja ese mismo día: no hay base");
  } finally {
    await otro.cerrar();
  }
});
