// R3a: los datos de las gráficas del tablero — el reporte ejecutivo con filtros de sucursal y disciplina (horarios, mapa de ocupación, familias con atraso, bajas por motivo, comparativo) y los
// reportes nuevos de embudo, fuentes y evolución. Todo con cifras escritas a mano a partir de un escenario pequeño, aislamiento por organización, alcance por rol y soft delete.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { deTexto, sumar } from "../lib/dinero.ts";
import { diasEntre } from "../lib/periodo.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeFinanzas, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { sembrarFamilia, sembrarPrograma, type TipoDeEtapa } from "../testutil/semilla.ts";
import type { ReporteEjecutivo } from "./ejecutivo.ts";
import type { ReporteDeEmbudo } from "./embudo.ts";
import type { ReporteDeEvolucion } from "./evolucion.ts";
import type { ReporteDeFuentes } from "./fuentes.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;
let v1: string;
let v2: string;
let etapa: Record<TipoDeEtapa, string>;
const ins: Record<string, string> = {};
const grupo: Record<string, string> = {};
let motivoB: string;
const camp: Record<string, string> = {};
const motivoPerdida: Record<string, string> = {};

const dia = (fecha: string, hora = "16:00:00") => void (m.reloj.ahora = new Date(`${fecha}T${hora}Z`));
const ejecutivo = (qs = "", c = m.admin, mes = "2026-11") => c.get<ReporteEjecutivo>(`/api/reportes/ejecutivo?mes=${mes}${qs}`);
const embudo = (qs = "", c = m.admin) => c.get<ReporteDeEmbudo>(`/api/reportes/embudo?desde=2026-10-01&hasta=2026-10-31${qs}`);
const fuentes = (qs = "", c = m.admin) => c.get<ReporteDeFuentes>(`/api/reportes/fuentes?desde=2026-10-01&hasta=2026-10-31${qs}`);
const evolucion = (qs = "", c = m.admin) => c.get<ReporteDeEvolucion>(`/api/reportes/evolucion?mes=2026-11${qs}`);

before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeFinanzas(prisma, "Tablero R3a");
  v1 = m.org.verticalId;
  v2 = (await prisma.vertical.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Segunda disciplina", slug: "segunda-disciplina" } })).id;
  motivoB = (await prisma.motivo_baja.create({ data: { organizacion_id: m.org.organizacionId, codigo: "otro_motivo", nombre: "Otro motivo de baja" } })).id;
  etapa = Object.fromEntries((await prisma.etapa_pipeline.findMany({ where: { organizacion_id: m.org.organizacionId, tipo_sistema: { not: null } } })).map((e) => [e.tipo_sistema!, e.id])) as Record<TipoDeEtapa, string>;

  // Grupos: dos de la disciplina 1 en Norte (mismo lunes a las 16), uno de la disciplina 2 en Sur (viernes 19) y uno de la disciplina 1 en Sur con un solo lugar (jueves 10).
  const prog = async (clave: string, vertical: string, sucursal: string, cupo: number, mensualidad: string, horarios: [number, number, number][]) => {
    const p = await sembrarPrograma(prisma, { ...m.org, verticalId: vertical }, { sucursalId: sucursal, nombre: `Programa ${clave}`, edadMin: 3, edadMax: 14, grupos: [{ nombre: `Grupo ${clave}`, cupoMaximo: cupo, horarios }], precio: { inscripcion: "500.00", mensualidad, desde: "2020-01-01" } });
    grupo[clave] = p.grupos[0]!.id;
  };
  await prog("N1", v1, m.norte, 4, "1000.00", [[1, 960, 1020], [3, 960, 1020]]);
  await prog("N2", v1, m.norte, 4, "1000.00", [[1, 990, 1050]]);
  await prog("S2", v2, m.sur, 5, "500.00", [[5, 1140, 1200]]);
  await prog("S1", v1, m.sur, 1, "800.00", [[4, 600, 660]]);

  // Septiembre: cuatro altas. Una baja ese mes.
  dia("2026-09-05");
  for (const [k, g] of [["a1", "N1"], ["a2", "N1"], ["a3", "N2"], ["a4", "S2"]] as const) ins[k] = (await m.inscribir({ grupoId: grupo[g]! })).inscripcionId;
  dia("2026-09-20");
  assert.equal((await m.admin.post(`/api/inscripciones/${ins["a1"]}/baja`, { motivo_baja_id: m.motivoBaja })).estado, 200);
  // Octubre: tres altas; una baja el 15.
  dia("2026-10-10");
  for (const [k, g] of [["b1", "N1"], ["b2", "S2"]] as const) ins[k] = (await m.inscribir({ grupoId: grupo[g]! })).inscripcionId;
  dia("2026-10-12");
  ins["d1"] = (await m.inscribir({ grupoId: grupo["S1"]! })).inscripcionId;
  dia("2026-10-15");
  assert.equal((await m.admin.post(`/api/inscripciones/${ins["a2"]}/baja`, { motivo_baja_id: motivoB })).estado, 200);
  // Noviembre: una alta, una congelada y una baja. Hoy es el 10.
  dia("2026-11-02");
  ins["c1"] = (await m.inscribir({ grupoId: grupo["N2"]! })).inscripcionId;
  dia("2026-11-03");
  assert.equal((await m.admin.post(`/api/inscripciones/${ins["b1"]}/congelar`)).estado, 200);
  dia("2026-11-05");
  assert.equal((await m.admin.post(`/api/inscripciones/${ins["b2"]}/baja`, { motivo_baja_id: m.motivoBaja })).estado, 200);
  dia("2026-11-10");

  // Cada alumno inscrito nació de un lead (que la inscripción dejó en la etapa de inscrito) creado «ahora» de la base: se pasan a agosto para que el rango de octubre sea solo el de este escenario.
  await prisma.lead.updateMany({ where: { organizacion_id: m.org.organizacionId }, data: { creado_en: new Date("2026-08-01T16:00:00Z") } });
  // Leads de octubre para el embudo y las fuentes.
  const campana = async (clave: string, origen: "facebook" | "instagram" | "google", o: { vertical_id?: string; sucursal_id?: string } = {}) => void (camp[clave] = (await prisma.campana.create({ data: { organizacion_id: m.org.organizacionId, nombre: `Campaña ${clave}`, origen, ...o } })).id);
  await campana("C1", "facebook");
  await campana("C2", "instagram");
  await campana("C3", "google", { vertical_id: v2 });
  for (const [k, nombre] of [["P1", "Motivo de pérdida uno"], ["P2", "Motivo de pérdida dos"]] as const) motivoPerdida[k] = (await prisma.motivo_perdida.create({ data: { organizacion_id: m.org.organizacionId, codigo: k.toLowerCase(), nombre } })).id;
  const lead = async (o: { sucursal: string | null; vertical: string; campana?: string; creado?: string; ruta: TipoDeEtapa[]; motivo?: string; atribucion?: Record<string, string> }) => {
    const f = await sembrarFamilia(prisma, m.org, { sucursalId: o.sucursal });
    const ultima = o.ruta[o.ruta.length - 1]!;
    await prisma.lead.update({ where: { id: f.leadId }, data: { vertical_interes_id: o.vertical, ...(o.campana ? { campana_id: o.campana } : {}), creado_en: new Date(`${o.creado ?? "2026-10-10"}T16:00:00Z`), etapa_id: etapa[ultima], ...(o.motivo ? { motivo_perdida_id: o.motivo } : {}), ...(o.atribucion ? { atribucion: o.atribucion } : {}) } });
    let anterior: string | null = null;
    for (const t of o.ruta) {
      await prisma.lead_etapa_historial.create({ data: { organizacion_id: m.org.organizacionId, lead_id: f.leadId, etapa_anterior_id: anterior, etapa_nueva_id: etapa[t], origen: "sistema" } });
      anterior = etapa[t];
    }
    return f.leadId;
  };
  // Disciplina 1, Norte.
  await lead({ sucursal: m.norte, vertical: v1, campana: camp["C1"]!, ruta: ["nuevo", "contactado", "muestra_agendada", "inscrito"] });
  await lead({ sucursal: m.norte, vertical: v1, campana: camp["C1"]!, ruta: ["nuevo", "contactado", "perdido"], motivo: motivoPerdida["P1"]! });
  await lead({ sucursal: m.norte, vertical: v1, campana: camp["C1"]!, ruta: ["nuevo"] });
  await lead({ sucursal: m.norte, vertical: v1, ruta: ["nuevo", "contactado", "muestra_agendada", "muestra_asistida", "negociacion"], atribucion: { fuente: "landing" } });
  await lead({ sucursal: m.norte, vertical: v1, campana: camp["C2"]!, ruta: ["nuevo"] });
  // Disciplina 2, Sur.
  await lead({ sucursal: m.sur, vertical: v2, campana: camp["C2"]!, ruta: ["nuevo", "contactado", "muestra_agendada", "inscrito"] });
  await lead({ sucursal: m.sur, vertical: v2, campana: camp["C2"]!, ruta: ["nuevo", "perdido"], motivo: motivoPerdida["P2"]! });
  await lead({ sucursal: m.sur, vertical: v2, campana: camp["C2"]!, ruta: ["nuevo", "contactado", "perdido"] });
  // Sin sucursal, sin campaña.
  await lead({ sucursal: null, vertical: v1, ruta: ["nuevo"] });
  // Fuera del rango: septiembre y noviembre.
  await lead({ sucursal: m.norte, vertical: v1, campana: camp["C1"]!, creado: "2026-09-15", ruta: ["nuevo", "contactado", "inscrito"] });
  await lead({ sucursal: m.norte, vertical: v1, campana: camp["C1"]!, creado: "2026-11-02", ruta: ["nuevo"] });
  // Gasto de las campañas (octubre) y uno de septiembre que no entra al rango.
  const gasto = async (c: string, fecha: string, monto: string) => assert.equal((await m.admin.post(`/api/campanas/${camp[c]}/gastos`, { fecha, monto })).estado, 201);
  await gasto("C1", "2026-10-03", "1000.00");
  await gasto("C1", "2026-10-10", "333.33");
  await gasto("C1", "2026-09-01", "200.00");
  await gasto("C2", "2026-10-08", "450.00");
  await gasto("C3", "2026-10-09", "300.00");
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

test("ejecutivo sin filtros: lo de siempre cuadra y suma los campos nuevos (bajas por motivo, comparativo, horarios, mapa)", async () => {
  const r = (await ejecutivo()).cuerpo;
  // Activas hoy: a3 (1000), a4 (500), d1 (800) y c1 (1000). La b1 está congelada; a1, a2 y b2 se dieron de baja.
  assert.deepEqual([r.activos.total_alumnos, r.activos.total_inscripciones, r.ingreso_mensual_recurrente], [4, 4, "3300.00"]);
  // Noviembre: alta c1; baja b2; base al 1.º: a3, a4, b1, b2 y d1.
  assert.deepEqual([r.altas_del_mes, r.bajas_del_mes, r.base_al_inicio_del_mes, r.desercion], [1, 1, 5, "20.0"]);
  assert.deepEqual(r.bajas_por_motivo.map((b) => [b.motivo?.id, b.bajas]), [[m.motivoBaja, 1]]);
  const octubre = (await ejecutivo("", m.admin, "2026-10")).cuerpo;
  assert.deepEqual(octubre.bajas_por_motivo.map((b) => [b.motivo?.id, b.bajas]), [[motivoB, 1]]);
  // Comparativo disciplina × sucursal (en noviembre).
  const c = (v: string, s: string) => r.comparativo.find((x) => x.vertical.id === v && x.sucursal.id === s)!;
  assert.equal(r.comparativo.length, 3);
  assert.deepEqual(
    [c(v1, m.norte)].map((x) => [x.alumnos, x.inscripciones, x.ingreso_mensual_recurrente, x.ocupados, x.cupo_maximo, x.ocupacion, x.altas_del_mes, x.bajas_del_mes, x.base_al_inicio_del_mes, x.desercion, x.desercion_texto]),
    [[2, 2, "2000.00", 2, 8, "25.0", 1, 0, 2, "0.0", "0.0 %"]],
    "a3 y c1; b1 congelada ya no ocupa lugar; base: a3 y b1",
  );
  assert.deepEqual([c(v2, m.sur)].map((x) => [x.alumnos, x.ingreso_mensual_recurrente, x.ocupados, x.cupo_maximo, x.ocupacion, x.altas_del_mes, x.bajas_del_mes, x.base_al_inicio_del_mes, x.desercion]), [[1, "500.00", 1, 5, "20.0", 0, 1, 2, "50.0"]]);
  assert.deepEqual([c(v1, m.sur)].map((x) => [x.alumnos, x.ingreso_mensual_recurrente, x.ocupacion, x.bajas_del_mes, x.desercion]), [[1, "800.00", "100.0", 0, "0.0"]]);
  // Lo del comparativo suma lo del reporte.
  assert.equal(r.comparativo.reduce((n, x) => n + x.alumnos, 0), r.activos.total_alumnos);
  assert.equal(sumar(...r.comparativo.map((x) => deTexto(x.ingreso_mensual_recurrente))), deTexto(r.ingreso_mensual_recurrente));
  assert.deepEqual([r.comparativo.reduce((n, x) => n + x.altas_del_mes, 0), r.comparativo.reduce((n, x) => n + x.bajas_del_mes, 0), r.comparativo.reduce((n, x) => n + x.base_al_inicio_del_mes, 0)], [r.altas_del_mes, r.bajas_del_mes, r.base_al_inicio_del_mes]);
  // Horarios por grupo y mapa de ocupación (día 0 = domingo; el lunes 16 junta N1 y N2).
  const g = (id: string) => r.ocupacion_por_grupo.find((x) => x.grupo.id === id)!;
  assert.deepEqual(g(grupo["N1"]!).horarios, [{ dia_semana: 1, hora_inicio_min: 960, hora_fin_min: 1020 }, { dia_semana: 3, hora_inicio_min: 960, hora_fin_min: 1020 }]);
  assert.equal(g(grupo["N1"]!).horario_texto, "lunes y miércoles de 16:00 a 17:00");
  assert.equal(r.ocupacion_por_grupo[0]!.grupo.id, grupo["S1"], "el más lleno primero");
  assert.deepEqual(r.mapa_ocupacion.map((x) => [x.dia_semana, x.hora, x.grupos, x.ocupados, x.cupo_maximo, x.ocupacion, x.estado]), [
    [4, 10, 1, 1, 1, "100.0", "a_reventar"],
    [1, 16, 2, 2, 8, "25.0", "vacio"],
    [3, 16, 1, 0, 4, "0.0", "vacio"],
    [5, 19, 1, 1, 5, "20.0", "vacio"],
  ]);
});

test("ejecutivo con filtros: la disciplina y la sucursal acotan inscripciones, ocupación, mapa y comparativo; y se intersectan con el alcance del asesor", async () => {
  const d2 = (await ejecutivo(`&vertical_id=${v2}`)).cuerpo;
  assert.deepEqual([d2.activos.total_alumnos, d2.ingreso_mensual_recurrente, d2.altas_del_mes, d2.bajas_del_mes, d2.base_al_inicio_del_mes, d2.desercion], [1, "500.00", 0, 1, 2, "50.0"]);
  assert.deepEqual(d2.ocupacion_por_grupo.map((x) => x.grupo.id), [grupo["S2"]]);
  assert.deepEqual(d2.mapa_ocupacion.map((x) => [x.dia_semana, x.hora]), [[5, 19]]);
  assert.deepEqual(d2.comparativo.map((x) => [x.vertical.id, x.sucursal.id]), [[v2, m.sur]]);
  const norte = (await ejecutivo(`&sucursal_id=${m.norte}`)).cuerpo;
  assert.deepEqual([norte.activos.total_alumnos, norte.ingreso_mensual_recurrente, norte.altas_del_mes, norte.bajas_del_mes, norte.base_al_inicio_del_mes], [2, "2000.00", 1, 0, 2]);
  assert.ok(norte.ocupacion_por_grupo.every((x) => x.sucursal.id === m.norte));
  const ambas = (await ejecutivo(`&sucursal_id=${m.sur}&vertical_id=${v1}`)).cuerpo;
  assert.deepEqual([ambas.activos.total_alumnos, ambas.ingreso_mensual_recurrente, ambas.comparativo.length], [1, "800.00", 1]);
  // Un asesor de Norte pidiendo Sur no ve nada (no se confirma que exista); pidiendo Norte, lo suyo.
  const fuera = (await ejecutivo(`&sucursal_id=${m.sur}`, m.asesorNorte)).cuerpo;
  assert.deepEqual([fuera.activos.total_alumnos, fuera.ingreso_mensual_recurrente, fuera.ocupacion_por_grupo.length, fuera.comparativo.length, fuera.cartera_vencida.total], [0, "0.00", 0, 0, "0.00"]);
  const suyo = (await ejecutivo(`&sucursal_id=${m.norte}`, m.asesorNorte)).cuerpo;
  assert.deepEqual([suyo.activos.total_alumnos, suyo.ingreso_mensual_recurrente], [2, "2000.00"]);
  assert.equal((await ejecutivo("&sucursal_id=no-es-un-uuid")).estado, 400);
  assert.equal((await ejecutivo(`&vertical_id=${randomUUID()}`)).cuerpo.activos.total_alumnos, 0, "una disciplina que no existe da un reporte vacío");
});

test("cartera vencida: las familias con atraso (en total y por tramo) coinciden con una cuenta independiente sobre los cargos, también con filtro de disciplina", async () => {
  const hoy = "2026-11-10";
  const independiente = async (vertical?: string) => {
    const cargos = await prisma.cargo.findMany({
      where: { organizacion_id: m.org.organizacionId, eliminado_en: null, estatus: { in: ["pendiente", "vencido"] }, ...(vertical ? { inscripcion: { grupo: { programa: { vertical_id: vertical } } } } : {}) },
      select: { tutor_id: true, monto_final: true, monto_pagado: true, fecha_vencimiento: true },
    });
    const tramos: Record<string, Set<string>> = { de_0_a_30: new Set(), de_31_a_60: new Set(), de_61_a_90: new Set(), mas_de_90: new Set() };
    const todas = new Set<string>();
    for (const c of cargos) {
      const atraso = diasEntre(c.fecha_vencimiento.toISOString().slice(0, 10), hoy);
      if (atraso <= 0 || deTexto(c.monto_final.toFixed(2)) - deTexto(c.monto_pagado.toFixed(2)) <= 0n) continue;
      tramos[atraso <= 30 ? "de_0_a_30" : atraso <= 60 ? "de_31_a_60" : atraso <= 90 ? "de_61_a_90" : "mas_de_90"]!.add(c.tutor_id);
      todas.add(c.tutor_id);
    }
    return { familias: todas.size, tramos: Object.fromEntries(Object.entries(tramos).map(([k, v]) => [k, v.size])) };
  };
  const todo = (await ejecutivo()).cuerpo.cartera_vencida;
  const esperado = await independiente();
  assert.ok(esperado.familias > 0, "el escenario deja familias con atraso");
  assert.deepEqual([todo.familias, todo.familias_por_tramo], [esperado.familias, esperado.tramos]);
  const d2 = (await ejecutivo(`&vertical_id=${v2}`)).cuerpo.cartera_vencida;
  const esperado2 = await independiente(v2);
  assert.deepEqual([d2.familias, d2.familias_por_tramo], [esperado2.familias, esperado2.tramos]);
  assert.ok(d2.familias < todo.familias, "con la disciplina 2 hay menos familias");
});

test("embudo: cuántos alcanzaron cada etapa (saltarse etapas cuenta), la mayor caída, los inscritos y por qué se pierden", async () => {
  const r = (await embudo()).cuerpo;
  // 9 leads de octubre: 5 en Norte (disciplina 1), 3 en Sur (disciplina 2) y 1 sin sucursal. El de septiembre y el de noviembre no cuentan.
  assert.equal(r.llegaron, 9);
  assert.deepEqual(r.etapas.map((e) => [e.etapa.tipo_sistema, e.alcanzaron, e.porcentaje, e.caida, e.caida_porcentaje, e.es_mayor_caida]), [
    ["nuevo", 9, "100.0", 0, null, false],
    ["contactado", 5, "55.6", 4, "44.4", true],
    ["muestra_agendada", 3, "33.3", 2, "40.0", false],
    ["muestra_asistida", 3, "33.3", 0, "0.0", false],
    ["negociacion", 3, "33.3", 0, "0.0", false],
    ["inscrito", 2, "22.2", 1, "33.3", false],
  ]);
  assert.deepEqual([r.etapas.map((e) => e.etapa.nombre), r.etapas.at(-1)!.etapa.es_ganado], [["Primera", "Etapa B", "Etapa C", "Etapa D", "Etapa E", "Etapa F"], true], "los nombres son de la tabla; la etapa de pérdida no está en el embudo");
  assert.deepEqual([r.inscritos, r.conversion], [2, "22.2"]);
  assert.equal(r.perdidos.total, 3);
  assert.deepEqual(r.perdidos.por_motivo.map((x) => [x.motivo?.id ?? null, x.leads]), [[motivoPerdida["P2"], 1], [motivoPerdida["P1"], 1], [null, 1]], "sin motivo va al final");
  assert.deepEqual(r.desde, "2026-10-01");
});

test("embudo con filtros: la disciplina y la sucursal acotan la cohorte; el empate de caídas lo gana la primera etapa", async () => {
  const d2 = (await embudo(`&vertical_id=${v2}`)).cuerpo;
  assert.equal(d2.llegaron, 3);
  assert.deepEqual(d2.etapas.map((e) => [e.alcanzaron, e.caida, e.es_mayor_caida]), [[3, 0, false], [2, 1, true], [1, 1, false], [1, 0, false], [1, 0, false], [1, 0, false]]);
  assert.deepEqual([d2.inscritos, d2.conversion, d2.perdidos.total], [1, "33.3", 2]);
  const sur = (await embudo(`&sucursal_id=${m.sur}`)).cuerpo;
  assert.deepEqual([sur.llegaron, sur.inscritos], [3, 1]);
  const d1 = (await embudo(`&vertical_id=${v1}`)).cuerpo;
  assert.deepEqual([d1.llegaron, d1.etapas[1]!.alcanzaron, d1.inscritos, d1.perdidos.total], [6, 3, 1, 1]);
  const nada = (await embudo(`&vertical_id=${randomUUID()}`)).cuerpo;
  assert.deepEqual([nada.llegaron, nada.inscritos, nada.conversion, nada.etapas.every((e) => e.alcanzaron === 0 && !e.es_mayor_caida && e.porcentaje === null)], [0, 0, null, true], "sin leads no hay porcentajes ni caída");
  assert.equal((await m.admin.get("/api/reportes/embudo?desde=2026-10-31&hasta=2026-10-01")).estado, 400);
  assert.equal((await m.admin.get("/api/reportes/embudo?desde=ayer")).estado, 400);
});

test("fuentes: leads, inscritos, conversión, gasto y costo por alumno al centavo; las fuentes sin campaña van aparte; la campaña con gasto y sin leads también sale", async () => {
  const r = (await fuentes()).cuerpo;
  assert.equal(r.incluye_gasto, true);
  const f = (clave: string) => r.filas.find((x) => x.clave === clave)!;
  assert.deepEqual([f(`campana:${camp["C1"]}`)].map((x) => [x.fuente, x.campana?.nombre, x.leads, x.inscritos, x.conversion, x.gasto, x.costo_por_alumno, x.es_mas_barato]), [["facebook", "Campaña C1", 3, 1, "33.3", "1333.33", "1333.33", false]], "el gasto de septiembre no entra");
  assert.deepEqual([f(`campana:${camp["C2"]}`)].map((x) => [x.leads, x.inscritos, x.conversion, x.gasto, x.costo_por_alumno, x.es_mas_barato]), [[4, 1, "25.0", "450.00", "450.00", true]]);
  assert.deepEqual([f(`campana:${camp["C3"]}`)].map((x) => [x.leads, x.inscritos, x.conversion, x.gasto, x.costo_por_alumno]), [[0, 0, null, "300.00", null]], "gasto sin leads: costo «—» (null)");
  assert.deepEqual([f("fuente:landing"), f("fuente:directo")].map((x) => [x.campana, x.leads, x.inscritos, x.conversion, x.gasto, x.costo_por_alumno]), [[null, 1, 0, "0.0", "0.00", null], [null, 1, 0, "0.0", "0.00", null]]);
  assert.deepEqual(r.filas.map((x) => x.clave), [`campana:${camp["C2"]}`, `campana:${camp["C1"]}`, "fuente:directo", "fuente:landing", `campana:${camp["C3"]}`], "más leads primero y, a igualdad, por nombre");
  // Total: 2 083.33 de gasto entre los 2 inscritos de campañas con gasto = 1 041.665 → 1 041.67.
  assert.deepEqual(r.total, { leads: 9, inscritos: 2, conversion: "22.2", gasto: "2083.33", inscritos_con_gasto: 2, inscritos_sin_costo: 0, costo_por_alumno: "1041.67" });
});

test("fuentes con filtro: el gasto de una campaña se reparte según la parte de sus leads que cae en el filtro; sin leads, cuenta completo solo si es compatible", async () => {
  const d1 = (await fuentes(`&vertical_id=${v1}`)).cuerpo;
  const f1 = (clave: string) => d1.filas.find((x) => x.clave === clave);
  assert.deepEqual([f1(`campana:${camp["C1"]}`)].map((x) => [x?.leads, x?.gasto]), [[3, "1333.33"]]);
  assert.deepEqual([f1(`campana:${camp["C2"]}`)].map((x) => [x?.leads, x?.inscritos, x?.gasto, x?.costo_por_alumno]), [[1, 0, "112.50", null]], "450.00 × 1 de 4 leads");
  assert.equal(f1(`campana:${camp["C3"]}`), undefined, "la campaña de la disciplina 2 no es compatible");
  assert.deepEqual(d1.total, { leads: 6, inscritos: 1, conversion: "16.7", gasto: "1445.83", inscritos_con_gasto: 1, inscritos_sin_costo: 0, costo_por_alumno: "1445.83" });
  const d2 = (await fuentes(`&vertical_id=${v2}`)).cuerpo;
  const f2 = (clave: string) => d2.filas.find((x) => x.clave === clave);
  assert.deepEqual([f2(`campana:${camp["C2"]}`)].map((x) => [x?.leads, x?.inscritos, x?.gasto, x?.costo_por_alumno]), [[3, 1, "337.50", "337.50"]], "450.00 × 3 de 4 leads");
  assert.deepEqual([f2(`campana:${camp["C3"]}`)].map((x) => [x?.leads, x?.gasto]), [[0, "300.00"]], "compatible: la campaña es de esa disciplina");
  assert.equal(f2(`campana:${camp["C1"]}`), undefined, "sin leads en el filtro y con su gasto repartido en cero no sale");
  assert.deepEqual([d2.total.gasto, d2.total.inscritos_con_gasto, d2.total.costo_por_alumno], ["637.50", 1, "637.50"]);
  const sur = (await fuentes(`&sucursal_id=${m.sur}`)).cuerpo;
  assert.deepEqual([sur.total.leads, sur.filas.find((x) => x.clave === `campana:${camp["C2"]}`)!.gasto], [3, "337.50"]);
});

test("evolución: 12 meses de altas, bajas, activos e ingreso recurrente; el último punto coincide con el reporte ejecutivo y cada mes con el suyo", async () => {
  const r = (await evolucion()).cuerpo;
  assert.deepEqual([r.mes, r.hasta, r.meses.length, r.meses[0]!.mes, r.meses[11]!.mes], ["2026-11", "2026-11-10", 12, "2025-12", "2026-11"]);
  const mes = (p: string) => r.meses.find((x) => x.mes === p)!;
  assert.deepEqual([mes("2026-08")].map((x) => [x.altas, x.bajas, x.activos, x.inscripciones_activas, x.ingreso_mensual_recurrente]), [[0, 0, 0, 0, "0.00"]]);
  // Fin de septiembre: activas a2, a3 y a4 (a1 se dio de baja el 20). Fin de octubre: a3, a4, b1, b2 y d1 (a2 se fue el 15).
  assert.deepEqual([mes("2026-09")].map((x) => [x.altas, x.bajas, x.activos, x.ingreso_mensual_recurrente]), [[4, 1, 3, "2500.00"]]);
  assert.deepEqual([mes("2026-10")].map((x) => [x.altas, x.bajas, x.activos, x.ingreso_mensual_recurrente]), [[3, 1, 5, "3800.00"]]);
  // Hoy: b1 congelada desde el 3 y b2 de baja el 5.
  assert.deepEqual([mes("2026-11")].map((x) => [x.altas, x.bajas, x.activos, x.ingreso_mensual_recurrente]), [[1, 1, 4, "3300.00"]]);
  const hoy = (await ejecutivo()).cuerpo;
  assert.deepEqual([mes("2026-11").activos, mes("2026-11").inscripciones_activas, mes("2026-11").ingreso_mensual_recurrente], [hoy.activos.total_alumnos, hoy.activos.total_inscripciones, hoy.ingreso_mensual_recurrente]);
  for (const p of ["2026-09", "2026-10", "2026-11"]) {
    const e = (await ejecutivo("", m.admin, p)).cuerpo;
    assert.deepEqual([mes(p).altas, mes(p).bajas], [e.altas_del_mes, e.bajas_del_mes], `altas y bajas de ${p} iguales al ejecutivo`);
  }
  // Con filtro: la disciplina 2 (a4 activa, b2 de baja).
  const d2 = (await evolucion(`&vertical_id=${v2}`)).cuerpo;
  assert.deepEqual(d2.meses.slice(-3).map((x) => [x.mes, x.altas, x.bajas, x.activos, x.ingreso_mensual_recurrente]), [["2026-09", 1, 0, 1, "500.00"], ["2026-10", 1, 0, 2, "1000.00"], ["2026-11", 0, 1, 1, "500.00"]]);
  // Otra ventana: terminar en octubre corta el último punto a fin de octubre.
  const octubre = (await m.admin.get<ReporteDeEvolucion>("/api/reportes/evolucion?mes=2026-10")).cuerpo;
  assert.deepEqual([octubre.hasta, octubre.meses.at(-1)!.mes, octubre.meses.at(-1)!.activos, octubre.meses.at(-1)!.ingreso_mensual_recurrente], ["2026-10-31", "2026-10", 5, "3800.00"]);
});

test("evolución: retención por cohortes (siguen al mes k), con lo que todavía no pasa en null y el promedio ponderado", async () => {
  const r = (await evolucion()).cuerpo;
  const c = (p: string) => r.cohortes.find((x) => x.mes === p)!;
  // Septiembre: a1..a4; a1 se fue en septiembre y a2 el 15 de octubre → siguen 2 de 4 al mes 1 (fin de octubre) y al mes 2 (hoy).
  assert.deepEqual([c("2026-09").altas, ...c("2026-09").seguimiento.map((s) => [s.mes_n, s.siguen, s.porcentaje])], [4, [1, 2, "50.0"], [2, 2, "50.0"], [3, null, null], [4, null, null], [5, null, null], [6, null, null]]);
  // Octubre: b1, b2, d1; b2 se fue el 5 de noviembre → 2 de 3 al mes 1 (hoy).
  assert.deepEqual([c("2026-10").altas, c("2026-10").seguimiento[0], c("2026-10").seguimiento[1]], [3, { mes_n: 1, siguen: 2, porcentaje: "66.7" }, { mes_n: 2, siguen: null, porcentaje: null }]);
  assert.deepEqual([c("2026-11").altas, c("2026-11").seguimiento.every((s) => s.siguen === null)], [1, true], "la cohorte del mes en curso todavía no tiene seguimiento");
  assert.deepEqual([c("2026-05").altas, c("2026-05").seguimiento[0]], [0, { mes_n: 1, siguen: 0, porcentaje: null }], "una cohorte sin altas no tiene porcentaje");
  // Promedio ponderado: mes 1 = (2 + 2) / (4 + 3); mes 2 = 2 / 4; mes 3 todavía nadie.
  assert.deepEqual(r.promedio.slice(0, 3), [{ mes_n: 1, siguen: 4, altas: 7, porcentaje: "57.1" }, { mes_n: 2, siguen: 2, altas: 4, porcentaje: "50.0" }, { mes_n: 3, siguen: 0, altas: 0, porcentaje: null }]);
});

test("permisos y alcance: administrador y asesor sí; recepción y maestro 403; sin sesión 401; el asesor solo ve lo de sus sucursales y el gasto es solo del administrador", async () => {
  for (const ruta of ["embudo?desde=2026-10-01", "fuentes?desde=2026-10-01", "evolucion"]) {
    assert.equal((await m.recepcion.get(`/api/reportes/${ruta}`)).estado, 403, ruta);
    assert.equal((await m.maestro.get(`/api/reportes/${ruta}`)).estado, 403, ruta);
    assert.equal((await m.api.cliente().get(`/api/reportes/${ruta}`)).estado, 401, ruta);
    assert.equal((await m.asesorNorte.get(`/api/reportes/${ruta}`)).estado, 200, ruta);
  }
  // Los leads del asesor: los de su sucursal y los que aún no tienen sucursal (decisión 5 de V2).
  assert.equal((await embudo("", m.asesorNorte)).cuerpo.llegaron, 6);
  assert.equal((await embudo("", m.asesorSur)).cuerpo.llegaron, 4);
  assert.equal((await embudo(`&sucursal_id=${m.sur}`, m.asesorNorte)).cuerpo.llegaron, 0, "pedir una sucursal que no es suya no confirma que existe");
  const suyo = (await fuentes("", m.asesorNorte)).cuerpo;
  assert.deepEqual([suyo.incluye_gasto, suyo.total.gasto, suyo.total.costo_por_alumno, suyo.total.inscritos_con_gasto, suyo.filas.every((x) => x.gasto === null && x.costo_por_alumno === null && !x.es_mas_barato)], [false, null, null, null, true]);
  assert.equal(suyo.total.leads, 6);
  assert.doesNotMatch(JSON.stringify(suyo), /1333|450\.00|300\.00/, "el gasto no sale para el asesor");
  // Evolución: solo las inscripciones de su sucursal (a1, a2, a3, b1, c1 en Norte).
  const evo = (await evolucion("", m.asesorNorte)).cuerpo;
  assert.deepEqual(evo.meses.slice(-3).map((x) => [x.altas, x.activos, x.ingreso_mensual_recurrente]), [[3, 2, "2000.00"], [1, 2, "2000.00"], [1, 2, "2000.00"]]);
  assert.equal((await evolucion("&mes=2026-13")).estado, 400);
  assert.equal((await evolucion("&mes=nov")).estado, 400);
});

test("aislamiento: otra organización no ve nada de esta en ninguno de los reportes (ni con ids de esta en los filtros)", async () => {
  const otro = await mundoDeFinanzas(prisma, "Tablero ajeno");
  try {
    const e = (await otro.admin.get<ReporteEjecutivo>("/api/reportes/ejecutivo?mes=2026-11")).cuerpo;
    assert.deepEqual([e.activos.total_alumnos, e.ocupacion_por_grupo.length, e.mapa_ocupacion.length, e.comparativo.length, e.bajas_por_motivo.length, e.cartera_vencida.familias], [0, 0, 0, 0, 0, 0]);
    const filtrado = (await otro.admin.get<ReporteEjecutivo>(`/api/reportes/ejecutivo?mes=2026-11&vertical_id=${v1}&sucursal_id=${m.norte}`)).cuerpo;
    assert.deepEqual([filtrado.activos.total_alumnos, filtrado.comparativo.length], [0, 0]);
    const b = (await otro.admin.get<ReporteDeEmbudo>(`/api/reportes/embudo?desde=2026-10-01&hasta=2026-10-31&vertical_id=${v1}`)).cuerpo;
    assert.deepEqual([b.llegaron, b.inscritos, b.perdidos.total, b.perdidos.por_motivo.length], [0, 0, 0, 0]);
    const f = (await otro.admin.get<ReporteDeFuentes>("/api/reportes/fuentes?desde=2026-10-01&hasta=2026-10-31")).cuerpo;
    assert.deepEqual([f.filas.length, f.total.leads, f.total.gasto], [0, 0, "0.00"], "ni las campañas ni los gastos de la otra organización");
    const ev = (await otro.admin.get<ReporteDeEvolucion>("/api/reportes/evolucion?mes=2026-11")).cuerpo;
    assert.ok(ev.meses.every((x) => x.altas === 0 && x.activos === 0 && x.ingreso_mensual_recurrente === "0.00"));
    assert.ok(ev.cohortes.every((x) => x.altas === 0));
  } finally {
    await otro.cerrar();
  }
});

test("lo borrado no cuenta: un lead, una inscripción y un gasto dados de baja salen de los reportes", async () => {
  const w = await mundoDeFinanzas(prisma, "Tablero borrados");
  try {
    const etapas = Object.fromEntries((await prisma.etapa_pipeline.findMany({ where: { organizacion_id: w.org.organizacionId, tipo_sistema: { not: null } } })).map((e) => [e.tipo_sistema!, e.id]));
    const camp1 = (await prisma.campana.create({ data: { organizacion_id: w.org.organizacionId, nombre: "Campaña borrable", origen: "facebook" } })).id;
    const a = await sembrarFamilia(prisma, w.org, {});
    const b = await sembrarFamilia(prisma, w.org, {});
    for (const l of [a, b]) {
      await prisma.lead.update({ where: { id: l.leadId }, data: { campana_id: camp1, creado_en: new Date("2026-10-10T16:00:00Z"), etapa_id: etapas["inscrito"]! } });
      await prisma.lead_etapa_historial.create({ data: { organizacion_id: w.org.organizacionId, lead_id: l.leadId, etapa_nueva_id: etapas["inscrito"]!, origen: "sistema" } });
    }
    const gastoId = (await w.admin.post<{ id: string }>(`/api/campanas/${camp1}/gastos`, { fecha: "2026-10-05", monto: "100.00" })).cuerpo.id;
    const rango = "desde=2026-10-01&hasta=2026-10-31";
    const antes = (await w.admin.get<ReporteDeFuentes>(`/api/reportes/fuentes?${rango}`)).cuerpo;
    assert.deepEqual([antes.total.leads, antes.total.inscritos, antes.total.gasto, antes.total.costo_por_alumno], [2, 2, "100.00", "50.00"]);
    assert.equal((await w.admin.get<ReporteDeEmbudo>(`/api/reportes/embudo?${rango}`)).cuerpo.llegaron, 2);
    // Se da de baja un lead y el gasto (soft delete, invariante 3).
    await prisma.lead.update({ where: { id: b.leadId }, data: { eliminado_en: new Date() } });
    assert.equal((await w.admin.delete(`/api/campanas/${camp1}/gastos/${gastoId}`)).estado, 204);
    const despues = (await w.admin.get<ReporteDeFuentes>(`/api/reportes/fuentes?${rango}`)).cuerpo;
    assert.deepEqual([despues.total.leads, despues.total.inscritos, despues.total.gasto, despues.total.costo_por_alumno, despues.filas.length], [1, 1, "0.00", null, 1]);
    const emb = (await w.admin.get<ReporteDeEmbudo>(`/api/reportes/embudo?${rango}`)).cuerpo;
    assert.deepEqual([emb.llegaron, emb.inscritos], [1, 1]);
    // Una inscripción dada de baja lógica sale de la serie y del ejecutivo.
    w.reloj.ahora = new Date("2026-10-06T16:00:00Z");
    const { grupoId } = await w.programa({ cupo: 5, mensualidad: "700.00" });
    const i1 = await w.inscribir({ grupoId });
    await w.inscribir({ grupoId });
    w.reloj.ahora = new Date("2026-11-10T16:00:00Z");
    assert.equal((await w.admin.get<ReporteDeEvolucion>("/api/reportes/evolucion?mes=2026-11")).cuerpo.meses.at(-1)!.activos, 2);
    await prisma.inscripcion.update({ where: { id: i1.inscripcionId }, data: { eliminado_en: new Date() } });
    const evo = (await w.admin.get<ReporteDeEvolucion>("/api/reportes/evolucion?mes=2026-11")).cuerpo;
    assert.deepEqual([evo.meses.at(-1)!.activos, evo.meses.at(-1)!.ingreso_mensual_recurrente, evo.meses.find((x) => x.mes === "2026-10")!.altas], [1, "700.00", 1]);
    const ej = (await w.admin.get<ReporteEjecutivo>("/api/reportes/ejecutivo?mes=2026-11")).cuerpo;
    assert.deepEqual([ej.activos.total_alumnos, ej.ingreso_mensual_recurrente, ej.comparativo.map((x) => x.alumnos)], [1, "700.00", [1]]);
  } finally {
    await w.cerrar();
  }
});
