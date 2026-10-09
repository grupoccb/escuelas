// Reglas puras de lo que se puede ajustar de una automatización desde la administración (J8): el signo del desfase según su evento, el horario de envío
// (invariante 14: nunca fuera de 09:00–20:00 de la sucursal) y los días. El servidor las aplica y la base las repite con sus CHECK.

export const EVENTOS_DISPARADORES = ["lead_sin_respuesta", "clase_muestra_proxima", "clase_muestra_no_asistio", "lead_frio", "promocion_por_vencer", "inscripcion_creada", "cargo_por_vencer", "cargo_vencido"] as const;
export type EventoDisparador = (typeof EVENTOS_DISPARADORES)[number];

/** El desfase (`offset_minutos`) mide minutos desde el evento: ANTES de él (negativo), DESPUÉS (positivo) o de cualquiera de los dos lados. */
const SIGNO_DEL_DESFASE: Record<EventoDisparador, "antes" | "despues"> = {
  lead_sin_respuesta: "despues",
  clase_muestra_proxima: "antes",
  clase_muestra_no_asistio: "despues",
  lead_frio: "despues",
  promocion_por_vencer: "antes",
  inscripcion_creada: "despues",
  cargo_por_vencer: "antes",
  cargo_vencido: "despues",
};

/**
 * INV-6 (K9, EK-A1): la CLASE de mensaje que cada evento exige de su plantilla. Reenganche, recuperación, lead frío y promoción son MARKETING (se frenan con una persona
 * atendiendo y cuentan en el tope de marketing); el recordatorio de clase muestra, la bienvenida y la cobranza son de SERVICIO (avisos de algo ya acordado). La clase la DECLARA
 * la plantilla, pero una plantilla que no corresponde al evento rompería el invariante 6 por configuración: se rechaza al ligarlas o al cambiar la clase.
 */
export const CLASE_DEL_EVENTO: Record<EventoDisparador, "servicio" | "marketing"> = {
  lead_sin_respuesta: "marketing",
  clase_muestra_proxima: "servicio",
  clase_muestra_no_asistio: "marketing",
  lead_frio: "marketing",
  promocion_por_vencer: "marketing",
  inscripcion_creada: "servicio",
  cargo_por_vencer: "servicio",
  cargo_vencido: "servicio",
};

/** Un mensaje en palabras si la plantilla (por su clase declarada) no corresponde al evento, o null si sirve. */
export function problemaDeClase(evento: EventoDisparador, claseDeLaPlantilla: string): string | null {
  const exigida = CLASE_DEL_EVENTO[evento];
  if (claseDeLaPlantilla === exigida) return null;
  return exigida === "marketing"
    ? "Este aviso es de marketing: su plantilla debe declararse de marketing (si no, saldría aunque una persona atienda la conversación y sin el tope de marketing)"
    : "Este aviso es de servicio (algo ya acordado): su plantilla debe declararse de servicio";
}

/** Cuánto se puede mover un desfase: 60 días en minutos. */
export const DESFASE_MAXIMO_MIN = 60 * 24 * 60;
export const INICIO_DE_ENVIO_MIN = 540;
export const FIN_DE_ENVIO_MIN = 1200;
export const ESPACIADO_MINIMO_MIN = 60;

/** Un mensaje de error en palabras, o null si el desfase sirve para ese evento. */
export function problemaDeDesfase(evento: EventoDisparador, offsetMin: number): string | null {
  if (!Number.isInteger(offsetMin) || Math.abs(offsetMin) > DESFASE_MAXIMO_MIN) return "El desfase debe ser un número entero de minutos (hasta 60 días)";
  const signo = SIGNO_DEL_DESFASE[evento];
  if (signo === "antes" && offsetMin > 0) return "Este aviso sale ANTES del evento: el desfase debe ser cero o negativo (por ejemplo -1440 es un día antes)";
  if (signo === "despues" && offsetMin < 0) return "Este aviso sale DESPUÉS del evento: el desfase debe ser cero o positivo";
  return null;
}

export function problemaDeHorario(inicioMin: number, finMin: number): string | null {
  if (inicioMin < INICIO_DE_ENVIO_MIN || finMin > FIN_DE_ENVIO_MIN) return "Los mensajes que inicia el sistema solo salen entre las 09:00 y las 20:00";
  if (inicioMin >= finMin) return "La hora de inicio debe ser antes que la de fin";
  return null;
}

export function problemaDeDias(dias: readonly number[]): string | null {
  if (dias.length === 0) return "Elige al menos un día";
  if (dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return "Los días van de 0 (domingo) a 6 (sábado)";
  if (new Set(dias).size !== dias.length) return "Hay un día repetido";
  return null;
}
