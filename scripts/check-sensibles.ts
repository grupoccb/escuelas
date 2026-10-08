// Guarda estática de datos sensibles (decisión 12): los datos de salud de menores no deben aparecer
// en logs, notas internas ni mensajes. Falla el build si:
//
//   1. un nombre de campo sensible (src/sensibles/campos.ts: alergias, medicamentos, contacto de
//      emergencia…; también camelCase) aparece DENTRO de una llamada a `log.info|warn|error(`;
//   2. aparece dentro de una llamada que arma un mensaje, una nota o una tarea para una persona
//      (encolar, enviarMensaje, enviarPlantilla, enviarNotaInterna, respuestaA, confirmacionBajaA,
//      resumenParaAsesor, asegurarTarea*…);
//   3. aparece en cualquier parte del código de las capas que redactan para el contacto o el asesor
//      (captacion, mensajeria, automatizaciones, reportes, http, lib, configuracion, catalogo) o en
//      el resto de src/ fuera de `sensibles/`, `api/rutas/salud.ts` y la API de permisos.
//
//   npm run check:sensibles
//   node scripts/check-sensibles.ts --raiz <dir>
//
// Los comentarios no cuentan. Los tests no se revisan (ahí los centinelas son el punto). Límite
// conocido: es revisión de TEXTO; un valor sensible renombrado a una variable inocua y pasado a un
// log no lo ve. Eso lo cubren la redacción en tiempo de ejecución de `log` (por clave y por
// `Sensible`) y el test de fuga (src/sensibles/fuga.itest.ts).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { RAICES_SENSIBLES, normalizarNombre } from "../src/sensibles/campos.ts";

const RAIZ_REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));

/** Llamadas cuyo contenido llega a un log, a un mensaje o a una persona. */
const LLAMADAS_VIGILADAS = [
  /\blog\.(?:info|warn|error)\s*\(/g,
  /\.encolar\s*\(/g,
  /\benviarMensaje\s*\(/g,
  /\benviarPlantilla\s*\(/g,
  /\benviarNotaInterna\s*\(/g,
  /\brespuestaA\s*\(/g,
  /\bconfirmacionBajaA\s*\(/g,
  /\bresumenParaAsesor\s*\(/g,
  /\bresumenAsesor\s*\(/g,
  /\basegurarTarea(?:Asesor|DeMensaje|EnTransaccion)\s*\(/g,
];

/** Rutas (relativas a src/, con "/") donde SÍ se nombran los campos sensibles. */
const PERMITIDAS = ["sensibles/", "api/rutas/salud.ts"];

export interface HallazgoSensible {
  archivo: string;
  linea: number;
  regla: string;
  campo: string;
}

/** Quita los comentarios de línea y de bloque conservando los saltos de línea (para que los números de línea coincidan). */
export function sinComentarios(codigo: string): string {
  let salida = "";
  let i = 0;
  let cadena: string | null = null;
  while (i < codigo.length) {
    const c = codigo[i]!;
    const d = codigo[i + 1];
    if (cadena) {
      salida += c;
      if (c === "\\") {
        salida += d ?? "";
        i += 2;
        continue;
      }
      if (c === cadena) cadena = null;
      i++;
    } else if (c === "/" && d === "/") {
      while (i < codigo.length && codigo[i] !== "\n") i++;
    } else if (c === "/" && d === "*") {
      i += 2;
      while (i < codigo.length && !(codigo[i] === "*" && codigo[i + 1] === "/")) {
        if (codigo[i] === "\n") salida += "\n";
        i++;
      }
      i += 2;
    } else {
      if (c === '"' || c === "'" || c === "`") cadena = c;
      salida += c;
      i++;
    }
  }
  return salida;
}

/** El campo sensible que contiene el texto (como identificador o dentro de una cadena), o null. */
export function campoSensibleEn(texto: string): string | null {
  for (const t of texto.match(/[A-Za-zÁÉÍÓÚáéíóúÑñ0-9_]+/g) ?? []) {
    const n = normalizarNombre(t);
    const raiz = RAICES_SENSIBLES.find((r) => n.includes(r));
    if (raiz) return t;
  }
  return null;
}

/** Texto de la llamada que empieza en el paréntesis de apertura `desde`, hasta su cierre balanceado. */
function cuerpoDeLlamada(codigo: string, desde: number): { texto: string; fin: number } {
  let profundidad = 0;
  for (let i = desde; i < codigo.length; i++) {
    const c = codigo[i];
    if (c === "(") profundidad++;
    else if (c === ")" && --profundidad === 0) return { texto: codigo.slice(desde, i + 1), fin: i };
  }
  return { texto: codigo.slice(desde), fin: codigo.length };
}

const lineaDe = (codigo: string, indice: number): number => codigo.slice(0, indice).split("\n").length;

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

export function escanearSensibles(raiz: string): { archivos: number; hallazgos: HallazgoSensible[] } {
  const src = join(raiz, "src");
  const archivos = archivosDe(src);
  const hallazgos: HallazgoSensible[] = [];
  for (const archivo of archivos) {
    const rel = relative(src, archivo).split(sep).join("/");
    const codigo = sinComentarios(readFileSync(archivo, "utf8"));
    const vistos = new Set<string>();
    const anotar = (linea: number, regla: string, campo: string): void => {
      const llave = `${linea}|${regla}`;
      if (vistos.has(llave)) return;
      vistos.add(llave);
      hallazgos.push({ archivo: `src/${rel}`, linea, regla, campo });
    };

    // 1 y 2: dentro de las llamadas vigiladas, en cualquier archivo (también en los permitidos).
    for (const patron of LLAMADAS_VIGILADAS) {
      patron.lastIndex = 0;
      for (let m = patron.exec(codigo); m; m = patron.exec(codigo)) {
        const apertura = m.index + m[0].length - 1;
        const { texto } = cuerpoDeLlamada(codigo, apertura);
        const campo = campoSensibleEn(texto);
        if (campo) anotar(lineaDe(codigo, apertura), `dentro de ${m[0].replace(/\s*\($/, "")}()`, campo);
      }
    }

    // 3: mención en cualquier parte, salvo donde se permite.
    if (!PERMITIDAS.some((p) => rel.startsWith(p) || rel === p)) {
      codigo.split("\n").forEach((texto, i) => {
        const campo = campoSensibleEn(texto);
        if (campo) anotar(i + 1, "nombre de campo sensible fuera de src/sensibles/", campo);
      });
    }
  }
  return { archivos: archivos.length, hallazgos };
}

function main(): void {
  const i = process.argv.indexOf("--raiz");
  const raiz = i >= 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]!) : RAIZ_REPO;
  const { archivos, hallazgos } = escanearSensibles(raiz);
  console.log(`check:sensibles: ${archivos} archivos de src/ escaneados.`);
  if (hallazgos.length === 0) {
    console.log("✓ Ningún dato de salud en logs, notas ni mensajes (revisión de texto).");
    return;
  }
  console.error(`\n✗ ${hallazgos.length} violación(es) de datos sensibles:\n`);
  for (const h of hallazgos) console.error(`  ${h.archivo}:${h.linea}  ${h.regla}  → «${h.campo}»`);
  console.error("");
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
