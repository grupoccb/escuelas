import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Mundo } from "../../scripts/navegador/tipos.ts";

export type { Mundo };
export const RAIZ = resolve(import.meta.dirname, "../..");
/** La carpeta del estado de la corrida (DIR_NAVEGADOR permite varias corridas a la vez, cada una con la suya). */
export const DIR_NAVEGADOR = resolve(RAIZ, process.env["DIR_NAVEGADOR"] ?? ".tmp/navegador");
/**
 * V13-fix (EV-45): `npm run test:navegador` ya NO reescribe las capturas versionadas de `docs/capturas/` (antes dejaba cientos de PNG modificados en el árbol tras cada corrida).
 * Las pruebas dejan sus capturas en la carpeta de la corrida (`<DIR_NAVEGADOR>/capturas`), que se descarta; solo con `CAPTURAS_ESCRIBIR=1` (`npm run capturas:escribir`) van a
 * `docs/capturas/`. `sub` es la ruta dentro de `capturas` (por ejemplo `v1` o `v1/v7-asesor`).
 */
export const CAPTURAS_ESCRIBIR = process.env["CAPTURAS_ESCRIBIR"] === "1";
export const carpetaDeCapturas = (sub = ""): string => resolve(CAPTURAS_ESCRIBIR ? resolve(RAIZ, "docs/capturas") : resolve(DIR_NAVEGADOR, "capturas"), sub);
export const rutaDeEstado = (rol: string): string => resolve(DIR_NAVEGADOR, `estado-${rol}.json`);

/** Los datos sembrados por scripts/navegador/mundo.ts (ids y credenciales de PRUEBA). */
export function cargarMundo(): Mundo {
  return JSON.parse(readFileSync(resolve(DIR_NAVEGADOR, "mundo.json"), "utf8")) as Mundo;
}
