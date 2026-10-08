// Un ciclo del barrido periódico (cada minuto): el tiempo de espera del bot y las automatizaciones
// (reenganche y recuperación de lo que un proceso muerto dejó a medias). Uno tras otro, no en
// paralelo, para que no se pisen sobre la misma conversación.
//
// Los dos están AISLADOS (EA-01/EA-07): si el primero falla por completo, el segundo corre igual.
// La recuperación de F1-01 vive en el motor; que la espera falle no puede dejarla sin correr en
// ninguna organización. Dentro de cada uno, además, cada organización y cada conversación van
// aisladas (ver espera.ts y motor.ts).

import { correrAutomatizaciones, type ResumenMotor } from "./automatizaciones/motor.ts";
import { barrerEspera, type ResumenEspera } from "./captacion/espera.ts";
import type { PrismaRaiz } from "./datos/prisma.ts";
import { log } from "./lib/log.ts";
import type { MessagingProvider } from "./mensajeria/index.ts";

export interface DepsCiclo {
  prisma: PrismaRaiz;
  mensajeria: MessagingProvider;
  reloj?: () => Date;
}

export interface ResumenCiclo {
  /** null si el barrido de espera lanzó antes de poder resumir. */
  espera: ResumenEspera | null;
  /** null si el motor lanzó antes de poder resumir. */
  motor: ResumenMotor | null;
  /** Errores aislados de todo el ciclo (conversaciones, organizaciones y barridos completos). */
  errores: number;
}

export async function correrCiclo(deps: DepsCiclo): Promise<ResumenCiclo> {
  let errores = 0;
  let espera: ResumenEspera | null = null;
  let motor: ResumenMotor | null = null;
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
  if (errores > 0) log.warn("ciclo_con_errores", { errores });
  return { espera, motor, errores };
}
