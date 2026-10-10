// Copia a web/public/fuentes/ las dos fuentes del sistema visual (docs/diseno/SISTEMA-VISUAL.md) desde sus paquetes de npm, para servirlas desde el propio origen
// (la política de seguridad solo permite `font-src 'self'`). Solo los subconjuntos «latin» y «latin-ext» (español incluido), variable en peso.
// Los archivos copiados SE VERSIONAN: el build no depende de esta copia. Se vuelve a correr solo para actualizar las fuentes:  node web/scripts/copiar-fuentes.mjs
//
// Licencia: SIL Open Font License 1.1 (se copia el texto junto a cada familia).

import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destino = join(web, "public/fuentes");
mkdirSync(destino, { recursive: true });

const familias = [
  { paquete: "figtree", nombre: "figtree", archivos: ["figtree-latin-wght-normal.woff2", "figtree-latin-ext-wght-normal.woff2"] },
  { paquete: "bricolage-grotesque", nombre: "bricolage-grotesque", archivos: ["bricolage-grotesque-latin-wght-normal.woff2", "bricolage-grotesque-latin-ext-wght-normal.woff2"] },
];
for (const f of familias) {
  const base = join(web, "node_modules/@fontsource-variable", f.paquete);
  for (const a of f.archivos) copyFileSync(join(base, "files", a), join(destino, a));
  copyFileSync(join(base, "LICENSE"), join(destino, `${f.nombre}-LICENSE.txt`));
}
console.log(`Fuentes copiadas a ${destino}`);
