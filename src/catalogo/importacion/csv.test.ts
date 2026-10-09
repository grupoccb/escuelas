// El lector de CSV de la carga del catálogo (V6): lo que produce Excel en español, sin sorpresas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ErrorDeCsv, decodificarBytes, detectarSeparador, leerCsv } from "./csv.ts";

const celdas = (texto: string): string[][] => leerCsv(texto).filas.map((f) => f.celdas);

test("coma, punto y coma y tabulador: el separador se decide con la primera fila", () => {
  assert.equal(leerCsv("a,b,c\n1,2,3\n").separador, ",");
  assert.equal(leerCsv("a;b;c\n1;2;3\n").separador, ";");
  assert.equal(leerCsv("a\tb\tc\n1\t2\t3\n").separador, "\t");
  assert.deepEqual(celdas("a;b;c\n1;2;3\n"), [["a", "b", "c"], ["1", "2", "3"]]);
  assert.deepEqual(celdas("a\tb\n1\t2\n"), [["a", "b"], ["1", "2"]]);
  assert.equal(detectarSeparador("solo una columna\nvalor\n"), ",", "sin separadores: coma");
  // Una coma dentro de comillas no cuenta para decidir el separador.
  assert.equal(detectarSeparador('"a,b,c";d;e\n'), ";");
  // Con punto y coma, las comas decimales y de texto no confunden.
  assert.deepEqual(celdas("Importe;Nota\n1500,50;hola, mundo\n"), [["Importe", "Nota"], ["1500,50", "hola, mundo"]]);
});

test("BOM de UTF-8: se quita, con o sin pasar por los bytes", () => {
  assert.deepEqual(celdas("﻿nombre,edad\nAna,7\n"), [["nombre", "edad"], ["Ana", "7"]]);
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Sucursal,Dirección\nCentro,Calle 1\n", "utf8")]);
  assert.equal(decodificarBytes(bytes), "Sucursal,Dirección\nCentro,Calle 1\n");
});

test("codificaciones: UTF-8, Windows-1252 (el «CSV» a secas de Excel) y UTF-16 con BOM", () => {
  assert.equal(decodificarBytes(Buffer.from("Día, niño, pingüino", "utf8")), "Día, niño, pingüino");
  // «Día;Salón» en Windows-1252: í = 0xED, ó = 0xF3 (no es UTF-8 válido).
  const w1252 = Buffer.from([0x44, 0xed, 0x61, 0x3b, 0x53, 0x61, 0x6c, 0xf3, 0x6e]);
  assert.equal(decodificarBytes(w1252), "Día;Salón");
  const u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Día\tSalón", "utf16le")]);
  assert.equal(decodificarBytes(u16), "Día\tSalón");
  const u16be = Buffer.from([0xfe, 0xff, 0x00, 0x44, 0x00, 0xed, 0x00, 0x61]);
  assert.equal(decodificarBytes(u16be), "Día");
});

test("comillas: separadores dentro, comillas dobles repetidas y saltos de línea dentro de un campo", () => {
  assert.deepEqual(celdas('a,b\n"uno, dos",tres\n'), [["a", "b"], ["uno, dos", "tres"]]);
  assert.deepEqual(celdas('a,b\n"dijo ""hola""",x\n'), [["a", "b"], ['dijo "hola"', "x"]]);
  assert.deepEqual(celdas('a,b\n"línea 1\nlínea 2",x\n'), [["a", "b"], ["línea 1\nlínea 2", "x"]]);
  assert.deepEqual(celdas('a;b\n"x;y";z\n'), [["a", "b"], ["x;y", "z"]]);
  assert.deepEqual(celdas('a,b\n"",x\n'), [["a", "b"], ["", "x"]], "comillas vacías = celda vacía");
  assert.deepEqual(celdas('a,b\n  "con espacios antes",x\n'), [["a", "b"], ["con espacios antes", "x"]]);
});

test("fin de línea: \\r\\n, \\n y \\r solo (Excel de Mac antiguo) dan lo mismo", () => {
  const esperado = [["a", "b"], ["1", "2"], ["3", "4"]];
  assert.deepEqual(celdas("a,b\r\n1,2\r\n3,4\r\n"), esperado);
  assert.deepEqual(celdas("a,b\n1,2\n3,4\n"), esperado);
  assert.deepEqual(celdas("a,b\r1,2\r3,4\r"), esperado);
  assert.deepEqual(celdas("a,b\r\n1,2\r\n3,4"), esperado, "sin salto de línea al final");
});

test("números de fila: los de la hoja; las filas vacías cuentan pero no se devuelven, y un salto dentro de un campo no cuenta", () => {
  const r = leerCsv('a,b\n1,2\n\n,\n"x\ny",3\n4,5\n');
  assert.deepEqual(r.filas.map((f) => f.numero), [1, 2, 5, 6], "fila 3 vacía, fila 4 de solo comas, la 5 trae un salto interno");
  assert.deepEqual(r.filas[2]!.celdas, ["x\ny", "3"]);
  // Excel exporta filas «,,,,» al final de la hoja: no son datos.
  assert.deepEqual(celdas("a,b,c\n1,2,3\n,,\n,,\n").length, 2);
});

test("acentos y eñes intactos; espacios de más se recortan fuera de comillas", () => {
  assert.deepEqual(celdas("Día,Niños\n  miércoles ,  pingüinos\n"), [["Día", "Niños"], ["miércoles", "pingüinos"]]);
  assert.deepEqual(celdas('a\n" conserva espacios "\n'), [["a"], [" conserva espacios "]]);
});

test("celdas faltantes o de más: la fila conserva lo que trae", () => {
  assert.deepEqual(celdas("a,b,c\n1,2\n1,2,3,4\n"), [["a", "b", "c"], ["1", "2"], ["1", "2", "3", "4"]]);
  assert.deepEqual(celdas("a,b\n1,\n"), [["a", "b"], ["1", ""]]);
});

test("comillas sin cerrar: error claro con la fila donde se abrieron", () => {
  assert.throws(() => leerCsv('a,b\n1,"sin cerrar\n2,3\n'), (e) => e instanceof ErrorDeCsv && /fila 2/.test(e.message) && /comillas/.test(e.message));
});

test("archivo vacío o solo encabezados", () => {
  assert.deepEqual(leerCsv("").filas, []);
  assert.deepEqual(leerCsv("﻿").filas, []);
  assert.deepEqual(celdas("a,b\n"), [["a", "b"]]);
});
