// V10b: los reportes cuentan los DOS casos de «inscrito» —por inscripción y a mano— y los distinguen. Postgres real y la app real, con montos exactos:
//   · reporte de leads (función, comando y CSV de la lista): los dos casos en la etapa de inscrito y el desglose «a mano»;
//   · costo por campaña: el lead inscrito a mano cuenta como alumno inscrito en el divisor del costo por alumno; el desglose dice cuántos son a mano; sin división por cero;
//     un lead marcado a mano que después se inscribió de verdad cuenta UNA sola vez; el rango de fechas aplica al día de la marca;
//   · conversión de clases muestra (asistidas → inscritas): también cuenta al lead marcado a mano;
//   · el tablero ejecutivo no inventa altas con ingreso: un inscrito a mano no cambia alumnos activos, altas ni ingreso;
//   · no-fuga entre organizaciones.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeFinanzas, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { sembrarFamilia } from "../testutil/semilla.ts";
import { reporteLeads } from "./leads.ts";
import { reporteDeCostoPorCampana } from "./costo-campana.ts";
import { reporteDeClasesMuestra } from "./clases-muestra.ts";
import type { ReporteDeCostoPorCampana } from "./costo-campana.ts";
import type { ReporteDeClasesMuestra } from "./clases-muestra.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;
let etapas: Record<string, string>;
let campanaX: string;
let campanaY: string;
let campanaZ: string;
let grupo: string;
const ORG = () => m.org.organizacionId;
const db = () => conAlcance(prisma, ORG());
const MARCA = "Se inscribió en persona y pagó en efectivo";

before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeFinanzas(prisma, "Reportes inscrito a mano");
  etapas = {};
  for (const e of await prisma.etapa_pipeline.findMany({ where: { organizacion_id: ORG() } })) if (e.tipo_sistema) etapas[e.tipo_sistema] = e.id;
  const campana = async (nombre: string, origen: "facebook" | "instagram" | "tiktok") => (await prisma.campana.create({ data: { organizacion_id: ORG(), nombre, origen } })).id;
  [campanaX, campanaY, campanaZ] = [await campana("Campaña X", "facebook"), await campana("Campaña Y", "instagram"), await campana("Campaña Z", "tiktok")];
  grupo = (await m.programa()).grupoId;
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

let n = 0;
/** Un lead de la campaña, creado ese día (mediodía local), con su clase muestra opcional. */
async function lead(campanaId: string, creado: string, o: { etapa?: string; clase?: "asistio" | "agendada" } = {}) {
  const fam = await sembrarFamilia(prisma, m.org, { sucursalId: m.norte, etapaId: etapas[o.etapa ?? "negociacion"]! });
  await prisma.lead.update({ where: { id: fam.leadId }, data: { campana_id: campanaId, creado_en: new Date(`${creado}T18:00:00Z`) } });
  if (o.clase) await prisma.clase_muestra.create({ data: { organizacion_id: ORG(), lead_id: fam.leadId, prospecto_id: fam.prospectoId, grupo_id: grupo, fecha_hora: new Date(`${creado}T22:00:00Z`), estatus: o.clase, agendada_por: "usuario", agendada_por_usuario_id: m.adminId } });
  return fam;
}
/** Una persona lo marcó a mano ese día (mediodía local); el lead queda en «inscrito». */
async function marcarAMano(leadId: string, dia: string, desde = "negociacion") {
  await prisma.lead_etapa_historial.create({ data: { organizacion_id: ORG(), lead_id: leadId, etapa_anterior_id: etapas[desde]!, etapa_nueva_id: etapas["inscrito"]!, origen: "usuario", usuario_id: m.adminId, motivo: "inscripcion_a_mano", nota: MARCA, a_mano: true, creado_en: new Date(`${dia}T18:00:00Z`) } });
  await prisma.lead.update({ where: { id: leadId }, data: { etapa_id: etapas["inscrito"]! } });
}
/** Una inscripción real del prospecto (y el lead en «inscrito», como lo deja la inscripción). */
async function inscribirDeVerdad(fam: { leadId: string; prospectoId: string }, dia: string, estatus: "activa" | "baja" = "activa") {
  const alumno = await prisma.alumno.create({ data: { organizacion_id: ORG(), nombre: `A${++n}`, apellidos: "Prueba", fecha_nacimiento: new Date("2018-01-01") } });
  const g = await prisma.grupo.findUniqueOrThrow({ where: { id: grupo }, select: { programa_id: true } });
  const base = { organizacion_id: ORG(), alumno_id: alumno.id, grupo_id: grupo, programa_id: g.programa_id, lead_id: fam.leadId, prospecto_id: fam.prospectoId, fecha_inscripcion: new Date(dia), fecha_inicio: new Date(dia), precio_inscripcion_aplicado: "100.00", precio_mensualidad_aplicado: "200.00", dia_corte_pago: 5 };
  await prisma.inscripcion.create({ data: estatus === "baja" ? { ...base, estatus: "baja", fecha_baja: new Date(dia), motivo_baja_id: m.motivoBaja } : base });
  await prisma.lead.update({ where: { id: fam.leadId }, data: { etapa_id: etapas["inscrito"]! } });
}

const gasto = async (campanaId: string, monto: string) => assert.equal((await m.admin.post(`/api/campanas/${campanaId}/gastos`, { fecha: "2026-10-03", monto })).estado, 201);
const costo = (qs = "") => m.admin.get<ReporteDeCostoPorCampana>(`/api/reportes/costo-por-alumno${qs}`);
const clases = (qs = "") => m.admin.get<ReporteDeClasesMuestra>(`/api/reportes/clases-muestra${qs}`);
const ejecutivo = () => m.admin.get<Record<string, unknown>>("/api/reportes/ejecutivo?mes=2026-10");

interface Mundo {
  l1: { leadId: string; prospectoId: string };
  l2: { leadId: string; prospectoId: string };
  l3: { leadId: string; prospectoId: string };
  l4: { leadId: string; prospectoId: string };
  l5: { leadId: string; prospectoId: string };
  l6: { leadId: string; prospectoId: string };
  l7: { leadId: string; prospectoId: string };
  l8: { leadId: string; prospectoId: string };
}
let w: Mundo;

test("preparación — casos mixtos: por inscripción, a mano, ambos en el mismo lead, corregido, abierto, de otra campaña, con baja y fuera del rango", async () => {
  // Campaña X, octubre.
  const l1 = await lead(campanaX, "2026-10-04", { clase: "asistio" });
  await inscribirDeVerdad(l1, "2026-10-04"); // por inscripción
  const l2 = await lead(campanaX, "2026-10-05", { clase: "asistio" });
  await marcarAMano(l2.leadId, "2026-10-10"); // a mano
  const l3 = await lead(campanaX, "2026-10-06", { clase: "asistio" });
  await marcarAMano(l3.leadId, "2026-10-08"); // a mano ...
  await inscribirDeVerdad(l3, "2026-10-12"); // ... y después inscrito de verdad: cuenta una sola vez
  const l4 = await lead(campanaX, "2026-10-07");
  await marcarAMano(l4.leadId, "2026-10-09");
  await prisma.lead_etapa_historial.create({ data: { organizacion_id: ORG(), lead_id: l4.leadId, etapa_anterior_id: etapas["inscrito"]!, etapa_nueva_id: etapas["negociacion"]!, origen: "usuario", usuario_id: m.adminId, motivo: "correccion_de_inscrito_a_mano", nota: "Marcada por error, aún no paga" } });
  await prisma.lead.update({ where: { id: l4.leadId }, data: { etapa_id: etapas["negociacion"]! } }); // corregido: ya no es inscrito
  const l5 = await lead(campanaX, "2026-10-08", { clase: "asistio" }); // abierto, asistió y no se inscribió
  const l7 = await lead(campanaX, "2026-10-09");
  await inscribirDeVerdad(l7, "2026-10-09", "baja"); // inscrito y dado de baja
  const l8 = await lead(campanaX, "2026-09-02"); // septiembre: fuera del rango de octubre
  await marcarAMano(l8.leadId, "2026-09-03");
  // Campaña Y: un solo lead, a mano.
  const l6 = await lead(campanaY, "2026-10-11");
  await marcarAMano(l6.leadId, "2026-10-12");
  w = { l1, l2, l3, l4, l5, l6, l7, l8 };
  await gasto(campanaX, "1000.00");
  await gasto(campanaY, "100.00");
  await gasto(campanaZ, "50.00");
});

test("reporte de leads — la etapa de inscrito cuenta los dos casos, el desglose dice cuántos son a mano y un lead cuenta una sola vez", async () => {
  const r = await reporteLeads(db(), { desde: new Date("2026-10-01T00:00:00Z"), hasta: new Date("2026-11-01T00:00:00Z") });
  const fila = (campana: string, etapa: string) => r.filas.find((f) => f.campana === campana && f.etapa === etapa);
  const inscritoX = fila("Campaña X", "Etapa F")!;
  // Campaña X en octubre en «inscrito»: l1 (inscripción), l2 (a mano), l3 (a mano y luego inscripción: cuenta por inscripción) y l7 (inscripción con baja) = 4; a mano = solo l2.
  assert.deepEqual([inscritoX.leads, inscritoX.aMano], [4, 1]);
  assert.deepEqual([fila("Campaña X", "Etapa E")!.leads, fila("Campaña X", "Etapa E")!.aMano], [2, 0], "l4 (corregido) y l5 siguen abiertos: no cuentan como inscritos");
  assert.deepEqual([fila("Campaña Y", "Etapa F")!.leads, fila("Campaña Y", "Etapa F")!.aMano], [1, 1]);
  assert.deepEqual(r.inscritos, { total: 5, porInscripcion: 3, aMano: 2 });
  assert.equal(r.inscritos.total, r.inscritos.porInscripcion + r.inscritos.aMano);
  assert.deepEqual(r.porEtapa.find((e) => e.etapa === "Etapa F"), { etapa: "Etapa F", ordenEtapa: r.porEtapa.find((e) => e.etapa === "Etapa F")!.ordenEtapa, leads: 5, aMano: 2 });
  // Sin rango entra también l8 (septiembre, a mano).
  const todo = await reporteLeads(db());
  assert.deepEqual(todo.inscritos, { total: 6, porInscripcion: 3, aMano: 3 });
  // Filtro por campaña y fecha: el desglose respeta los mismos filtros que el conteo.
  assert.equal(todo.filas.reduce((s, f) => s + f.aMano, 0), 3);
  assert.equal(todo.total, todo.filas.reduce((s, f) => s + f.leads, 0));
});

test("reporte de leads — el comando imprime el desglose (texto y JSON)", () => {
  const correr = (...args: string[]) => spawnSync(process.execPath, ["scripts/reporte-leads.ts", "--organizacion", ORG(), ...args], { env: process.env, encoding: "utf8" });
  const texto = correr("--desde", "2026-10-01", "--hasta", "2026-11-01");
  assert.equal(texto.status, 0, texto.stderr);
  assert.match(texto.stdout.split("\n").find((l) => l.startsWith("Campaña"))!, /A mano$/);
  assert.match(texto.stdout, /Inscritos: 5 \(3 por inscripción, 2 a mano\)/);
  const json = JSON.parse(correr("--desde", "2026-10-01", "--hasta", "2026-11-01", "--json").stdout) as { inscritos: { total: number; porInscripcion: number; aMano: number } };
  assert.deepEqual(json.inscritos, { total: 5, porInscripcion: 3, aMano: 2 });
});

test("lista de leads en CSV — una columna «Cómo se inscribió»: a mano, por inscripción o vacía", async () => {
  const csv = await m.admin.get<string>("/api/exportaciones/leads");
  assert.equal(csv.estado, 200);
  const texto = String(csv.cuerpo).replace(/^\uFEFF/, "");
  const [encabezado, ...filas] = texto.split(/\r?\n/).filter((l) => l !== "");
  const columnas = encabezado!.split(",");
  assert.equal(columnas.at(-1), "Cómo se inscribió");
  const telefono = async (leadId: string) => (await prisma.lead.findFirstOrThrow({ where: { id: leadId } })).telefono!;
  const celda = async (leadId: string): Promise<string | undefined> => {
    const tel = await telefono(leadId);
    return filas.find((f) => f.includes(tel))?.split(",").at(-1)?.replace(/"/g, "");
  };
  assert.equal(await celda(w.l2.leadId), "A mano");
  assert.equal(await celda(w.l1.leadId), "Por inscripción");
  assert.equal(await celda(w.l3.leadId), "Por inscripción", "marcado a mano y después inscrito: cuenta por la inscripción");
  assert.equal(await celda(w.l5.leadId), "", "un lead abierto no tiene esa columna");
  assert.equal(await celda(w.l4.leadId), "", "uno corregido ya no es inscrito");
});

test("costo por campaña — el inscrito a mano es un alumno inscrito más en el divisor; centavos exactos; el desglose lo dice; ninguno cuenta doble", async () => {
  const r = (await costo("?desde=2026-10-01&hasta=2026-10-31")).cuerpo;
  const f = (id: string) => r.filas.find((x) => x.campana.id === id)!;
  const x = f(campanaX);
  // X: activas = l1 y l3 (2); a mano = l2 (1: l3 ya tiene su inscripción, l4 se corrigió y l8 es de septiembre); l7 tiene baja y no es activa ni a mano.
  assert.deepEqual([x.gasto, x.leads, x.inscripciones_activas, x.inscritos_a_mano, x.alumnos_inscritos], ["1000.00", 6, 2, 1, 3]);
  assert.deepEqual([x.costo_por_alumno, x.costo_por_alumno_texto], ["333.33", "333.33"], "1000.00 / 3 = 333.33");
  const y = f(campanaY);
  assert.deepEqual([y.gasto, y.inscripciones_activas, y.inscritos_a_mano, y.alumnos_inscritos, y.costo_por_alumno], ["100.00", 0, 1, 1, "100.00"], "solo a mano: antes salía «—»");
  const z = f(campanaZ);
  assert.deepEqual([z.gasto, z.alumnos_inscritos, z.costo_por_alumno, z.costo_por_alumno_texto], ["50.00", 0, null, "—"], "sin ningún inscrito: «—», no una división por cero");
  assert.deepEqual([r.total.gasto, r.total.inscripciones_activas, r.total.inscritos_a_mano, r.total.alumnos_inscritos, r.total.costo_por_alumno], ["1150.00", 2, 2, 4, "287.50"]);
  // Sin rango también cuenta la marca de septiembre.
  const todo = (await costo()).cuerpo;
  assert.deepEqual([todo.filas.find((q) => q.campana.id === campanaX)!.inscritos_a_mano, todo.total.alumnos_inscritos], [2, 5]);
  // Solo septiembre: la marca de septiembre cuenta ahí y no en octubre; ni l3 ni nadie se cuenta dos veces.
  const sept = (await costo("?desde=2026-09-01&hasta=2026-09-30")).cuerpo;
  assert.deepEqual([sept.filas.find((q) => q.campana.id === campanaX)!.inscritos_a_mano, sept.total.inscritos_a_mano], [1, 1]);
  // Una campaña.
  assert.equal((await costo(`?desde=2026-10-01&hasta=2026-10-31&campana_id=${campanaY}`)).cuerpo.filas.length, 1);
});

test("costo por campaña — la función directa y el CSV traen las columnas nuevas", async () => {
  const directo = await reporteDeCostoPorCampana(db(), { desde: "2026-10-01", hasta: "2026-10-31" });
  assert.equal(directo.total.alumnos_inscritos, directo.total.inscripciones_activas + directo.total.inscritos_a_mano);
  const csv = String((await m.admin.get<string>("/api/reportes/costo-por-alumno?desde=2026-10-01&hasta=2026-10-31&formato=csv")).cuerpo).replace(/^\uFEFF/, "");
  const [encabezado, ...filas] = csv.split(/\r?\n/).filter((l) => l !== "");
  const cols = encabezado!.split(",");
  const iMano = cols.indexOf("Inscritos a mano");
  const iAlumnos = cols.indexOf("Alumnos inscritos");
  const iCosto = cols.indexOf("Costo por alumno inscrito");
  assert.ok(iMano > 0 && iAlumnos > 0 && iCosto > 0, encabezado);
  const total = filas.find((f) => f.startsWith("Total"))!.split(",");
  assert.deepEqual([total[iMano], total[iAlumnos], total[iCosto]], ["2", "4", "287.50"]);
});

test("clases muestra — la conversión cuenta al lead marcado a mano, lo desglosa y no cuenta doble al que ya tiene inscripción", async () => {
  const r = (await clases("?desde=2026-10-01&hasta=2026-10-31")).cuerpo;
  // Asistidas: l1, l2, l3 y l5. Inscritas: l1 y l3 (tienen inscripción) y l2 (a mano). l5 no.
  assert.deepEqual([r.total.asistidas, r.total.inscritas, r.total.inscritas_a_mano, r.total.conversion], [4, 3, 1, "75.0"]);
  const fuente = r.por_fuente.find((f) => f.clave === "facebook")!;
  assert.deepEqual([fuente.asistidas, fuente.inscritas, fuente.inscritas_a_mano], [4, 3, 1]);
  assert.deepEqual([r.por_sucursal[0]!.inscritas, r.por_sucursal[0]!.inscritas_a_mano], [3, 1]);
  const directo = await reporteDeClasesMuestra(db(), { desde: "2026-10-01", hasta: "2026-10-31" });
  assert.equal(directo.total.inscritas_a_mano, 1);
  const csv = String((await m.admin.get<string>("/api/reportes/clases-muestra?desde=2026-10-01&hasta=2026-10-31&formato=csv")).cuerpo);
  assert.match(csv.split(/\r?\n/)[0]!, /De ellas, inscritas a mano/);
});

test("tablero ejecutivo — un inscrito a mano no inventa altas ni ingreso: alumnos activos, altas, bajas y mensualidad quedan como antes", async () => {
  const foto = async () => {
    const e = (await ejecutivo()).cuerpo;
    return { activos: e["activos"], altas: e["altas_del_mes"], bajas: e["bajas_del_mes"], ingreso: e["ingreso_mensual_recurrente"], cartera: e["cartera_vencida"] };
  };
  const antes = await foto();
  const otro = await lead(campanaZ, "2026-10-14");
  await marcarAMano(otro.leadId, "2026-10-15");
  assert.deepEqual(await foto(), antes);
});

test("no-fuga — otra organización no ve las marcas de esta ni las suma en sus reportes", async () => {
  const ajeno = await mundoDeFinanzas(prisma, "Reportes inscrito a mano ajena");
  try {
    const suyas = conAlcance(prisma, ajeno.org.organizacionId);
    assert.deepEqual((await reporteLeads(suyas)).inscritos, { total: 0, porInscripcion: 0, aMano: 0 });
    const c = await ajeno.admin.get<ReporteDeCostoPorCampana>("/api/reportes/costo-por-alumno");
    assert.deepEqual([c.cuerpo.total.inscritos_a_mano, c.cuerpo.total.alumnos_inscritos], [0, 0]);
    assert.deepEqual((await reporteDeClasesMuestra(suyas)).total.inscritas_a_mano, 0);
  } finally {
    await ajeno.cerrar();
  }
});
