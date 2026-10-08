// Cierre ordenado del proceso ante SIGTERM/SIGINT (cada despliegue manda uno).
//
// Cerrar a la mitad de un barrido dejaría reclamos huérfanos (F1-01): primero se deja de programar
// barridos y se espera al que corre; después las peticiones en curso terminan; la base se cierra al
// final. Si algo falla o tarda más que el tope, el proceso sale con código distinto de 0 (EA-19): un
// cierre que falla no se esconde detrás de un `exit(0)`.
//
// El tope tiene que ser MENOR que el plazo que el orquestador da antes de matar el proceso
// (`stop_grace_period` en docker-compose.yml, `stopTimeout` en ECS): si no, el cierre ordenado solo
// se garantiza cuando el barrido termina antes de que lo maten. Un test lo comprueba.

import { log } from "./lib/log.ts";

/** Tiempo máximo del cierre ordenado. `stop_grace_period` del backend debe ser mayor. */
export const LIMITE_CIERRE_MS = 30_000;

export interface RecursosDeCierre {
  barrido: { detener(): Promise<void> };
  server: { close(callback?: (error?: Error) => void): unknown; closeIdleConnections(): void };
  prisma: { $disconnect(): Promise<void> };
  /** Termina el proceso. En producción, `process.exit`. */
  salir(codigo: number): void;
  limiteMs?: number;
}

/** Devuelve la función que cierra. Es idempotente: la segunda señal mientras cierra no hace nada. */
export function crearCierre(r: RecursosDeCierre): (signal: string) => Promise<void> {
  let cerrando = false;
  return async (signal) => {
    if (cerrando) return;
    cerrando = true;
    log.info("backend_cerrando", { signal });
    const limite = setTimeout(() => {
      log.error("backend_cierre_agotado", { limiteMs: r.limiteMs ?? LIMITE_CIERRE_MS });
      r.salir(1);
    }, r.limiteMs ?? LIMITE_CIERRE_MS);
    limite.unref();

    let codigo = 0;
    const paso = async (nombre: string, trabajo: () => Promise<void>): Promise<void> => {
      try {
        await trabajo();
      } catch (e) {
        codigo = 1;
        log.error("backend_cierre_fallido", { paso: nombre, error: (e as Error).message });
      }
    };
    await paso("barrido", () => r.barrido.detener());
    // Las peticiones en curso (un webhook a medio procesar) terminan antes de cerrar la base.
    await paso("servidor", () =>
      new Promise<void>((resolver, rechazar) => {
        r.server.close((error) => (error ? rechazar(error) : resolver()));
        r.server.closeIdleConnections();
      }),
    );
    await paso("base_de_datos", () => r.prisma.$disconnect());
    clearTimeout(limite);
    r.salir(codigo);
  };
}
