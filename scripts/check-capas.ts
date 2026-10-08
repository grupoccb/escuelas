// Guarda de capas. Falla el build si alguien se salta:
// - el scope por organización (invariante 1): Prisma crudo, SQL crudo u organizacion_id a mano
//   fuera de src/datos/;
// - MessagingProvider (invariante 4): la API de Chatwoot o de Twilio, o el transporte, fuera
//   de src/mensajeria/.
//
//   npm run check:capas
//   node scripts/check-capas.ts --raiz <dir>
//
// Revisa src/. No revisa scripts/: ahí viven herramientas de desarrollo (configurar Chatwoot,
// simular al contacto) que no son parte del producto. Excluye los tests y src/testutil/, que
// arman datos de varias organizaciones a propósito.

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

const REGLAS: Regla[] = [
  {
    invariante: 1,
    permitidoEn: "datos/",
    prohibido: [
      { re: /generated\/prisma/, que: "importa el cliente generado de Prisma" },
      { re: /new\s+PrismaClient\b/, que: "instancia PrismaClient" },
      { re: /\$(?:queryRaw|executeRaw)(?:Unsafe)?\b/, que: "SQL crudo" },
      { re: /\borganizacion_id\s*:/, que: "organizacion_id a mano (lo pone el scope)" },
    ],
  },
  {
    invariante: 4,
    permitidoEn: "mensajeria/",
    prohibido: [
      { re: /\/api\/v1\/|\/public\/api\//, que: "API de Chatwoot" },
      { re: /api_access_token/i, que: "token de Chatwoot" },
      { re: /api\.twilio\.com|from\s+["']twilio["']|require\(\s*["']twilio["']\s*\)/, que: "Twilio directo" },
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

function archivosDe(dir: string): string[] {
  const out: string[] = [];
  const recorrer = (d: string): void => {
    for (const e of readdirSync(d)) {
      const completo = join(d, e);
      if (statSync(completo).isDirectory()) {
        if (e !== "generated" && e !== "testutil") recorrer(completo);
      } else if (e.endsWith(".ts") && !e.endsWith(".test.ts") && !e.endsWith(".itest.ts")) {
        out.push(completo);
      }
    }
  };
  recorrer(dir);
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
