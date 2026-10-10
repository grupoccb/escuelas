// Los reportes y listas como filas planas para el CSV (I5). Una sola definición de columnas por reporte: el CSV y la pantalla muestran lo mismo.

import type { Columna } from "../exportacion/csv.ts";
import type { ReporteDeCostoPorCampana, FilaDeCostoPorCampana } from "./costo-campana.ts";
import type { FilaDeClasesMuestra, ReporteDeClasesMuestra } from "./clases-muestra.ts";
import type { FilaDeActivos, FilaDeOcupacion, ReporteEjecutivo } from "./ejecutivo.ts";
import { oGuion } from "../lib/razon.ts";

export interface FilaPlanaDeClases extends FilaDeClasesMuestra {
  dimension: string;
}

export function filasDeClasesMuestra(r: ReporteDeClasesMuestra): FilaPlanaDeClases[] {
  return [
    { dimension: "Total", ...r.total },
    ...r.por_fuente.map((f) => ({ dimension: "Fuente", ...f })),
    ...r.por_vertical.map((f) => ({ dimension: "Vertical", ...f })),
    ...r.por_sucursal.map((f) => ({ dimension: "Sucursal", ...f })),
  ];
}

export const COLUMNAS_DE_CLASES: Columna<FilaPlanaDeClases>[] = [
  { titulo: "Dimensión", valor: (f) => f.dimension },
  { titulo: "Nombre", valor: (f) => f.nombre },
  { titulo: "Agendadas", tipo: "entero", valor: (f) => f.agendadas },
  { titulo: "Asistidas", tipo: "entero", valor: (f) => f.asistidas },
  { titulo: "No asistidas", tipo: "entero", valor: (f) => f.no_asistidas },
  { titulo: "Canceladas", tipo: "entero", valor: (f) => f.canceladas },
  { titulo: "Pendientes", tipo: "entero", valor: (f) => f.pendientes },
  { titulo: "Inscritas", tipo: "entero", valor: (f) => f.inscritas },
  { titulo: "De ellas, inscritas a mano", tipo: "entero", valor: (f) => f.inscritas_a_mano },
  { titulo: "Conversión (%)", valor: (f) => oGuion(f.conversion) },
];

export type FilaPlanaDeCosto = Omit<FilaDeCostoPorCampana, "campana"> & { campana: { nombre: string; origen: string } };

export function filasDeCosto(r: ReporteDeCostoPorCampana): FilaPlanaDeCosto[] {
  return [...r.filas, { campana: { nombre: "Total", origen: "" }, ...r.total }];
}

export const COLUMNAS_DE_COSTO: Columna<FilaPlanaDeCosto>[] = [
  { titulo: "Campaña", valor: (f) => f.campana.nombre },
  { titulo: "Origen", valor: (f) => f.campana.origen },
  { titulo: "Gasto", tipo: "dinero", valor: (f) => f.gasto },
  { titulo: "Leads", tipo: "entero", valor: (f) => f.leads },
  { titulo: "Clases muestra", tipo: "entero", valor: (f) => f.clases_muestra },
  { titulo: "Clases asistidas", tipo: "entero", valor: (f) => f.clases_asistidas },
  { titulo: "Inscripciones activas", tipo: "entero", valor: (f) => f.inscripciones_activas },
  { titulo: "Inscritos a mano", tipo: "entero", valor: (f) => f.inscritos_a_mano },
  { titulo: "Alumnos inscritos", tipo: "entero", valor: (f) => f.alumnos_inscritos },
  { titulo: "Costo por lead", tipo: "dinero", valor: (f) => f.costo_por_lead ?? "—" },
  { titulo: "Costo por clase muestra", tipo: "dinero", valor: (f) => f.costo_por_clase_muestra ?? "—" },
  { titulo: "Costo por alumno inscrito", tipo: "dinero", valor: (f) => f.costo_por_alumno ?? "—" },
];

export const COLUMNAS_DE_ACTIVOS: Columna<FilaDeActivos>[] = [
  { titulo: "Vertical", valor: (f) => f.vertical.nombre },
  { titulo: "Sucursal", valor: (f) => f.sucursal.nombre },
  { titulo: "Alumnos activos", tipo: "entero", valor: (f) => f.alumnos },
  { titulo: "Inscripciones activas", tipo: "entero", valor: (f) => f.inscripciones },
  { titulo: "Ingreso mensual recurrente", tipo: "dinero", valor: (f) => f.ingreso_mensual_recurrente },
];

export const COLUMNAS_DE_OCUPACION: Columna<FilaDeOcupacion>[] = [
  { titulo: "Grupo", valor: (f) => f.grupo.nombre },
  { titulo: "Programa", valor: (f) => f.programa },
  { titulo: "Vertical", valor: (f) => f.vertical.nombre },
  { titulo: "Sucursal", valor: (f) => f.sucursal.nombre },
  { titulo: "Ocupados", tipo: "entero", valor: (f) => f.ocupados },
  { titulo: "Cupo máximo", tipo: "entero", valor: (f) => f.cupo_maximo },
  { titulo: "Ocupación (%)", valor: (f) => f.ocupacion },
  { titulo: "Estado", valor: (f) => f.estado },
];

/** Los indicadores del reporte ejecutivo como renglones «Indicador, Valor» (la sección `resumen` del CSV). */
export interface RenglonDeIndicador {
  indicador: string;
  valor: string | number;
  tipo: "entero" | "dinero" | "texto";
}

export function indicadoresDelEjecutivo(r: ReporteEjecutivo): RenglonDeIndicador[] {
  const a = r.cartera_vencida.antiguedad;
  return [
    { indicador: "Mes", valor: r.mes, tipo: "texto" },
    { indicador: "Alumnos activos", valor: r.activos.total_alumnos, tipo: "entero" },
    { indicador: "Inscripciones activas", valor: r.activos.total_inscripciones, tipo: "entero" },
    { indicador: "Altas del mes", valor: r.altas_del_mes, tipo: "entero" },
    { indicador: "Bajas del mes", valor: r.bajas_del_mes, tipo: "entero" },
    { indicador: "Inscripciones vigentes al inicio del mes", valor: r.base_al_inicio_del_mes, tipo: "entero" },
    { indicador: "Deserción del mes (%)", valor: oGuion(r.desercion), tipo: "texto" },
    { indicador: "Ingreso mensual recurrente", valor: r.ingreso_mensual_recurrente, tipo: "dinero" },
    { indicador: "Cartera vencida", valor: r.cartera_vencida.total, tipo: "dinero" },
    { indicador: "Cartera vencida de 0 a 30 días", valor: a.de_0_a_30, tipo: "dinero" },
    { indicador: "Cartera vencida de 31 a 60 días", valor: a.de_31_a_60, tipo: "dinero" },
    { indicador: "Cartera vencida de 61 a 90 días", valor: a.de_61_a_90, tipo: "dinero" },
    { indicador: "Cartera vencida de más de 90 días", valor: a.mas_de_90, tipo: "dinero" },
  ];
}

/** Una columna de valor cuyo tipo depende del renglón: dinero y enteros exactos, el resto texto (y neutralizado si empieza como fórmula). */
export const COLUMNAS_DE_INDICADORES: Columna<RenglonDeIndicador>[] = [
  { titulo: "Indicador", valor: (f) => f.indicador },
  { titulo: "Valor", tipo: (f) => f.tipo, valor: (f) => f.valor },
];
