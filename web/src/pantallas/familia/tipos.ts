// Lo que la API devuelve de familias, alumnos y expedientes (docs/API.md, F1, F5 y G5). Los importes son TEXTO decimal exacto.

export interface VinculoDeAlumno {
  tutor_id: string;
  nombre: string;
  apellidos: string | null;
  parentesco: string;
  es_responsable_pago: boolean;
  es_contacto_urgencia: boolean;
  puede_recoger: boolean;
  lo_lleva: boolean;
  /** Ausentes para el maestro: no ve cómo contactar a la familia. */
  telefono?: string;
  correo?: string | null;
}

export interface AlumnoDeLista {
  id: string;
  nombre: string;
  apellidos: string;
  fecha_nacimiento: string;
  edad: number | null;
  sexo: string | null;
  estatus: "activo" | "baja" | "congelado";
  sucursal_id: string | null;
  talla_uniforme: string | null;
  tutores: VinculoDeAlumno[];
}

export interface Nombrado {
  id: string;
  nombre: string;
}

export type EstatusDeInscripcion = "activa" | "congelada" | "baja";

export interface InscripcionDeExpediente {
  id: string;
  estatus: EstatusDeInscripcion;
  fecha_inicio: string;
  fecha_baja: string | null;
  grupo: Nombrado;
  programa: Nombrado;
  vertical: Nombrado;
  sucursal: Nombrado;
}

export interface Trayectoria {
  fecha_de_inicio: string | null;
  antiguedad: { dias: number; meses: number } | null;
  grupo_actual: Nombrado | null;
  inscripciones: InscripcionDeExpediente[];
  historial_de_cambios_de_grupo: { inscripcion_id: string; fecha: string; grupo_anterior: Nombrado | null; grupo_nuevo: Nombrado | null }[];
  niveles: { vertical: { id: string; nombre: string; etiqueta_progresion: string | null }; nivel: { id: string; nombre: string; color_hex: string | null } | null; fecha_obtenido: string | null }[];
  proximo_examen: {
    vertical: { id: string; nombre: string; etiqueta_evento: string | null };
    evento: { id: string; nombre: string; tipo: string; fecha: string; estatus_del_alumno: string | null } | null;
    elegibilidad: { elegible: boolean; motivo: string | null; clases_cumplidas: number; clases_requeridas: number; faltan: number; siguiente_nivel: Nombrado | null };
  }[];
}

export type CuentaDelAlumno = { disponible: true; saldo: string; vencido: string; antiguedadCarteraVencidaDias: number | null } | { disponible: false; motivo: string };

export interface Economico {
  mensualidad_vigente: { total: string; por_inscripcion: { inscripcion_id: string; grupo: string; precio_de_lista: string; descuento: string; mensualidad: string; meses_gratis: number }[] };
  dia_de_corte: { inscripcion_id: string; dia: number; proximo_corte: string }[];
  promocion_aplicada: { inscripcion_id: string; promocion: Nombrado; beneficios: { tipo: string; descripcion: string | null; descuento: string; meses_gratis: number; estatus: string }[] }[];
  beneficios_pendientes: { inscripcion_id: string; promocion: string; tipo: string; descripcion: string | null }[];
  estado_de_cuenta: CuentaDelAlumno;
  antiguedad_cartera_vencida: { dias: number | null; vencido: string } | { disponible: false; motivo: string };
}

export interface Operativo {
  asistencia: { porcentaje_30_dias: string | null; racha_de_faltas: number; umbral_de_faltas: number; por_inscripcion: { inscripcion_id: string; grupo: string }[] };
  eventos: { evento: { id: string; nombre: string; tipo: string; fecha: string }; estatus: string; resultado: string | null; nivel_otorgado: Nombrado | null }[];
  productos_comprados: { disponible: true; productos: { producto: string; cantidad: number; fecha: string }[] } | { disponible: false; motivo: string };
}

export interface Comercial {
  origen_del_lead: { lead_id: string; campana: { id: string; nombre: string; origen: string } | null; canal: string | null; fuente: string | null; codigo_de_rastreo: string | null }[];
  dias_para_cerrar: { lead_id: string; dias: number }[];
  hermanos_inscritos: { alumno_id: string; alumno: string; verticales: Nombrado[] }[];
  motivo_de_baja: { inscripcion_id: string; fecha_baja: string | null; motivo: { id: string; codigo: string; nombre: string } | null }[];
}

export interface Expediente {
  alumno: { id: string; nombre: string; apellidos: string; estatus: "activo" | "baja" | "congelado" };
  trayectoria: Trayectoria;
  /** `null` para el maestro: sin importes. */
  economico: Economico | null;
  operativo: Operativo;
  comercial: Comercial | null;
}

export interface FilaDeOcupacion {
  grupo: Nombrado;
  programa: string;
  ocupados: number;
  cupo_maximo: number;
  ocupacion: string;
  estado: string;
}

export interface FamiliaUnSoloHijo {
  tutor_id: string;
  nombre: string;
  apellidos: string | null;
  telefono: string;
  sucursal_id: string | null;
  alumno: { id: string; nombre: string; apellidos: string; edad: number | null };
  verticales_inscritas: Nombrado[];
  verticales_sin: { id: string; nombre: string; disponible_en_su_sucursal: boolean }[];
}
