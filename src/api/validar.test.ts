import { test } from "node:test";
import assert from "node:assert/strict";
import { ErrorApi } from "./errores.ts";
import { booleano, booleanoDeTexto, correo, entero, enteroDeTexto, enumerado, fechaISO, listaDe, nulable, objeto, opcional, parsear, parsearQuery, texto, textoLiteral, uuid } from "./validar.ts";

function detalles(fn: () => unknown): { campo?: string; mensaje: string }[] {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof ErrorApi);
    assert.equal(e.codigo, "validacion");
    assert.equal(e.estado, 400);
    return e.detalles ?? [];
  }
  assert.fail("debía lanzar validacion");
}

const esquema = objeto({
  nombre: texto({ max: 10 }),
  edad: opcional(entero({ min: 0, max: 120 })),
  rol: enumerado(["a", "b"] as const),
  activo: opcional(booleano()),
});

test("un objeto válido sale tipado y recortado", () => {
  const r = parsear(esquema, { nombre: "  Ana  ", rol: "a" });
  assert.deepEqual(r, { nombre: "Ana", rol: "a" });
});

test("rechaza campos desconocidos y los nombra", () => {
  assert.deepEqual(detalles(() => parsear(esquema, { nombre: "Ana", rol: "a", admin: true })).map((d) => d.campo), ["admin"]);
});

test("junta TODOS los errores, no solo el primero, con el nombre del campo", () => {
  const d = detalles(() => parsear(esquema, { nombre: "", edad: 200, rol: "z" }));
  assert.deepEqual(d.map((x) => x.campo).sort(), ["edad", "nombre", "rol"]);
});

test("falta de campos obligatorios; opcional ausente no es error; null en opcional sí lo es", () => {
  assert.deepEqual(detalles(() => parsear(esquema, {})).map((d) => d.campo).sort(), ["nombre", "rol"]);
  assert.deepEqual(parsear(esquema, { nombre: "x", rol: "b" }), { nombre: "x", rol: "b" });
  assert.equal(detalles(() => parsear(esquema, { nombre: "x", rol: "b", edad: null })).length, 1);
  assert.deepEqual(parsear(objeto({ edad: nulable(entero()) }), { edad: null }), { edad: null });
});

test("no coacciona: «5» no es un entero, 1 no es un booleano, 1.5 no es entero", () => {
  assert.equal(detalles(() => parsear(entero(), "5")).length, 1);
  assert.equal(detalles(() => parsear(booleano(), 1)).length, 1);
  assert.equal(detalles(() => parsear(entero(), 1.5)).length, 1);
  assert.equal(detalles(() => parsear(texto(), 5)).length, 1);
});

test("el cuerpo debe ser un objeto: un arreglo, null o un texto se rechazan", () => {
  for (const malo of [[], null, "texto", 5]) assert.equal(detalles(() => parsear(esquema, malo)).length, 1);
});

test("__proto__ y constructor no pasan como campos", () => {
  const cuerpo = JSON.parse('{"nombre":"x","rol":"a","__proto__":{"admin":true}}') as unknown;
  assert.deepEqual(detalles(() => parsear(esquema, cuerpo)).map((d) => d.campo), ["__proto__"]);
  assert.deepEqual(detalles(() => parsear(esquema, { nombre: "x", rol: "a", constructor: 1 })).map((d) => d.campo), ["constructor"]);
});

test("uuid, correo y listas (con máximo y sin repetidos)", () => {
  assert.equal(parsear(uuid(), "3F2504E0-4F89-41D3-9A0C-0305E82C3301"), "3f2504e0-4f89-41d3-9a0c-0305e82c3301");
  assert.equal(detalles(() => parsear(uuid(), "no-es-uuid")).length, 1);
  assert.equal(parsear(correo(), "  Ana@Ejemplo.COM "), "ana@ejemplo.com");
  assert.equal(detalles(() => parsear(correo(), "sin-arroba")).length, 1);
  assert.deepEqual(parsear(listaDe(entero(), { max: 3 }), [1, 2]), [1, 2]);
  assert.equal(detalles(() => parsear(listaDe(entero(), { max: 2 }), [1, 2, 3])).length, 1);
  assert.equal(detalles(() => parsear(listaDe(entero(), { unicos: true }), [1, 1])).length, 1);
  assert.deepEqual(detalles(() => parsear(listaDe(entero()), [1, "x"])).map((d) => d.campo), ["[1]"]);
});

test("texto: máximo, patrón y sin recortar en textoLiteral", () => {
  assert.equal(detalles(() => parsear(texto({ max: 3 }), "abcd")).length, 1);
  assert.equal(detalles(() => parsear(texto({ patron: /^\d+$/ }), "abc")).length, 1);
  assert.equal(parsear(textoLiteral({ max: 20 }), "  con espacios "), "  con espacios ");
});

test("query: enteros y booleanos llegan como texto; un parámetro repetido es un error", () => {
  const q = objeto({ n: opcional(enteroDeTexto({ min: 1, max: 10 })), b: opcional(booleanoDeTexto()) });
  assert.deepEqual(parsearQuery(q, { n: "7", b: "true" }), { n: 7, b: true });
  assert.equal(detalles(() => parsearQuery(q, { n: "0" })).length, 1);
  assert.equal(detalles(() => parsearQuery(q, { n: "7.5" })).length, 1);
  assert.equal(detalles(() => parsearQuery(q, { n: ["1", "2"] })).length, 1);
  assert.equal(detalles(() => parsearQuery(q, { n: { a: "1" } })).length, 1);
  assert.equal(detalles(() => parsearQuery(q, { b: "si" })).length, 1);
  assert.equal(detalles(() => parsearQuery(q, { otro: "x" })).length, 1);
});

test("EC-07: fechaISO acepta fechas del calendario entre 1900 y 2999 y rechaza el año 0000, 3000 y lo imposible (nunca llega un 500 de la base)", () => {
  for (const ok of ["1900-01-01", "2024-02-29", "2026-10-08", "2999-12-31"]) assert.equal(parsear(fechaISO(), ok), ok, ok);
  for (const mal of ["0000-01-01", "0001-01-01", "1899-12-31", "3000-01-01", "9999-12-31", "2026-02-30", "2025-02-29", "2026-13-01", "26-10-08", "2026-1-8", ""]) {
    assert.equal(detalles(() => parsear(fechaISO(), mal)).length, 1, mal);
  }
  assert.equal(detalles(() => parsear(fechaISO(), 20261008)).length, 1);
});
