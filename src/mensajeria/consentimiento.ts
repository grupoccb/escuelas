// Consentimiento por teléfono. La bitácora es append-only: el estado vigente es la fila más
// reciente por (organización, teléfono, alcance). Una baja aplica a TODA la organización, es
// decir, a todas sus verticales, no solo a la que recibió el mensaje.

import { altaConAlcance, type Consultas } from "../datos/alcance.ts";

export type AlcanceBaja = "todo" | "marketing";

/** true si la baja vigente del teléfono cubre ese alcance. "todo" cubre también "marketing". */
export async function estaDadoDeBaja(db: Consultas, telefono: string, alcance: AlcanceBaja = "todo"): Promise<boolean> {
  const alcances = alcance === "todo" ? (["todo"] as const) : (["todo", "marketing"] as const);
  for (const a of alcances) {
    const ultimo = await db.consentimiento.findFirst({
      where: { telefono, alcance: a },
      orderBy: [{ fecha: "desc" }, { creado_en: "desc" }],
      select: { estado: true },
    });
    if (ultimo?.estado === "opt_out") return true;
  }
  return false;
}

/**
 * Registra la baja total. Devuelve false (y no escribe) si ya estaba dada de baja: el registro
 * no crece con repeticiones.
 */
export async function registrarBaja(
  db: Consultas,
  telefono: string,
  origen: string,
  evidencia: Record<string, string>,
  ahora: Date,
): Promise<boolean> {
  if (await estaDadoDeBaja(db, telefono, "todo")) return false;
  await db.consentimiento.create({
    data: altaConAlcance({ telefono, estado: "opt_out" as const, alcance: "todo" as const, origen, evidencia, fecha: ahora }),
  });
  return true;
}
