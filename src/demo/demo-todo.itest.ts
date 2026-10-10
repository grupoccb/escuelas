// V12: la siembra de `npm run demo:todo`, sin Docker: sobre una base propia con las migraciones y los mismos archivos de datos que usa compose (`demo-preparar`), se corre lo
// que el comando corre (`generarDatosDeDemo` y `sembrarDemoViva`) y se comprueba lo que la persona va a ver: los cuatro usuarios con su rol, los siete módulos encendidos, el
// catálogo de las tres disciplinas con sus plantillas y automatizaciones, la historia determinista, lo de hoy para el maestro, los leads del asesor, el cobro de recepción,
// la cuadratura en verde y que repetirlo no cambia nada. Las horas se calculan de un «ahora» fijo (lunes y domingo), no del reloj de la máquina.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { borrarBaseDeDemo, recrearBaseDeDemo } from "../../scripts/lib/base-de-demo.ts";
import { crearPrismaDePruebas, exigirBaseDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { conAlcance, type BaseDatos } from "../datos/alcance.ts";
import { cuadratura } from "../finanzas/cuadratura.ts";
import { leerModulos } from "../modulos/index.ts";
import { normalizarTelefono } from "../lib/telefono.ts";
import { fechaLocal } from "../lib/horario.ts";
import { generarDatosDeDemo, MARCA_DE_DEMO, verificarCatalogo } from "./generador.ts";
import { FAMILIA_CON_COBRO, MARCA_DE_DEMO_VIVA, sembrarDemoViva } from "./vivos.ts";

const stem = new URL(process.env["DATABASE_URL"] ?? "postgresql://x/inscripciones_pruebas").pathname.slice(1).replace(/_pruebas$/, "");
const BASE_A = `${stem}_demo_todo_a_pruebas`;
const BASE_B = `${stem}_demo_todo_b_pruebas`;
const BASE_C = `${stem}_demo_todo_c_pruebas`;
const servidor = (): string => {
  exigirBaseDePruebas(process.env["DATABASE_URL"]);
  return process.env["DATABASE_URL"]!;
};
/** Un lunes a las 11:00 en la Ciudad de México (UTC−6 en esa fecha). */
const LUNES = new Date("2026-10-12T17:00:00Z");
/** Un domingo: ningún grupo de la demo da clase. */
const DOMINGO = new Date("2026-10-11T17:00:00Z");
const HASTA = new Date("2026-10-12T22:00:00Z");
const PEQUENO = { semilla: 7, alumnos: 24, meses: 2 } as const;

interface Sembrada {
  url: string;
  prisma: PrismaPruebas;
  db: BaseDatos;
  organizacionId: string;
}
const abiertas: PrismaPruebas[] = [];

async function sembrar(base: string, ahora: Date, llenarGrupos = false): Promise<Sembrada & { historia: Awaited<ReturnType<typeof generarDatosDeDemo>>; viva: Awaited<ReturnType<typeof sembrarDemoViva>> }> {
  const url = await recrearBaseDeDemo(servidor(), base, /_demo_todo_[abc]_pruebas$/);
  const prisma = crearPrismaDePruebas(url, 10);
  abiertas.push(prisma);
  const org = await prisma.organizacion.findFirstOrThrow({ where: { slug: "escuela-demo" } });
  const historia = await generarDatosDeDemo(prisma, { organizacionId: org.id, hasta: new Date(Math.min(HASTA.getTime(), ahora.getTime() + 5 * 3_600_000)), ...PEQUENO });
  if (llenarGrupos) {
    // La escuela llena (como la deja la historia de 300 alumnos): el cupo de cada grupo es justo lo que tiene inscrito.
    for (const g of await prisma.grupo.findMany({ where: { organizacion_id: org.id }, select: { id: true } })) {
      const ocupados = await prisma.inscripcion.count({ where: { grupo_id: g.id, estatus: "activa" } });
      await prisma.grupo.update({ where: { id: g.id }, data: { cupo_maximo: Math.max(1, ocupados) } });
    }
  }
  const viva = await sembrarDemoViva(prisma, { organizacionId: org.id, ahora });
  return { url, prisma, db: conAlcance(prisma, org.id), organizacionId: org.id, historia, viva };
}

before(() => void exigirBaseDePruebas(servidor()));
after(async () => {
  for (const p of abiertas) await p.$disconnect();
  await borrarBaseDeDemo(servidor(), BASE_A);
  await borrarBaseDeDemo(servidor(), BASE_B);
  await borrarBaseDeDemo(servidor(), BASE_C);
});

const huella = async (db: BaseDatos): Promise<Record<string, unknown>> => ({
  leads: await db.lead.count(),
  leadsVivos: await db.lead.count({ where: { telefono: { startsWith: MARCA_DE_DEMO_VIVA } } }),
  clases: await db.clase_muestra.count(),
  inscripciones: await db.inscripcion.count(),
  cargos: await db.cargo.count(),
  pagos: await db.pago.count(),
  tutores: await db.tutor.count(),
  alumnos: await db.alumno.count(),
  usuarios: await db.usuario.count(),
  tareas: await db.tarea_asesor.count(),
});

let lunes: Awaited<ReturnType<typeof sembrar>>;

test("la siembra de la demo deja los cuatro usuarios con su rol, los siete módulos encendidos y el catálogo de las tres disciplinas con sus plantillas y automatizaciones", { timeout: 900_000 }, async () => {
  lunes = await sembrar(BASE_A, LUNES);
  const { db } = lunes;
  const usuarios = await db.usuario.findMany({ where: { activo: true }, select: { correo: true, rol: true }, orderBy: { correo: "asc" } });
  assert.deepEqual(usuarios, [
    { correo: "admin@demo.test", rol: "administrador" },
    { correo: "asesor@demo.test", rol: "asesor" },
    { correo: "maestro@demo.test", rol: "maestro" },
    { correo: "recepcion@demo.test", rol: "recepcion" },
  ]);
  assert.deepEqual(Object.values(await leerModulos(db)).length > 0, true);
  const modulos = await leerModulos(db);
  assert.deepEqual(Object.entries(modulos).filter(([, v]) => v !== true), [], "todos los módulos encendidos (decisión 3 del plan)");
  assert.equal(Object.keys(modulos).length, 7);
  const verticales = await db.vertical.findMany({ where: { activo: true } });
  assert.ok(verticales.length >= 3, `tres disciplinas, hay ${verticales.length}`);
  assert.ok((await db.plantilla_mensaje.count({ where: { activo: true } })) >= 5, "plantillas");
  assert.ok((await db.automatizacion.count()) >= 5, "automatizaciones");
  assert.ok((await db.grupo.count({ where: { instructor_id: { not: null } } })) > 0, "el maestro tiene grupos");
  assert.deepEqual(await verificarCatalogo(db), { traslapesDeEdad: 0, choquesDeSalon: 0, choquesDeInstructor: 0 });
});

test("la historia es determinista: ~alumnos y meses pedidos, con la cuadratura en verde", async () => {
  const { historia, db } = lunes;
  assert.equal(historia.yaExistia, false);
  assert.ok(historia.inscripciones >= 15, `inscripciones: ${historia.inscripciones}`);
  assert.ok(historia.cargos > 0 && historia.pagos > 0);
  const c = await cuadratura(db);
  assert.equal(c.ok, true, JSON.stringify(c.ok ? null : c.discrepancias.slice(0, 3)));
  assert.ok((await db.lead.count({ where: { telefono: { startsWith: MARCA_DE_DEMO } } })) > 20);
});

test("el maestro ve clases muestra de HOY (lunes), a una hora que sale del horario de sus grupos, no fija", async () => {
  const { db, viva } = lunes;
  assert.equal(viva.yaExistia, false);
  assert.ok(viva.clasesDelMaestro.length >= 1, "al menos una clase del día");
  assert.ok(viva.clasesDelMaestro.every((c) => c.esHoy), "todas son de hoy");
  const maestro = await db.usuario.findFirstOrThrow({ where: { rol: "maestro" } });
  const instructor = await db.instructor.findFirstOrThrow({ where: { usuario_id: maestro.id } });
  const clases = await db.clase_muestra.findMany({ where: { estatus: "agendada", lead: { telefono: { startsWith: MARCA_DE_DEMO_VIVA } }, grupo: { instructor_id: instructor.id } }, include: { grupo: { include: { horarios: true, programa: { include: { sucursal: true } } } } } });
  assert.equal(clases.length, viva.clasesDelMaestro.length);
  for (const c of clases) {
    const zona = c.grupo.programa.sucursal.zona_horaria;
    assert.equal(fechaLocal(c.fecha_hora, zona), fechaLocal(LUNES, zona), "la clase es del mismo día local que «ahora»");
    // Es una sesión real del grupo: el día de la semana y la hora de pared salen de su horario.
    const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: zona, hour: "2-digit", minute: "2-digit", hour12: false }).format(c.fecha_hora).replace(":", "").replace(/^0/, ""));
    assert.ok(c.grupo.horarios.some((h) => h.dia_semana === 1 && Math.floor(h.hora_inicio_min / 60) * 100 + (h.hora_inicio_min % 60) === hora), `la hora ${hora} es una sesión del grupo`);
  }
  // La historia no le deja decenas de avisos viejos sin ver: los de clases de hace más de un día ya están vistos.
  assert.equal(await db.aviso_maestro.count({ where: { leido_en: null, clase_muestra: { fecha_hora: { lt: new Date(LUNES.getTime() - 24 * 3_600_000) } } } }), 0);
  // El maestro tiene avisos de esas clases (se agendaron por el servicio real).
  assert.ok((await db.aviso_maestro.count({ where: { clase_muestra: { lead: { telefono: { startsWith: MARCA_DE_DEMO_VIVA } } } } })) >= 1);
});

test("si hoy ningún grupo del maestro da clase (domingo), las clases son del primer día con clase y el resumen lo dice", { timeout: 900_000 }, async () => {
  const dom = await sembrar(BASE_B, DOMINGO);
  assert.ok(dom.viva.clasesDelMaestro.length >= 1);
  assert.ok(dom.viva.clasesDelMaestro.every((c) => !c.esHoy && c.fecha > "2026-10-11"), JSON.stringify(dom.viva.clasesDelMaestro));
  // Una corrida interrumpida a medias (falta la familia del último paso) no se completa duplicando: se pide recrear la base, igual que `demo:datos`.
  await dom.prisma.tutor.updateMany({ where: { organizacion_id: dom.organizacionId, telefono: normalizarTelefono(FAMILIA_CON_COBRO.telefonoNacional)! }, data: { eliminado_en: new Date() } });
  await assert.rejects(sembrarDemoViva(dom.prisma, { organizacionId: dom.organizacionId, ahora: DOMINGO }), /demo viva a medias/);
});

test("con la escuela LLENA (cada grupo con todos sus lugares inscritos) la demo viva deja lugar con bajas de ejemplo por el servicio real y la cuadratura sigue en verde", { timeout: 900_000 }, async () => {
  const llena = await sembrar(BASE_C, LUNES, true);
  assert.ok(llena.viva.bajasParaLugar >= 1, "hubo que dejar lugar");
  assert.ok(llena.viva.clasesDelMaestro.length >= 1 && llena.viva.claseAsistida && llena.viva.familiaConCobro, JSON.stringify(llena.viva));
  assert.equal((await cuadratura(llena.db)).ok, true);
  assert.equal(await llena.db.inscripcion.count({ where: { estatus: "baja" } }) >= llena.viva.bajasParaLugar, true);
});

test("el asesor ve leads nuevos y uno contactado en SU sucursal y una clase muestra asistida lista para convertir", async () => {
  const { db, viva } = lunes;
  assert.equal(viva.leadsNuevos, 3);
  assert.equal(viva.leadsContactados, 1);
  assert.equal(viva.claseAsistida, true);
  const asesor = await db.usuario.findFirstOrThrow({ where: { rol: "asesor" } });
  const suyas = (await db.usuario_sucursal.findMany({ where: { usuario_id: asesor.id } })).map((s) => s.sucursal_id);
  assert.ok(suyas.length >= 1);
  const vivos = await db.lead.findMany({ where: { telefono: { startsWith: MARCA_DE_DEMO_VIVA } }, include: { etapa: true } });
  const porEtapa = (n: string): number => vivos.filter((l) => l.etapa.nombre === n && l.sucursal_interes_id !== null && suyas.includes(l.sucursal_interes_id)).length;
  assert.equal(porEtapa("Nuevo"), 3);
  assert.equal(porEtapa("Contactado"), 1);
  assert.equal(porEtapa("Clase muestra asistida"), 1);
  // Verticales distintas: el asesor ve más de una disciplina.
  assert.ok(new Set(vivos.map((l) => l.vertical_interes_id)).size >= 2);
});

test("recepción encuentra a la familia por su teléfono, con la primera mensualidad y un uniforme por cobrar", async () => {
  const { db, viva } = lunes;
  assert.ok(viva.familiaConCobro && viva.familiaConCobro.cargosPendientes >= 2, JSON.stringify(viva.familiaConCobro));
  const tutor = await db.tutor.findFirstOrThrow({ where: { telefono: normalizarTelefono(FAMILIA_CON_COBRO.telefonoNacional)! } });
  assert.equal(tutor.id, viva.familiaConCobro.tutorId);
  const cargos = await db.cargo.findMany({ where: { tutor_id: tutor.id } });
  // La inscripción puede salir gratis por la promoción vigente del catálogo (queda pagada con monto 0); por cobrar quedan la mensualidad y el uniforme del mostrador.
  const porCobrar = cargos.filter((c) => c.estatus === "pendiente" || c.estatus === "vencido");
  assert.ok(porCobrar.length >= 2 && porCobrar.every((c) => c.monto_final.gt(0)));
  assert.ok(porCobrar.some((c) => c.concepto === "mensualidad") && porCobrar.some((c) => c.concepto === "producto"));
  const pagado = await db.pago.count({ where: { tutor_id: tutor.id } });
  assert.equal(pagado, 0, "nada pagado: está por cobrar");
});

test("la cuadratura sigue en verde con la demo viva y repetir todo no cambia nada (idempotente)", { timeout: 900_000 }, async () => {
  const { db, prisma, organizacionId } = lunes;
  assert.equal((await cuadratura(db)).ok, true);
  const antes = await huella(db);
  const h = await generarDatosDeDemo(prisma, { organizacionId, hasta: HASTA, ...PEQUENO });
  const v = await sembrarDemoViva(prisma, { organizacionId, ahora: LUNES });
  assert.equal(h.yaExistia, true);
  assert.equal(v.yaExistia, true);
  assert.deepEqual(await huella(db), antes);
  // Aun con otro «ahora»: no siembra una segunda vez.
  assert.equal((await sembrarDemoViva(prisma, { organizacionId, ahora: new Date(LUNES.getTime() + 86_400_000) })).yaExistia, true);
  assert.deepEqual(await huella(db), antes);
});

test("misma semilla y mismo «ahora», misma demo: dos bases distintas dan la misma huella y las mismas clases", { timeout: 900_000 }, async () => {
  const otra = await sembrar(BASE_B, LUNES);
  assert.deepEqual(await huella(otra.db), await huella(lunes.db));
  const nombres = async (db: BaseDatos): Promise<string[]> => (await db.prospecto.findMany({ where: { lead: { telefono: { startsWith: MARCA_DE_DEMO_VIVA } } }, select: { nombre: true }, orderBy: { nombre: "asc" } })).map((p) => p.nombre ?? "");
  assert.deepEqual(await nombres(otra.db), await nombres(lunes.db));
  const clases = async (db: BaseDatos): Promise<string[]> => (await db.clase_muestra.findMany({ where: { lead: { telefono: { startsWith: MARCA_DE_DEMO_VIVA } } }, select: { fecha_hora: true, estatus: true }, orderBy: [{ fecha_hora: "asc" }, { estatus: "asc" }] })).map((c) => `${c.fecha_hora.toISOString()} ${c.estatus}`);
  assert.deepEqual(await clases(otra.db), await clases(lunes.db));
});
