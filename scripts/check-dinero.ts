// Guarda de dinero (C2): el dinero va en centavos enteros (`src/lib/dinero.ts`), nunca en punto flotante.
// Falla el build si en el código de producción (src/, sin tests, `generated` ni `testutil`):
//
//   1. aparece `parseFloat(` o `Number.parseFloat(` (nadie la necesita: un importe es texto → `deTexto`);
//   2. aparece `.toNumber()` (la forma de bajar un Decimal de Prisma a flotante; se usa `deDecimal`);
//   3. una línea con una palabra de dinero (monto, precio, costo, importe, saldo, pago, cargo, descuento,
//      mensualidad, tarifa, cuota, dinero, centavo, moneda) llama a `Number(`, `parseInt(`, `.toFixed(` o a
//      `Math.round|floor|ceil|trunc(` (el atajo clásico `Math.round(precio * 100)`);
//   4. en una ZONA DE DINERO (`promociones/`, `cotizador/`, `finanzas/`, `pagos/`, `cobranza/`,
//      `catalogo/precios.ts`) aparece CUALQUIERA de esas llamadas, sin importar los nombres.
//
//   npm run check:dinero
//   node scripts/check-dinero.ts --raiz <dir>
//
// `src/lib/dinero.ts` está exento solo de `.toFixed(` (convierte un `Decimal` por su texto exacto). Los
// comentarios no cuentan. Límite conocido: es revisión de TEXTO. No ve un importe con un nombre neutro
// fuera de las zonas (`const x = Number(fila.v)`), ni aritmética de flotantes sin llamar a esas funciones
// (`importe * 0.15`). Lo cubren los tests de `dinero.ts`, los de cada módulo con importes exactos (p. ej.
// 15 % de $1,234.50) y la revisión: todo cálculo de dinero entra por `src/lib/dinero.ts`.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { sinComentarios } from "./check-sensibles.ts";

const RAIZ_REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));

const PALABRAS_DE_DINERO = /(?:monto|precio|costo|importe|saldo|pago|cargo|descuento|mensualidad|tarifa|cuota|dinero|centavo|moneda)/i;
const LLAMADAS_DE_FLOTANTE = /\bNumber\s*\(|\bparseInt\s*\(|\.toFixed\s*\(|\bMath\s*\.\s*(?:round|floor|ceil|trunc)\s*\(/;
const PARSE_FLOAT = /\bparseFloat\s*\(|\bNumber\s*\.\s*parseFloat\b/;
const TO_NUMBER = /\.\s*toNumber\s*\(/;
const ZONAS_DE_DINERO = ["promociones/", "cotizador/", "finanzas/", "pagos/", "cobranza/", "catalogo/precios.ts"];
const EXENTO_DE_TOFIXED = "lib/dinero.ts";

export interface HallazgoDinero {
  archivo: string;
  linea: number;
  regla: string;
  texto: string;
}

const CODIGO = /\.(?:[cm]?[jt]s|tsx)$/;
const PRUEBA = /\.(?:i?test)\.(?:[cm]?[jt]s|tsx)$/;
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

export function escanearDinero(raiz: string): { archivos: number; hallazgos: HallazgoDinero[] } {
  const src = join(raiz, "src");
  const archivos = archivosDe(src);
  const hallazgos: HallazgoDinero[] = [];
  for (const archivo of archivos) {
    const rel = relative(src, archivo).split(sep).join("/");
    const enZona = ZONAS_DE_DINERO.some((z) => rel.startsWith(z) || rel === z);
    sinComentarios(readFileSync(archivo, "utf8"))
      .split("\n")
      .forEach((linea, i) => {
        const anotar = (regla: string): void => {
          hallazgos.push({ archivo: `src/${rel}`, linea: i + 1, regla, texto: linea.trim().slice(0, 120) });
        };
        if (PARSE_FLOAT.test(linea)) return anotar("parseFloat: un importe es texto → deTexto() de src/lib/dinero.ts");
        if (TO_NUMBER.test(linea)) return anotar(".toNumber(): un Decimal se lee con deDecimal() de src/lib/dinero.ts");
        const llama = LLAMADAS_DE_FLOTANTE.exec(linea);
        if (!llama) return;
        if (llama[0].includes("toFixed") && rel === EXENTO_DE_TOFIXED) return;
        if (enZona) return anotar(`${llama[0].replace(/\s*\($/, "")}() en una zona de dinero: usa centavos (src/lib/dinero.ts)`);
        if (PALABRAS_DE_DINERO.test(linea)) anotar(`${llama[0].replace(/\s*\($/, "")}() sobre una línea de dinero: usa centavos (src/lib/dinero.ts)`);
      });
  }
  return { archivos: archivos.length, hallazgos };
}

function main(): void {
  const i = process.argv.indexOf("--raiz");
  const raiz = i >= 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]!) : RAIZ_REPO;
  const { archivos, hallazgos } = escanearDinero(raiz);
  console.log(`check:dinero: ${archivos} archivos de src/ escaneados.`);
  if (hallazgos.length === 0) {
    console.log("✓ Ningún importe pasa por punto flotante (revisión de texto).");
    return;
  }
  console.error(`\n✗ ${hallazgos.length} uso(s) de punto flotante con dinero:\n`);
  for (const h of hallazgos) console.error(`  ${h.archivo}:${h.linea}  ${h.regla}\n      ${h.texto}`);
  console.error("");
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
