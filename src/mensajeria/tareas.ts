// Tareas para el asesor que deja el sistema cuando algo no se puede resolver solo. Una sola
// pendiente por conversación y tipo (índice único parcial en la base): repetir el aviso no
// llena la bandeja.

import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import { esViolacionUnica } from "../datos/prisma.ts";
import type { TipoTareaAsesor } from "../datos/tipos.ts";

export interface TareaParaAsesor {
  leadId: string;
  conversacionId: string;
  tipo: TipoTareaAsesor;
  descripcion: string;
}

/**
 * Crea la tarea si no hay ya una pendiente del mismo tipo en esa conversación. Devuelve true si
 * la creó. Si dos procesos chocan, el índice único rechaza al segundo y se ignora.
 *
 * Fuera de una transacción. Dentro de una, un choque de unicidad la aborta: ahí conviene
 * consultar antes y dejar que el reintento del llamador vea la tarea ya creada.
 */
export async function asegurarTareaAsesor(db: Consultas, t: TareaParaAsesor): Promise<boolean> {
  const pendiente = await db.tarea_asesor.findFirst({
    where: { conversacion_id: t.conversacionId, tipo: t.tipo, estado: "pendiente" },
    select: { id: true },
  });
  if (pendiente) return false;
  try {
    await db.tarea_asesor.create({
      data: altaConAlcance({ lead_id: t.leadId, conversacion_id: t.conversacionId, tipo: t.tipo, descripcion: t.descripcion }),
    });
    return true;
  } catch (e) {
    if (!esViolacionUnica(e)) throw e;
    return false;
  }
}

/** Recorta un texto largo para citarlo en la descripción de una tarea. */
export function resumirTexto(texto: string, max = 160): string {
  return texto.length > max ? `${texto.slice(0, max)}…` : texto;
}
