// Lo que devuelve `GET /api/clases-muestra/:id/registro` (docs/API.md, D5). La salud NO viaja aquí: solo banderas.

export type EstatusDeRegistro = "sin_captura" | "borrador" | "completo" | "cerrado";

export interface TutorDeRegistro {
  id: string;
  nombre: string;
  apellidos: string | null;
  parentesco: string;
  telefono: string;
  correo: string | null;
  es_responsable_pago: boolean;
  lo_lleva: boolean;
  puede_recoger: boolean;
}

export interface Registro {
  existe: boolean;
  id: string | null;
  clase_muestra_id: string;
  prospecto_id: string;
  lead_id: string;
  clase: { estatus: string; fecha_hora: string };
  estatus: EstatusDeRegistro;
  alumno: { nombre: string | null; apellidos: string | null; fecha_nacimiento: string | null; sexo: string | null; escuela: string | null; turno_escolar: string | null; talla_uniforme: string | null };
  tutores: TutorDeRegistro[];
  antecedentes: { practico_antes: boolean | null; practico_donde: string | null; practico_nivel: string | null; motivo_clase: string | null; motivo_clase_detalle: string | null };
  observacion: { asistio: boolean | null; nivel_observado: string | null; grupo_recomendado_id: string | null; interes_percibido: string | null; notas: string | null };
  salud: { contacto_registrado: boolean; completa: boolean; faltantes: string[]; puedes_ver_valores: boolean };
  faltantes: string[];
  completo_en: string | null;
  cerrado_en: string | null;
  actualizado_en: string | null;
}

export interface EstadoLegal {
  tipo: "reglamento" | "uso_imagen" | "aviso_privacidad";
  estado: "sin_respuesta" | "aceptada" | "rechazada" | "revocada";
  version_aceptada: number | null;
  version_vigente: number | null;
  al_corriente: boolean;
  texto: string;
}

export interface DocumentoVigente {
  id: string;
  tipo: "reglamento" | "uso_imagen" | "aviso_privacidad";
  version: number;
  titulo: string;
  texto?: string;
}
