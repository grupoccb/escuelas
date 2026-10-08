// Retención de lo que crece sin parar (EB-19): sesiones e intentos de acceso.
//
// - Una sesión que expiró o se revocó hace más de `sesionesDias` ya no sirve para nada; se marca
//   `eliminado_en` (soft delete: invariante 3, nunca DELETE físico).
// - Un intento de acceso fuera de la ventana de bloqueo no cuenta; pasadas `intentosHoras` se marca
//   `eliminado_en`. (Los intentos de quien ni existe también se guardan, así que sin esto crecen con
//   cualquiera que le escriba al login.)
//
// IDEMPOTENTE: una segunda corrida seguida no encuentra nada que marcar (el alcance oculta lo ya
// marcado). Se invoca desde el barrido (`ciclo.ts`, a lo más una vez por hora) y se puede correr a
// mano. Un error en una organización se anota y no detiene a las demás.
//
// NO toca el registro de cambios ni el registro de accesos a salud: son de solo anexar y su retención es una
// decisión de producto (qué tanto tiempo se conserva quién vio los datos de salud de un menor) que
// queda abierta para Eduardo; ver la bitácora.

import { conAlcance } from "../datos/alcance.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import { listarOrganizaciones } from "../datos/sistema.ts";
import { log } from "../lib/log.ts";

export interface ConfigRetencion {
  /** Días que se conserva una sesión después de expirar o revocarse. */
  sesionesDias: number;
  /** Horas que se conserva un intento de acceso. */
  intentosHoras: number;
}

export const RETENCION_POR_DEFECTO: ConfigRetencion = { sesionesDias: 30, intentosHoras: 48 };

export interface ResumenRetencion {
  organizaciones: number;
  sesiones: number;
  intentos: number;
  errores: number;
}

export async function purgarCaducados(deps: { prisma: PrismaRaiz; reloj?: () => Date }, config: ConfigRetencion = RETENCION_POR_DEFECTO): Promise<ResumenRetencion> {
  const ahora = (deps.reloj ?? (() => new Date()))();
  const limiteSesiones = new Date(ahora.getTime() - config.sesionesDias * 24 * 60 * 60 * 1000);
  const limiteIntentos = new Date(ahora.getTime() - config.intentosHoras * 60 * 60 * 1000);
  const resumen: ResumenRetencion = { organizaciones: 0, sesiones: 0, intentos: 0, errores: 0 };
  for (const org of await listarOrganizaciones(deps.prisma)) {
    resumen.organizaciones++;
    try {
      const db = conAlcance(deps.prisma, org.id);
      const sesiones = await db.sesion.updateMany({
        where: { OR: [{ expira_en: { lt: limiteSesiones } }, { revocada_en: { lt: limiteSesiones } }] },
        data: { eliminado_en: ahora },
      });
      const intentos = await db.intento_acceso.updateMany({ where: { creado_en: { lt: limiteIntentos } }, data: { eliminado_en: ahora } });
      resumen.sesiones += sesiones.count;
      resumen.intentos += intentos.count;
    } catch (e) {
      resumen.errores++;
      log.error("retencion_error", { organizacion: org.id, error: (e as Error).message });
    }
  }
  if (resumen.sesiones > 0 || resumen.intentos > 0) log.info("retencion", { ...resumen });
  return resumen;
}
