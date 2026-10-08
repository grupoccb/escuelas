// Guarda de capas. Falla el build si alguien se salta:
// - el scope por organización (invariante 1): Prisma crudo (importar el cliente generado, `pg`,
//   `new PrismaClient`, `prisma.<modelo>.…` sobre el cliente sin alcance), SQL crudo u
//   organizacion_id a mano fuera de src/datos/;
// - MessagingProvider (invariante 4): la API de Chatwoot o de Twilio (rutas, hosts, SDK estático o
//   dinámico, variables de entorno de Chatwoot) o el transporte, fuera de src/mensajeria/.
//
//   npm run check:capas
//   node scripts/check-capas.ts --raiz <dir>
//
// Revisa src/ (.ts, .mts, .tsx, .js, .mjs, .cjs). No revisa scripts/: ahí viven herramientas de
// desarrollo (configurar Chatwoot, simular al contacto) que no son parte del producto. Excluye
// los tests (`*.test.*`, `*.itest.*`) y, por RUTA EXACTA, src/generated y src/testutil: un
// `src/otro/testutil/` o `src/otro/generated/` sí se revisan.
//
// Límite conocido: es una revisión de texto. No ve un cliente crudo pasado por una variable con
// otro nombre ni SQL armado a trozos. El tipo `BaseDatos` (src/datos/alcance.ts) cierra el resto:
// el cliente con alcance no ofrece SQL crudo.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ_REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));

interface Regla {
  invariante: number;
  /** Carpeta (relativa a src/, con "/") donde lo prohibido sí está permitido. */
  permitidoEn: string;
  prohibido: { re: RegExp; que: string }[];
}

export const REGLAS: Regla[] = [
  {
    invariante: 1,
    permitidoEn: "datos/",
    prohibido: [
      { re: /generated\/prisma/, que: "importa el cliente generado de Prisma" },
      { re: /(?:from\s+|require\(\s*|import\(\s*)["'](?:pg|@prisma\/client|@prisma\/adapter-pg)["']/, que: "importa un cliente de base de datos (pg / Prisma)" },
      { re: /new\s+PrismaClient\b/, que: "instancia PrismaClient" },
      { re: /\$(?:queryRaw|executeRaw)(?:Unsafe)?\b/, que: "SQL crudo" },
      { re: /\borganizacion_id\s*:/, que: "organizacion_id a mano (lo pone el scope)" },
      { re: /["'`][^"'`]*\borganizacion_id\s*(?:=(?!=)|<>|!=|\s+in\b)/i, que: "organizacion_id a mano dentro de SQL" },
      { re: /\bprisma\.(?!\$)[A-Za-z_]\w*\.\w+\s*\(/, que: "consulta con el PrismaClient crudo (sin conAlcance)" },
    ],
  },
  {
    invariante: 4,
    permitidoEn: "mensajeria/",
    prohibido: [
      { re: /\/api\/v1\/|\/public\/api\//, que: "API de Chatwoot" },
      { re: /api_access_token/i, que: "token de Chatwoot" },
      { re: /https?:\/\/[^"'`\s]*chatwoot/i, que: "URL de Chatwoot" },
      { re: /\bCHATWOOT_[A-Z_]+/, que: "variable de entorno de Chatwoot" },
      { re: /twilio\.com/i, que: "host de Twilio" },
      { re: /(?:from\s+|require\(\s*|import\(\s*)["']twilio["']/, que: "Twilio directo" },
      { re: /x-(?:twilio|chatwoot)-signature/i, que: "firma de webhook" },
      { re: /mensajeria\/(?:chatwoot\/|transporte|fake)/, que: "importa el transporte (usa mensajeria/index.ts)" },
    ],
  },
];

export interface Hallazgo {
  archivo: string;
  linea: number;
  invariante: number;
  que: string;
  texto: string;
}

const CODIGO = /\.(?:[cm]?[jt]s|tsx)$/;
const PRUEBA = /\.(?:i?test)\.(?:[cm]?[jt]s|tsx)$/;
/** Carpetas de src/ que no se revisan, por ruta exacta desde src/. */
const EXCLUIDAS = new Set(["generated", "testutil"]);

function archivosDe(src: string): string[] {
  const out: string[] = [];
  const recorrer = (d: string): void => {
    for (const e of readdirSync(d)) {
      const completo = join(d, e);
      const rel = relative(src, completo).split(sep).join("/");
      if (statSync(completo).isDirectory()) {
        if (!EXCLUIDAS.has(rel)) recorrer(completo);
      } else if (CODIGO.test(e) && !PRUEBA.test(e)) {
        out.push(completo);
      }
    }
  };
  recorrer(src);
  return out;
}

export function escanearCapas(raiz: string): { archivos: number; hallazgos: Hallazgo[] } {
  const src = join(raiz, "src");
  const archivos = archivosDe(src);
  const hallazgos: Hallazgo[] = [];
  for (const archivo of archivos) {
    const rel = relative(src, archivo).split(sep).join("/");
    const lineas = readFileSync(archivo, "utf8").split("\n");
    for (const regla of REGLAS) {
      if (rel.startsWith(regla.permitidoEn)) continue;
      lineas.forEach((texto, i) => {
        for (const { re, que } of regla.prohibido) {
          if (re.test(texto)) {
            hallazgos.push({ archivo: `src/${rel}`, linea: i + 1, invariante: regla.invariante, que, texto: texto.trim() });
          }
        }
      });
    }
  }
  return { archivos: archivos.length, hallazgos };
}

function main(): void {
  const i = process.argv.indexOf("--raiz");
  const raiz = i >= 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]!) : RAIZ_REPO;
  const { archivos, hallazgos } = escanearCapas(raiz);
  console.log(`check:capas: ${archivos} archivos de src/ escaneados.`);
  if (hallazgos.length === 0) {
    console.log("✓ Datos solo por el scope y mensajería solo por MessagingProvider.");
    return;
  }
  console.error(`\n✗ ${hallazgos.length} violación(es) de capas:\n`);
  for (const h of hallazgos) console.error(`  ${h.archivo}:${h.linea}  [invariante ${h.invariante}] ${h.que}  → ${h.texto}`);
  console.error("");
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
