// Guarda de dinero (C2, endurecida en la auditoría de C: EC-06): el dinero va en centavos enteros
// (`src/lib/dinero.ts`), nunca en punto flotante. Falla el build si en el código de producción (src/, sin tests,
// `generated` ni `testutil`):
//
//   1. aparece `parseFloat(` o `Number.parseFloat(` (nadie la necesita: un importe es texto → `deTexto`), aunque
//      el paréntesis esté en otra línea;
//   2. aparece `.toNumber()` (la forma de bajar un Decimal de Prisma a flotante; se usa `deDecimal`), también partido en
//      varias líneas o por corchetes (`x["toNumber"]()`);
//   3. una línea con una palabra de dinero (monto, precio, costo, importe, saldo, pago, cargo, descuento,
//      mensualidad, tarifa, cuota, dinero, centavo, moneda) llama a `Number(`, `parseInt(`, `.toFixed(` o a
//      `Math.round|floor|ceil|trunc|fround(` (el atajo clásico `Math.round(precio * 100)`), o pasa esas funciones sin llamarlas
//      (`const f = parseFloat`, `.map(Number)`);
//   4. en una ZONA DE DINERO (`promociones/`, `cotizador/`, `finanzas/`, `pagos/`, `cobranza/`, `reportes/`, `demo/`, `exportacion/`, `api/rutas/finanzas-*`, `api/rutas/reportes-*`, `inscripciones/`, `conversion/`, `eventos/`, `expediente/`, `api/rutas/eventos.ts`, `api/rutas/expediente.ts`,
//      `catalogo/precios.ts`) aparece CUALQUIERA de esas llamadas, sin importar los nombres, y además: acceso por corchetes
//      a `Math` o a esas funciones, `globalThis`, `~~x`, el `+x` unario, y una multiplicación o división por un literal
//      decimal (`* 0.15`) o por 1 (`* 1`): aritmética de flotantes sin llamar a nada.
//
//   npm run check:dinero
//   node scripts/check-dinero.ts --raiz <dir>
//
// `src/lib/dinero.ts` está exento solo de `.toFixed(` (convierte un `Decimal` por su texto exacto). Los
// comentarios no cuentan. Límite conocido: es revisión de TEXTO. Fuera de las zonas no ve un importe con un nombre
// neutro (`const x = Number(fila.v)`) ni aritmética de flotantes sin llamadas (`importe * 0.15`). Lo cubren los tests de
// `dinero.ts`, los de cada módulo con importes exactos (p. ej. 15 % de $1,234.50) y la revisión: todo cálculo de dinero
// entra por `src/lib/dinero.ts`.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { sinComentarios } from "./check-sensibles.ts";

const RAIZ_REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));

const PALABRAS_DE_DINERO = /(?:monto|precio|costo|importe|saldo|pago|cargo|descuento|mensualidad|tarifa|cuota|dinero|centavo|moneda)/i;
const LLAMADAS_DE_FLOTANTE = /\bNumber\s*\(|\bparseInt\s*\(|\.toFixed\s*\(|\bMath\s*\.\s*(?:round|floor|ceil|trunc|fround)\s*\(/;
const ZONAS_DE_DINERO = ["promociones/", "cotizador/", "finanzas/", "pagos/", "cobranza/", "inscripciones/", "conversion/", "eventos/", "expediente/", "catalogo/precios.ts", "api/rutas/eventos.ts", "api/rutas/expediente.ts", "api/rutas/finanzas-", "api/rutas/reportes-", "reportes/", "demo/", "exportacion/"];
const EXENTO_DE_TOFIXED = "lib/dinero.ts";

/** Funciones que bajan un importe a flotante, por su nombre (para el acceso por corchetes). */
const NOMBRES_DE_FLOTANTE = "toNumber|toFixed|parseFloat|parseInt|Number|round|floor|ceil|trunc|fround";

/**
 * Reglas que se aplican al TEXTO entero (sin comentarios), no línea por línea: así no las esquiva un salto de línea. La línea
 * que se reporta es donde empieza la coincidencia. `donde`: "siempre", "zona" (solo en una zona de dinero) o "dinero"
 * (en una zona o en una línea con palabra de dinero).
 */
const REGLAS_DE_TEXTO: { re: RegExp; regla: string; donde: "siempre" | "zona" | "dinero" }[] = [
  { re: /\bparseFloat\s*\(|\bNumber\s*\.\s*parseFloat\b/g, regla: "parseFloat: un importe es texto → deTexto() de src/lib/dinero.ts", donde: "siempre" },
  { re: /\.\s*toNumber\s*\(/g, regla: ".toNumber(): un Decimal se lee con deDecimal() de src/lib/dinero.ts", donde: "siempre" },
  { re: new RegExp(`\\[\\s*["'\`](?:${NOMBRES_DE_FLOTANTE})["'\`]\\s*\\]`, "g"), regla: "acceso por corchetes a una función de flotantes (x[\"toNumber\"]): usa src/lib/dinero.ts", donde: "siempre" },
  { re: /\bMath\s*\[/g, regla: "Math[…]: acceso por corchetes que esquiva la revisión; usa centavos (src/lib/dinero.ts)", donde: "zona" },
  { re: /\bglobalThis\b/g, regla: "globalThis en una zona de dinero (esquiva Number/Math); usa centavos (src/lib/dinero.ts)", donde: "zona" },
  { re: /(?:[=(,:?]|\|\||\?\?|\breturn)\s*(?:Number\s*\.\s*parseFloat|parseFloat|parseInt|Number)\s*(?=[;,)\]}\n])/g, regla: "función de flotantes pasada o guardada sin llamarla (const f = parseFloat; .map(Number)): usa centavos (src/lib/dinero.ts)", donde: "dinero" },
  { re: /~~/g, regla: "~~ trunca a entero de 32 bits y baja el importe a flotante: usa centavos (src/lib/dinero.ts)", donde: "zona" },
  { re: /(?:[=(,:?*/%<>!&|-]|\breturn|\bcase)\s*\+\s*(?=[A-Za-z_$(])/g, regla: "+x unario: convierte a número flotante; usa deTexto() de src/lib/dinero.ts", donde: "zona" },
  { re: /[*/]\s*\d+\.\d+|\d+\.\d+\s*[*/]/g, regla: "multiplicación o división por un decimal literal (* 0.15): usa porcentaje() de src/lib/dinero.ts", donde: "zona" },
  { re: /[*/]\s*1(?![\d._n])/g, regla: "multiplicar o dividir por 1 convierte a número: usa deTexto() de src/lib/dinero.ts", donde: "zona" },
];

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
    const texto = sinComentarios(readFileSync(archivo, "utf8"));
    const lineas = texto.split("\n");
    const vistos = new Set<string>();
    const anotar = (linea: number, regla: string): void => {
      const llave = `${linea}|${regla}`;
      if (vistos.has(llave)) return;
      vistos.add(llave);
      hallazgos.push({ archivo: `src/${rel}`, linea, regla, texto: (lineas[linea - 1] ?? "").trim().slice(0, 120) });
    };

    // 1. Reglas sobre el texto entero (no las esquiva un salto de línea).
    for (const r of REGLAS_DE_TEXTO) {
      for (const m of texto.matchAll(r.re)) {
        const linea = texto.slice(0, m.index).split("\n").length;
        if (r.donde === "zona" && !enZona) continue;
        if (r.donde === "dinero" && !enZona && !PALABRAS_DE_DINERO.test(lineas[linea - 1] ?? "")) continue;
        anotar(linea, r.regla);
      }
    }

    // 2. Llamadas a Number(, parseInt(, .toFixed( y Math.round…( : línea por línea.
    lineas.forEach((linea, i) => {
      const llama = LLAMADAS_DE_FLOTANTE.exec(linea);
      if (!llama) return;
      if (llama[0].includes("toFixed") && rel === EXENTO_DE_TOFIXED) return;
      if (enZona) return anotar(i + 1, `${llama[0].replace(/\s*\($/, "")}() en una zona de dinero: usa centavos (src/lib/dinero.ts)`);
      if (PALABRAS_DE_DINERO.test(linea)) anotar(i + 1, `${llama[0].replace(/\s*\($/, "")}() sobre una línea de dinero: usa centavos (src/lib/dinero.ts)`);
    });
  }
  hallazgos.sort((a, b) => (a.archivo < b.archivo ? -1 : a.archivo > b.archivo ? 1 : a.linea - b.linea));
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
