// Lo que devuelven los reportes (docs/API.md, I1 a I3). Los importes son TEXTO decimal exacto; los porcentajes, texto con un decimal.

export interface FilaDeClases {
  clave: string;
  nombre: string;
  agendadas: number;
  asistidas: number;
  no_asistidas: number;
  canceladas: number;
  pendientes: number;
  inscritas: number;
  conversion: string | null;
}
export interface ReporteDeClases {
  desde: string | null;
  hasta: string | null;
  total: FilaDeClases;
  por_fuente: FilaDeClases[];
  por_vertical: FilaDeClases[];
  por_sucursal: FilaDeClases[];
}

export interface FilaDeCosto {
  campana: { id: string; nombre: string; origen: string };
  gasto: string;
  leads: number;
  clases_muestra: number;
  clases_asistidas: number;
  inscripciones_activas: number;
  costo_por_lead_texto: string;
  costo_por_clase_muestra_texto: string;
  costo_por_alumno_texto: string;
}
export interface ReporteDeCosto {
  desde: string | null;
  hasta: string | null;
  filas: FilaDeCosto[];
  total: Omit<FilaDeCosto, "campana">;
}
export interface GastoDeCampana {
  id: string;
  fecha: string;
  monto: string;
  nota: string | null;
}

export interface Ejecutivo {
  mes: string;
  activos: { total_alumnos: number; total_inscripciones: number; por_vertical_y_sucursal: { vertical: { id: string; nombre: string }; sucursal: { id: string; nombre: string }; alumnos: number; inscripciones: number; ingreso_mensual_recurrente: string }[] };
  altas_del_mes: number;
  bajas_del_mes: number;
  base_al_inicio_del_mes: number;
  desercion: string | null;
  desercion_texto: string;
  ingreso_mensual_recurrente: string;
  cartera_vencida: { total: string; antiguedad: Record<"de_0_a_30" | "de_31_a_60" | "de_61_a_90" | "mas_de_90", string> };
  ocupacion_por_grupo: { grupo: { id: string; nombre: string }; programa: string; vertical: { id: string; nombre: string }; sucursal: { id: string; nombre: string }; ocupados: number; cupo_maximo: number; ocupacion: string; estado: "a_reventar" | "vacio" | "normal" }[];
}
