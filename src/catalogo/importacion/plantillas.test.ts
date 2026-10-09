// Las plantillas que se descargan (V6): salen de la misma tabla que el importador, así que se leen con él; la fila de ejemplo no crea nada; el zip es un zip válido; y los
// archivos de `docs/plantillas-catalogo/` son exactamente lo que genera el código.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync, crc32 } from "node:zlib";
import { ESQUEMAS, TIPOS } from "./esquemas.ts";
import { leerArchivos } from "./lectura.ts";
import { EXISTENTE_VACIO, planificar } from "./plan.ts";
import { archivosDePlantillas, crearZip, descargasDePlantillas, instrucciones, plantillaCsv } from "./plantillas.ts";

test("cada plantilla: UTF-8 con BOM, coma, fin de línea de Excel, encabezados en español y UNA fila de ejemplo falsa", () => {
  for (const t of TIPOS) {
    const texto = plantillaCsv(t);
    assert.equal(texto.charCodeAt(0), 0xfeff, `${t}: BOM`);
    const lineas = texto.slice(1).split("\r\n");
    assert.equal(lineas.length, 3, `${t}: encabezados, ejemplo y el fin de línea final`);
    assert.equal(lineas[2], "");
    assert.match(lineas[1]!, /EJEMPLO/, `${t}: el ejemplo dice EJEMPLO`);
    for (const c of ESQUEMAS[t].columnas) assert.ok(lineas[0]!.includes(c.titulo), `${t}: ${c.titulo}`);
    assert.doesNotMatch(lineas[0]!, /_|id\b|uuid|null|slug/i, `${t}: sin términos técnicos en los encabezados`);
  }
});

test("las plantillas se leen con el importador: se reconocen solas, la fila de ejemplo se ignora y no crean nada", () => {
  const lectura = leerArchivos(archivosDePlantillas().filter((a) => a.nombre.endsWith(".csv")).map((a) => ({ nombre: a.nombre, bytes: a.contenido })));
  assert.deepEqual(lectura.problemas, []);
  for (const t of TIPOS) {
    assert.ok(lectura.tablas[t], `se reconoció ${t}`);
    assert.equal(lectura.tablas[t]!.filas.length, 0, `${t}: sin filas de datos`);
  }
  assert.equal(lectura.avisos.filter((a) => /fila de ejemplo/.test(a.mensaje)).length, TIPOS.length);
  const plan = planificar(lectura.tablas, EXISTENTE_VACIO);
  assert.deepEqual(plan.errores, []);
  assert.deepEqual(plan.ops, []);
});

test("la plantilla de cada hoja se reconoce aunque el archivo se llame distinto (Excel agrega «(1)», o lo renombran)", () => {
  for (const t of TIPOS) {
    const l = leerArchivos([{ nombre: "documento final (3).csv", bytes: Buffer.from(plantillaCsv(t)) }]);
    assert.deepEqual(l.problemas, [], t);
    assert.ok(l.tablas[t], t);
  }
});

test("las instrucciones: cortas, en español, con lo que hace y NO hace el sistema", () => {
  const texto = instrucciones();
  assert.equal(texto.charCodeAt(0), 0xfeff);
  assert.match(texto, /NUNCA borra nada/);
  assert.match(texto, /Sin cambios/);
  assert.match(texto, /CSV UTF-8/);
  for (const t of TIPOS) assert.ok(texto.includes(ESQUEMAS[t].archivo), t);
  assert.ok(texto.split("\n").length < 90, "una hoja, no un manual");
});

/** Un lector mínimo de zip (método almacenado) para comprobar que el que armamos es válido. */
function leerZip(zip: Buffer): { nombre: string; contenido: Buffer }[] {
  const fin = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(fin >= 0, "fin del directorio central");
  const total = zip.readUInt16LE(fin + 10);
  let pos = zip.readUInt32LE(fin + 16);
  const salida: { nombre: string; contenido: Buffer }[] = [];
  for (let i = 0; i < total; i++) {
    assert.equal(zip.readUInt32LE(pos), 0x02014b50);
    const metodo = zip.readUInt16LE(pos + 10);
    const suma = zip.readUInt32LE(pos + 16);
    const tam = zip.readUInt32LE(pos + 24);
    const nombreLen = zip.readUInt16LE(pos + 28);
    const extraLen = zip.readUInt16LE(pos + 30);
    const comentarioLen = zip.readUInt16LE(pos + 32);
    const local = zip.readUInt32LE(pos + 42);
    const nombre = zip.subarray(pos + 46, pos + 46 + nombreLen).toString("utf8");
    assert.equal(zip.readUInt32LE(local), 0x04034b50);
    const inicio = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const bruto = zip.subarray(inicio, inicio + tam);
    const contenido = metodo === 8 ? inflateRawSync(bruto) : bruto;
    assert.equal(crc32(contenido), suma, `${nombre}: suma de verificación`);
    salida.push({ nombre, contenido: Buffer.from(contenido) });
    pos += 46 + nombreLen + extraLen + comentarioLen;
  }
  return salida;
}

test("el zip con todas las plantillas es válido, determinista y trae los mismos bytes que cada archivo", () => {
  const archivos = archivosDePlantillas();
  const zip = crearZip(archivos);
  assert.deepEqual(crearZip(archivos), zip, "determinista");
  const dentro = leerZip(zip);
  assert.deepEqual(dentro.map((a) => a.nombre), archivos.map((a) => a.nombre));
  for (const a of dentro) assert.deepEqual(a.contenido, archivos.find((x) => x.nombre === a.nombre)!.contenido, a.nombre);
  assert.equal(descargasDePlantillas().at(-1)?.nombre, "plantillas-catalogo.zip");
  // Nombres con acentos: el zip los marca como UTF-8.
  const conAcentos = leerZip(crearZip([{ nombre: "información.txt", contenido: Buffer.from("hola") }]));
  assert.equal(conAcentos[0]!.nombre, "información.txt");
});

test("docs/plantillas-catalogo/ es lo que genera el código (si falla: npm run catalogo:plantillas)", () => {
  for (const a of descargasDePlantillas()) {
    const enDocs = readFileSync(new URL(`../../../docs/plantillas-catalogo/${a.nombre}`, import.meta.url));
    assert.ok(enDocs.equals(a.contenido), `${a.nombre} está desfasado: corre npm run catalogo:plantillas`);
  }
});
