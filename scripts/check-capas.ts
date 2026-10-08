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
// El invariante 1 NO descansa solo en esta revisión de texto (EA-12): los módulos reciben un
// `PrismaRaiz` opaco (src/datos/prisma.ts) que no tiene modelos ni `$transaction` ni SQL crudo, así
// que un alias, una desestructuración, `deps["prisma"]` o una consulta multilínea no compilan
// (el typecheck de `npm run validar` falla). Esta guarda cierra lo que el tipo no ve: obtener el
// cliente completo (`clienteSinAlcance`, `crearPrismaDePruebas`, `PrismaClient`), importar
// utilidades de prueba desde código de producción, cargas dinámicas y primitivas de red.
//
// Límite conocido (documentado, no resuelto): un doble cast deliberado a una forma escrita a mano
// (`x as never as { lead: … }`) compila; la guarda solo ve el que lleva `prisma` en la misma línea.
// Un host de Twilio armado a trozos ya no importa: `fetch` y los módulos de red están prohibidos
// fuera de src/mensajeria/.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ_REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));

interface Regla {
  invariante: number | string;
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
      { re: /\bPrismaClient\b/, que: "menciona PrismaClient (los módulos reciben un PrismaRaiz opaco)" },
      { re: /\bclienteSinAlcance\b/, que: "obtiene el cliente completo sin alcance (solo src/datos/)" },
      { re: /\b(?:crearPrismaDePruebas|PrismaPruebas)\b/, que: "usa el cliente de pruebas en código de producción" },
      { re: /(?:from\s+|require\(\s*|import\(\s*)["'][^"']*\btestutil\//, que: "importa utilidades de prueba (src/testutil) desde código de producción" },
      { re: /(?:from\s+|require\(\s*|import\(\s*)["'][^"']*\.i?test\.[cm]?[jt]sx?["']/, que: "importa un archivo de prueba desde código de producción" },
      { re: /\bimport\(\s*[^"'\s)]/, que: "importación dinámica con ruta calculada" },
      { re: /\bcreateRequire\b/, que: "carga de módulos con createRequire" },
      { re: /\bprisma\b[^;\n]*\bas\s+(?:unknown|never|any)\b/, que: "cast del cliente de base de datos" },
    ],
  },
  {
    invariante: 4,
    permitidoEn: "mensajeria/",
    prohibido: [
      { re: /\/api\/v1\/|\/public\/api\//, que: "API de Chatwoot" },
      { re: /api_access_token/i, que: "token de Chatwoot" },
      { re: /https?:\/\/[^"'`\s]*chatwoot/i, que: "URL de Chatwoot" },
      { re: /\bCHATWOOT_/, que: "variable de entorno de Chatwoot" },
      { re: /\bfetch\s*\(/, que: "petición de red (fetch) fuera de mensajeria" },
      { re: /["']node:(?:https?|net|tls|dgram|http2)["']|from\s+["'](?:https?|net|tls|undici)["']|\bXMLHttpRequest\b/, que: "módulo de red fuera de mensajeria" },
      { re: /twilio\.com/i, que: "host de Twilio" },
      { re: /(?:from\s+|require\(\s*|import\(\s*)["']twilio["']/, que: "Twilio directo" },
      { re: /x-(?:twilio|chatwoot)-signature/i, que: "firma de webhook" },
      { re: /mensajeria\/(?:chatwoot\/|transporte|fake)/, que: "importa el transporte (usa mensajeria/index.ts)" },
    ],
  },
  {
    // Decisión 12: la ficha de salud y su registro de accesos solo se tocan desde src/sensibles/, que
    // cifra, exige el permiso y registra cada acceso. Cualquier otro lugar leería datos de menores sin rastro.
    invariante: "decisión 12",
    permitidoEn: "sensibles/",
    prohibido: [{ re: /\b(?:ficha_salud|acceso_dato_sensible)\b/, que: "toca la ficha de salud o su registro sin pasar por leerSensible()/guardarSensible()" }],
  },
];

export interface Hallazgo {
  archivo: string;
  linea: number;
  invariante: number | string;
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
  for (const h of hallazgos) console.error(`  ${h.archivo}:${h.linea}  [${typeof h.invariante === "number" ? `invariante ${h.invariante}` : h.invariante}] ${h.que}  → ${h.texto}`);
  console.error("");
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
