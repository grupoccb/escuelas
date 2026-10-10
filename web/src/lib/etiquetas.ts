// Textos de pantalla para los valores fijos de la API. Genéricos: lo propio de cada escuela (nombres de grupos, programas, etapas…) viene de las tablas.

export const SEXOS = [
  { valor: "femenino", texto: "Femenino" },
  { valor: "masculino", texto: "Masculino" },
  { valor: "otro", texto: "Otro" },
] as const;

export const TURNOS = [
  { valor: "matutino", texto: "Matutino" },
  { valor: "vespertino", texto: "Vespertino" },
  { valor: "jornada_completa", texto: "Jornada completa" },
] as const;

export const MOTIVOS_DE_CLASE = [
  { valor: "disciplina", texto: "Disciplina" },
  { valor: "condicion_fisica", texto: "Condición física" },
  { valor: "socializacion", texto: "Socialización" },
  { valor: "competencia", texto: "Competencia" },
  { valor: "otro", texto: "Otro" },
] as const;

export const INTERESES = [
  { valor: "alto", texto: "Alto" },
  { valor: "medio", texto: "Medio" },
  { valor: "bajo", texto: "Bajo" },
] as const;

export const ESTATUS_DE_CLASE: Record<string, { texto: string; tono: "neutro" | "info" | "exito" | "alerta" | "peligro" }> = {
  agendada: { texto: "Agendada", tono: "info" },
  asistio: { texto: "Asistió", tono: "exito" },
  no_asistio: { texto: "No asistió", tono: "alerta" },
  reagendada: { texto: "Reagendada", tono: "neutro" },
  cancelada: { texto: "Cancelada", tono: "peligro" },
};

export const ESTATUS_DE_REGISTRO: Record<string, { texto: string; tono: "neutro" | "info" | "exito" | "alerta" }> = {
  sin_captura: { texto: "Sin captura", tono: "neutro" },
  borrador: { texto: "Borrador", tono: "alerta" },
  completo: { texto: "Completo", tono: "info" },
  cerrado: { texto: "Cerrado", tono: "exito" },
};

/** Los campos que la API reporta como faltantes (`alumno.apellidos`, `tutores.responsable_pago`…) en palabras de una persona. */
const FALTANTES: Record<string, string> = {
  "alumno.nombre": "Nombre del alumno",
  "alumno.apellidos": "Apellidos del alumno",
  "alumno.fecha_nacimiento": "Fecha de nacimiento (del acta)",
  "alumno.sexo": "Sexo del alumno",
  tutores: "Al menos un adulto",
  "tutores.responsable_pago": "Quién es el responsable de pago",
  "antecedentes.practico_antes": "Si ha practicado antes",
  "antecedentes.motivo_clase": "Por qué quiere tomar la clase",
  "observacion.interes_percibido": "Interés percibido del maestro",
  reglamento: "Que la familia acepte el reglamento",
};

export function etiquetaDeFaltante(campo: string, deSalud: (campo: string) => string | null): string {
  return FALTANTES[campo] ?? deSalud(campo) ?? campo;
}

export const TIPOS_DE_TAREA: Record<string, { titulo: string; ayuda: string }> = {
  sin_plantilla_apta: { titulo: "Sin plantilla apta", ayuda: "No había una plantilla aprobada para escribirle fuera de la ventana de 24 h: contáctalo tú." },
  revision_manual: { titulo: "Revisión manual", ayuda: "Algo pide que una persona lo revise." },
  baja_volvio_a_escribir: { titulo: "Dado de baja volvió a escribir", ayuda: "Pidió la baja y volvió a escribir: el sistema calla, decide una persona." },
  entrega_fallida: { titulo: "Mensaje no entregado", ayuda: "WhatsApp reportó que un mensaje no llegó. Revisa el código de error." },
  envio_incierto: { titulo: "Envío incierto", ayuda: "No se sabe si un mensaje salió. No se reenvía solo: confírmalo." },
  automatizacion_omitida: { titulo: "Aviso automático omitido", ayuda: "Un aviso programado no se mandó por falta de datos o de canal." },
  baja_solicitada: { titulo: "Pidió la baja", ayuda: "Pidió dejar de recibir mensajes mientras lo atendía una persona: confírmalo." },
  nota_fallida: { titulo: "Nota interna fallida", ayuda: "No se pudo publicar la nota para los asesores." },
  lista_espera_nueva: { titulo: "Nuevo en lista de espera", ayuda: "Alguien entró a la lista de espera de un grupo lleno." },
  lista_espera_lugar_liberado: { titulo: "Lugar liberado", ayuda: "Se liberó un lugar: ofrécelo al siguiente de la lista." },
  aviso_maestro_no_enviado: { titulo: "Aviso al maestro no enviado", ayuda: "El aviso de la clase muestra no salió por WhatsApp; el maestro lo ve en la aplicación." },
  llamar_no_asistio: { titulo: "Llamar a quien no llegó", ayuda: "No llegó a su clase muestra: ofrécele reagendar." },
  avisar_cambio_de_clase: { titulo: "Avisar el cambio de una clase", ayuda: "Se cambió o se canceló una clase muestra y el aviso por WhatsApp no pudo salir a tiempo: llama a la familia y avísale." },
  lead_frio: { titulo: "Lead sin movimiento", ayuda: "Lleva días sin movimiento en su etapa: decide cómo retomarlo." },
  listo_para_cerrar: { titulo: "Listo para cerrar", ayuda: "El maestro marcó que la familia quedó lista para inscribirse." },
  faltas_consecutivas: { titulo: "Faltas seguidas", ayuda: "Un alumno llegó al umbral de faltas consecutivas." },
  evento_inesperado: { titulo: "Evento inesperado", ayuda: "Llegó algo que el sistema no pudo procesar; una persona debe verlo." },
  deuda_vencida: { titulo: "Deuda vencida", ayuda: "Una familia lleva días de atraso en sus pagos." },
  cobranza_sin_canal: { titulo: "Cobranza sin canal", ayuda: "No hay conversación de WhatsApp para recordar un pago: cóbrale por otro medio." },
  beneficio_en_revision: { titulo: "Beneficio en revisión", ayuda: "Se canceló un pago que había liberado un beneficio ya entregado." },
};

export function tipoDeTarea(tipo: string): { titulo: string; ayuda: string } {
  return TIPOS_DE_TAREA[tipo] ?? { titulo: tipo.replace(/_/g, " "), ayuda: "" };
}

/** «1 lugar», «5 lugares», «0 lugares» (V7: una cotización decía «1 lugares»). */
export const textoDeLugares = (n: number): string => `${n} ${n === 1 ? "lugar" : "lugares"}`;
