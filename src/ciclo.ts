// Un ciclo del barrido periódico (cada minuto): el tiempo de espera del bot, las automatizaciones
// (reenganche y recuperación de lo que un proceso muerto dejó a medias) y el reenvío de los eventos
// de Twilio que quedaron pendientes. Uno tras otro, no en paralelo, para que no se pisen sobre la
// misma conversación.
//
// Los tres están AISLADOS (EA-01/EA-07): si uno falla por completo, los otros corren igual. La
// recuperación de F1-01 vive en el motor; que la espera falle no puede dejarla sin correr en
// ninguna organización. Dentro de cada uno, además, cada organización y cada conversación van
// aisladas (ver espera.ts y motor.ts).

import { correrAutomatizaciones, type ResumenMotor } from "./automatizaciones/motor.ts";
import { barrerEspera, type ResumenEspera } from "./captacion/espera.ts";
import type { PrismaRaiz } from "./datos/prisma.ts";
import { log } from "./lib/log.ts";
import type { BordeTwilio, MessagingProvider, ResumenReenvio } from "./mensajeria/index.ts";

export interface DepsCiclo {
  prisma: PrismaRaiz;
  mensajeria: MessagingProvider;
  /** El borde de Twilio, si está encendido: su barrido reenvía los eventos que quedaron pendientes (EA-03). */
  twilio?: BordeTwilio;
  reloj?: () => Date;
}

export interface ResumenCiclo {
  /** null si el barrido de espera lanzó antes de poder resumir. */
  espera: ResumenEspera | null;
  /** null si el motor lanzó antes de poder resumir. */
  motor: ResumenMotor | null;
  /** null si no hay borde de Twilio o su barrido lanzó por completo. */
  twilio: ResumenReenvio | null;
  /** Errores aislados de todo el ciclo (conversaciones, organizaciones y barridos completos). */
  errores: number;
}

export async function correrCiclo(deps: DepsCiclo): Promise<ResumenCiclo> {
  let errores = 0;
  let espera: ResumenEspera | null = null;
  let motor: ResumenMotor | null = null;
  let twilio: ResumenReenvio | null = null;
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
  if (deps.twilio) {
    try {
      twilio = await deps.twilio.reenviarPendientes();
      errores += twilio.errores;
    } catch (e) {
      errores++;
      log.error("ciclo_error", { barrido: "twilio", error: (e as Error).message });
    }
  }
  if (errores > 0) log.warn("ciclo_con_errores", { errores });
  return { espera, motor, twilio, errores };
}
