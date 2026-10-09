// Lo que la API de administración devuelve (docs/API.md, J7 y J8). Los importes son TEXTO decimal exacto.

export interface Vertical {
  id: string;
  nombre: string;
  slug: string;
  etiqueta_progresion: string | null;
  etiqueta_evento: string | null;
  usa_progresion: boolean;
  color_marca: string | null;
  logo_url: string | null;
  cotizador_whatsapp_activo: boolean;
  clase_muestra_whatsapp_activo: boolean;
  activo: boolean;
}

export interface SucursalAdmin {
  id: string;
  nombre: string;
  direccion: string | null;
  zona_horaria: string;
  activo: boolean;
  verticales: { vertical_id: string; nombre: string; activo: boolean }[];
}

export interface ProgramaAdmin {
  id: string;
  vertical_id: string;
  sucursal_id: string;
  nombre: string;
  edad_min: number;
  edad_max: number;
  nivel: string | null;
  descripcion_publica: string | null;
  permite_traslape: boolean;
  fecha_corte_edad: string | null;
  activo: boolean;
}

export interface GrupoAdmin {
  id: string;
  nombre: string;
  cupo_maximo: number;
  permite_lista_espera: boolean;
  activo: boolean;
  instructor_id: string | null;
  salon_id: string | null;
  salon: { id: string; nombre: string } | null;
  programa: { id: string; nombre: string; vertical_id: string; sucursal_id: string };
  horarios: { dia_semana: number; hora_inicio_min: number; hora_fin_min: number }[];
}

export interface InstructorAdmin {
  id: string;
  nombre: string;
  telefono: string | null;
  correo: string | null;
  activo: boolean;
  usuario_id: string | null;
  sucursales: string[];
}

export interface SalonAdmin {
  id: string;
  sucursal_id: string;
  nombre: string;
  capacidad: number | null;
  activo: boolean;
}

export interface PrecioAdmin {
  id: string;
  programa_id: string;
  costo_inscripcion: string;
  costo_mensualidad: string;
  moneda: string;
  vigencia_desde: string;
  vigencia_hasta: string | null;
}

export interface BeneficioAdmin {
  id: string;
  tipo: string;
  modo: string;
  valor: string | null;
  producto_id: string | null;
  descripcion: string | null;
  momento_disparo: string;
}

export interface PromocionAdmin {
  id: string;
  nombre: string;
  codigo: string;
  vigencia_desde: string;
  vigencia_hasta: string | null;
  condicion_tipo: string;
  condicion_valor: { hermanos?: number; meses?: number } | null;
  cupo_maximo: number | null;
  cupo_usado: number;
  acumulable: boolean;
  prioridad: number;
  activo: boolean;
  verticales: string[];
  sucursales: string[];
  programas: string[];
  beneficios: BeneficioAdmin[];
}

export interface CanalAdmin {
  id: string;
  vertical_id: string;
  sucursal_id: string | null;
  numero_whatsapp: string | null;
  messaging_service_sid: string | null;
  sender_sid: string | null;
  waba_id: string | null;
  nombre_publico: string;
  calidad_meta: string;
  activo: boolean;
  bandeja: { id: string; nombre: string; chatwoot_account_id: number | null; chatwoot_inbox_id: number | null } | null;
}

export interface Configuracion {
  max_automaticos_por_dia: number;
  max_marketing_por_ventana: number;
  ventana_marketing_dias: number;
  cotizacion_vigencia_dias: number;
  lista_espera_oferta_horas: number;
  clase_muestra_anticipacion_min: number;
  clase_muestra_horizonte_dias: number;
  clase_muestra_correccion_horas: number;
  umbral_faltas_consecutivas: number;
  umbral_dias_deuda: number;
  sucursal_sin_programa: "ofrecer_otra" | "avisar_asesor";
  modo_cierre: "asesor_whatsapp" | "maestro_en_sitio";
  limites: Record<string, { min: number; max: number; etiqueta: string; ayuda: string }>;
}
