// Guarda de estilo (PLAN-DISENO.md, D2). Falla el build si en la interfaz aparece un color, una fuente o un estilo en línea fuera de las variables de `web/src/estilos/base.css`
// (docs/diseno/SISTEMA-VISUAL.md, regla 5).
//
//   npm run check:estilo
//   node scripts/check-estilo.ts --raiz <dir>
//
// Revisa web/src (.ts, .tsx, .css; sin las pruebas `*.test.*`) y la página pública del servidor (src/http/landing-html.ts, con EXCEPCIONES por línea):
// - En código (.ts/.tsx): ningún `style=`, ningún color (`#abc`, `rgb()`, `hsl()`, nombres), ninguna `font-family`/`fontFamily`. Los textos que mencionan un color como ejemplo
//   para la persona («Escribe un color como #1F5FBF») están en EXCEPCIONES, por archivo y fragmento exacto.
// - En CSS: los colores y las familias de letra solo existen DENTRO de `:root { … }` (las variables) y de `@font-face`. Fuera de ahí, solo `var(--…)`, `transparent`, `currentColor`,
//   `inherit`, `none`.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ_REPO = resolve(fileURLToPath(new URL("..", import.meta.url)));

export interface Hallazgo {
  archivo: string;
  linea: number;
  regla: string;
  texto: string;
}

/** Líneas de código que mencionan un color a propósito (un texto de ayuda). Por archivo (relativo a la raíz) y fragmento exacto de la línea. */
export const EXCEPCIONES: { archivo: string; contiene: string; motivo: string }[] = [
  { archivo: "web/src/pantallas/admin/Verticales.tsx", contiene: "Escribe un color como #1F5FBF", motivo: "mensaje de validación para la persona, no un estilo" },
  // La página pública que arma el servidor (`src/http/landing-html.ts`): sus variables de color y sus fuentes se declaran una vez, en estas líneas; el resto del estilo usa `var(--…)`.
  { archivo: "src/http/landing-html.ts", contiene: "@font-face", motivo: "declaración de las fuentes del sistema, desde el propio origen" },
  { archivo: "src/http/landing-html.ts", contiene: "`:root { color-scheme: light; --marca:", motivo: "las variables de color de la página pública" },
  { archivo: "src/http/landing-html.ts", contiene: "const COLOR_POR_OMISION", motivo: "el primario del sistema, si la escuela no tiene color de marca" },
  { archivo: "src/http/landing-html.ts", contiene: 'return luminancia > 0.4 ? "#111111" : "#ffffff"', motivo: "texto sobre el color de marca (WCAG)" },
  { archivo: "src/http/landing-html.ts", contiene: "ESTILOS(COLOR_POR_OMISION,", motivo: "página de error con la marca por omisión" },
];

const COLOR_HEX = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FUNCION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix)\s*\(/i;
const COLOR_NOMBRE = /(?<![\w-])(?:white|black|red|green|blue|yellow|orange|purple|gray|grey|pink|brown|silver|gold|navy|teal|maroon|aqua|lime|olive|fuchsia)(?![\w-])/i;

/** Quita comentarios (de bloque y de línea) conservando los saltos de línea, para que los números de línea sigan siendo los del archivo. */
function sinComentarios(codigo: string, css: boolean): string {
  const bloque = codigo.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return css ? bloque : bloque.replace(/(^|[^:"'`\\])\/\/.*$/gm, (_m, antes: string) => antes);
}

/** Reemplaza por espacios el contenido (y las llaves) de los bloques `:root { … }` y `@font-face { … }`, conservando saltos de línea. */
function sinVariables(css: string): string {
  let salida = "";
  let i = 0;
  while (i < css.length) {
    const resto = css.slice(i);
    const m = /^(?::root|@font-face)\s*\{/.exec(resto) ?? /^\[data-[^\]]+\]\s*\{/.exec(resto);
    if (m && (i === 0 || /[\s}]/.test(css[i - 1]!))) {
      let profundidad = 1;
      let j = i + m[0].length;
      while (j < css.length && profundidad > 0) {
        if (css[j] === "{") profundidad++;
        else if (css[j] === "}") profundidad--;
        j++;
      }
      salida += css.slice(i, j).replace(/[^\n]/g, " ");
      i = j;
    } else {
      salida += css[i];
      i++;
    }
  }
  return salida;
}

export function revisarCodigo(archivo: string, codigo: string): Hallazgo[] {
  const h: Hallazgo[] = [];
  const lineas = sinComentarios(codigo, false).split("\n");
  lineas.forEach((l, i) => {
    const permitida = EXCEPCIONES.some((e) => e.archivo === archivo && l.includes(e.contiene));
    if (permitida) return;
    const hallazgo = (regla: string): void => void h.push({ archivo, linea: i + 1, regla, texto: l.trim().slice(0, 140) });
    if (/\bstyle\s*=\s*\{/.test(l)) hallazgo("estilo-en-linea");
    if (/href\s*=\s*["']#/.test(l) ? false : COLOR_HEX.test(l)) hallazgo("color-fuera-de-variables");
    if (COLOR_FUNCION.test(l)) hallazgo("color-fuera-de-variables");
    if (/\bfontFamily\b|font-family\s*:(?!\s*var\()/.test(l)) hallazgo("fuente-fuera-de-variables");
  });
  return h;
}

export function revisarCss(archivo: string, css: string): Hallazgo[] {
  const h: Hallazgo[] = [];
  const lineas = sinVariables(sinComentarios(css, true)).split("\n");
  lineas.forEach((l, i) => {
    const hallazgo = (regla: string): void => void h.push({ archivo, linea: i + 1, regla, texto: l.trim().slice(0, 140) });
    if (COLOR_HEX.test(l) || COLOR_FUNCION.test(l)) hallazgo("color-fuera-de-variables");
    else if (/(?:^|[;{\s])(?:color|background(?:-color)?|border(?:-[a-z]+)*|outline(?:-color)?|fill|stroke|box-shadow|text-decoration-color|caret-color|accent-color)\s*:/.test(l) && COLOR_NOMBRE.test(l.replace(/var\([^)]*\)/g, ""))) hallazgo("color-fuera-de-variables");
    const familia = /font-family\s*:\s*([^;}]*)/.exec(l);
    if (familia && !/^\s*(?:var\(|inherit)/.test(familia[1]!)) hallazgo("fuente-fuera-de-variables");
    const corta = /(?:^|[;{\s])font\s*:\s*([^;}]*)/.exec(l);
    if (corta && !/^\s*(?:inherit|var\()/.test(corta[1]!)) hallazgo("fuente-fuera-de-variables");
  });
  return h;
}

function archivosDe(dir: string, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const p = join(dir, nombre);
    if (statSync(p).isDirectory()) archivosDe(p, salida);
    else if (/\.(ts|tsx|css)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) salida.push(p);
  }
  return salida;
}

export function revisarRaiz(raiz: string): Hallazgo[] {
  const h: Hallazgo[] = [];
  const landing = join(raiz, "src/http/landing-html.ts");
  const archivos = archivosDe(join(raiz, "web/src"));
  if (existsSync(landing)) archivos.push(landing);
  for (const p of archivos) {
    const rel = relative(raiz, p).split(sep).join("/");
    const codigo = readFileSync(p, "utf8");
    h.push(...(p.endsWith(".css") ? revisarCss(rel, codigo) : revisarCodigo(rel, codigo)));
  }
  return h;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--raiz");
  const raiz = i >= 0 ? resolve(process.argv[i + 1]!) : RAIZ_REPO;
  const h = revisarRaiz(raiz);
  for (const x of h) console.error(`✘ ${x.archivo}:${x.linea} [${x.regla}] ${x.texto}`);
  if (h.length > 0) {
    console.error(`\ncheck:estilo: ${h.length} hallazgo(s). Los colores, las fuentes y los estilos van en las variables de web/src/estilos/base.css.`);
    process.exit(1);
  }
  console.log("check:estilo: sin colores, fuentes ni estilos en línea fuera de las variables.");
}
