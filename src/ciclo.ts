// Un ciclo del barrido periódico (cada minuto): el tiempo de espera del bot, las automatizaciones
// (reenganche y recuperación de lo que un proceso muerto dejó a medias) y el reenvío de los eventos
// de Twilio que quedaron pendientes. Uno tras otro, no en paralelo, para que no se pisen sobre la
// misma conversación.
//
// Los tres están AISLADOS (EA-01/EA-07): si uno falla por completo, los otros corren igual. La
// recuperación de F1-01 vive en el motor; que la espera falle no puede dejarla sin correr en
// ninguna organización. Dentro de cada uno, además, cada organización y cada conversación van
// aisladas (ver espera.ts y motor.ts).

import { purgarCaducados, type ResumenRetencion } from "./auth/retencion.ts";
import { correrAutomatizaciones, type ResumenMotor } from "./automatizaciones/motor.ts";
import { barrerEspera, type ResumenEspera } from "./captacion/espera.ts";
import { barrerAvisosMaestro, type ResumenAvisos } from "./clases-muestra/avisos.ts";
import { vencerCotizacionesDeTodas, type ResumenVencimiento } from "./cotizador/vencer.ts";
import type { PrismaRaiz } from "./datos/prisma.ts";
import { barrerFinanzas, type ResumenFinanzas } from "./finanzas/barrido.ts";
import { log } from "./lib/log.ts";
import { registrarCiclo } from "./observabilidad/proceso.ts";
import type { BordeTwilio, MessagingProvider, ResumenReenvio } from "./mensajeria/index.ts";

export interface DepsCiclo {
  prisma: PrismaRaiz;
  mensajeria: MessagingProvider;
  /** El borde de Twilio, si está encendido: su barrido reenvía los eventos que quedaron pendientes (EA-03). */
  twilio?: BordeTwilio;
  /**
   * Retención de sesiones e intentos de acceso (EB-19): a lo más una vez cada `cadaMs` (por defecto
   * una hora) por instancia de base de datos. Apagada si no se pasa (los tests del ciclo no la usan).
   */
  retencion?: { cadaMs?: number };
  /**
   * Vencimiento de las cotizaciones (C8): a lo más una vez cada `cadaMs` (por defecto una hora) por instancia de base de datos.
   * Corre SIEMPRE, con o sin retención (EC-15): sin él el bot seguiría reutilizando cotizaciones de cualquier edad.
   */
  cotizaciones?: { cadaMs?: number };
  /**
   * Finanzas (H1, H6): mensualidades del mes, cargos vencidos y tareas de cobranza. A lo más una vez cada `cadaMs` (por defecto 10 minutos) por instancia de
   * base de datos; es idempotente, así que repetirlo o correrlo en paralelo no duplica nada. Corre SIEMPRE.
   */
  finanzas?: { cadaMs?: number };
  reloj?: () => Date;
}

/** Última vez que corrió la retención, por instancia de base de datos. */
const ultimaRetencion = new WeakMap<object, number>();
/** Última vez que corrió el vencimiento de cotizaciones, por instancia de base de datos. */
const ultimoVencimiento = new WeakMap<object, number>();
/** Última vez que corrió el barrido de finanzas, por instancia de base de datos. */
const ultimaFinanzas = new WeakMap<object, number>();
const RETENCION_CADA_MS = 60 * 60 * 1000;
const FINANZAS_CADA_MS = 10 * 60 * 1000;

export interface ResumenCiclo {
  /** null si el barrido de espera lanzó antes de poder resumir. */
  espera: ResumenEspera | null;
  /** null si el motor lanzó antes de poder resumir. */
  motor: ResumenMotor | null;
  /** Avisos de clases muestra a los maestros (D2). null si el barrido lanzó por completo. */
  avisosMaestro: ResumenAvisos | null;
  /** null si no hay borde de Twilio o su barrido lanzó por completo. */
  twilio: ResumenReenvio | null;
  /** null si la retención está apagada, no le tocaba o lanzó. */
  retencion: ResumenRetencion | null;
  /** Cotizaciones que pasaron a `vencida` (mantenimiento horario, independiente de la retención). null si no le tocaba o lanzó. */
  cotizaciones: ResumenVencimiento | null;
  /** Mensualidades generadas y cargos vencidos (H1). null si no le tocaba o lanzó. */
  finanzas: ResumenFinanzas | null;
  /** Errores aislados de todo el ciclo (conversaciones, organizaciones y barridos completos). */
  errores: number;
}

export async function correrCiclo(deps: DepsCiclo): Promise<ResumenCiclo> {
  let errores = 0;
  let espera: ResumenEspera | null = null;
  let motor: ResumenMotor | null = null;
  let avisosMaestro: ResumenAvisos | null = null;
  let twilio: ResumenReenvio | null = null;
  let retencion: ResumenRetencion | null = null;
  let cotizaciones: ResumenVencimiento | null = null;
  let finanzas: ResumenFinanzas | null = null;
  try {
    espera = await barrerEspera(deps);
    errores += espera.errores;
  } catch (e) {
    errores++;
    log.error("ciclo_error", { barrido: "espera", error: (e as Error).message });
  }
  try {
    motor = await correrAutomatizaciones(deps);
    errores += motor.errores;
  } catch (e) {
    errores++;
    log.error("ciclo_error", { barrido: "motor", error: (e as Error).message });
  }
  try {
    avisosMaestro = await barrerAvisosMaestro(deps);
    errores += avisosMaestro.errores;
  } catch (e) {
    errores++;
    log.error("ciclo_error", { barrido: "avisos_maestro", error: (e as Error).message });
  }
  if (deps.twilio) {
    try {
      twilio = await deps.twilio.reenviarPendientes();
      errores += twilio.errores;
    } catch (e) {
      errores++;
      log.error("ciclo_error", { barrido: "twilio", error: (e as Error).message });
    }
  }
  if (deps.retencion) {
    const ahora = (deps.reloj ?? (() => new Date()))().getTime();
    const ultima = ultimaRetencion.get(deps.prisma);
    if (ultima === undefined || ahora - ultima >= (deps.retencion.cadaMs ?? RETENCION_CADA_MS)) {
      ultimaRetencion.set(deps.prisma, ahora);
      try {
        retencion = await purgarCaducados(deps);
        errores += retencion.errores;
      } catch (e) {
        errores++;
        log.error("ciclo_error", { barrido: "retencion", error: (e as Error).message });
      }
    }
  }
  {
    const ahora = (deps.reloj ?? (() => new Date()))().getTime();
    const ultima = ultimoVencimiento.get(deps.prisma);
    if (ultima === undefined || ahora - ultima >= (deps.cotizaciones?.cadaMs ?? RETENCION_CADA_MS)) {
      ultimoVencimiento.set(deps.prisma, ahora);
      try {
        cotizaciones = await vencerCotizacionesDeTodas(deps);
        errores += cotizaciones.errores;
      } catch (e) {
        errores++;
        log.error("ciclo_error", { barrido: "cotizaciones", error: (e as Error).message });
      }
    }
  }
  {
    const ahora = (deps.reloj ?? (() => new Date()))().getTime();
    const ultima = ultimaFinanzas.get(deps.prisma);
    if (ultima === undefined || ahora - ultima >= (deps.finanzas?.cadaMs ?? FINANZAS_CADA_MS)) {
      ultimaFinanzas.set(deps.prisma, ahora);
      try {
        finanzas = await barrerFinanzas(deps);
        errores += finanzas.errores;
      } catch (e) {
        errores++;
        log.error("ciclo_error", { barrido: "finanzas", error: (e as Error).message });
      }
    }
  }
  if (errores > 0) log.warn("ciclo_con_errores", { errores });
  // K4: el barrido dice que corrió (lo leen /salud/lista, /metricas y la alarma «barrido atrasado» de infra/monitoreo.tf).
  registrarCiclo(errores);
  log.info("ciclo_completado", { errores });
  return { espera, motor, avisosMaestro, twilio, retencion, cotizaciones, finanzas, errores };
}
