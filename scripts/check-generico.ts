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
// Exclusiones: carpetas de documentación y de seeds (ahí los términos son datos), el código
// generado, dependencias y el propio archivo de términos.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ_REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const ARCHIVO_TERMINOS = join("config", "terminos-prohibidos.txt");

/** Rutas (relativas a la raíz, con "/") que no se escanean. */
const RUTAS_EXCLUIDAS = new Set([
  "docs",
  "prisma/seed",
  "src/generated",
  ARCHIVO_TERMINOS.split(sep).join("/"),
]);

const CARPETAS_EXCLUIDAS = new Set(["node_modules", ".git", "coverage", "dist"]);

const EXTENSIONES = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".sql", ".prisma",
  ".yml", ".yaml", ".html", ".hbs", ".txt", ".rb", ".env",
]);

const ARCHIVOS_EXCLUIDOS = new Set(["package-lock.json"]);

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
  // Bordes: cualquier cosa que no sea letra o dígito. "_" cuenta como borde (snake_case).
  return new RegExp(`(?<![\\p{L}\\p{N}])${t}(?:es|s)?(?![\\p{L}\\p{N}])`, "u");
}

function listarArchivos(raiz: string): string[] {
  const out: string[] = [];
  const recorrer = (dir: string): void => {
    for (const entrada of readdirSync(dir)) {
      const completo = join(dir, entrada);
      const rel = relative(raiz, completo).split(sep).join("/");
      if (RUTAS_EXCLUIDAS.has(rel)) continue;
      if (statSync(completo).isDirectory()) {
        if (!CARPETAS_EXCLUIDAS.has(entrada)) recorrer(completo);
      } else if (EXTENSIONES.has(extname(entrada)) && !ARCHIVOS_EXCLUIDOS.has(entrada)) {
        out.push(completo);
      }
    }
  };
  recorrer(raiz);
  return out;
}

export function escanear(raiz: string, terminos: string[]): { archivos: number; hallazgos: Hallazgo[] } {
  const patrones = terminos.map((termino) => ({ termino, re: patron(termino) }));
  const archivos = listarArchivos(raiz);
  const hallazgos: Hallazgo[] = [];
  for (const archivo of archivos) {
    readFileSync(archivo, "utf8").split("\n").forEach((texto, i) => {
      const normal = normalizarLinea(texto);
      for (const { termino, re } of patrones) {
        if (re.test(normal)) {
          hallazgos.push({ archivo: relative(raiz, archivo), linea: i + 1, termino, texto: texto.trim() });
        }
      }
    });
  }
  return { archivos: archivos.length, hallazgos };
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
