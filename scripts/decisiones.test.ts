// V11: la lista única de decisiones para Eduardo (`docs/DECISIONES-PARA-EDUARDO.md`) no se queda atrás ni se rompe sin que el build avise. Esta prueba lee el archivo y comprueba:
//
// - Existe y trae los tres grupos (A. bloquea salir con captación, B. bloquea un módulo posterior, C. puede esperar) y la tabla «Ya decidido».
// - Cada decisión (D-01, D-02…) lleva los siete campos (pregunta, contexto, opciones, recomendación, qué pasa si no se decide, dónde se cambia, ids de origen) y su casilla para responder, está numerada sin saltos y vive en un solo grupo.
// - Ningún identificador de origen aparece en dos decisiones (cada decisión una sola vez) y las decisiones del grupo B nombran su módulo.
// - El cuadro-resumen lista todas las decisiones, ni una más ni una menos.
// - Todos los identificadores de las filas «decisión de producto» de `docs/HALLAZGOS-ABIERTOS-V1.md` aparecen en alguna decisión: si una auditoría o un bloque agrega una fila nueva y nadie la lleva a la lista, esta prueba falla.
//
// Los identificadores de una celda se separan por comas, salvo las comas dentro de paréntesis y las de un texto que no empieza como un identificador (por ejemplo «V7-RECEPCION corte, WhatsApp, leads:leer», que es un solo identificador).

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DECISIONES = join(RAIZ, "docs", "DECISIONES-PARA-EDUARDO.md");
const HALLAZGOS = join(RAIZ, "docs", "HALLAZGOS-ABIERTOS-V1.md");

const GRUPOS = [
  { letra: "A", titulo: "## A. Bloquea salir con captación" },
  { letra: "B", titulo: "## B. Bloquea un módulo posterior" },
  { letra: "C", titulo: "## C. Puede esperar" },
] as const;

const CAMPOS = ["Pregunta", "Contexto", "Opciones", "Recomendación", "Si no se decide", "Dónde se cambia", "Ids origen"] as const;

const MODULOS_B = ["Cotizador", "Clase muestra", "Inscripción", "Operación", "Finanzas", "Tableros"];

/** Cómo empieza un identificador de origen (EA-02, V7-ADMIN-30, F1 §5.1, A7, SUP-PRECIOS, fase-1 §5 (3)…). */
const INICIO_DE_ID = /^(?:[A-Z]{1,5}\d{0,2}[a-z]?[-\s§]|[A-Z]\d+\b|fase-1|SUPUESTOS)/;

/** Separa una celda de identificadores por comas de primer nivel y vuelve a pegar lo que no empieza como un identificador. */
function separarIds(celda: string): string[] {
  const trozos: string[] = [];
  let profundidad = 0;
  let actual = "";
  for (const c of celda) {
    if (c === "(") profundidad++;
    if (c === ")") profundidad = Math.max(0, profundidad - 1);
    if (c === "," && profundidad === 0) {
      trozos.push(actual);
      actual = "";
    } else actual += c;
  }
  trozos.push(actual);
  const ids: string[] = [];
  for (const crudo of trozos) {
    const t = crudo.trim();
    if (t === "") continue;
    if (ids.length > 0 && !INICIO_DE_ID.test(t)) ids[ids.length - 1] += `, ${t}`;
    else ids.push(t);
  }
  return ids;
}

interface Decision {
  numero: string;
  titulo: string;
  grupo: string;
  modulo: string;
  campos: Map<string, string>;
  casilla: boolean;
  ids: string[];
}

function leerDecisiones(texto: string): Decision[] {
  const lineas = texto.split("\n");
  const decisiones: Decision[] = [];
  let grupo = "";
  let actual: { numero: string; titulo: string; grupo: string; cuerpo: string[] } | null = null;
  const cerrar = (): void => {
    if (!actual) return;
    const cuerpo = actual.cuerpo.join("\n");
    const campos = new Map<string, string>();
    let campo: string | null = null;
    for (const l of actual.cuerpo) {
      const inicio = l.match(/^\*\*([^*]+):\*\*\s*(.*)$/);
      if (inicio && (CAMPOS as readonly string[]).includes(inicio[1]!)) {
        campo = inicio[1]!;
        campos.set(campo, inicio[2]!);
      } else if (/^- \[[ x]\] Decidido/.test(l)) campo = null;
      else if (campo) campos.set(campo, `${campos.get(campo)}\n${l}`);
    }
    for (const [k, v] of campos) campos.set(k, v.trim());
    const modulo = cuerpo.match(/\*\*Módulo:\*\*\s*([^·\n]+?)\s*(?:·|\n)/)?.[1]?.trim() ?? "";
    decisiones.push({
      numero: actual.numero,
      titulo: actual.titulo,
      grupo: actual.grupo,
      modulo,
      campos,
      casilla: /^- \[[ x]\] Decidido:/m.test(cuerpo),
      ids: separarIds((campos.get("Ids origen") ?? "").replace(/\s+/g, " ")),
    });
    actual = null;
  };
  for (const linea of lineas) {
    const g = GRUPOS.find((x) => linea.trim() === x.titulo);
    if (g) {
      cerrar();
      grupo = g.letra;
      continue;
    }
    if (/^## /.test(linea)) {
      cerrar();
      grupo = "";
      continue;
    }
    const d = linea.match(/^#{3,4} (D-\d{2,3}) · (.+)$/);
    if (d) {
      cerrar();
      actual = { numero: d[1]!, titulo: d[2]!.trim(), grupo, cuerpo: [] };
      continue;
    }
    if (actual) actual.cuerpo.push(linea);
  }
  cerrar();
  return decisiones;
}

/** Los identificadores (primera columna) de las filas cuya clasificación es «decisión de producto». */
function idsDeProductoEnHallazgos(texto: string): { fila: string; ids: string[] }[] {
  const filas: { fila: string; ids: string[] }[] = [];
  for (const linea of texto.split("\n")) {
    if (!linea.startsWith("| ")) continue;
    const celdas = linea.split("|").map((c) => c.trim());
    // ["", id, origen, sev, descripción, clasificación, detalle, estado, ""]
    if (celdas.length < 9 || celdas[5] !== "decisión de producto") continue;
    filas.push({ fila: celdas[1]!, ids: separarIds(celdas[1]!) });
  }
  return filas;
}

const texto = existsSync(DECISIONES) ? readFileSync(DECISIONES, "utf8") : "";
const decisiones = leerDecisiones(texto);

test("V11: el archivo existe y trae los tres grupos y la tabla «Ya decidido»", () => {
  assert.ok(existsSync(DECISIONES), "falta docs/DECISIONES-PARA-EDUARDO.md");
  for (const g of GRUPOS) assert.ok(texto.split("\n").some((l) => l.trim() === g.titulo), `falta el grupo «${g.titulo}»`);
  assert.ok(texto.includes("## Ya decidido"), "falta la tabla «Ya decidido»");
  assert.ok(texto.includes("## Las 10 que más urgen"), "falta la sección «Las 10 que más urgen»");
  assert.ok(texto.includes("## Cuadro-resumen"), "falta el cuadro-resumen");
  for (const g of GRUPOS) assert.ok(decisiones.some((d) => d.grupo === g.letra), `el grupo ${g.letra} no tiene decisiones`);
});

test("V11: cada decisión tiene los siete campos, su casilla y un solo grupo, y la numeración no tiene saltos", () => {
  assert.ok(decisiones.length >= 50, `se esperaban muchas decisiones y hay ${decisiones.length}`);
  decisiones.forEach((d, i) => {
    assert.equal(d.numero, `D-${String(i + 1).padStart(2, "0")}`, `la numeración se salta o se repite en ${d.numero}`);
    for (const campo of CAMPOS) assert.ok((d.campos.get(campo) ?? "").length > 0, `${d.numero}: falta o está vacío el campo «${campo}»`);
    assert.ok(d.casilla, `${d.numero}: falta la casilla «- [ ] Decidido: ______»`);
    assert.ok(d.grupo !== "", `${d.numero}: no está dentro de ninguno de los tres grupos`);
    assert.ok(d.ids.length > 0, `${d.numero}: no trae ids de origen`);
    assert.ok(/^(?:- \*\*[A-Z]\.\*\* .+\n?){2,}$/m.test(d.campos.get("Opciones")!), `${d.numero}: las opciones deben ser al menos dos, con letra`);
  });
  const grupos = decisiones.map((d) => d.grupo).join("");
  assert.match(grupos, /^A+B+C+$/, "las decisiones deben ir en orden: grupo A, luego B, luego C");
});

test("V11: las decisiones del grupo B nombran el módulo que desbloquean", () => {
  for (const d of decisiones.filter((x) => x.grupo === "B")) assert.ok(MODULOS_B.includes(d.modulo), `${d.numero}: el módulo «${d.modulo}» no es uno de los de V1 (${MODULOS_B.join(", ")})`);
});

test("V11: ningún identificador de origen aparece en dos decisiones", () => {
  const dueno = new Map<string, string>();
  const repetidos: string[] = [];
  for (const d of decisiones) {
    for (const id of d.ids) {
      const previo = dueno.get(id);
      if (previo !== undefined) repetidos.push(`${id} (${previo} y ${d.numero})`);
      else dueno.set(id, d.numero);
    }
  }
  assert.deepEqual(repetidos, [], `ids repetidos: ${repetidos.join("; ")}`);
});

test("V11: el cuadro-resumen lista todas las decisiones, ni una más ni una menos", () => {
  const resumen = texto.split("## Cuadro-resumen")[1]?.split("\n---")[0] ?? "";
  const filas = [...resumen.matchAll(/^\| (D-\d{2,3}) \|/gm)].map((m) => m[1]!);
  assert.deepEqual(filas, decisiones.map((d) => d.numero));
});

test("V11: las 'Las 10 que más urgen' apuntan a decisiones que existen y no se repiten", () => {
  const seccion = texto.split("## Las 10 que más urgen")[1]?.split("\n## ")[0] ?? "";
  const filas = [...seccion.matchAll(/^\| (\d+) \| (D-\d{2,3}) \|/gm)].map((m) => ({ orden: Number(m[1]), numero: m[2]! }));
  assert.equal(filas.length, 10);
  assert.deepEqual(filas.map((f) => f.orden), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(filas.map((f) => f.numero)).size, 10, "una decisión aparece dos veces entre las urgentes");
  const existentes = new Set(decisiones.map((d) => d.numero));
  for (const f of filas) assert.ok(existentes.has(f.numero), `${f.numero} no existe`);
});

test("V11: todas las filas «decisión de producto» de HALLAZGOS-ABIERTOS-V1.md están en alguna decisión", () => {
  assert.ok(existsSync(HALLAZGOS), "falta docs/HALLAZGOS-ABIERTOS-V1.md");
  const filas = idsDeProductoEnHallazgos(readFileSync(HALLAZGOS, "utf8"));
  assert.ok(filas.length >= 52, `se esperaban muchas filas de decisión de producto y se leyeron ${filas.length}: ¿cambió el formato de la tabla?`);
  const presentes = new Set(decisiones.flatMap((d) => d.ids));
  const faltan: string[] = [];
  for (const fila of filas) for (const id of fila.ids) if (!presentes.has(id)) faltan.push(`${id} (fila «${fila.fila}»)`);
  assert.deepEqual(faltan, [], `ids de HALLAZGOS-ABIERTOS-V1.md que no están en DECISIONES-PARA-EDUARDO.md: ${faltan.join("; ")}`);
});

test("V11: separar ids respeta paréntesis y textos que no empiezan como un id", () => {
  assert.deepEqual(separarIds("EB-02, EB-03"), ["EB-02", "EB-03"]);
  assert.deepEqual(separarIds("V7-RECEPCION corte, WhatsApp, leads:leer"), ["V7-RECEPCION corte, WhatsApp, leads:leer"]);
  assert.deepEqual(separarIds("V7-RECEPCION-13, V7-RECEPCION-21 (inventario, «Evento»)"), ["V7-RECEPCION-13", "V7-RECEPCION-21 (inventario, «Evento»)"]);
  assert.deepEqual(separarIds("EK-01 (confirmación), estado_aprobacion"), ["EK-01 (confirmación), estado_aprobacion"]);
  assert.deepEqual(separarIds("fase-1 §5 (7), A2"), ["fase-1 §5 (7)", "A2"]);
  assert.deepEqual(separarIds("V7-ADMIN campañas, V7 aterrizaje"), ["V7-ADMIN campañas", "V7 aterrizaje"]);
  assert.deepEqual(separarIds("SUPUESTOS"), ["SUPUESTOS"]);
});
