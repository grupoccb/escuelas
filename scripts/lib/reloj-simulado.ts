// Reloj simulado de las pruebas (V10b-fix). Una prueba que depende de la hora real o del día del mes falla "de madrugada" o "los días 12": para demostrarlo y
// para fijarlo, TODAS las corridas de pruebas pueden correr con otro «ahora»:
//
//   PRUEBAS_AHORA=2026-10-10T06:30:00Z npm run test:navegador          (el instante, ISO con Z o con desfase)
//   PRUEBAS_AHORA=2026-10-10T06:30:00Z npm run test:int
//   PRUEBAS_AHORA=2026-10-10T06:30:00Z node --import ./scripts/lib/reloj-simulado-import.ts --test src/…   (una prueba suelta)
//
// El reloj corre (no se congela): el instante dado es el «ahora» del PRIMER proceso que lo lee; los demás (servidor de pruebas, trabajadores de Playwright, el
// navegador) reciben el mismo desfase en PRUEBAS_DESFASE_MS, así que todos coinciden. Solo es para pruebas: nada de `src/` lo importa y el arranque de
// producción lo niega (src/seguridad/entorno.ts, `reloj_de_pruebas_en_produccion`). Postgres sigue con su `now()` real: el desfase mueve a la APLICACIÓN.

/** El instante REAL de la máquina aunque `Date` ya esté simulada en este proceso (`performance` no la toca). */
export const ahoraReal = (): number => Math.round(performance.timeOrigin + performance.now());

/** Milisegundos de desfase pedidos por el entorno (0 = reloj real). `PRUEBAS_DESFASE_MS` manda sobre `PRUEBAS_AHORA` (así el desfase se hereda tal cual a los procesos hijos). */
export function desfaseDesdeEntorno(env: NodeJS.ProcessEnv, instanteReal: number = ahoraReal()): number {
  const heredado = (env["PRUEBAS_DESFASE_MS"] ?? "").trim();
  if (heredado) {
    const n = Number(heredado);
    if (!Number.isFinite(n)) throw new Error(`PRUEBAS_DESFASE_MS no es un número: «${heredado}»`);
    return n;
  }
  const texto = (env["PRUEBAS_AHORA"] ?? "").trim();
  if (!texto) return 0;
  // Se exige la zona (Z o ±hh:mm): «2026-10-10T06:30:00» sin zona dependería de la zona de la máquina, justo lo que se quiere evitar.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(texto)) throw new Error(`PRUEBAS_AHORA debe ser un instante ISO con zona (ej. 2026-10-10T06:30:00Z); recibí «${texto}»`);
  const instante = Date.parse(texto);
  if (Number.isNaN(instante)) throw new Error(`PRUEBAS_AHORA no es una fecha válida: «${texto}»`);
  return instante - instanteReal;
}

/** El entorno para un proceso hijo que debe vivir en el mismo «ahora»: fija el desfase UNA vez y agrega el shim a `NODE_OPTIONS`. Sin `PRUEBAS_AHORA`, no cambia nada. */
export function entornoConRelojSimulado(env: NodeJS.ProcessEnv, rutaShim: string, instanteReal: number = ahoraReal()): NodeJS.ProcessEnv {
  const desfase = desfaseDesdeEntorno(env, instanteReal);
  if (!(env["PRUEBAS_AHORA"] ?? "").trim() && !(env["PRUEBAS_DESFASE_MS"] ?? "").trim()) return env;
  const opciones = `--import=${rutaShim}`;
  const actuales = env["NODE_OPTIONS"] ?? "";
  return { ...env, PRUEBAS_DESFASE_MS: String(desfase), NODE_OPTIONS: actuales.includes(opciones) ? actuales : `${actuales} ${opciones}`.trim() };
}

/**
 * Sustituye `Date` global por una que suma el desfase a «ahora» (`new Date()` y `Date.now()`); con argumentos se comporta igual. Devuelve el desfase aplicado.
 * Se niega en producción real (NODE_ENV=production sin ENTORNO_DEMO=si).
 */
export function instalarRelojSimulado(env: NodeJS.ProcessEnv = process.env): number {
  const desfase = desfaseDesdeEntorno(env);
  if (desfase === 0) return 0;
  if (env["NODE_ENV"] === "production" && (env["ENTORNO_DEMO"] ?? "").trim().toLowerCase() !== "si") throw new Error("El reloj simulado de las pruebas no existe en producción");
  const Real = Date;
  const ahora = (): number => ahoraReal() + desfase;
  class DateSimulada extends Real {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(ahora());
      else super(...(args as [number]));
    }
    static override now(): number {
      return ahora();
    }
  }
  globalThis.Date = DateSimulada as unknown as DateConstructor;
  return desfase;
}
