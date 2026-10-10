// Textos y reglas puras de la administración de mensajería (J8): cómo se llama cada evento, cuánto es un desfase en palabras y qué significa cada origen y causa de un evento inesperado.

import type { ModuloId } from "../../api/tipos.ts";

/** Cada evento con el módulo al que pertenece: apagado el módulo, la automatización queda en pausa (no programa ni manda nada). */
export const EVENTOS: Record<string, { titulo: string; sentido: "antes" | "despues"; ayuda: string; modulo: ModuloId }> = {
  lead_sin_respuesta: { titulo: "Reenganche de un contacto que dejó de contestar", sentido: "despues", ayuda: "Minutos después de su último mensaje.", modulo: "captacion" },
  clase_muestra_proxima: { titulo: "Recordatorio de la clase muestra", sentido: "antes", ayuda: "Minutos antes de la clase (negativo). Si ya no alcanza, se descarta.", modulo: "clase_muestra" },
  clase_muestra_no_asistio: { titulo: "Recuperación de quien no llegó a la clase muestra", sentido: "despues", ayuda: "Minutos después de marcar que no asistió.", modulo: "clase_muestra" },
  lead_frio: { titulo: "Lead sin movimiento", sentido: "despues", ayuda: "Minutos extra después de cumplirse los días de su etapa.", modulo: "captacion" },
  promocion_por_vencer: { titulo: "Promoción por vencer", sentido: "antes", ayuda: "Minutos antes de que acabe la promoción (negativo).", modulo: "cotizador" },
  inscripcion_creada: { titulo: "Bienvenida de inscripción", sentido: "despues", ayuda: "Minutos después de inscribirse.", modulo: "inscripcion" },
  cargo_por_vencer: { titulo: "Recordatorio de pago antes de vencer", sentido: "antes", ayuda: "Minutos antes del día de vencimiento (negativo).", modulo: "finanzas" },
  cargo_vencido: { titulo: "Recordatorio de pago atrasado", sentido: "despues", ayuda: "Minutos después del vencimiento; los siguientes intentos salen cada «espaciado».", modulo: "finanzas" },
  clase_muestra_reprogramada: { titulo: "Aviso de clase muestra reprogramada", sentido: "despues", ayuda: "Minutos después de que una persona reprograma la clase (0 = enseguida, dentro del horario de envío). Si ya no alcanza a llegar antes de la clase, no sale y queda una tarea.", modulo: "clase_muestra" },
  clase_muestra_cancelada: { titulo: "Aviso de clase muestra cancelada", sentido: "despues", ayuda: "Minutos después de que una persona cancela la clase (0 = enseguida, dentro del horario de envío). Si ya no alcanza a llegar antes de la clase, no sale y queda una tarea.", modulo: "clase_muestra" },
};

/** El nombre del módulo, para decirle a la escuela por qué una automatización está en pausa. */
export const NOMBRE_DE_MODULO: Record<ModuloId, string> = {
  captacion: "Captación",
  cotizador: "Cotizador",
  clase_muestra: "Clase muestra",
  inscripcion: "Inscripción",
  operacion: "Operación diaria",
  finanzas: "Finanzas",
  tableros: "Tableros",
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

/** Por qué algo llegó raro, en palabras (V7: antes decía «El cuerpo no era un JSON válido»). El detalle técnico sigue disponible, plegado, para quien da soporte. */
export const CAUSAS: Record<string, string> = {
  json_invalido: "Llegó un mensaje que el sistema no pudo leer",
  forma_inesperada: "Faltaban datos o venían con otra forma",
  sin_identificador: "No traía con qué reconocerlo",
  dato_invalido: "Uno de los datos no era válido",
  texto_con_nul: "Traía un carácter que no se puede guardar",
  restriccion_base: "El sistema no pudo guardar uno de los datos",
  registro_inexistente: "Se refería a algo que ya no existe",
  bandeja_sin_aprovisionar: "La bandeja de WhatsApp todavía no está dada de alta",
  reenvio_abandonado: "Se agotaron los reintentos de reenvío",
  error_interno: "Falló algo dentro del sistema",
};

export const ROLES = [
  { valor: "administrador", texto: "Administrador" },
  { valor: "asesor", texto: "Asesor" },
  { valor: "maestro", texto: "Maestro" },
  { valor: "recepcion", texto: "Recepción" },
] as const;

/** Qué ve y qué hace cada rol, dicho para quien da de alta a una persona (V7: antes se elegía el rol sin saber qué iba a ver esa persona). */
export const AYUDA_DE_ROL: Record<string, string> = {
  administrador: "Ve y cambia todo: catálogo, precios, usuarios, módulos, tableros y la bandeja. Dáselo con cuidado.",
  asesor: "Atiende a las familias que escriben: embudo, tareas, cotizaciones, clases muestra e inscripciones de su sucursal. No ve Administración ni cobros.",
  maestro: "Ve sus clases: «Hoy», el registro de la clase muestra y el pase de lista de sus grupos. No ve cobros ni a las familias de otros grupos.",
  recepcion: "Atiende el mostrador: cobros, estados de cuenta, uniformes, ventas y el cierre del día de su sucursal. No ve el embudo ni la salud de los alumnos.",
};

/** Los roles que trabajan por sucursal (el administrador las ve todas; el maestro entra por sus grupos). */
export const ROLES_CON_SUCURSALES = new Set(["asesor", "recepcion"]);

/** Contraseña para el alta o el restablecimiento: el servidor decide la política; aquí solo se evita mandar algo evidentemente corto. */
export function problemaDeContrasenaNueva(contrasena: string): string | null {
  return contrasena.length >= 10 ? null : "Debe tener al menos 10 caracteres";
}
