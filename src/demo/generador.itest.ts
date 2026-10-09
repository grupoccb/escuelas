// I4: los datos de demo. Se generan por los servicios REALES (no inserts a ciegas), de forma determinista (misma semilla → misma historia), idempotente (volver a correrlo no duplica; sus filas
// están marcadas) y con la cuadratura en verde al terminar. Estas pruebas usan una base de pruebas y un tamaño chico; la corrida completa (300 alumnos, 6 meses) la hace el comando.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeFinanzas, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { sembrarPrograma } from "../testutil/semilla.ts";
import { InscripcionesActivas } from "../catalogo/cupo.ts";
import { conAlcance } from "../datos/alcance.ts";
import { cuadratura } from "../finanzas/cuadratura.ts";
import { reporteDeCostoPorCampana } from "../reportes/costo-campana.ts";
import { reporteEjecutivo } from "../reportes/ejecutivo.ts";
import { generarDatosDeDemo, MARCA_DE_DEMO, type ResumenDeDemo } from "./generador.ts";

let prisma: PrismaPruebas;
const HASTA = new Date("2026-10-08T22:00:00Z");
const mundos: MundoDeFinanzas[] = [];

before(() => {
  prisma = crearPrismaDePruebas(undefined, 20);
});
after(async () => {
  for (const m of mundos) await m.cerrar();
  await prisma.$disconnect();
});

/** Una organización con un catálogo CHICO y determinista (los mismos nombres siempre): dos sucursales, tres programas, seis grupos de 8 lugares con dos sesiones por semana. */
async function escuela(nombre: string): Promise<MundoDeFinanzas> {
  const m = await mundoDeFinanzas(prisma, nombre, new Date("2026-10-08T16:00:00Z"));
  mundos.push(m);
  let k = 0;
  for (const [sucursal, programa, edades] of [[m.norte, "Programa 1", [4, 8]], [m.norte, "Programa 2", [9, 12]], [m.sur, "Programa 3", [5, 11]]] as const) {
    k++;
    await sembrarPrograma(prisma, m.org, {
      sucursalId: sucursal,
      nombre: programa,
      edadMin: edades[0],
      edadMax: edades[1],
      grupos: [
        { nombre: `Grupo ${k}A`, cupoMaximo: 8, horarios: [[1, 960, 1020], [3, 960, 1020]] },
        { nombre: `Grupo ${k}B`, cupoMaximo: 8, horarios: [[2, 1020, 1080], [4, 1020, 1080]] },
      ],
      precio: { inscripcion: "500.00", mensualidad: k === 2 ? "1234.50" : "900.00", desde: "2020-01-01" },
    });
  }
  return m;
}
const marca = { startsWith: MARCA_DE_DEMO };
const cuentas = async (m: MundoDeFinanzas) => ({
  leads: await m.db.lead.count({ where: { telefono: marca } }),
  cargos: await m.db.cargo.count({ where: { tutor: { telefono: marca } } }),
  pagos: await m.db.pago.count({ where: { tutor: { telefono: marca } } }),
  asistencias: await m.db.asistencia.count({ where: { inscripcion: { lead: { telefono: marca } } } }),
  inscripciones: await m.db.inscripcion.count({ where: { lead: { telefono: marca } } }),
});
const sinTiempo = (r: ResumenDeDemo) => ({ ...r, segundos: 0, cuadratura: r.cuadratura?.resumen ?? null });

let primera: { m: MundoDeFinanzas; resumen: ResumenDeDemo; traza: string[] } | undefined;
async function corridaChica() {
  if (primera) return primera;
  const m = await escuela("Demo A");
  const traza: string[] = [];
  const resumen = await generarDatosDeDemo(prisma, { organizacionId: m.org.organizacionId, hasta: HASTA, semilla: 7, alumnos: 30, meses: 3, traza: (l) => traza.push(l) });
  primera = { m, resumen, traza };
  return primera;
}

test("genera una historia de verdad por los servicios reales: leads, clases muestra, inscripciones con sus cargos, pases de lista, pagos parciales y completos, ventas, bajas — y la cuadratura da cero discrepancias", { timeout: 600_000 }, async () => {
  const { m, resumen } = await corridaChica();
  assert.equal(resumen.yaExistia, false);
  assert.ok(resumen.leads > resumen.inscripciones, `más leads (${resumen.leads}) que inscripciones (${resumen.inscripciones}): el embudo pierde gente`);
  assert.ok(resumen.inscripciones >= 20 && resumen.inscripciones <= 45, `inscripciones: ${resumen.inscripciones}`);
  assert.ok(resumen.clasesMuestra >= resumen.asistidas && resumen.asistidas >= resumen.inscripciones, JSON.stringify(sinTiempo(resumen)));
  assert.ok(resumen.pagos > 0 && resumen.pagosParciales > 0, "hay pagos completos y parciales");
  assert.ok(resumen.pases > 50, `hay pases de lista (${resumen.pases} asistencias)`);
  assert.ok(resumen.cuadratura?.ok, JSON.stringify(resumen.cuadratura?.discrepancias.slice(0, 3)));
  assert.deepEqual(resumen.catalogo, { traslapesDeEdad: 0, choquesDeSalon: 0, choquesDeInstructor: 0 }, "la historia no toca las verificaciones del catálogo");
  assert.deepEqual((await cuadratura(m.db)).discrepancias, []);
  // Seis meses de cargos: varios periodos distintos, generados por el barrido mensual.
  const periodos = new Set((await m.db.cargo.findMany({ where: { concepto: "mensualidad", tutor: { telefono: marca } }, select: { periodo: true } })).map((c) => c.periodo));
  assert.ok(periodos.size >= 3, `periodos: ${[...periodos].join(", ")}`);
  // Hubo de todo: bajas, ventas, y gente que debe (cartera vencida).
  assert.ok(resumen.bajas >= 1, "al menos una baja");
  assert.ok(resumen.ventas >= 1, "al menos una venta");
  const vencidos = await m.db.cargo.count({ where: { tutor: { telefono: marca }, estatus: { in: ["pendiente", "vencido"] }, fecha_vencimiento: { lt: new Date("2026-10-08") } } });
  assert.ok(vencidos >= 1, "hay deuda vencida (morosos y tardíos)");
  assert.ok((await m.db.cargo.count({ where: { tutor: { telefono: marca }, estatus: "pagado" } })) >= 1);
});

test("pasó por los servicios, no por inserts a ciegas: los inscritos tienen tutor y aceptaron el reglamento, el lead quedó «inscrito», la clase se marcó asistida, y la asistencia solo existe en días de sesión", async () => {
  const { m } = await corridaChica();
  const inscritos = await m.db.inscripcion.findMany({ where: { lead: { telefono: marca } }, select: { lead_id: true, prospecto_id: true, alumno: { select: { tutores: { select: { es_responsable_pago: true } } } }, cargos: { select: { concepto: true } } } });
  assert.ok(inscritos.length > 0);
  for (const i of inscritos) {
    assert.ok(i.alumno.tutores.some((t) => t.es_responsable_pago), "tiene responsable de pago");
    assert.ok(i.cargos.some((c) => c.concepto === "inscripcion") && i.cargos.some((c) => c.concepto === "mensualidad"), "tiene su cargo de inscripción y su mensualidad");
    assert.ok(await m.db.aceptacion_legal.findFirst({ where: { prospecto_id: i.prospecto_id!, tipo: "reglamento", resultado: "aceptada" }, select: { id: true } }), "aceptó el reglamento");
    assert.ok(await m.db.clase_muestra.findFirst({ where: { lead_id: i.lead_id!, estatus: "asistio" }, select: { id: true } }), "la clase muestra de su familia se marcó asistida");
  }
  const etapa = await m.db.lead.findMany({ where: { telefono: marca, id: { in: inscritos.map((i) => i.lead_id!) } }, select: { etapa: { select: { tipo_sistema: true } } } });
  assert.ok(etapa.every((l) => l.etapa.tipo_sistema === "inscrito"));
  // Origen de campaña: hay leads con fuente (campañas de apoyo con su código de rastreo).
  assert.ok((await m.db.lead.count({ where: { telefono: marca, campana_id: { not: null } } })) > 0);
  assert.ok((await m.db.campana.count({ where: { nombre: { startsWith: "Demo:" } } })) === 4);
  assert.ok((await m.db.gasto_campana.count()) > 0, "el gasto de las campañas capturado a mano");
  // Reportes sobre estos datos: los números cierran con la base.
  const r = await m.admin.get<{ activos: { total_inscripciones: number }; ingreso_mensual_recurrente: string }>("/api/reportes/ejecutivo?mes=2026-10");
  assert.equal(r.estado, 200);
  const activas = await m.db.inscripcion.count({ where: { estatus: "activa" } });
  assert.equal(r.cuerpo.activos.total_inscripciones, activas);
});

test("es IDEMPOTENTE: volver a correrlo no duplica nada y lo dice (yaExistia)", { timeout: 300_000 }, async () => {
  const { m } = await corridaChica();
  const antes = await cuentas(m);
  const otra = await generarDatosDeDemo(prisma, { organizacionId: m.org.organizacionId, hasta: HASTA, semilla: 7, alumnos: 30, meses: 3 });
  assert.equal(otra.yaExistia, true);
  assert.deepEqual(await cuentas(m), antes);
  assert.ok(otra.cuadratura?.ok);
  assert.equal(otra.inscripciones, antes.inscripciones);
});

test("una corrida INTERRUMPIDA (hay filas marcadas pero falta el gasto final) se detecta: no se completa duplicando ni se da por buena", { timeout: 300_000 }, async () => {
  const b = await escuela("Demo interrumpida");
  const entrada = { organizacionId: b.org.organizacionId, hasta: HASTA, semilla: 5, alumnos: 8, meses: 2 };
  await generarDatosDeDemo(prisma, entrada);
  // Se simula la interrupción: lo último que hace el generador es el gasto de las campañas.
  await b.db.gasto_campana.updateMany({ where: {}, data: { eliminado_en: new Date() } });
  const antes = await cuentas(b);
  await assert.rejects(() => generarDatosDeDemo(prisma, entrada), /a medias/);
  assert.deepEqual(await cuentas(b), antes, "no agregó ni una fila");
});

test("es DETERMINISTA: la misma semilla en otra organización con el mismo catálogo genera exactamente la misma historia; otra semilla, otra", { timeout: 900_000 }, async () => {
  const { resumen, traza } = await corridaChica();
  const b = await escuela("Demo B");
  const trazaB: string[] = [];
  const igual = await generarDatosDeDemo(prisma, { organizacionId: b.org.organizacionId, hasta: HASTA, semilla: 7, alumnos: 30, meses: 3, traza: (l) => trazaB.push(l) });
  assert.deepEqual(sinTiempo(igual), sinTiempo(resumen));
  assert.ok(traza.length > 500, `la traza tiene cuerpo (${traza.length} líneas)`);
  assert.deepEqual(trazaB, traza, "cada evento, pago y pase de la historia es el mismo, línea por línea (no solo los totales)");
  const c = await escuela("Demo C");
  const distinta = await generarDatosDeDemo(prisma, { organizacionId: c.org.organizacionId, hasta: HASTA, semilla: 8, alumnos: 30, meses: 3 });
  assert.notDeepEqual(sinTiempo(distinta), sinTiempo(resumen));
  assert.ok(distinta.cuadratura?.ok);
});

test("el comando no corre contra la base de la demo salvo que se pida explícitamente, y contra una base de pruebas genera y cuadra", { timeout: 300_000 }, async () => {
  const sinConfirmar = spawnSync(process.execPath, ["scripts/demo-datos.ts"], { env: { ...process.env, DATABASE_URL: "postgresql://inscripciones:inscripciones@localhost:5432/inscripciones" }, encoding: "utf8" });
  assert.equal(sinConfirmar.status, 2);
  assert.match(sinConfirmar.stderr, /--confirmar-base-de-demo/);
  const m = await escuela("Demo comando");
  const salida = execFileSync(process.execPath, ["scripts/demo-datos.ts", "--organizacion", m.org.organizacionId, "--alumnos", "10", "--meses", "2", "--hasta", "2026-10-08", "--semilla", "3"], { env: { ...process.env, DATABASE_URL: process.env["DATABASE_URL"]! }, encoding: "utf8" });
  assert.match(salida, /Datos de demo generados/);
  assert.match(salida, /✓ cuadra/);
  const otra = execFileSync(process.execPath, ["scripts/demo-datos.ts", "--organizacion", m.org.organizacionId, "--hasta", "2026-10-08"], { env: { ...process.env, DATABASE_URL: process.env["DATABASE_URL"]! }, encoding: "utf8" });
  assert.match(otra, /Ya había datos de demo/);
});

const ID_FIJO = /00000000-0000-4000-8000-000000000(\d{3})/g;
// El mismo orden con el que `docker-compose.yml` carga la demo.
const SEEDS = ["demo", "catalogo", "catalogo-completo", "clase-muestra", "seguimiento", "progresion"] as const;

test("LENTA — la demo completa: 300 alumnos y seis meses sobre el catálogo REAL del seed (tres verticales, dos sucursales); cuadra, el catálogo sigue verde y los reportes salen de estos datos", { timeout: 3_600_000, skip: process.env["SALTAR_PRUEBAS_LENTAS"] ? "SALTAR_PRUEBAS_LENTAS está definida" : false }, async () => {
  const prefijo = randomBytes(4).toString("hex");
  const orgId = `${prefijo}-0000-4000-8000-000000000001`;
  const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await cliente.connect();
  try {
    for (const seed of SEEDS) await cliente.query(readFileSync(`prisma/seed/${seed}.sql`, "utf8").replace(ID_FIJO, `${prefijo}-0000-4000-8000-000000000$1`).replaceAll("escuela-demo", `escuela-${prefijo}`));
  } finally {
    await cliente.end();
  }
  const r = await generarDatosDeDemo(prisma, { organizacionId: orgId, hasta: HASTA });
  assert.equal(r.yaExistia, false);
  const db = conAlcance(prisma, orgId);
  // Alrededor de 300 alumnos: el catálogo del seed tiene 300 lugares y las bajas liberan algunos.
  const alumnos = await db.alumno.count({ where: { inscripciones: { some: { lead: { telefono: { startsWith: MARCA_DE_DEMO } } } } } });
  assert.ok(alumnos >= 250 && alumnos <= 330, `alumnos inscritos: ${alumnos}`);
  assert.ok(r.inscripciones >= alumnos && r.bajas >= 10 && r.pagos > 500 && r.pagosParciales > 50 && r.ventas > 20 && r.pases > 5_000, JSON.stringify({ ...r, cuadratura: null }));
  assert.ok(r.cuadratura?.ok, JSON.stringify(r.cuadratura?.discrepancias.slice(0, 3)));
  assert.deepEqual(r.catalogo, { traslapesDeEdad: 0, choquesDeSalon: 0, choquesDeInstructor: 0 });
  // Seis meses de mensualidades.
  const periodos = new Set((await db.cargo.findMany({ where: { concepto: "mensualidad" }, select: { periodo: true } })).map((c) => c.periodo));
  assert.ok(periodos.size >= 6, [...periodos].join(", "));
  // Los reportes de I1 a I3 leen estos datos y cuadran con la base.
  const ejecutivo = await reporteEjecutivo(db, { mes: "2026-10", ahora: HASTA, fuente: new InscripcionesActivas() });
  assert.equal(ejecutivo.activos.total_inscripciones, await db.inscripcion.count({ where: { estatus: "activa" } }));
  assert.ok(ejecutivo.ocupacion_por_grupo.some((g) => g.ocupados > 0));
  const costo = await reporteDeCostoPorCampana(db, {});
  assert.equal(costo.filas.length, 4);
  assert.ok(costo.total.inscripciones_activas > 0 && costo.total.costo_por_alumno !== null);
  // Es idempotente también a este tamaño.
  const otra = await generarDatosDeDemo(prisma, { organizacionId: orgId, hasta: HASTA });
  assert.equal(otra.yaExistia, true);
  assert.equal(otra.inscripciones, r.inscripciones);
});
