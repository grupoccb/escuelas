// G2 contra Postgres real y la app real: el porcentaje y la racha por API, y la tarea para el asesor al llegar al umbral — una pendiente por inscripción, una por
// racha, se resuelve sola al volver a asistir o al corregir el pase, el umbral lo fija la organización y dos pases simultáneos no crean dos tareas.
// Reloj: miércoles 18 de noviembre de 2026, 12:00 en la Ciudad de México. El grupo A sesiona lunes y miércoles.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { fijarConfiguracion } from "../testutil/semilla.ts";
import { conAlcance } from "../datos/alcance.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { recalcularDerivados } from "./derivados.ts";
import { mundoDeOperacion, type MundoDeOperacion } from "../testutil/operacion.ts";

let prisma: PrismaPruebas;
let m: MundoDeOperacion;
before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeOperacion(prisma, "Derivados de asistencia");
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

// Lunes y miércoles anteriores a «hoy» (miércoles 18): fechas de sesión del grupo A.
const L19 = "2026-10-19";
const M21 = "2026-10-21";
const L26 = "2026-10-26";
const M28 = "2026-10-28";
const L02 = "2026-11-02";
const M04 = "2026-11-04";
const L09 = "2026-11-09";
const M11 = "2026-11-11";

interface Alerta { inscripcion_id: string; racha_de_faltas: number; umbral: number; accion: string | null; tarea_id: string | null }
type Estatus = "presente" | "falta" | "justificada";
const pasar = async (mundo: MundoDeOperacion, grupoId: string, fecha: string, entradas: [string, Estatus][], cliente = mundo.maestroA) =>
  cliente.pedir<{ alertas: Alerta[] }>("PUT", `/api/grupos/${grupoId}/pase`, { fecha, asistencias: entradas.map(([inscripcion_id, estatus]) => ({ inscripcion_id, estatus })) });
const tareasDe = (inscripcionId: string) => prisma.tarea_asesor.findMany({ where: { inscripcion_id: inscripcionId, tipo: "faltas_consecutivas" }, orderBy: { creado_en: "asc" } });

test("G2 la tarea nace al llegar la racha al umbral (3 por omisión): una pendiente por inscripción, con su lead, su fecha de inicio y sin repetirse al volver a guardar", async () => {
  const a = await m.inscribir(m.grupoA, { nombre: "Ana" });
  const otra = await m.inscribir(m.grupoA, { nombre: "Otra" });
  // Dos faltas: todavía no.
  for (const f of [L26, M28]) {
    const r = await pasar(m, m.grupoA, f, [[a.inscripcionId, "falta"], [otra.inscripcionId, "presente"]]);
    assert.equal(r.estado, 200);
    assert.deepEqual(r.cuerpo.alertas, []);
  }
  assert.equal((await tareasDe(a.inscripcionId)).length, 0);
  // La tercera: tarea.
  const tercera = await pasar(m, m.grupoA, L02, [[a.inscripcionId, "falta"], [otra.inscripcionId, "presente"]]);
  assert.deepEqual(tercera.cuerpo.alertas.map((x) => [x.inscripcion_id, x.racha_de_faltas, x.umbral, x.accion]), [[a.inscripcionId, 3, 3, "tarea_creada"]]);
  const [t] = await tareasDe(a.inscripcionId);
  assert.deepEqual([t!.estado, t!.lead_id, t!.conversacion_id, t!.referencia_fecha?.toISOString().slice(0, 10)], ["pendiente", a.leadId, null, L26]);
  assert.match(t!.descripcion, /Ana Prueba lleva 3 faltas consecutivas \(desde el 2026-10-26\)/);
  assert.equal(tercera.cuerpo.alertas[0]!.tarea_id, t!.id);
  // Guardar lo mismo, o seguir faltando: no hay otra tarea.
  assert.deepEqual((await pasar(m, m.grupoA, L02, [[a.inscripcionId, "falta"]])).cuerpo.alertas, [], "lo mismo otra vez no recalcula nada");
  const cuarta = await pasar(m, m.grupoA, M04, [[a.inscripcionId, "falta"]]);
  assert.deepEqual(cuarta.cuerpo.alertas.map((x) => [x.racha_de_faltas, x.accion, x.tarea_id]), [[4, null, t!.id]], "la racha crece y la tarea es la misma");
  assert.equal((await tareasDe(a.inscripcionId)).length, 1);
  assert.equal((await tareasDe(otra.inscripcionId)).length, 0, "quien asiste no genera nada");
});

test("G2 se resuelve sola al volver a asistir; una racha NUEVA es otra tarea (otra fecha de inicio)", async () => {
  const mundo = await mundoDeOperacion(prisma, "Racha nueva");
  try {
    await fijarConfiguracion(prisma, mundo.org.organizacionId, { umbral_faltas_consecutivas: 2 });
    const a = await mundo.inscribir(mundo.grupoA, { nombre: "Beto" });
    await pasar(mundo, mundo.grupoA, L26, [[a.inscripcionId, "falta"]]);
    const dos = await pasar(mundo, mundo.grupoA, M28, [[a.inscripcionId, "falta"]]);
    assert.deepEqual(dos.cuerpo.alertas.map((x) => [x.racha_de_faltas, x.umbral, x.accion]), [[2, 2, "tarea_creada"]]);
    // Vuelve a asistir: la tarea se resuelve sola.
    const vuelve = await pasar(mundo, mundo.grupoA, L02, [[a.inscripcionId, "presente"]]);
    assert.deepEqual(vuelve.cuerpo.alertas.map((x) => [x.racha_de_faltas, x.accion]), [[0, "tarea_resuelta"]]);
    const [primera] = await tareasDe(a.inscripcionId);
    assert.deepEqual([primera!.estado, primera!.resuelta_en?.toISOString()], ["hecha", mundo.reloj.ahora.toISOString()]);
    // Otra racha: otra tarea, con su propia fecha de inicio.
    await pasar(mundo, mundo.grupoA, M04, [[a.inscripcionId, "falta"]]);
    const nueva = await pasar(mundo, mundo.grupoA, L09, [[a.inscripcionId, "falta"]]);
    assert.equal(nueva.cuerpo.alertas[0]!.accion, "tarea_creada");
    const todas = await tareasDe(a.inscripcionId);
    assert.deepEqual(todas.map((t) => [t.estado, t.referencia_fecha?.toISOString().slice(0, 10)]), [["hecha", L26], ["pendiente", M04]]);
    // Si una persona la resuelve a mano con la racha vigente, repetir el pase no la vuelve a crear.
    await prisma.tarea_asesor.update({ where: { id: todas[1]!.id }, data: { estado: "hecha", resuelta_en: new Date() } });
    await pasar(mundo, mundo.grupoA, M11, [[a.inscripcionId, "falta"]]);
    assert.equal((await tareasDe(a.inscripcionId)).length, 2, "la racha sigue siendo la del 4 de noviembre: no hay tarea nueva");
  } finally {
    await mundo.cerrar();
  }
});

test("G2 corregir un pase recalcula: una falta que pasa a presente baja la racha y resuelve la tarea; devolverla a falta es la MISMA racha y no repite la tarea", async () => {
  const a = await m.inscribir(m.grupoA, { nombre: "Cora" });
  for (const f of [L26, M28, L02]) await pasar(m, m.grupoA, f, [[a.inscripcionId, "falta"]]);
  assert.equal((await tareasDe(a.inscripcionId))[0]!.estado, "pendiente");
  const corregido = await pasar(m, m.grupoA, M28, [[a.inscripcionId, "presente"]]);
  assert.deepEqual(corregido.cuerpo.alertas.map((x) => [x.racha_de_faltas, x.accion]), [[1, "tarea_resuelta"]]);
  assert.equal((await tareasDe(a.inscripcionId))[0]!.estado, "hecha");
  const devuelto = await pasar(m, m.grupoA, M28, [[a.inscripcionId, "falta"]]);
  assert.deepEqual(devuelto.cuerpo.alertas.map((x) => [x.racha_de_faltas, x.accion]), [[3, null]], "misma racha (desde el 26): no se crea otra tarea");
  assert.equal((await tareasDe(a.inscripcionId)).length, 1);
});

test("G2 la racha cuenta SESIONES con pase tomado, no días: las clases sin pase no suman ni rompen; una justificada no suma ni rompe", async () => {
  const sesiones = await m.inscribir(m.grupoA, { nombre: "Dani" });
  // Tres faltas con una semana sin pase de por medio entre cada una (lunes y miércoles que no se pasaron): son tres consecutivas.
  for (const f of ["2026-10-05", L19, L02]) await pasar(m, m.grupoA, f, [[sesiones.inscripcionId, "falta"]]);
  assert.equal((await tareasDe(sesiones.inscripcionId)).length, 1);
  assert.equal((await tareasDe(sesiones.inscripcionId))[0]!.referencia_fecha?.toISOString().slice(0, 10), "2026-10-05");

  const justificada = await m.inscribir(m.grupoA, { nombre: "Eli" });
  await pasar(m, m.grupoA, L26, [[justificada.inscripcionId, "falta"]]);
  await pasar(m, m.grupoA, M28, [[justificada.inscripcionId, "justificada"]]);
  const segunda = await pasar(m, m.grupoA, L02, [[justificada.inscripcionId, "falta"]]);
  assert.deepEqual(segunda.cuerpo.alertas, [], "falta, justificada, falta = 2 consecutivas");
  const tercera = await pasar(m, m.grupoA, M04, [[justificada.inscripcionId, "falta"]]);
  assert.deepEqual(tercera.cuerpo.alertas.map((x) => [x.racha_de_faltas, x.accion]), [[3, "tarea_creada"]]);
});

test("G2 el umbral lo fija la organización: con 5 hacen falta cinco; con 1 basta la primera falta", async () => {
  const cinco = await mundoDeOperacion(prisma, "Umbral cinco");
  try {
    await fijarConfiguracion(prisma, cinco.org.organizacionId, { umbral_faltas_consecutivas: 5 });
    const a = await cinco.inscribir(cinco.grupoA);
    let ultima;
    for (const f of [L19, M21, L26, M28]) ultima = await pasar(cinco, cinco.grupoA, f, [[a.inscripcionId, "falta"]]);
    assert.deepEqual(ultima!.cuerpo.alertas, [], "cuatro no alcanzan");
    const quinta = await pasar(cinco, cinco.grupoA, L02, [[a.inscripcionId, "falta"]]);
    assert.deepEqual(quinta.cuerpo.alertas.map((x) => [x.racha_de_faltas, x.umbral, x.accion]), [[5, 5, "tarea_creada"]]);
  } finally {
    await cinco.cerrar();
  }
  const uno = await mundoDeOperacion(prisma, "Umbral uno");
  try {
    await fijarConfiguracion(prisma, uno.org.organizacionId, { umbral_faltas_consecutivas: 1 });
    const a = await uno.inscribir(uno.grupoA);
    const r = await pasar(uno, uno.grupoA, L26, [[a.inscripcionId, "falta"]]);
    assert.deepEqual(r.cuerpo.alertas.map((x) => [x.racha_de_faltas, x.accion]), [[1, "tarea_creada"]]);
  } finally {
    await uno.cerrar();
  }
});

test("G2 concurrencia real: cuatro pases simultáneos de fechas distintas que cruzan el umbral crean UNA sola tarea", async () => {
  const mundo = await mundoDeOperacion(prisma, "Racha simultánea");
  try {
    const a = await mundo.inscribir(mundo.grupoA);
    for (const f of [L19, M21]) await pasar(mundo, mundo.grupoA, f, [[a.inscripcionId, "falta"]]);
    const rs = await Promise.all([L26, M28, L02, M04].map((f) => pasar(mundo, mundo.grupoA, f, [[a.inscripcionId, "falta"]], f === M28 || f === M04 ? mundo.admin : mundo.maestroA)));
    assert.deepEqual(rs.map((r) => r.estado), [200, 200, 200, 200]);
    const tareas = await tareasDe(a.inscripcionId);
    assert.equal(tareas.length, 1, "una sola tarea");
    assert.equal(tareas[0]!.referencia_fecha?.toISOString().slice(0, 10), L19);
    assert.equal(rs.flatMap((r) => r.cuerpo.alertas).filter((x) => x.accion === "tarea_creada").length, 1);
  } finally {
    await mundo.cerrar();
  }
});

test("G2 concurrencia FORZADA, sin pasar por el pase: dos recálculos de la MISMA inscripción que leen «no hay tarea» a la vez crean una sola y ninguno revienta", async () => {
  const a = await m.inscribir(m.grupoA, { nombre: "Kiko" });
  for (const f of [L26, M28, L02]) await prisma.asistencia.create({ data: { organizacion_id: m.org.organizacionId, inscripcion_id: a.inscripcionId, grupo_id: m.grupoA, fecha: new Date(`${f}T00:00:00.000Z`), estatus: "falta" } });
  // Una barrera ENTRE la lectura de «¿hay una pendiente?» y la creación obliga a que las dos lean lo mismo antes de que cualquiera cree. Con el candado por inscripción la segunda
  // ni siquiera llega a leer hasta que la primera termina (la barrera se agota y sigue); sin él, las dos crean y la base rechaza a una.
  const barrera = new Barrera(2);
  const conBarrera = conAlcance(
    conGanchos(prisma, {
      modelo: "tarea_asesor",
      operacion: "findFirst",
      cuando: (args) => (args["where"] as { estado?: unknown; tipo?: unknown } | undefined)?.estado === "pendiente" && (args["where"] as { tipo?: unknown }).tipo === "faltas_consecutivas",
      despues: () => barrera.esperar(400),
    }),
    m.org.organizacionId,
  );
  const rs = await Promise.allSettled([1, 2].map(() => recalcularDerivados(conBarrera, { organizacionId: m.org.organizacionId, inscripcionIds: [a.inscripcionId], ahora: m.reloj.ahora })));
  assert.deepEqual(rs.map((r) => r.status), ["fulfilled", "fulfilled"], rs.filter((r) => r.status === "rejected").map((r) => String((r as PromiseRejectedResult).reason).slice(0, 100)).join(" | "));
  const alertas = rs.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  assert.equal(alertas.filter((x) => x.accion === "tarea_creada").length, 1);
  assert.equal((await tareasDe(a.inscripcionId)).length, 1);
});

test("G2 SQL directo: la base no deja dos tareas pendientes de la misma inscripción ni dos de la misma racha, aunque la primera ya esté resuelta", async () => {
  const a = await m.inscribir(m.grupoA, { nombre: "Fabi" });
  const base = { organizacion_id: m.org.organizacionId, inscripcion_id: a.inscripcionId, tipo: "faltas_consecutivas" as const, descripcion: "x" };
  const t1 = await prisma.tarea_asesor.create({ data: { ...base, referencia_fecha: new Date("2026-10-26T00:00:00.000Z") } });
  await assert.rejects(prisma.tarea_asesor.create({ data: { ...base, referencia_fecha: new Date("2026-11-02T00:00:00.000Z") } }), /Unique constraint|tarea_asesor_inscripcion_pendiente_key/, "dos pendientes");
  await prisma.tarea_asesor.update({ where: { id: t1.id }, data: { estado: "hecha", resuelta_en: new Date() } });
  await assert.rejects(prisma.tarea_asesor.create({ data: { ...base, referencia_fecha: new Date("2026-10-26T00:00:00.000Z") } }), /Unique constraint|tarea_asesor_inscripcion_racha_key/, "la misma racha");
  await prisma.tarea_asesor.create({ data: { ...base, referencia_fecha: new Date("2026-11-02T00:00:00.000Z") } });
});

test("G2 la tarea de una inscripción sin lead la ve el asesor de la sucursal de su grupo (no el de otra), la resuelve y el administrador la ve", async () => {
  const a = await m.inscribir(m.grupoA, { nombre: "Gabo" });
  await prisma.inscripcion.update({ where: { id: a.inscripcionId }, data: { lead_id: null } });
  for (const f of [L26, M28, L02]) await pasar(m, m.grupoA, f, [[a.inscripcionId, "falta"]]);
  const [t] = await tareasDe(a.inscripcionId);
  assert.equal(t!.lead_id, null);
  const lista = (c: typeof m.admin) => c.get<{ datos: { id: string; inscripcion_id: string | null }[] }>("/api/tareas?tipo=faltas_consecutivas&limite=100");
  assert.ok((await lista(m.admin)).cuerpo.datos.some((x) => x.id === t!.id && x.inscripcion_id === a.inscripcionId));
  assert.ok((await lista(m.asesorNorte)).cuerpo.datos.some((x) => x.id === t!.id), "el asesor de la sucursal del grupo la ve");
  assert.ok(!(await lista(m.asesorSur)).cuerpo.datos.some((x) => x.id === t!.id), "el de otra sucursal no");
  assert.equal((await m.asesorSur.patch(`/api/tareas/${t!.id}`, { estado: "hecha" })).estado, 404);
  assert.equal((await m.asesorNorte.patch(`/api/tareas/${t!.id}`, { estado: "hecha" })).estado, 200);
  // Resuelta a mano con la racha vigente: el siguiente pase no la repite.
  await pasar(m, m.grupoA, M04, [[a.inscripcionId, "falta"]]);
  assert.equal((await tareasDe(a.inscripcionId)).length, 1);
});

test("G2 consultable por API: el historial de una inscripción con su porcentaje y su racha, y los derivados de todo el grupo", async () => {
  const mundo = await mundoDeOperacion(prisma, "Derivados por API");
  try {
    const a = await mundo.inscribir(mundo.grupoA, { nombre: "Hugo" });
    const b = await mundo.inscribir(mundo.grupoA, { nombre: "Iris" });
    const congelada = await mundo.inscribir(mundo.grupoA, { nombre: "Juan", estatus: "congelada" });
    // Hugo: 19/10 presente (fuera de la ventana), 21/10 presente, 26/10 falta, 28/10 justificada, 02/11 falta. Iris: siempre presente.
    const plan: [string, Estatus, Estatus][] = [[L19, "presente", "presente"], [M21, "presente", "presente"], [L26, "falta", "presente"], [M28, "justificada", "presente"], [L02, "falta", "presente"]];
    for (const [f, ha, ib] of plan) await pasar(mundo, mundo.grupoA, f, [[a.inscripcionId, ha], [b.inscripcionId, ib]]);
    const h = await mundo.maestroA.get<{ derivados: Record<string, unknown>; datos: { fecha: string; estatus: string }[]; paginacion: { total: number } }>(`/api/inscripciones/${a.inscripcionId}/asistencia`);
    assert.equal(h.estado, 200);
    // Ventana de 30 días desde el 18/11: del 20/10 al 18/11 → entran el 21/10 (presente), 26/10 (falta), 28/10 (justificada) y 02/11 (falta); el 19/10 queda fuera.
    assert.deepEqual(h.cuerpo.derivados, { ventana: { desde: "2026-10-20", hasta: "2026-11-18" }, porcentaje_30_dias: 33.3, presentes: 1, faltas: 2, justificadas: 1, racha_de_faltas: 2, inicio_de_racha: L26, umbral_de_faltas: 3, en_riesgo: false });
    assert.deepEqual(h.cuerpo.datos.map((x) => [x.fecha, x.estatus]), [[L02, "falta"], [M28, "justificada"], [L26, "falta"], [M21, "presente"], [L19, "presente"]], "lo más reciente primero");
    const pagina = await mundo.maestroA.get<{ datos: unknown[]; paginacion: { total: number } }>(`/api/inscripciones/${a.inscripcionId}/asistencia?limite=2&pagina=2&desde=${M21}&hasta=${L02}`);
    assert.deepEqual([pagina.cuerpo.datos.length, pagina.cuerpo.paginacion.total], [2, 4]);
    // Alcance: el maestro ajeno y el asesor de otra sucursal reciben 404; el asesor de la sucursal lee.
    assert.equal((await mundo.maestroB.get(`/api/inscripciones/${a.inscripcionId}/asistencia`)).estado, 404);
    assert.equal((await mundo.asesorSur.get(`/api/inscripciones/${a.inscripcionId}/asistencia`)).estado, 404);
    assert.equal((await mundo.asesorNorte.get(`/api/inscripciones/${a.inscripcionId}/asistencia`)).estado, 200);
    assert.equal((await mundo.admin.get(`/api/inscripciones/${randomUuid()}/asistencia`)).estado, 404);

    const grupo = await mundo.maestroA.get<{ umbral_de_faltas: number; datos: { inscripcion_id: string; alumno: string; porcentaje_30_dias: number | null; racha_de_faltas: number; en_riesgo: boolean }[] }>(`/api/grupos/${mundo.grupoA}/asistencia/derivados`);
    assert.equal(grupo.estado, 200);
    assert.deepEqual(grupo.cuerpo.datos.map((x) => [x.inscripcion_id, x.porcentaje_30_dias, x.racha_de_faltas, x.en_riesgo]).sort(), [[a.inscripcionId, 33.3, 2, false], [b.inscripcionId, 100, 0, false]].sort(), "solo los activos; la congelada no está");
    assert.ok(!grupo.cuerpo.datos.some((x) => x.inscripcion_id === congelada.inscripcionId));
    assert.equal((await mundo.maestroB.get(`/api/grupos/${mundo.grupoA}/asistencia/derivados`)).estado, 404);
    assert.equal((await mundo.asesorSur.get(`/api/grupos/${mundo.grupoA}/asistencia/derivados`)).estado, 404);
  } finally {
    await mundo.cerrar();
  }
});

const randomUuid = (): string => crypto.randomUUID();

test("EG-04: si el pase se guardó pero el recálculo no llegó a correr (el proceso murió), repetir el MISMO pase termina el trabajo y la tarea nace", async () => {
  const a = await m.inscribir(m.grupoA, { nombre: "Lalo" });
  for (const f of [L19, M21]) assert.equal((await pasar(m, m.grupoA, f, [[a.inscripcionId, "falta"]])).estado, 200);
  // La tercera falta se guarda como lo hace el pase, pero SIN recalcular (lo que queda si el proceso muere entre los dos pasos).
  const { guardarPase } = await import("./pase.ts");
  const guardado = await guardarPase(m.db, { organizacionId: m.org.organizacionId, grupoId: m.grupoA, fecha: L26, usuarioId: null, entradas: [{ inscripcionId: a.inscripcionId, estatus: "falta", metodo: "manual" }] });
  assert.equal(guardado.ok && guardado.creadas, 1);
  assert.equal((await tareasDe(a.inscripcionId)).length, 0, "el recálculo no corrió");
  // El reintento del mismo pase no cambia ninguna fila, pero recalcula: la tarea nace.
  const reintento = await pasar(m, m.grupoA, L26, [[a.inscripcionId, "falta"]]);
  assert.equal(reintento.estado, 200);
  assert.deepEqual((reintento.cuerpo as unknown as { creadas: number; sin_cambio: number }).creadas, 0);
  assert.equal((await tareasDe(a.inscripcionId)).length, 1);
  assert.deepEqual(reintento.cuerpo.alertas.map((x) => [x.inscripcion_id, x.accion]), [[a.inscripcionId, "tarea_creada"]]);
  // Y repetirlo otra vez no la duplica.
  assert.equal((await pasar(m, m.grupoA, L26, [[a.inscripcionId, "falta"]])).estado, 200);
  assert.equal((await tareasDe(a.inscripcionId)).length, 1);
});
