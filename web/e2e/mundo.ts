import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Mundo } from "../../scripts/navegador/tipos.ts";

export type { Mundo };
export const RAIZ = resolve(import.meta.dirname, "../..");
/** La carpeta del estado de la corrida (DIR_NAVEGADOR permite varias corridas a la vez, cada una con la suya). */
export const DIR_NAVEGADOR = resolve(RAIZ, process.env["DIR_NAVEGADOR"] ?? ".tmp/navegador");
export const rutaDeEstado = (rol: string): string => resolve(DIR_NAVEGADOR, `estado-${rol}.json`);

/** Los datos sembrados por scripts/navegador/mundo.ts (ids y credenciales de PRUEBA). */
export function cargarMundo(): Mundo {
  return JSON.parse(readFileSync(resolve(DIR_NAVEGADOR, "mundo.json"), "utf8")) as Mundo;
}
