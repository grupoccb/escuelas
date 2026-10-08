// Zona horaria de la sucursal que atiende a un contacto. Define el horario de envío
// (invariante 14). La usan MessagingProvider, que lo hace cumplir, y el motor de
// automatizaciones, que programa las ejecuciones dentro de horario.

import type { Consultas } from "../datos/alcance.ts";

/**
 * La de la sucursal que eligió el contacto, la fija del canal o, si aún no hay ninguna, la de
 * la primera sucursal activa de la vertical. Sin ninguna, null: no se adivina la hora local y
 * no se manda nada automático.
 */
export async function zonaHorariaDeContacto(
  db: Consultas,
  sucursalDelLead: string | null,
  sucursalDelCanal: string | null,
  verticalId: string,
): Promise<string | null> {
  const id = sucursalDelLead ?? sucursalDelCanal;
  if (id) return (await db.sucursal.findFirst({ where: { id }, select: { zona_horaria: true } }))?.zona_horaria ?? null;
  const fila = await db.sucursal_vertical.findFirst({
    where: { vertical_id: verticalId, activo: true, sucursal: { activo: true, eliminado_en: null } },
    orderBy: { creado_en: "asc" },
    select: { sucursal: { select: { zona_horaria: true } } },
  });
  return fila?.sucursal.zona_horaria ?? null;
}
