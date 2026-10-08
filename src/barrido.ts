// Barrido periódico que se puede detener limpiamente.
//
// Un proceso que recibe SIGTERM (cada despliegue) no puede cortar un barrido a la mitad: dejaría
// ejecuciones reclamadas y mensajes en `enviando` sin resultado (F1-01). Por eso detener() deja
// de programar barridos nuevos y espera al que esté en curso; solo después se cierra la base.
// Dos barridos nunca se solapan: si el anterior sigue, el tic se salta.

import { log } from "./lib/log.ts";

export interface Barrido {
  /** Deja de programar barridos y espera al que esté en curso. Idempotente. */
  detener(): Promise<void>;
}

export interface OpcionesBarrido {
  tarea: () => Promise<void>;
  intervaloMs: number;
}

export function iniciarBarrido({ tarea, intervaloMs }: OpcionesBarrido): Barrido {
  let enCurso: Promise<void> | null = null;
  let detenido = false;

  const timer = setInterval(() => {
    if (detenido || enCurso) return;
    enCurso = (async () => {
      try {
        await tarea();
      } catch (e) {
        log.error("barrido_error", { error: (e as Error).message });
      } finally {
        enCurso = null;
      }
    })();
  }, intervaloMs);
  timer.unref();

  return {
    async detener() {
      detenido = true;
      clearInterval(timer);
      await enCurso;
    },
  };
}
