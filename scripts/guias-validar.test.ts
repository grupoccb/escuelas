// V8: las guías de una página por rol (`docs/guias/*.md`) no se desactualizan sin que el build avise. Esta prueba lee cada guía y comprueba, sin navegador:
//
// - Todo lo que va entre «comillas angulares» (un botón, una pantalla, un campo) existe tal cual en la interfaz o en los textos que el servidor manda a la pantalla.
// - Todo mensaje entre “comillas curvas” existe en el código (los puntos suspensivos tapan lo que cambia: un nombre, un número; cada tramo entre ellos se busca por separado).
// - Las **negritas** son nombres de Chatwoot, y solo valen si `chatwoot-textos.json` los trae (lo llena la corrida de capturas contra un Chatwoot arriba, que los ve en pantalla).
// - Las imágenes y los enlaces existen y no sobra ninguna imagen.
// - El texto de la guía (lo que no es un nombre de la pantalla) no trae términos técnicos, inglés ni identificadores, y cabe en una página.
//
//   npm run guias:validar

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { BLOQUEO_POR_DEFECTO } from "../src/auth/acceso.ts";
import { DIAS_ADELANTE_DEL_MAESTRO } from "../src/api/rutas/maestro.ts";
import { CONFIGURACION_POR_DEFECTO } from "../src/configuracion/index.ts";
import { DURACION_VENTANA_SERVICIO_MS } from "../src/mensajeria/reglas.ts";

const RAIZ = resolve(fileURLToPath(new URL("..", import.meta.url)));
const CARPETA = join(RAIZ, "docs", "guias");

/** Cuántas palabras caben en las páginas que se le permiten a cada guía (la medida real de páginas la hace `npm run guias:capturas` al imprimirlas). */
const PALABRAS_MAXIMAS: Record<string, number> = { asesor: 720, maestro: 640, recepcion: 640, administrador: 760 };
const PALABRAS_MINIMAS = 250;
const GUIAS = Object.keys(PALABRAS_MAXIMAS);

/** Palabras que una persona de la escuela no debería leer en la guía (fuera de lo que cita de la pantalla). */
const JERGA = /(?<![\p{L}])(api|sql|webhook|token|backend|frontend|url|click|clic|login|logout|dashboard|inbox|payload|json|uuid|lead|leads|bot|template|password|email|plantillas?_|endpoint|localhost|docker|cookie|servidor)(?![\p{L}])/iu;

const normalizar = (t: string): string => t.replaceAll("&nbsp;", " ").replaceAll("&quot;", '"').replaceAll('\\"', '"').replace(/\s+/g, " ");

/** Todo texto que la persona puede ver: la interfaz (`web/src`) y lo que el servidor le manda a la pantalla (`src`), sin pruebas ni código generado. */
function textosDeLaAplicacion(): string {
  const partes: string[] = [];
  const recorrer = (dir: string): void => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      const rel = relative(RAIZ, ruta).split("\\").join("/");
      if (nombre === "node_modules" || nombre === "generated" || nombre === "testutil" || rel === "web/dist") continue;
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.(ts|tsx)$/.test(nombre) && !/\.(test|itest)\.tsx?$/.test(nombre)) partes.push(normalizar(readFileSync(ruta, "utf8")));
    }
  };
  recorrer(join(RAIZ, "web", "src"));
  recorrer(join(RAIZ, "src"));
  return partes.join("\n");
}

const CORPUS = textosDeLaAplicacion();
const leerGuia = (nombre: string): string => readFileSync(join(CARPETA, `${nombre}.md`), "utf8");

export interface Citas {
  /** Lo que va entre «comillas angulares». */
  nombres: string[];
  /** Los mensajes entre “comillas curvas”. */
  mensajes: string[];
  /** Lo que va en **negritas** (nombres de Chatwoot). */
  chatwoot: string[];
  /** Lo que queda sin citas, enlaces, imágenes ni tablas de relleno: el texto propio de la guía. */
  prosa: string;
}

/** Separa lo que la guía cita de la pantalla del texto propio. Un mensaje puede traer «nombres» adentro: cuenta como mensaje, no como nombre aparte. */
export function extraerCitas(md: string): Citas {
  let resto = md.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  const mensajes: string[] = [];
  resto = resto.replace(/“([^”]+)”/g, (_, m: string) => {
    mensajes.push(m);
    return " ";
  });
  const chatwoot: string[] = [];
  resto = resto.replace(/\*\*([^*]+)\*\*/g, (_, m: string) => {
    chatwoot.push(m);
    return " ";
  });
  const nombres: string[] = [];
  resto = resto.replace(/«([^»]+)»/g, (_, m: string) => {
    nombres.push(m);
    return " ";
  });
  const prosa = resto.replace(/^\|?[-| :]+\|?$/gm, " ").replace(/[|*#>_]/g, " ");
  return { nombres, mensajes, chatwoot, prosa };
}

const palabras = (t: string): number => t.split(/\s+/).filter((p) => /[\p{L}\p{N}]/u.test(p)).length;

test("las cuatro guías y el índice existen", () => {
  for (const g of [...GUIAS, "README"]) assert.ok(existsSync(join(CARPETA, `${g}.md`)), `Falta docs/guias/${g}.md`);
});

for (const guia of GUIAS) {
  test(`${guia}: cada botón, pantalla y campo citado existe en la interfaz`, () => {
    const { nombres } = extraerCitas(leerGuia(guia));
    assert.ok(nombres.length >= 8, `La guía cita solo ${nombres.length} nombres de la pantalla: ¿se perdieron las comillas «»?`);
    const faltan = [...new Set(nombres)].filter((n) => !CORPUS.includes(normalizar(n)));
    assert.deepEqual(faltan, [], `La guía «${guia}» cita nombres que ya no existen en la interfaz (cámbialos en la guía o en la pantalla): ${faltan.map((f) => `«${f}»`).join(", ")}`);
  });

  test(`${guia}: cada mensaje citado existe en el código`, () => {
    const { mensajes } = extraerCitas(leerGuia(guia));
    const faltan: string[] = [];
    for (const m of mensajes) {
      // Los tramos entre puntos suspensivos; uno muy corto (un «Espera») no prueba nada y se salta.
      for (const tramo of m.split(/…|\.\.\./).map((t) => normalizar(t).trim())) if (tramo.length >= 8 && !CORPUS.includes(tramo)) faltan.push(tramo);
    }
    assert.deepEqual(faltan, [], `La guía «${guia}» cita mensajes que ya no existen tal cual en la aplicación: ${faltan.join(" | ")}`);
  });

  test(`${guia}: el texto propio no trae términos técnicos, inglés ni identificadores y cabe en la hoja`, () => {
    const { prosa } = extraerCitas(leerGuia(guia));
    assert.deepEqual(prosa.match(new RegExp(JERGA.source, "giu")) ?? [], [], `La guía «${guia}» usa términos técnicos o en inglés en su texto`);
    assert.deepEqual(prosa.match(/\b[a-z]+_[a-z_]+\b|[0-9a-f]{8}-[0-9a-f]{4}-/g) ?? [], [], `La guía «${guia}» deja a la vista un identificador`);
    const cuantas = palabras(leerGuia(guia).replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/^\|?[-| :]+\|?$/gm, " "));
    assert.ok(cuantas >= PALABRAS_MINIMAS, `«${guia}» tiene ${cuantas} palabras: es muy corta para servir de guía`);
    assert.ok(cuantas <= PALABRAS_MAXIMAS[guia]!, `«${guia}» tiene ${cuantas} palabras y no cabe en su hoja (máximo ${PALABRAS_MAXIMAS[guia]}): recórtala`);
  });

  test(`${guia}: las imágenes y los enlaces existen`, () => {
    const md = leerGuia(guia);
    for (const [, destino] of md.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) assert.ok(existsSync(join(CARPETA, destino!)), `La guía «${guia}» pone una imagen que no existe: ${destino}`);
    for (const [, destino] of md.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^https?:/.test(destino!)) continue;
      const archivo = destino!.split("#")[0]!;
      assert.ok(existsSync(resolve(CARPETA, archivo)), `La guía «${guia}» enlaza a un archivo que no existe: ${destino}`);
    }
  });
}

test("las negritas de la guía del asesor son nombres de Chatwoot que se vieron en pantalla", () => {
  const archivo = join(CARPETA, "chatwoot-textos.json");
  assert.ok(existsSync(archivo), "Falta docs/guias/chatwoot-textos.json: corre `npm run guias:capturas` con el Chatwoot local arriba");
  const vistos = new Set((JSON.parse(readFileSync(archivo, "utf8")) as { textos: string[] }).textos);
  for (const guia of GUIAS) {
    const { chatwoot } = extraerCitas(leerGuia(guia));
    if (guia !== "asesor") assert.deepEqual(chatwoot, [], `Solo la guía del asesor lleva negritas (son nombres de Chatwoot): «${guia}» trae ${chatwoot.join(", ")}`);
    const faltan = [...new Set(chatwoot)].filter((n) => !vistos.has(n));
    assert.deepEqual(faltan, [], `La guía «${guia}» nombra cosas de Chatwoot que nadie ha visto en pantalla (¿cambió Chatwoot?): corre \`npm run guias:capturas\` con el Chatwoot local arriba. ${faltan.join(", ")}`);
  }
});

test("no sobra ninguna imagen: todas las de img/ están en alguna guía", () => {
  const usadas = new Set<string>();
  for (const guia of GUIAS) for (const [, destino] of leerGuia(guia).matchAll(/!\[[^\]]*\]\(img\/([^)]+)\)/g)) usadas.add(destino!);
  const enCarpeta = readdirSync(join(CARPETA, "img")).filter((f) => f.endsWith(".png"));
  assert.deepEqual(enCarpeta.filter((f) => !usadas.has(f)), [], "Hay imágenes en docs/guias/img/ que ninguna guía usa");
});

test("el índice de las guías enlaza a las cuatro y está enlazado desde Operación", () => {
  const indice = readFileSync(join(CARPETA, "README.md"), "utf8");
  for (const g of GUIAS) assert.ok(indice.includes(`(${g}.md)`), `El índice no enlaza a ${g}.md`);
  assert.ok(readFileSync(join(RAIZ, "docs", "OPERACION.md"), "utf8").includes("guias/README.md"), "docs/OPERACION.md no enlaza a docs/guias/README.md");
});

test("la extracción de citas separa nombres, mensajes y negritas", () => {
  const c = extraerCitas("Toca «Guardar» y mira **Resolver**. Dice “Hola «mundo» aquí…” fin ![x](img/a.png) [guía](../X.md)");
  assert.deepEqual(c.nombres, ["Guardar"]);
  assert.deepEqual(c.chatwoot, ["Resolver"]);
  assert.deepEqual(c.mensajes, ["Hola «mundo» aquí…"]);
  assert.ok(!c.prosa.includes("img/a.png"));
});

void dirname;

// V13-fix EV-08: la guía del maestro decía «hasta 24 horas» para corregir la asistencia y el valor real es 48 (y se puede cambiar). Cada cifra con unidad que una guía da debe compararse con
// el valor del sistema de donde sale: si el valor cambia y la guía no, esta prueba falla. Una cifra nueva en una guía sin su fila aquí también falla.
const UNIDADES = "horas|hora|minutos|minuto|días|día|veces|intentos";
const CIFRAS: { guia: string; patron: RegExp; valor: number; origen: string }[] = [
  { guia: "maestro", patron: /hasta (\d+) horas después/, valor: CONFIGURACION_POR_DEFECTO.claseMuestraCorreccionHoras, origen: "CONFIGURACION_POR_DEFECTO.claseMuestraCorreccionHoras" },
  { guia: "maestro", patron: /próximos (\d+) días/, valor: DIAS_ADELANTE_DEL_MAESTRO, origen: "DIAS_ADELANTE_DEL_MAESTRO" },
  { guia: "asesor", patron: /últimas (\d+) horas/, valor: DURACION_VENTANA_SERVICIO_MS / 3_600_000, origen: "DURACION_VENTANA_SERVICIO_MS" },
  { guia: "administrador", patron: /contraseña (\d+) veces/, valor: BLOQUEO_POR_DEFECTO.maxFallos, origen: "BLOQUEO_POR_DEFECTO.maxFallos" },
  { guia: "administrador", patron: /unos (\d+) minutos/, valor: BLOQUEO_POR_DEFECTO.ventanaMs / 60_000, origen: "BLOQUEO_POR_DEFECTO.ventanaMs" },
];

test("EV-08: cada cifra con unidad de las guías (horas, días, minutos, veces) coincide con el valor real del sistema", () => {
  for (const c of CIFRAS) {
    const texto = leerGuia(c.guia);
    const m = texto.match(c.patron);
    assert.ok(m, `La guía «${c.guia}» ya no dice ${c.patron}: actualiza la fila en scripts/guias-validar.test.ts`);
    assert.equal(Number(m[1]), c.valor, `La guía «${c.guia}» dice ${m[0]} pero el sistema usa ${c.valor} (${c.origen}): corrige la guía`);
  }
});

test("EV-08: no hay cifras con unidad en las guías que no estén comparadas con su valor real", () => {
  const sinFila: string[] = [];
  for (const guia of GUIAS) {
    const texto = extraerCitas(leerGuia(guia)).prosa;
    for (const m of leerGuia(guia).matchAll(new RegExp(`(\\d+) (?:${UNIDADES})(?![\\p{L}])`, "gu"))) {
      const cubierta = CIFRAS.some((c) => c.guia === guia && leerGuia(guia).match(c.patron)?.[0]?.includes(m[0]));
      if (!cubierta && texto.includes(m[0])) sinFila.push(`${guia}: «${m[0]}»`);
    }
  }
  assert.deepEqual(sinFila, [], "agrega la cifra a CIFRAS (scripts/guias-validar.test.ts) con el valor del sistema del que sale");
});

// V13-fix EV-03: la guía del administrador y el diálogo de apagar prometían «nada se borra y todo vuelve al encenderlo». Es falso para lo que el sistema hace solo: mientras el módulo estuvo
// apagado no se generaron los cobros de esos meses ni se mandaron sus recordatorios, y al encenderlo no se ponen al corriente. Se conserva lo guardado, y así debe decirse.
test("EV-03: ni la guía del administrador ni la pantalla de Módulos prometen que «todo vuelve» al encender: dicen que lo guardado se conserva y que lo de ese tiempo no se recupera", () => {
  const textos: Record<string, string> = {
    "docs/guias/administrador.md": readFileSync(join(CARPETA, "administrador.md"), "utf8"),
    "web/src/pantallas/admin/Modulos.tsx": readFileSync(join(RAIZ, "web", "src", "pantallas", "admin", "Modulos.tsx"), "utf8"),
  };
  for (const [archivo, t] of Object.entries(textos)) {
    assert.ok(!/todo vuelve|vuelven al encenderlo|vuelven en cuanto lo enciendas|vuelven en cuanto/i.test(t), `${archivo}: promete que todo vuelve al encenderlo`);
    assert.ok(/no se recupera/.test(t), `${archivo}: debe decir que lo de ese tiempo no se recupera`);
    assert.ok(/se conserva/.test(t), `${archivo}: debe decir que lo guardado se conserva`);
  }
});
