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

export interface TareaDeMensaje extends TareaParaAsesor {
  mensajeId: string;
  /** Código de error del proveedor, si lo hay (p. ej. 63016). */
  codigoError: number | null;
}

/**
 * Tarea ligada a UN mensaje (entrega fallida). Una por mensaje y tipo, sin importar su estado: un
 * fallo posterior del mismo mensaje, o el mismo evento repetido, no crea otra aunque la primera
 * ya se haya resuelto. Distinta de las tareas "una pendiente por conversación". Devuelve true si
 * la creó. Fuera de una transacción (atrapa el choque del índice único).
 */
export async function asegurarTareaDeMensaje(db: Consultas, t: TareaDeMensaje): Promise<boolean> {
  const existente = await db.tarea_asesor.findFirst({ where: { mensaje_id: t.mensajeId, tipo: t.tipo }, select: { id: true } });
  if (existente) return false;
  try {
    await db.tarea_asesor.create({
      data: altaConAlcance({
        lead_id: t.leadId,
        conversacion_id: t.conversacionId,
        mensaje_id: t.mensajeId,
        tipo: t.tipo,
        descripcion: t.descripcion,
        codigo_error: t.codigoError,
      }),
    });
    return true;
  } catch (e) {
    if (!esViolacionUnica(e)) throw e;
    return false;
  }
}

/**
 * Variante para usar DENTRO de una transacción: consulta y crea, pero no atrapa el choque del
 * índice único (en Postgres un error aborta la transacción y atraparlo no sirve de nada). Si dos
 * procesos chocan, la violación sube y quien llama repite la transacción: en el reintento la
 * primera tarea ya existe y no se crea otra. Devuelve true si la creó.
 */
export async function asegurarTareaEnTransaccion(tx: Consultas, t: TareaParaAsesor): Promise<boolean> {
  const pendiente = await tx.tarea_asesor.findFirst({
    where: { conversacion_id: t.conversacionId, tipo: t.tipo, estado: "pendiente" },
    select: { id: true },
  });
  if (pendiente) return false;
  await tx.tarea_asesor.create({
    data: altaConAlcance({ lead_id: t.leadId, conversacion_id: t.conversacionId, tipo: t.tipo, descripcion: t.descripcion }),
  });
  return true;
}

/** Recorta un texto largo para citarlo en la descripción de una tarea. */
export function resumirTexto(texto: string, max = 160): string {
  return texto.length > max ? `${texto.slice(0, max)}…` : texto;
}
