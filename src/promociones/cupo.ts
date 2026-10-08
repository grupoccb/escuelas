// Consumo de cupo de una promoción (C3), SEGURO bajo concurrencia.
//
// `cupo_usado` sube con un UPDATE condicional atómico (`WHERE cupo_usado < cupo_maximo`): si dos personas
// toman el último lugar a la vez, Postgres re-evalúa la condición sobre la fila ya actualizada y a la
// segunda no le toca (0 filas). Es una sola sentencia, sin leer-y-luego-escribir. Además la base tiene un CHECK
// (`cupo_usado <= cupo_maximo`) por si alguien lo olvida. Una promoción sin tope también cuenta sus usos.

import type { BaseDatos, Consultas } from "../datos/alcance.ts";

/** Toma un lugar. true = lo tomó; false = no había (o la promoción no existe / está dada de baja / inactiva). */
export async function consumirCupo(db: BaseDatos | Consultas, promocionId: string): Promise<boolean> {
  const p = await db.promocion.findFirst({ where: { id: promocionId, activo: true }, select: { cupo_maximo: true } });
  if (!p) return false;
  try {
    const r = await db.promocion.updateMany({
      where: { id: promocionId, activo: true, ...(p.cupo_maximo === null ? {} : { cupo_usado: { lt: p.cupo_maximo } }) },
      data: { cupo_usado: { increment: 1 } },
    });
    return r.count === 1;
  } catch (e) {
    // Alguien bajó el tope entre la lectura y el UPDATE: la base se negó a pasarse del cupo → no había lugar.
    if (e instanceof Error && e.message.includes("promocion_cupo_check")) return false;
    throw e;
  }
}

/** Devuelve un lugar (se canceló la inscripción). Nunca baja de cero. true = lo devolvió. */
export async function liberarCupo(db: BaseDatos | Consultas, promocionId: string): Promise<boolean> {
  const r = await db.promocion.updateMany({ where: { id: promocionId, cupo_usado: { gt: 0 } }, data: { cupo_usado: { decrement: 1 } } });
  return r.count === 1;
}
