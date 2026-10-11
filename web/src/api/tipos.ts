// Tipos de lo que devuelve la API (docs/API.md). Solo lo que la interfaz usa. Los importes son TEXTO decimal exacto («1234.50»).

export type Rol = "administrador" | "asesor" | "maestro" | "recepcion";
export type ModoDeCierre = "asesor_whatsapp" | "maestro_en_sitio";

export interface Sucursal {
  id: string;
  nombre: string;
}

/** Los módulos de la escuela (`GET /api/yo` y `/api/modulos`). La captación es el módulo base y siempre viene encendida. */
export type ModuloId = "captacion" | "cotizador" | "clase_muestra" | "inscripcion" | "operacion" | "finanzas" | "tableros";
export type Modulos = Record<ModuloId, boolean>;

export interface Yo {
  usuario: { id: string; correo: string; nombre: string; rol: Rol };
  organizacion: { id: string; nombre: string; slug: string | null } | null;
  sucursales: Sucursal[];
  /** Los permisos EFECTIVOS: los del rol menos los de los módulos apagados. */
  permisos: string[];
  /** Los módulos encendidos de la organización. */
  modulos: Modulos;
  /** Los tipos de tarea cuyo módulo está apagado: no se ofrecen en el filtro de tareas. */
  tipos_de_tarea_apagados: string[];
  configuracion: { modo_cierre: ModoDeCierre; chatwoot_url_publica: string | null };
}

export interface Etapa {
  id: string;
  nombre: string;
  orden: number;
  tipo_sistema: string | null;
  es_ganado: boolean;
  es_perdido: boolean;
  dias_alerta_sin_movimiento: number | null;
}

export interface MotivoPerdida {
  id: string;
  codigo: string;
  nombre: string;
  orden: number;
  activo: boolean;
}

export type Fuente = string;

export interface LeadResumen {
  id: string;
  nombre_contacto: string | null;
  telefono: string | null;
  vertical_interes_id: string;
  sucursal_interes_id: string | null;
  campana_id: string | null;
  campana: { id: string; nombre: string } | null;
  fuente: Fuente;
  etapa_id: string;
  motivo_perdida_id: string | null;
  recuperaciones: number;
  ultima_interaccion_en: string | null;
  creado_en: string;
}

/** Un niño del lead (V3). `edad` es la cumplida hoy si se capturó su fecha de nacimiento; `programa_sugerido` solo viene con el cotizador encendido. */
export interface ProspectoDeLead {
  id: string;
  nombre: string | null;
  apellidos: string | null;
  fecha_nacimiento: string | null;
  edad: number | null;
  edad_declarada: number | null;
  origen: string;
  alumno_id: string | null;
  vertical: { id: string; nombre: string };
  programa_sugerido?: { id: string; nombre: string } | null;
}

export interface LeadDetalle extends LeadResumen {
  anuncio_titulo: string | null;
  atribucion: Record<string, unknown> | null;
  tutor_id: string | null;
  etapa: { id: string; nombre: string; tipo_sistema: string | null; es_ganado: boolean; es_perdido: boolean };
  vertical: { id: string; nombre: string };
  sucursal: { id: string; nombre: string } | null;
  motivo_perdida: { id: string; nombre: string } | null;
  prospectos: ProspectoDeLead[];
  conversaciones: { id: string; estado: string; chatwoot: { cuenta_id: number | null; bandeja_id: number | null; conversacion_id: number } }[];
}

export interface Tarea {
  id: string;
  tipo: string;
  estado: "pendiente" | "hecha" | "descartada";
  descripcion: string;
  codigo_error: number | null;
  lead_id: string | null;
  /** V7: de qué familia es (nombre y teléfono de contacto del lead). */
  lead?: { nombre_contacto: string | null; telefono: string | null } | null;
  conversacion_id: string | null;
  inscripcion_id: string | null;
  cargo_id: string | null;
  vence_en: string | null;
  resuelta_en: string | null;
  creado_en: string;
}

export interface Horario {
  dia_semana: number;
  hora_inicio_min: number;
  hora_fin_min: number;
}

export interface Grupo {
  id: string;
  nombre: string;
  cupo_maximo: number;
  activo: boolean;
  instructor_id: string | null;
  salon: { id: string; nombre: string } | null;
  programa: { id: string; nombre: string; vertical_id: string; sucursal_id: string; edad_min: number; edad_max: number };
  horarios: Horario[];
}

export type EstatusClase = "agendada" | "asistio" | "no_asistio" | "reagendada" | "cancelada";

export interface ClaseMuestra {
  id: string;
  lead_id: string;
  prospecto_id: string;
  prospecto: string | null;
  edad_declarada: number | null;
  grupo_id: string;
  grupo: string;
  programa_id: string;
  programa: string;
  sucursal_id: string;
  sucursal: string;
  zona_horaria: string;
  fecha_hora: string;
  sesion: { fecha: string; hora: string };
  estatus: EstatusClase;
  agendada_por: "bot" | "usuario";
  reprogramada_de_id: string | null;
  motivo_cancelacion: string | null;
  notas: string | null;
  asistencia_marcada_en: string | null;
  creado_en: string;
  contacto?: string | null;
  telefono?: string | null;
}

export interface Cargo {
  id: string;
  tutor_id: string;
  alumno: { id: string; nombre: string; apellidos: string };
  inscripcion_id: string | null;
  concepto: string;
  periodo: string | null;
  descripcion: string | null;
  monto_final: string;
  monto_pagado: string;
  saldo: string;
  fecha_vencimiento: string;
  estatus: string;
  estatus_efectivo: string;
  dias_de_atraso: number;
}

export interface Tutor {
  id: string;
  nombre: string;
  apellidos: string | null;
  telefono: string;
  correo: string | null;
  sucursal_id: string | null;
  alumnos: { alumno_id: string; nombre: string; apellidos: string; estatus: string; parentesco: string; es_responsable_pago: boolean }[];
}

// ── El cotizador (`GET /api/cotizador`, y el `snapshot` de una cotización guardada). Importes: texto del servidor. ──

export interface TotalesDeImporte {
  original: string;
  descuento_ahora: string;
  descuento_diferido: string;
  final_ahora: string;
  final_con_diferidos: string;
}

export interface PromocionesCotizadas {
  aplicadas: { promocion_id: string; nombre: string }[];
  lineas: { promocion_id: string; promocion_nombre: string; tipo: string; estado: string; descuento: string; meses: number | null; descripcion: string | null }[];
  inscripcion: TotalesDeImporte;
  mensualidad: TotalesDeImporte;
  meses_gratis_ahora: number;
  meses_gratis_diferidos: number;
}

export interface GrupoCotizado {
  grupo_id: string;
  nombre: string;
  horario_texto: string;
  lugares_disponibles: number;
  lleno: boolean;
  oferta: string;
}
export interface ProgramaCotizado {
  programa_id: string;
  nombre: string;
  precio: { costo_inscripcion: string; costo_mensualidad: string } | null;
  sin_precio: boolean;
  grupos: GrupoCotizado[];
  promociones: PromocionesCotizadas | null;
}

// ── Datos de las gráficas del tablero (R3a): `GET /api/reportes/{ejecutivo,embudo,fuentes,evolucion}`. Los importes son TEXTO decimal exacto; los porcentajes, texto con un decimal («42.9»). ──
// Clases muestra por disciplina: sigue siendo `GET /api/reportes/clases-muestra` (tipos en `pantallas/tableros/tipos.ts`, `por_vertical`). Los filtros `sucursal_id` y `vertical_id` son opcionales.

export type TramoDeAntiguedad = "de_0_a_30" | "de_31_a_60" | "de_61_a_90" | "mas_de_90";
export type EstadoDeOcupacion = "a_reventar" | "vacio" | "normal";

/** Una franja semanal de un grupo. `dia_semana`: 0 = domingo … 6 = sábado; los minutos son desde la medianoche local de la sucursal. */
export interface FranjaDeGrupo {
  dia_semana: number;
  hora_inicio_min: number;
  hora_fin_min: number;
}

export interface OcupacionDeGrupo {
  grupo: { id: string; nombre: string };
  programa: string;
  vertical: { id: string; nombre: string };
  sucursal: { id: string; nombre: string };
  ocupados: number;
  cupo_maximo: number;
  ocupacion: string;
  estado: EstadoDeOcupacion;
  horarios: FranjaDeGrupo[];
  /** «lunes y miércoles de 16:00 a 17:00». */
  horario_texto: string;
}

/** Una celda del mapa de calor: día de la semana × hora de INICIO (0 a 23). Solo vienen las celdas con clases; las demás son «sin clases». */
export interface CeldaDeMapaDeOcupacion {
  dia_semana: number;
  hora: number;
  grupos: number;
  ocupados: number;
  cupo_maximo: number;
  ocupacion: string;
  estado: EstadoDeOcupacion;
}

export interface FilaDeComparativo {
  vertical: { id: string; nombre: string };
  sucursal: { id: string; nombre: string };
  alumnos: number;
  inscripciones: number;
  ingreso_mensual_recurrente: string;
  ocupados: number;
  cupo_maximo: number;
  /** null: la disciplina no tiene grupos activos en esa sucursal. */
  ocupacion: string | null;
  altas_del_mes: number;
  bajas_del_mes: number;
  base_al_inicio_del_mes: number;
  desercion: string | null;
  desercion_texto: string;
}

/** `GET /api/reportes/ejecutivo?mes=AAAA-MM&sucursal_id=&vertical_id=`: el reporte ejecutivo de siempre con los campos nuevos (`familias*`, `mapa_ocupacion`, `bajas_por_motivo`, `comparativo`, horarios por grupo). */
export interface EjecutivoDelTablero {
  mes: string;
  activos: { total_alumnos: number; total_inscripciones: number; por_vertical_y_sucursal: { vertical: { id: string; nombre: string }; sucursal: { id: string; nombre: string }; alumnos: number; inscripciones: number; ingreso_mensual_recurrente: string }[] };
  altas_del_mes: number;
  bajas_del_mes: number;
  base_al_inicio_del_mes: number;
  desercion: string | null;
  desercion_texto: string;
  ingreso_mensual_recurrente: string;
  cartera_vencida: {
    total: string;
    antiguedad: Record<TramoDeAntiguedad, string>;
    /** Familias (tutores distintos) con saldo vencido, en total y por tramo. */
    familias: number;
    familias_por_tramo: Record<TramoDeAntiguedad, number>;
  };
  ocupacion_por_grupo: OcupacionDeGrupo[];
  mapa_ocupacion: CeldaDeMapaDeOcupacion[];
  /** Las bajas del mes por motivo, de más a menos; `motivo: null` = sin motivo. */
  bajas_por_motivo: { motivo: { id: string; nombre: string } | null; bajas: number }[];
  comparativo: FilaDeComparativo[];
}

/** `GET /api/reportes/embudo?desde=&hasta=&sucursal_id=&vertical_id=`: la cohorte de leads que llegaron en el rango. */
export interface EtapaDelEmbudo {
  etapa: { id: string; nombre: string; tipo_sistema: string | null; es_ganado: boolean };
  orden: number;
  /** Cuántos llegaron a esta etapa o a una posterior. */
  alcanzaron: number;
  /** alcanzaron / llegaron. null si no llegó ningún lead. */
  porcentaje: string | null;
  /** Cuántos de la etapa anterior no llegaron a esta (0 en la primera). */
  caida: number;
  caida_porcentaje: string | null;
  es_mayor_caida: boolean;
}
export interface ReporteDeEmbudo {
  desde: string | null;
  hasta: string | null;
  llegaron: number;
  etapas: EtapaDelEmbudo[];
  /** Los que hoy están en una etapa ganada. */
  inscritos: number;
  conversion: string | null;
  perdidos: { total: number; por_motivo: { motivo: { id: string; nombre: string } | null; leads: number }[] };
}

/** `GET /api/reportes/fuentes?desde=&hasta=&sucursal_id=&vertical_id=`. `gasto` y `costo_por_alumno` son null para quien no tiene el permiso de costos (`incluye_gasto: false`). */
export interface FilaDeFuente {
  clave: string;
  /** Origen de la campaña (`facebook`, `referido`, `presencial`…) o, sin campaña, `landing`, `codigo`, `anuncio` o `directo`. */
  fuente: string;
  campana: { id: string; nombre: string } | null;
  leads: number;
  inscritos: number;
  conversion: string | null;
  gasto: string | null;
  costo_por_alumno: string | null;
  es_mas_barato: boolean;
}
export interface ReporteDeFuentes {
  desde: string | null;
  hasta: string | null;
  incluye_gasto: boolean;
  filas: FilaDeFuente[];
  total: { leads: number; inscritos: number; conversion: string | null; gasto: string | null; inscritos_con_gasto: number | null; inscritos_sin_costo: number | null; costo_por_alumno: string | null };
}

/** `GET /api/reportes/evolucion?mes=AAAA-MM&sucursal_id=&vertical_id=`: 12 meses que terminan en `mes` y la retención por cohortes. */
export interface PuntoMensual {
  mes: string;
  altas: number;
  bajas: number;
  /** Alumnos distintos con una inscripción activa al corte del mes (el del mes en curso es hoy). */
  activos: number;
  inscripciones_activas: number;
  ingreso_mensual_recurrente: string;
}
export interface SeguimientoDeCohorte {
  /** 1 a 6: meses después del mes de inscripción. */
  mes_n: number;
  /** null: todavía no pasa ese tiempo. */
  siguen: number | null;
  porcentaje: string | null;
}
export interface ReporteDeEvolucion {
  mes: string;
  /** Fecha de corte del último punto (`AAAA-MM-DD`; hoy si `mes` es el mes en curso). */
  hasta: string;
  meses: PuntoMensual[];
  cohortes: { mes: string; altas: number; seguimiento: SeguimientoDeCohorte[] }[];
  promedio: { mes_n: number; siguen: number; altas: number; porcentaje: string | null }[];
}
