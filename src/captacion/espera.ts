// Tiempo de espera del bot (lead a medias). Si el contacto deja de contestar a mitad de la
// captura, a los 30 minutos la conversación se vuelve VISIBLE para los asesores: una nota privada
// con los datos parciales y la conversación abierta en Chatwoot.
//
// Visible no es atendido. La conversación NO pasa a `en_atencion_humana`: sigue en `bot`.
//   - Si el contacto regresa, el bot continúa la captura donde iba.
//   - El reenganche de 25 h puede salir (el motor solo mira conversaciones en `bot`).
//   - `en_atencion_humana` se activa cuando una PERSONA la toma (ver toma.ts).
//
// Solo se manda una nota interna, nunca un mensaje al contacto. Un recordatorio al contacto lo
// inicia el sistema (invariante 14: horario, plantilla fuera de ventana) y es trabajo del
// reenganche, no del bot.
//
// Idempotente: `visible_a_asesores_en` marca el aviso y la reclama la misma versión de la
// conversación, así que dos barridos simultáneos (o dos seguidos) no avisan dos veces. Si abrirla
// en Chatwoot falla, el aviso ya salió y solo se reintenta la apertura.

import { conAlcance } from "../datos/alcance.ts";
import type { PrismaClient } from "../datos/prisma.ts";
import { listarOrganizaciones } from "../datos/sistema.ts";
import { log } from "../lib/log.ts";
import type { MessagingProvider } from "../mensajeria/index.ts";
import { resumenParaAsesor } from "./resumen.ts";

/**
 * Cuánto espera el bot una respuesta antes de avisar a los asesores. Es mucho menor que el
 * reenganche (25 h) a propósito: avisar no bloquea el reenganche porque la conversación sigue
 * en `bot`.
 */
export const TIEMPO_ESPERA_MS = 30 * 60 * 1000;

/**
 * Cuánto se espera antes de reintentar abrir una conversación que ya se avisó. Quien avisa la abre
 * enseguida; esto evita que un barrido simultáneo la abra también mientras el primero termina.
 */
const REINTENTO_APERTURA_MS = 60 * 1000;

export interface DepsEspera {
  prisma: PrismaClient;
  mensajeria: MessagingProvider;
  esperaMs?: number;
  /** Limita el barrido a una organización. Sin él, recorre todas. */
  organizacionId?: string;
  reloj?: () => Date;
}

/** Devuelve cuántas conversaciones se hicieron visibles a los asesores en este barrido. */
export async function barrerTiemposDeEspera(deps: DepsEspera): Promise<number> {
  const ahora = deps.reloj?.() ?? new Date();
  const corte = new Date(ahora.getTime() - (deps.esperaMs ?? TIEMPO_ESPERA_MS));
  let avisadas = 0;

  const organizaciones = (await listarOrganizaciones(deps.prisma)).filter(
    (o) => deps.organizacionId === undefined || o.id === deps.organizacionId,
  );
  for (const org of organizaciones) {
    const db = conAlcance(deps.prisma, org.id);

    // 1. Avisar: nota con los datos parciales + abrir la conversación. Una sola vez.
    const vencidas = await db.conversacion.findMany({
      where: {
        estado: "bot",
        pasar_a_asesor_pendiente: false,
        visible_a_asesores_en: null,
        paso_captacion: { in: ["nombre", "edad", "sucursal"] }, // la captura va a medias
        ultimo_mensaje_entrante_en: { lt: corte },
      },
      select: { id: true },
    });
    for (const { id } of vencidas) {
      const avisada = await db.$transaction(async (tx) => {
        const conv = await tx.conversacion.findFirst({
          where: { id, estado: "bot", pasar_a_asesor_pendiente: false, visible_a_asesores_en: null },
          include: { lead: true },
        });
        if (!conv) return false;
        const marcada = await tx.conversacion.updateMany({
          where: { id, version: conv.version, visible_a_asesores_en: null },
          data: { visible_a_asesores_en: ahora, version: conv.version + 1 },
        });
        if (marcada.count !== 1) return false; // otro proceso la tocó: en el siguiente barrido

        await deps.mensajeria.encolar(tx, conv.id, [
          { tipo: "nota_interna", cuerpo: await resumenParaAsesor(tx, conv.lead.id, "sin_respuesta") },
        ]);
        return true;
      });
      if (!avisada) continue;
      // La nota sale ANTES de abrir la conversación: el asesor ve el resumen al llegar.
      await deps.mensajeria.despachar(db, id);
      await deps.mensajeria.abrirParaAsesores(db, id);
      avisadas++;
      log.info("espera_vencida", { conversacionId: id });
    }

    // 2. Reintentar la apertura de las que se avisaron pero Chatwoot no abrió.
    const sinAbrir = await db.conversacion.findMany({
      where: {
        estado: "bot",
        visible_a_asesores_en: { lte: new Date(ahora.getTime() - REINTENTO_APERTURA_MS) },
        abierta_para_asesores_en: null,
      },
      select: { id: true },
    });
    for (const { id } of sinAbrir) await deps.mensajeria.abrirParaAsesores(db, id);
  }
  return avisadas;
}
