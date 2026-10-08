// Barrido que pasa a `vencida` las cotizaciones vigentes cuyo último día ya pasó (C8). Idempotente; una organización
// que falla no detiene a las demás. Corre dentro del mantenimiento horario del ciclo (`src/ciclo.ts`).

import { conAlcance } from "../datos/alcance.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import { listarOrganizaciones } from "../datos/sistema.ts";
import { log } from "../lib/log.ts";
import { vencerCotizaciones } from "./guardar.ts";

export interface ResumenVencimiento {
  organizaciones: number;
  vencidas: number;
  errores: number;
}

export async function vencerCotizacionesDeTodas(deps: { prisma: PrismaRaiz; reloj?: () => Date; organizacionId?: string }): Promise<ResumenVencimiento> {
  const ahora = (deps.reloj ?? (() => new Date()))();
  const resumen: ResumenVencimiento = { organizaciones: 0, vencidas: 0, errores: 0 };
  for (const org of await listarOrganizaciones(deps.prisma)) {
    if (deps.organizacionId !== undefined && org.id !== deps.organizacionId) continue;
    resumen.organizaciones++;
    try {
      resumen.vencidas += await vencerCotizaciones(conAlcance(deps.prisma, org.id), ahora);
    } catch (e) {
      resumen.errores++;
      log.error("cotizaciones_vencer_error", { organizacion: org.id, error: (e as Error).message });
    }
  }
  if (resumen.vencidas > 0) log.info("cotizaciones_vencidas", { ...resumen });
  return resumen;
}
