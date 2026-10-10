// Costo por alumno inscrito por campaña (I2): el número que le dice a la escuela dónde poner su presupuesto. El GASTO lo captura a mano el administrador (`gasto_campana`);
// todo lo demás sale de lo que el sistema ya sabe.
//
// DEFINICIONES
//   · gasto = Σ de los gastos de la campaña con fecha en el rango (inclusive). Dinero exacto (centavos `bigint`).
//   · leads = los leads de la campaña creados en el rango (día LOCAL de `creado_en`, en la zona de su sucursal de interés o, sin ella, de la primera sucursal). clases muestra = las agendadas de esos leads con día LOCAL de clase (zona de la sucursal del grupo) en el rango (sin las reagendadas,
//     que las reemplaza la nueva) y, de ellas, las asistidas.
//   · inscripciones activas = las inscripciones ACTIVAS hoy con origen en la campaña (`inscripcion.lead_id → lead.campana_id`) cuya fecha de inscripción cae en el rango.
//   · inscritos a mano (V10b) = los leads de la campaña que una persona marcó como inscritos con la inscripción apagada y que NO tienen ninguna inscripción real (`src/embudo/inscrito-a-mano.ts`),
//     con el día LOCAL de la marca en el rango. Un lead marcado a mano que después se inscribió de verdad ya NO es «a mano»: cuenta una sola vez, por su inscripción.
//   · alumnos inscritos = inscripciones activas + inscritos a mano (el divisor del costo por alumno). Un lead inscrito a mano cuenta como UN alumno: el sistema no sabe cuántos niños eran.
//   · costo por lead = gasto / leads; costo por clase muestra = gasto / clases muestra agendadas; costo por alumno inscrito = gasto / alumnos inscritos. Cada cociente se
//     redondea al centavo (mitad alejándose de cero). Sin divisor NO hay división por cero: el valor es null y el texto es «—».

import { aFecha, sumarDias, type FechaISO } from "../catalogo/precios.ts";
import type { BaseDatos } from "../datos/alcance.ts";
import { inscritosAMano } from "../embudo/inscrito-a-mano.ts";
import { aTexto, deDecimal, deTexto, dividir, sumar, type Centavos } from "../lib/dinero.ts";
import { fechaLocal } from "../lib/horario.ts";
import { oGuion } from "../lib/razon.ts";

export interface FiltrosDeCosto {
  desde?: FechaISO;
  hasta?: FechaISO;
  campanaId?: string;
}

export interface FilaDeCostoPorCampana {
  campana: { id: string; nombre: string; origen: string };
  gasto: string;
  leads: number;
  clases_muestra: number;
  clases_asistidas: number;
  inscripciones_activas: number;
  /** V10b: leads de la campaña marcados a mano como inscritos (sin inscripción real). Se suman a las inscripciones activas para el costo por alumno. */
  inscritos_a_mano: number;
  /** V10b: `inscripciones_activas` + `inscritos_a_mano`: el divisor del costo por alumno. */
  alumnos_inscritos: number;
  costo_por_lead: string | null;
  costo_por_clase_muestra: string | null;
  costo_por_alumno: string | null;
  costo_por_lead_texto: string;
  costo_por_clase_muestra_texto: string;
  costo_por_alumno_texto: string;
}

export interface ReporteDeCostoPorCampana {
  desde: FechaISO | null;
  hasta: FechaISO | null;
  filas: FilaDeCostoPorCampana[];
  total: Omit<FilaDeCostoPorCampana, "campana">;
}

/** gasto / divisor al centavo, o null sin divisor. PURA. */
export function costoPor(gasto: Centavos, divisor: number): string | null {
  return divisor > 0 ? aTexto(dividir(gasto, divisor)) : null;
}

function fila(gasto: Centavos, leads: number, clases: number, asistidas: number, inscripciones: number, aMano: number) {
  const [porLead, porClase, porAlumno] = [costoPor(gasto, leads), costoPor(gasto, clases), costoPor(gasto, inscripciones + aMano)];
  return {
    gasto: aTexto(gasto),
    leads,
    clases_muestra: clases,
    clases_asistidas: asistidas,
    inscripciones_activas: inscripciones,
    inscritos_a_mano: aMano,
    alumnos_inscritos: inscripciones + aMano,
    costo_por_lead: porLead,
    costo_por_clase_muestra: porClase,
    costo_por_alumno: porAlumno,
    costo_por_lead_texto: oGuion(porLead),
    costo_por_clase_muestra_texto: oGuion(porClase),
    costo_por_alumno_texto: oGuion(porAlumno),
  };
}

export async function reporteDeCostoPorCampana(db: BaseDatos, f: FiltrosDeCosto = {}): Promise<ReporteDeCostoPorCampana> {
  const enRangoDia = () => ({ ...(f.desde ? { gte: aFecha(f.desde) } : {}), ...(f.hasta ? { lte: aFecha(f.hasta) } : {}) });
  // Los leads y las clases se ubican por su DÍA LOCAL (la zona de su sucursal; el lead sin sucursal, la de la primera de la organización). Se pide una ventana UTC holgada (±1 día)
  // y el filtro exacto se hace en memoria, como en I1.
  const ventana = f.desde || f.hasta ? { ...(f.desde ? { gte: aFecha(sumarDias(f.desde, -1)) } : {}), ...(f.hasta ? { lt: aFecha(sumarDias(f.hasta, 2)) } : {}) } : null;
  const dentro = (instante: Date, zona: string): boolean => {
    const dia = fechaLocal(instante, zona);
    return (!f.desde || dia >= f.desde) && (!f.hasta || dia <= f.hasta);
  };
  const zonaPorOmision = (await db.sucursal.findFirst({ orderBy: [{ creado_en: "asc" }, { id: "asc" }], select: { zona_horaria: true } }))?.zona_horaria ?? "UTC";
  const campanas = await db.campana.findMany({ where: f.campanaId ? { id: f.campanaId } : {}, orderBy: [{ nombre: "asc" }, { id: "asc" }], select: { id: true, nombre: true, origen: true } });
  const ids = campanas.map((c) => c.id);
  const [gastos, leadsTodos, clasesTodas, inscripciones] = await Promise.all([
    db.gasto_campana.findMany({ where: { campana_id: { in: ids }, ...(f.desde || f.hasta ? { fecha: enRangoDia() } : {}) }, select: { campana_id: true, monto: true } }),
    db.lead.findMany({ where: { campana_id: { in: ids }, ...(ventana ? { creado_en: ventana } : {}) }, select: { campana_id: true, creado_en: true, sucursal_interes: { select: { zona_horaria: true } } } }),
    db.clase_muestra.findMany({ where: { estatus: { not: "reagendada" }, lead: { campana_id: { in: ids } }, ...(ventana ? { fecha_hora: ventana } : {}) }, select: { estatus: true, fecha_hora: true, lead: { select: { campana_id: true } }, grupo: { select: { programa: { select: { sucursal: { select: { zona_horaria: true } } } } } } } }),
    db.inscripcion.findMany({ where: { estatus: "activa", lead: { campana_id: { in: ids } }, ...(f.desde || f.hasta ? { fecha_inscripcion: enRangoDia() } : {}) }, select: { lead: { select: { campana_id: true } } } }),
  ]);
  // V10b: los inscritos a mano de estas campañas, en su día local.
  const manos = await inscritosAMano(db);
  const leadsAMano = manos.size === 0 ? [] : await db.lead.findMany({ where: { id: { in: [...manos.keys()] }, campana_id: { in: ids } }, select: { id: true, campana_id: true, sucursal_interes: { select: { zona_horaria: true } } } });
  const aMano = leadsAMano.filter((l) => dentro(manos.get(l.id)!.en, l.sucursal_interes?.zona_horaria ?? zonaPorOmision));
  const leads = leadsTodos.filter((l) => dentro(l.creado_en, l.sucursal_interes?.zona_horaria ?? zonaPorOmision));
  const clases = clasesTodas.filter((c) => dentro(c.fecha_hora, c.grupo.programa.sucursal.zona_horaria));
  const filas: FilaDeCostoPorCampana[] = campanas.map((c) => {
    const g = sumar(...gastos.filter((x) => x.campana_id === c.id).map((x) => deDecimal(x.monto)));
    const cl = clases.filter((x) => x.lead.campana_id === c.id);
    return { campana: c, ...fila(g, leads.filter((x) => x.campana_id === c.id).length, cl.length, cl.filter((x) => x.estatus === "asistio").length, inscripciones.filter((x) => x.lead?.campana_id === c.id).length, aMano.filter((x) => x.campana_id === c.id).length) };
  });
  const totalGasto = sumar(...filas.map((x) => deTexto(x.gasto)));
  const total = fila(totalGasto, sum(filas, "leads"), sum(filas, "clases_muestra"), sum(filas, "clases_asistidas"), sum(filas, "inscripciones_activas"), sum(filas, "inscritos_a_mano"));
  return { desde: f.desde ?? null, hasta: f.hasta ?? null, filas, total };
}

const sum = (xs: FilaDeCostoPorCampana[], k: "leads" | "clases_muestra" | "clases_asistidas" | "inscripciones_activas" | "inscritos_a_mano"): number => xs.reduce((n, x) => n + x[k], 0);
