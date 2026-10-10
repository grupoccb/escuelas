// V10 / V7-ADMIN-32: TODO formulario de la interfaz lleva `noValidate`. Sin él, al enviar un campo vacío, una fecha fuera de rango o un correo mal escrito, el NAVEGADOR
// muestra su propio aviso (en el idioma del navegador de cada persona, a menudo en inglés, y sin decir qué hacer) en lugar de los mensajes en español de la pantalla.
// Esta guarda recorre el código fuente: un formulario nuevo sin `noValidate` falla el build.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";

const RAIZ = resolve(import.meta.dirname);

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const completo = join(dir, e);
    if (statSync(completo).isDirectory()) return archivos(completo);
    return completo.endsWith(".tsx") && !completo.endsWith(".test.tsx") ? [completo] : [];
  });
}

/** La etiqueta de apertura de cada `<form …>` (desde `<form` hasta su `>` real: las flechas `=>` y las llaves de las funciones no la cierran). */
function formularios(texto: string): { linea: number; etiqueta: string }[] {
  const salida: { linea: number; etiqueta: string }[] = [];
  for (const m of texto.matchAll(/<form(?=[\s>])/g)) {
    let i = m.index!;
    let llaves = 0;
    for (; i < texto.length; i++) {
      const c = texto[i];
      if (c === "{") llaves++;
      else if (c === "}") llaves--;
      else if (c === ">" && llaves === 0 && texto[i - 1] !== "=") break;
    }
    salida.push({ linea: texto.slice(0, m.index).split("\n").length, etiqueta: texto.slice(m.index!, i + 1) });
  }
  return salida;
}

test("la guarda ve los formularios de verdad (hay muchos) y no se confunde con las flechas ni las llaves", () => {
  const ejemplo = `<form className="x" onSubmit={(e) => { e.preventDefault(); if (a > b) f(); }} noValidate>\n<form\n  className="y"\n>`;
  const f = formularios(ejemplo);
  assert.equal(f.length, 2);
  assert.ok(f[0]!.etiqueta.includes("noValidate"));
  assert.ok(!f[1]!.etiqueta.includes("noValidate"));
  const todos = archivos(RAIZ).flatMap((a) => formularios(readFileSync(a, "utf8")));
  assert.ok(todos.length >= 30, `se esperaban 30 o más formularios y hay ${todos.length}`);
});

test("todo <form> de la interfaz lleva noValidate (los mensajes son los de la pantalla, en español)", () => {
  const sin: string[] = [];
  for (const archivo of archivos(RAIZ)) {
    for (const f of formularios(readFileSync(archivo, "utf8"))) if (!/\bnoValidate\b/.test(f.etiqueta)) sin.push(`${relative(RAIZ, archivo)}:${f.linea}`);
  }
  assert.deepEqual(sin, [], "estos formularios muestran el aviso nativo del navegador");
});
