// Textos y reglas puras de la administración de mensajería (J8): cómo se llama cada evento, cuánto es un desfase en palabras y qué significa cada origen y causa de un evento inesperado.

export const EVENTOS: Record<string, { titulo: string; sentido: "antes" | "despues"; ayuda: string }> = {
  lead_sin_respuesta: { titulo: "Reenganche de un contacto que dejó de contestar", sentido: "despues", ayuda: "Minutos después de su último mensaje." },
  clase_muestra_proxima: { titulo: "Recordatorio de la clase muestra", sentido: "antes", ayuda: "Minutos antes de la clase (negativo). Si ya no alcanza, se descarta." },
  clase_muestra_no_asistio: { titulo: "Recuperación de quien no llegó a la clase muestra", sentido: "despues", ayuda: "Minutos después de marcar que no asistió." },
  lead_frio: { titulo: "Lead sin movimiento", sentido: "despues", ayuda: "Minutos extra después de cumplirse los días de su etapa." },
  promocion_por_vencer: { titulo: "Promoción por vencer", sentido: "antes", ayuda: "Minutos antes de que acabe la promoción (negativo)." },
  inscripcion_creada: { titulo: "Bienvenida de inscripción", sentido: "despues", ayuda: "Minutos después de inscribirse." },
  cargo_por_vencer: { titulo: "Recordatorio de pago antes de vencer", sentido: "antes", ayuda: "Minutos antes del día de vencimiento (negativo)." },
  cargo_vencido: { titulo: "Recordatorio de pago atrasado", sentido: "despues", ayuda: "Minutos después del vencimiento; los siguientes intentos salen cada «espaciado»." },
};

export const tituloDeEvento = (e: string): string => EVENTOS[e]?.titulo ?? e.replace(/_/g, " ");

/** Los minutos de un desfase en la unidad más natural: 1440 → «1 día después», -120 → «2 horas antes», 0 → «en el momento». */
export function textoDeDesfase(minutos: number): string {
  if (minutos === 0) return "en el momento";
  const abs = Math.abs(minutos);
  const cuando = minutos < 0 ? "antes" : "después";
  const dias = abs / 1440;
  const horas = abs / 60;
  if (Number.isInteger(dias)) return `${dias} ${dias === 1 ? "día" : "días"} ${cuando}`;
  if (Number.isInteger(horas)) return `${horas} ${horas === 1 ? "hora" : "horas"} ${cuando}`;
  return `${abs} minutos ${cuando}`;
}

export const ORIGENES: Record<string, string> = {
  chatwoot: "Chatwoot",
  twilio_entrante: "WhatsApp (mensaje entrante)",
  twilio_estado: "WhatsApp (estado de entrega)",
  landing: "Página de captación",
  barrido_twilio: "Reenvío de WhatsApp",
};

export const CAUSAS: Record<string, string> = {
  json_invalido: "El cuerpo no era un JSON válido",
  forma_inesperada: "Faltaban datos o venían con otra forma",
  sin_identificador: "No traía identificador",
  dato_invalido: "Un dato no era válido",
  texto_con_nul: "Traía un carácter no permitido",
  restriccion_base: "La base rechazó el dato",
  registro_inexistente: "Se refería a algo que no existe",
  bandeja_sin_aprovisionar: "La bandeja no está dada de alta",
  reenvio_abandonado: "Se agotaron los reintentos de reenvío",
  error_interno: "Error interno",
};

export const ROLES = [
  { valor: "administrador", texto: "Administrador" },
  { valor: "asesor", texto: "Asesor" },
  { valor: "maestro", texto: "Maestro" },
  { valor: "recepcion", texto: "Recepción" },
] as const;

/** Los roles que trabajan por sucursal (el administrador las ve todas; el maestro entra por sus grupos). */
export const ROLES_CON_SUCURSALES = new Set(["asesor", "recepcion"]);

/** Contraseña para el alta o el restablecimiento: el servidor decide la política; aquí solo se evita mandar algo evidentemente corto. */
export function problemaDeContrasenaNueva(contrasena: string): string | null {
  return contrasena.length >= 10 ? null : "Debe tener al menos 10 caracteres";
}
