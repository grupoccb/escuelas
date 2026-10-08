// Reglas de envío. Puras: deciden con el estado de la conversación y la hora, sin tocar base
// ni red. Solo MessagingProvider las llama (invariante 4).
//
// Hoy: atención humana (invariante 6), estado de la conversación y ventana de servicio
// (invariante 5). Plantillas, horario (14), opt-out y frecuencia entran con sus tablas en
// Fase 1; mientras tanto nada fuera de ventana se manda.

import type { EstadoConversacion } from "../datos/tipos.ts";

export type TipoSaliente = "mensaje" | "nota_interna";

export type MotivoBloqueo = "atencion_humana" | "opt_out" | "conversacion_cerrada" | "fuera_de_ventana";

export interface EstadoParaReglas {
  estado: EstadoConversacion;
  ventana_servicio_hasta: Date | null;
}

/** Devuelve el motivo por el que NO se puede mandar, o null si se puede. */
export function motivoBloqueo(conv: EstadoParaReglas, tipo: TipoSaliente, ahora: Date): MotivoBloqueo | null {
  // Sin excepción: ni siquiera una nota interna automática cuando ya atiende una persona.
  if (conv.estado === "en_atencion_humana") return "atencion_humana";
  if (tipo === "nota_interna") return null;

  if (conv.estado === "opt_out") return "opt_out";
  if (conv.estado === "cerrada") return "conversacion_cerrada";

  // Fuera de la ventana de servicio solo cabe una plantilla aprobada; todavía no hay
  // plantillas, así que no se manda.
  if (!conv.ventana_servicio_hasta || conv.ventana_servicio_hasta.getTime() <= ahora.getTime()) {
    return "fuera_de_ventana";
  }
  return null;
}

/** 24 h desde el último mensaje entrante. */
export const DURACION_VENTANA_SERVICIO_MS = 24 * 60 * 60 * 1000;

export function ventanaServicioDesde(entrante: Date): Date {
  return new Date(entrante.getTime() + DURACION_VENTANA_SERVICIO_MS);
}
