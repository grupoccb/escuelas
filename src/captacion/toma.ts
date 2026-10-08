// Una persona toma la conversación en Chatwoot → `en_atencion_humana` (invariante 6).
//
// Qué significa "atender": que una PERSONA la tome (se la asigna en Chatwoot o manda el primer
// mensaje como asesor). Que la conversación esté visible, abierta o `open` en Chatwoot NO es
// atención humana: el propio sistema la deja abierta a los 30 min (lead a medias) y al terminar la
// captura. Por eso la señal es la asignación a un usuario o un mensaje de un usuario, no el estado.
//
// Con la misma versión optimista de la conversación que usa el bot: si el contacto escribe a la
// vez, uno gana y el otro se repite viendo el estado nuevo. Idempotente: un segundo evento de
// toma (asignación y primer mensaje llegan los dos) no cambia nada.
//
// "Resuelta" no devuelve el bot. Si el asesor resuelve la conversación, el backend la deja en
// `en_atencion_humana` (conservador: nunca vuelve a escribir solo sobre algo que una persona
// atendió). Una conversación NUEVA de Chatwoot abre otra fila y el bot atiende desde cero.

import { altaConAlcance, conAlcance, type Consultas } from "../datos/alcance.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import { resolverBandejaChatwoot } from "../datos/sistema.ts";
import { log } from "../lib/log.ts";
import type { EventoDesasignacion, EventoTomaDeConversacion } from "../mensajeria/index.ts";

export type ResultadoToma = "tomada" | "sin_cambio" | "conversacion_desconocida" | "bandeja_desconocida";

export interface DepsToma {
  prisma: PrismaRaiz;
}

const MAX_REINTENTOS = 3;

/**
 * Anota a quién está asignada la conversación: el id del agente de Chatwoot (siempre) y el usuario
 * del sistema que corresponde a ese agente (si está vinculado). Si el agente se vincula DESPUÉS, el
 * vínculo completa las conversaciones ya asignadas (ver `vincularAgente`).
 */
async function guardarAsignacion(tx: Consultas, conversacionId: string, agenteId: number): Promise<void> {
  const usuario = await tx.usuario.findFirst({ where: { chatwoot_agent_id: agenteId }, select: { id: true } });
  await tx.conversacion.update({
    where: { id: conversacionId },
    data: { asignada_a_agente_chatwoot_id: agenteId, asignada_a_usuario_id: usuario?.id ?? null },
  });
}

export async function registrarTomaDeConversacion(deps: DepsToma, evento: EventoTomaDeConversacion): Promise<ResultadoToma> {
  const bandeja = await resolverBandejaChatwoot(deps.prisma, evento.chatwootAccountId, evento.chatwootInboxId);
  if (!bandeja) return "bandeja_desconocida";
  const db = conAlcance(deps.prisma, bandeja.organizacion_id);

  for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
    const resultado = await db.$transaction(async (tx): Promise<ResultadoToma | "reintentar"> => {
      const conv = await tx.conversacion.findFirst({
        where: { bandeja_chatwoot_id: bandeja.id, chatwoot_conversacion_id: evento.chatwootConversacionId },
        select: { id: true, lead_id: true, estado: true, version: true },
      });
      if (!conv) return "conversacion_desconocida"; // el backend no la conoce: no hay nada que apagar
      // Qué asesor la tiene (B5): se anota aunque la conversación ya esté en manos de una persona
      // (reasignaciones) y antes de decidir si cambia el estado.
      if (evento.via === "asignacion" && evento.agenteId !== null) await guardarAsignacion(tx, conv.id, evento.agenteId);
      // Ya la atiende una persona, o está dada de baja o cerrada: el estado no cambia.
      if (conv.estado !== "bot") return "sin_cambio";

      const cambio = await tx.conversacion.updateMany({
        where: { id: conv.id, version: conv.version, estado: "bot" },
        data: { estado: "en_atencion_humana", pasar_a_asesor_pendiente: false, version: conv.version + 1 },
      });
      if (cambio.count !== 1) return "reintentar"; // el contacto escribió a la vez: se repite con el estado nuevo

      await tx.interaccion.create({
        data: altaConAlcance({
          lead_id: conv.lead_id,
          conversacion_id: conv.id,
          tipo: "pase_a_asesor" as const,
          contenido: "Una persona tomó la conversación.",
          datos: { motivo: "persona_tomo_conversacion", via: evento.via, agente_chatwoot_id: evento.agenteId },
        }),
      });
      return "tomada";
    });
    if (resultado !== "reintentar") {
      log.info("toma_de_conversacion", { resultado, via: evento.via });
      return resultado;
    }
  }
  // Sigue habiendo choques de versión: Chatwoot reintenta el webhook.
  throw new Error("No se pudo registrar la toma de la conversación: choque de versión repetido");
}

export type ResultadoDesasignacion = "desasignada" | "conversacion_desconocida" | "bandeja_desconocida";

/**
 * La conversación se quedó sin asesor en Chatwoot. Se borra la asignación que el sistema tenía
 * anotada; el estado de atención NO cambia (desasignar no devuelve el bot: decisión conservadora de A3).
 */
export async function registrarDesasignacionDeConversacion(deps: DepsToma, evento: EventoDesasignacion): Promise<ResultadoDesasignacion> {
  const bandeja = await resolverBandejaChatwoot(deps.prisma, evento.chatwootAccountId, evento.chatwootInboxId);
  if (!bandeja) return "bandeja_desconocida";
  const db = conAlcance(deps.prisma, bandeja.organizacion_id);
  const r = await db.conversacion.updateMany({
    where: { bandeja_chatwoot_id: bandeja.id, chatwoot_conversacion_id: evento.chatwootConversacionId },
    data: { asignada_a_agente_chatwoot_id: null, asignada_a_usuario_id: null },
  });
  log.info("desasignacion_de_conversacion", { resultado: r.count === 1 ? "desasignada" : "conversacion_desconocida" });
  return r.count === 1 ? "desasignada" : "conversacion_desconocida";
}
