// Tiempo de espera del bot. Si el contacto deja de contestar a mitad de la captura, la
// conversación no se queda colgada: pasa a un asesor con los datos parciales en una nota.
//
// Solo se manda una nota interna, nunca un mensaje al contacto. Un recordatorio al contacto lo
// inicia el sistema (invariante 14: horario, plantilla fuera de ventana) y es trabajo del
// reenganche, no del bot.
//
// Idempotente: una conversación que ya se marcó para pasar, o que ya está con una persona, no
// vuelve a seleccionarse. Dos barridos simultáneos no pasan dos veces: el cambio exige la
// misma versión de la conversación.

import { conAlcance } from "../datos/alcance.ts";
import type { PrismaClient } from "../datos/prisma.ts";
import { listarOrganizaciones } from "../datos/sistema.ts";
import { log } from "../lib/log.ts";
import type { MessagingProvider } from "../mensajeria/index.ts";
import { resumenParaAsesor } from "./resumen.ts";

/** Cuánto espera el bot una respuesta antes de pasar la conversación a un asesor. */
export const TIEMPO_ESPERA_MS = 30 * 60 * 1000;

export interface DepsEspera {
  prisma: PrismaClient;
  mensajeria: MessagingProvider;
  esperaMs?: number;
  /** Limita el barrido a una organización. Sin él, recorre todas. */
  organizacionId?: string;
  reloj?: () => Date;
}

/** Devuelve cuántas conversaciones pasaron a un asesor en este barrido. */
export async function barrerTiemposDeEspera(deps: DepsEspera): Promise<number> {
  const ahora = deps.reloj?.() ?? new Date();
  const corte = new Date(ahora.getTime() - (deps.esperaMs ?? TIEMPO_ESPERA_MS));
  let pasadas = 0;

  const organizaciones = (await listarOrganizaciones(deps.prisma)).filter(
    (o) => deps.organizacionId === undefined || o.id === deps.organizacionId,
  );
  for (const org of organizaciones) {
    const db = conAlcance(deps.prisma, org.id);
    const vencidas = await db.conversacion.findMany({
      where: {
        estado: "bot",
        pasar_a_asesor_pendiente: false,
        paso_captacion: { in: ["nombre", "edad", "sucursal"] },
        ultimo_mensaje_entrante_en: { lt: corte },
      },
      select: { id: true },
    });

    for (const { id } of vencidas) {
      const paso = await db.$transaction(async (tx) => {
        const conv = await tx.conversacion.findFirst({
          where: { id, estado: "bot", pasar_a_asesor_pendiente: false },
          include: { lead: true },
        });
        if (!conv) return false;
        const marcada = await tx.conversacion.updateMany({
          where: { id, version: conv.version },
          data: { pasar_a_asesor_pendiente: true, motivo_pase_asesor: "sin_respuesta", version: conv.version + 1 },
        });
        if (marcada.count !== 1) return false; // otro proceso la tocó: en el siguiente barrido

        await deps.mensajeria.encolar(tx, conv.id, [
          { tipo: "nota_interna", cuerpo: await resumenParaAsesor(tx, conv.lead.id, "sin_respuesta") },
        ]);
        return true;
      });
      if (!paso) continue;
      await deps.mensajeria.despachar(db, id);
      pasadas++;
      log.info("espera_vencida", { conversacionId: id });
    }
  }
  return pasadas;
}
