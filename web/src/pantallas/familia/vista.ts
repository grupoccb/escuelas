// Textos de las pantallas de familia y expediente. Lógica pura (con su prueba): sin React ni red.

export function textoDeAntiguedad(a: { dias: number; meses: number } | null): string {
  if (!a) return "—";
  if (a.meses < 1) return a.dias === 1 ? "1 día" : `${a.dias} días`;
  const años = Math.floor(a.meses / 12);
  const meses = a.meses % 12;
  const partes = [años > 0 ? (años === 1 ? "1 año" : `${años} años`) : "", meses > 0 ? (meses === 1 ? "1 mes" : `${meses} meses`) : ""].filter(Boolean);
  return partes.join(" y ");
}

export const ESTATUS_DE_ALUMNO: Record<string, { texto: string; tono: "exito" | "info" | "neutro" }> = {
  activo: { texto: "Activo", tono: "exito" },
  congelado: { texto: "Congelado", tono: "info" },
  baja: { texto: "Baja", tono: "neutro" },
};

export const ESTATUS_DE_INSCRIPCION: Record<string, { texto: string; tono: "exito" | "info" | "neutro" }> = {
  activa: { texto: "Activa", tono: "exito" },
  congelada: { texto: "Congelada", tono: "info" },
  baja: { texto: "Baja", tono: "neutro" },
};

/** Las banderas de un adulto con respecto a un alumno, en palabras («Paga», «Contacto de urgencia»…). */
export function banderasDe(v: { es_responsable_pago: boolean; es_contacto_urgencia: boolean; puede_recoger: boolean; lo_lleva: boolean }): string[] {
  return [v.es_responsable_pago ? "Responsable de pago" : "", v.es_contacto_urgencia ? "Contacto de urgencia" : "", v.puede_recoger ? "Puede recogerlo" : "", v.lo_lleva ? "Lo lleva" : ""].filter(Boolean);
}

export const nombreCompleto = (p: { nombre: string; apellidos?: string | null }): string => [p.nombre, p.apellidos].filter(Boolean).join(" ");

/** Los motivos de elegibilidad que da la API, en palabras. */
export function textoDeElegibilidad(e: { elegible: boolean; clases_cumplidas: number; clases_requeridas: number; faltan: number }): string {
  if (e.elegible) return `Elegible (${e.clases_cumplidas} de ${e.clases_requeridas} clases)`;
  return `Le faltan ${e.faltan} clase${e.faltan === 1 ? "" : "s"} (${e.clases_cumplidas} de ${e.clases_requeridas})`;
}

export const TIPOS_DE_BENEFICIO: Record<string, string> = {
  descuento_inscripcion: "Descuento en la inscripción",
  descuento_mensualidad: "Descuento en la mensualidad",
  producto_gratis: "Producto gratis",
  meses_gratis: "Meses gratis",
};

export const TIPOS_DE_MOVIMIENTO: Record<string, string> = {
  cambio_grupo: "Cambio de grupo",
  congelacion: "Congelada",
  reactivacion: "Reactivada",
  baja: "Baja",
};

/** «no_asistio» → «No asistió»: lo que la API manda como código, en palabras (con tilde y sin guion bajo). */
export function textoLegible(codigo: string): string {
  const palabras = codigo.replace(/_/g, " ").trim();
  const conTilde = palabras.replace(/\basistio\b/g, "asistió");
  return conTilde.charAt(0).toUpperCase() + conTilde.slice(1);
}

export const ESTATUS_DE_EVENTO: Record<string, { texto: string; tono: "exito" | "info" | "alerta" | "neutro" }> = {
  inscrito: { texto: "Inscrito", tono: "info" },
  asistio: { texto: "Asistió", tono: "exito" },
  no_asistio: { texto: "No asistió", tono: "alerta" },
};
