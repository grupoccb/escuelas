// Firewall genérico (CLAUDE.md, invariante 2). Falla si un término de vertical o de sucursal
// aparece en código, tests o plantillas fijas. Esos términos viven en tablas y seeds.
//
//   npm run check:generico
//   node scripts/check-generico.ts --raiz <dir>    (escanea otro directorio; lo usan los tests)
//
// Portado y adaptado de Agenda Lista (scripts/check-generico.ts). Cambios:
// - La lista de términos vive en config/terminos-prohibidos.txt, no en este archivo.
// - Separa camelCase y snake_case, así que también atrapa identificadores como `idVertical…`.
// - Ignora acentos y acepta plural.
// - No excluye *.test.ts: el invariante también prohíbe los términos en tests de lógica.
//
// Qué se escanea: TODO archivo de texto (no binario) del repo, sea cual sea su extensión o su
// nombre (`.mts`, `.css`, `.sh`, `.md`, `Dockerfile*`, `.env` en la raíz…). Se excluye solo:
// - lo que está en RUTAS_EXCLUIDAS y CARPETAS_EXCLUIDAS, siempre por RUTA EXACTA desde la raíz
//   (un `src/dist/` o un `src/coverage/` sí se escanean);
// - los seeds SQL (`prisma/seed/**/*.sql`: ahí los términos son datos). Un `.ts` dentro de
//   `prisma/seed/` sí se escanea.
// El término cuenta aunque lo rodeen dígitos (`termino2`): solo lo ocultan las letras vecinas.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ_REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const ARCHIVO_TERMINOS = join("config", "terminos-prohibidos.txt");

/** Rutas (relativas a la raíz, con "/"), archivo o carpeta, que no se escanean. Ruta exacta. */
const RUTAS_EXCLUIDAS = new Set([
  "docs",
  "src/generated",
  ARCHIVO_TERMINOS.split(sep).join("/"),
  // Describen las reglas: citan los términos a propósito.
  "CLAUDE.md",
  "SPEC.md",
  // Hashes de integridad, no texto del proyecto.
  "package-lock.json",
  "web/package-lock.json",
]);

/** Carpetas de herramientas o dependencias que no son código del repo. Ruta exacta desde la raíz. */
const CARPETAS_EXCLUIDAS = new Set([
  ".git",
  ".tmp", // borradores locales fuera de git (.gitignore)
  "node_modules",
  "web/node_modules",
  "coverage",
  "dist",
  "web/dist",
]);

/** Seeds SQL: los términos son datos. Solo `.sql`; un `.ts` en prisma/seed sí se escanea. */
const esSeedSql = (rel: string): boolean => rel.startsWith("prisma/seed/") && rel.endsWith(".sql");

/** Un archivo con bytes nulos al inicio es binario (imagen, .DS_Store…): no es texto del proyecto. */
const esBinario = (contenido: Buffer): boolean => contenido.subarray(0, 8000).includes(0);

/**
 * Archivos que son código o texto del proyecto por su extensión (o nombre). Un byte nulo en uno de
 * estos NO lo vuelve binario (EA-16): Node ejecuta un `.ts` con NUL y la guarda lo saltaba, así que
 * bastaba un NUL en un comentario para esconder un término. Se reporta como hallazgo y se escanea.
 */
const ES_TEXTO_POR_NOMBRE = /(?:\.(?:[cm]?[jt]sx?|json|md|css|scss|html?|sh|ya?ml|sql|txt|rb|prisma|toml|env)|^Dockerfile(?:\..*)?|^\.env(?:\..*)?)$/i;
const esTextoPorNombre = (ruta: string): boolean => ES_TEXTO_POR_NOMBRE.test(ruta.split(/[\\/]/).pop() ?? "");

export const BYTE_NULO = "byte nulo en un archivo de texto";

export interface Hallazgo {
  archivo: string;
  linea: number;
  termino: string;
  texto: string;
}

const sinAcentos = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "");

/** Separa camelCase y pasa a minúsculas sin acentos: "idVerticalX" → "id vertical x". */
function normalizarLinea(linea: string): string {
  return sinAcentos(linea.replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2")).toLowerCase();
}

export function leerTerminos(raiz = RAIZ_REPO): string[] {
  return readFileSync(join(raiz, ARCHIVO_TERMINOS), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

function patron(termino: string): RegExp {
  const t = sinAcentos(termino).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Bordes: solo las LETRAS ocultan el término ("pre…x" no cuenta). Un dígito no: `termino2` y
  // `2termino` cuentan. "_" también es borde (snake_case).
  return new RegExp(`(?<!\\p{L})${t}(?:es|s)?(?!\\p{L})`, "u");
}

function listarArchivos(raiz: string): string[] {
  const out: string[] = [];
  const recorrer = (dir: string): void => {
    for (const entrada of readdirSync(dir)) {
      const completo = join(dir, entrada);
      const rel = relative(raiz, completo).split(sep).join("/");
      if (RUTAS_EXCLUIDAS.has(rel)) continue;
      if (statSync(completo).isDirectory()) {
        if (!CARPETAS_EXCLUIDAS.has(rel)) recorrer(completo);
      } else if (!esSeedSql(rel)) {
        out.push(completo);
      }
    }
  };
  recorrer(raiz);
  return out;
}

export function escanear(raiz: string, terminos: string[]): { archivos: number; hallazgos: Hallazgo[] } {
  const patrones = terminos.map((termino) => ({ termino, re: patron(termino) }));
  const hallazgos: Hallazgo[] = [];
  let escaneados = 0;
  for (const archivo of listarArchivos(raiz)) {
    const contenido = readFileSync(archivo);
    if (esBinario(contenido)) {
      if (!esTextoPorNombre(archivo)) continue; // imagen, .DS_Store…
      // Código con un NUL escondido: no se salta, se reporta (y se escanea completo).
      const posicion = contenido.indexOf(0);
      const linea = contenido.subarray(0, posicion).toString("utf8").split("\n").length;
      hallazgos.push({ archivo: relative(raiz, archivo), linea, termino: BYTE_NULO, texto: "(contiene el byte 0x00: no es texto válido)" });
    }
    escaneados++;
    contenido.toString("utf8").split("\n").forEach((texto, i) => {
      const normal = normalizarLinea(texto);
      for (const { termino, re } of patrones) {
        if (re.test(normal)) {
          hallazgos.push({ archivo: relative(raiz, archivo), linea: i + 1, termino, texto: texto.trim() });
        }
      }
    });
  }
  return { archivos: escaneados, hallazgos };
}

function main(): void {
  const i = process.argv.indexOf("--raiz");
  const raiz = i >= 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]!) : RAIZ_REPO;
  const { archivos, hallazgos } = escanear(raiz, leerTerminos());

  console.log(`check:generico: ${archivos} archivos escaneados.`);
  if (hallazgos.length === 0) {
    console.log("✓ Cero términos de vertical o sucursal en el código.");
    return;
  }
  console.error(`\n✗ ${hallazgos.length} término(s) prohibido(s):\n`);
  for (const h of hallazgos) console.error(`  ${h.archivo}:${h.linea}  «${h.termino}»  → ${h.texto}`);
  console.error("\nEsos valores van en tablas o seeds, no en código (CLAUDE.md, invariante 2).\n");
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
