// Escribe las plantillas de la carga del catálogo (V6) en `docs/plantillas-catalogo/`: un CSV por hoja, las instrucciones (LEEME.txt) y el zip con todo. Salen del mismo código que las
// descargas de Administración (`src/catalogo/importacion/plantillas.ts`); un test comprueba que lo que está en `docs/` es lo que genera el código.
//
//   npm run catalogo:plantillas
//   node scripts/catalogo-plantillas.ts --carpeta <otra carpeta>

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { descargasDePlantillas } from "../src/catalogo/importacion/plantillas.ts";

const { values } = parseArgs({ options: { carpeta: { type: "string", default: "docs/plantillas-catalogo" } } });
const carpeta = resolve(values.carpeta);
mkdirSync(carpeta, { recursive: true });
for (const a of descargasDePlantillas()) {
  writeFileSync(resolve(carpeta, a.nombre), a.contenido);
  console.log(`  ${a.nombre}`);
}
console.log(`Plantillas escritas en ${carpeta}`);
