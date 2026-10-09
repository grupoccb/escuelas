// Barrido de finanzas (H1, H6): lo que el sistema hace solo con el dinero, una organización a la vez y aislado (una que falla no detiene a las demás):
//   1. genera la mensualidad del mes en curso de las inscripciones activas (idempotente por inscripción y periodo);
//   2. materializa como `vencido` los cargos pendientes cuyo vencimiento ya pasó;
//   3. (H6) tareas para el asesor por deuda vencida y su limpieza (`src/cobranza/tareas.ts`).
// Corre dentro del ciclo de cada minuto (`src/ciclo.ts`), a lo más una vez cada `cadaMs` por instancia.

import { conAlcance } from "../datos/alcance.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import { listarOrganizaciones } from "../datos/sistema.ts";
import { log } from "../lib/log.ts";
import { barrerTareasDeCobranza } from "../cobranza/tareas.ts";
import { leerConfiguracion } from "../configuracion/index.ts";
import { leerModulos } from "../modulos/index.ts";
import { generarMensualidades, materializarVencidos } from "./cargos.ts";

export interface ResumenFinanzas {
  organizaciones: number;
  mensualidadesGeneradas: number;
  sinResponsable: number;
  vencidosMaterializados: number;
  tareasDeCobranza: number;
  tareasResueltas: number;
  errores: number;
}

export async function barrerFinanzas(deps: { prisma: PrismaRaiz; reloj?: () => Date; organizacionId?: string }): Promise<ResumenFinanzas> {
  const ahora = (deps.reloj ?? (() => new Date()))();
  const resumen: ResumenFinanzas = { organizaciones: 0, mensualidadesGeneradas: 0, sinResponsable: 0, vencidosMaterializados: 0, tareasDeCobranza: 0, tareasResueltas: 0, errores: 0 };
  for (const org of await listarOrganizaciones(deps.prisma)) {
    if (deps.organizacionId !== undefined && org.id !== deps.organizacionId) continue;
    resumen.organizaciones++;
    const db = conAlcance(deps.prisma, org.id);
    // V1: con las finanzas apagadas no se genera ninguna mensualidad, no se vence ningún cargo y no se crea ninguna tarea de cobranza. Al encender, la mensualidad del mes en
    // curso se genera una sola vez (idempotente por inscripción y periodo); los meses que pasaron durante el apagón NO se generan solos.
    try {
      if (!(await leerModulos(db)).finanzas) continue;
    } catch (e) {
      resumen.errores++;
      log.error("finanzas_modulos_error", { organizacion: org.id, error: (e as Error).message });
      continue;
    }
    try {
      const g = await generarMensualidades(db, ahora);
      resumen.mensualidadesGeneradas += g.creados;
      resumen.sinResponsable += g.sinResponsable;
    } catch (e) {
      resumen.errores++;
      log.error("finanzas_generar_error", { organizacion: org.id, error: (e as Error).message });
    }
    try {
      resumen.vencidosMaterializados += await materializarVencidos(db, ahora);
    } catch (e) {
      resumen.errores++;
      log.error("finanzas_vencer_error", { organizacion: org.id, error: (e as Error).message });
    }
    try {
      const t = await barrerTareasDeCobranza(db, ahora, (await leerConfiguracion(db)).umbralDiasDeuda);
      resumen.tareasDeCobranza += t.creadas;
      resumen.tareasResueltas += t.resueltas;
    } catch (e) {
      resumen.errores++;
      log.error("finanzas_cobranza_error", { organizacion: org.id, error: (e as Error).message });
    }
  }
  if (resumen.mensualidadesGeneradas > 0 || resumen.vencidosMaterializados > 0) log.info("finanzas_barrido", { ...resumen });
  return resumen;
}
