// Cancelar los recordatorios de pago que ya no valen (H6): cuando un cargo se salda o se cancela, o su inscripción se da de baja, las ejecuciones PROGRAMADAS y aún no reclamadas por
// el motor pasan a `cancelado`. Corre dentro de la misma transacción de lo que las invalida (el pago, la cancelación, la baja). Lo que el motor ya reclamó lo revalida él mismo
// antes de mandar (`revalidar.ts`): queda, nada más, la ventana de milisegundos entre esa revisión y el envío.

import type { Consultas } from "../datos/alcance.ts";

export async function cancelarEjecucionesDeCobro(tx: Consultas, cargoIds: readonly string[], motivo: string): Promise<number> {
  if (cargoIds.length === 0) return 0;
  const r = await tx.automatizacion_ejecucion.updateMany({
    where: { entidad_tipo: "cargo", entidad_id: { in: [...cargoIds] }, estatus: "programado", ejecutado_en: null },
    data: { estatus: "cancelado", motivo_omision: motivo },
  });
  return r.count;
}

/** Cancela los recordatorios de TODOS los cargos de una inscripción (se dio de baja). */
export async function cancelarEjecucionesDeInscripcion(tx: Consultas, inscripcionId: string, motivo: string): Promise<number> {
  const cargos = await tx.cargo.findMany({ where: { inscripcion_id: inscripcionId }, select: { id: true } });
  return cancelarEjecucionesDeCobro(tx, cargos.map((c) => c.id), motivo);
}
