import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Mundo } from "../../scripts/navegador/tipos.ts";

export type { Mundo };
export const RAIZ = resolve(import.meta.dirname, "../..");
export const rutaDeEstado = (rol: string): string => resolve(RAIZ, `.tmp/navegador/estado-${rol}.json`);

/** Los datos sembrados por scripts/navegador/mundo.ts (ids y credenciales de PRUEBA). */
export function cargarMundo(): Mundo {
  return JSON.parse(readFileSync(resolve(RAIZ, ".tmp/navegador/mundo.json"), "utf8")) as Mundo;
}
