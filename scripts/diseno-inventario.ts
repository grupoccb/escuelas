// Inventario del rediseño (PLAN-DISENO.md, D1). Las «escenas» de web/e2e-diseno/escenas-*.ts son la lista de todo lo que una persona puede llegar a ver.
//
//   npm run diseno:inventario                    coteja la lista contra el código y falla si algo existe y no está en ella
//   npm run diseno:inventario -- --escribir      regenera docs/diseno/INVENTARIO.md desde las escenas (con el estado de cada captura)
//   npm run diseno:inventario -- --capturas      además exige la captura de «antes» y la de «despues» de cada fila, en las dos vistas
//
// El cotejo:
//   1. cada <Route path> de web/src/app.tsx está en la `ruta` de alguna escena;
//   2. cada archivo de web/src que usa <Dialogo>, `avisar(` (aviso de «ya quedó») o la barra de guardado está en las `fuentes` de alguna escena;
//   3. cada clase que base.css define aparece en el DOM de alguna escena (docs/diseno/clases-observadas.json, que deja `npm run diseno:capturas`), salvo las de
//      docs/diseno/clases-excluidas.json (cada una con su motivo).

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface FilaDeInventario {
  id: string;
  rol: string;
  grupo: string;
  titulo: string;
  tipo: string;
  ruta?: string;
  fuentes?: string[];
  vistas?: string[];
}

export const VISTAS = ["escritorio", "celular"] as const;
const RAIZ = resolve(fileURLToPath(new URL("..", import.meta.url)));

/** Las rutas de `<Route path="…">` de un archivo de enrutador. */
export function rutasDeApp(codigo: string): string[] {
  return [...codigo.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]!);
}

/** Las rutas que cubre una fila (`ruta` puede traer varias separadas por espacios, comas o punto y coma). */
export function rutasDeFila(f: Pick<FilaDeInventario, "ruta">): string[] {
  return (f.ruta ?? "").split(/[\s,;]+/).filter(Boolean);
}

/** Las clases de CSS que un archivo define con un selector de clase (`.nombre`), sin las de las animaciones ni las de números (`.5`). */
export function clasesDeCss(css: string): string[] {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectores = [...sinComentarios.matchAll(/([^{}]+)\{/g)].map((m) => m[1]!);
  const salida = new Set<string>();
  for (const s of selectores) {
    if (/^\s*@/.test(s)) continue;
    for (const m of s.matchAll(/\.([a-zA-Z_][\w-]*)/g)) salida.add(m[1]!);
  }
  return [...salida].sort();
}

/** Archivos de `directorio` (recursivo) cuyo código cumple `prueba`, relativos a la raíz del repositorio. */
export function archivosConUso(directorio: string, prueba: RegExp, raiz = RAIZ): string[] {
  const salida: string[] = [];
  const recorrer = (d: string): void => {
    for (const nombre of readdirSync(d)) {
      const p = join(d, nombre);
      if (statSync(p).isDirectory()) {
        if (nombre === "node_modules" || nombre === "dist") continue;
        recorrer(p);
      } else if (/\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) && prueba.test(readFileSync(p, "utf8"))) salida.push(relative(raiz, p));
    }
  };
  recorrer(directorio);
  return salida.sort();
}

export async function cargarEscenas(raiz = RAIZ): Promise<FilaDeInventario[]> {
  const carpeta = join(raiz, "web/e2e-diseno");
  const filas: FilaDeInventario[] = [];
  for (const archivo of readdirSync(carpeta).filter((n) => /^escenas-.+\.ts$/.test(n)).sort()) {
    const modulo = (await import(join(carpeta, archivo))) as { ESCENAS: FilaDeInventario[] };
    filas.push(...modulo.ESCENAS);
  }
  return filas;
}

export interface Hallazgo {
  regla: string;
  detalle: string;
}

/** El cotejo puro (sin leer disco), para poder probarlo. */
export function cotejar(entrada: {
  filas: FilaDeInventario[];
  rutasDelEnrutador: string[];
  archivosConFlotantes: string[];
  clasesDeBaseCss: string[];
  clasesObservadas: string[];
  clasesExcluidas: string[];
}): Hallazgo[] {
  const h: Hallazgo[] = [];
  const ids = new Map<string, number>();
  for (const f of entrada.filas) ids.set(f.id, (ids.get(f.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) h.push({ regla: "id-repetido", detalle: `${id} aparece ${n} veces` });
  for (const f of entrada.filas) if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.id)) h.push({ regla: "id-invalido", detalle: f.id });

  const rutasCubiertas = new Set(entrada.filas.flatMap(rutasDeFila));
  for (const r of entrada.rutasDelEnrutador) if (!rutasCubiertas.has(r)) h.push({ regla: "ruta-sin-fila", detalle: `la ruta ${r} de app.tsx no está en ninguna fila` });

  const fuentesCubiertas = new Set(entrada.filas.flatMap((f) => f.fuentes ?? []));
  for (const a of entrada.archivosConFlotantes) if (!fuentesCubiertas.has(a)) h.push({ regla: "flotante-sin-fila", detalle: `${a} usa un diálogo, un aviso o la barra de guardado y no está en las fuentes de ninguna fila` });

  const vistas = new Set(entrada.clasesObservadas);
  const excluidas = new Set(entrada.clasesExcluidas);
  for (const c of entrada.clasesDeBaseCss) if (!vistas.has(c) && !excluidas.has(c)) h.push({ regla: "clase-sin-fila", detalle: `la clase .${c} de base.css no apareció en ninguna escena` });
  return h;
}

const ENCABEZADO = [
  "# INVENTARIO.md — Todo lo que una persona puede llegar a ver",
  "",
  "Se genera de las escenas de `web/e2e-diseno/escenas-*.ts` con `npm run diseno:inventario -- --escribir`. No se edita a mano. `npm run diseno:inventario` lo coteja contra las rutas de `app.tsx`,",
  "contra cada uso de diálogo, aviso y barra de guardado, y contra las clases de `base.css`. Las capturas están en `docs/diseno/capturas/antes/` y `docs/diseno/capturas/despues/`",
  "(`<id>-escritorio.jpg`, 1366 px, y `<id>-celular.jpg`, 390 px). ✔ = existe la captura; · = no aplica a esa vista; ✘ = falta.",
  "",
].join("\n");

export function marca(raiz: string, fase: string, id: string, vista: string, vistasDeLaFila: readonly string[] | undefined): string {
  if (vistasDeLaFila && !vistasDeLaFila.includes(vista)) return "·";
  return existsSync(join(raiz, "docs/diseno/capturas", fase, `${id}-${vista}.jpg`)) ? "✔" : "✘";
}

export function tablaDeInventario(filas: FilaDeInventario[], raiz = RAIZ): string {
  const grupos = [...new Set(filas.map((f) => f.grupo))];
  const partes: string[] = [ENCABEZADO, `Filas: **${filas.length}**.`, ""];
  for (const g of grupos) {
    const delGrupo = filas.filter((f) => f.grupo === g);
    partes.push(`## ${g} (${delGrupo.length})`, "", "| id | rol | tipo | qué se ve | ruta | antes (esc · cel) | después (esc · cel) |", "|---|---|---|---|---|---|---|");
    for (const f of delGrupo) {
      const m = (fase: string): string => VISTAS.map((v) => marca(raiz, fase, f.id, v, f.vistas)).join(" · ");
      partes.push(`| \`${f.id}\` | ${f.rol} | ${f.tipo} | ${f.titulo.replaceAll("|", "\\|")} | ${f.ruta ? `\`${f.ruta}\`` : ""} | ${m("antes")} | ${m("despues")} |`);
    }
    partes.push("");
  }
  return `${partes.join("\n")}\n`;
}

/** Las filas a las que les falta una captura (de «antes» o de «despues»). */
export function capturasFaltantes(filas: FilaDeInventario[], raiz = RAIZ): string[] {
  const falta: string[] = [];
  for (const f of filas) for (const fase of ["antes", "despues"]) for (const v of VISTAS) if (marca(raiz, fase, f.id, v, f.vistas) === "✘") falta.push(`${fase}/${f.id}-${v}.jpg`);
  return falta;
}

function leerJson<T>(ruta: string, porOmision: T): T {
  try {
    return JSON.parse(readFileSync(ruta, "utf8")) as T;
  } catch {
    return porOmision;
  }
}

async function principal(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const filas = await cargarEscenas();
  if (args.has("--escribir")) {
    writeFileSync(join(RAIZ, "docs/diseno/INVENTARIO.md"), tablaDeInventario(filas));
    console.log(`docs/diseno/INVENTARIO.md: ${filas.length} filas`);
  }
  const hallazgos = cotejar({
    filas,
    rutasDelEnrutador: rutasDeApp(readFileSync(join(RAIZ, "web/src/app.tsx"), "utf8")).filter((r) => r !== "*").concat("*"),
    archivosConFlotantes: archivosConUso(join(RAIZ, "web/src"), /<Dialogo[\s>]|\bavisar\(|barra-guardado/),
    clasesDeBaseCss: clasesDeCss(readFileSync(join(RAIZ, "web/src/estilos/base.css"), "utf8")),
    clasesObservadas: leerJson<string[]>(join(RAIZ, "docs/diseno/clases-observadas.json"), []),
    clasesExcluidas: Object.keys(leerJson<Record<string, string>>(join(RAIZ, "docs/diseno/clases-excluidas.json"), {})),
  });
  const faltan = args.has("--capturas") ? capturasFaltantes(filas) : [];
  for (const x of hallazgos) console.error(`✘ [${x.regla}] ${x.detalle}`);
  for (const x of faltan) console.error(`✘ [captura-faltante] ${x}`);
  if (hallazgos.length + faltan.length > 0) {
    console.error(`\n${hallazgos.length + faltan.length} hallazgo(s).`);
    process.exit(1);
  }
  console.log(`Inventario completo: ${filas.length} filas, rutas, flotantes y clases cotejadas${args.has("--capturas") ? ", todas las capturas presentes" : ""}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await principal();
