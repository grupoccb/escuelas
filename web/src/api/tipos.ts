// Tipos de lo que devuelve la API (docs/API.md). Solo lo que la interfaz usa. Los importes son TEXTO decimal exacto («1234.50»).

export type Rol = "administrador" | "asesor" | "maestro" | "recepcion";
export type ModoDeCierre = "asesor_whatsapp" | "maestro_en_sitio";

export interface Sucursal {
  id: string;
  nombre: string;
}

export interface Yo {
  usuario: { id: string; correo: string; nombre: string; rol: Rol };
  organizacion: { id: string; nombre: string; slug: string | null } | null;
  sucursales: Sucursal[];
  permisos: string[];
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

export interface ProspectoDeLead {
  id: string;
  nombre: string | null;
  edad_declarada: number | null;
  origen: string;
  alumno_id: string | null;
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
