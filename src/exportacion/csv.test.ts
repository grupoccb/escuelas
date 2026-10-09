// I5: el CSV escapa bien, neutraliza fórmulas, lleva BOM y no estropea el dinero.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOM, aCsv, celda, encabezadoDeCsv, filaDeCsv, neutralizarFormula, nombreDeArchivo, type Columna } from "./csv.ts";

test("un campo con coma, comillas o salto de línea va entre comillas y las comillas se duplican", () => {
  assert.equal(celda("Pérez, Ana"), '"Pérez, Ana"');
  assert.equal(celda('dijo "hola"'), '"dijo ""hola"""');
  assert.equal(celda("línea1\nlínea2"), '"línea1\nlínea2"');
  assert.equal(celda("a\r\nb"), '"a\r\nb"');
  assert.equal(celda("sin nada raro"), "sin nada raro");
  assert.equal(celda("a;b", "texto", ";"), '"a;b"');
  assert.equal(celda("a;b", "texto", ","), "a;b");
});

test("nulos y vacíos salen como celda vacía; los números y bigint, tal cual", () => {
  assert.equal(celda(null), "");
  assert.equal(celda(undefined), "");
  assert.equal(celda(""), "");
  assert.equal(celda(42, "entero"), "42");
  assert.equal(celda(12345678901234567890n, "texto"), "12345678901234567890");
});

test("INYECCIÓN DE FÓRMULAS: =, +, -, @, tabulador y retorno de carro (también tras espacios) se neutralizan con un apóstrofo", () => {
  for (const peligro of ["=1+1", "=HYPERLINK(\"http://malo\",\"x\")", "+52 55 1234", "-2+3", "@SUMA(A1)", "\t=1", "\r=1", "  =1+1", "\u0000=1", " \t-5", "\u0085=1", "\u200B=1+1", "\u202E=1", "\uFEFF@SUMA(1)", "＝1+1", "＋52", "－1", "＠SUMA(1)"]) {
    const salida = celda(peligro);
    assert.ok(salida.replace(/^"/, "").startsWith("'"), `${JSON.stringify(peligro)} → ${JSON.stringify(salida)}`);
  }
  // Un tabulador o un retorno de carro al inicio se neutralizan aunque lo que sigue no sea una fórmula (Excel los trata como separadores de celda).
  assert.equal(neutralizarFormula("\tabc"), "'\tabc");
  assert.equal(neutralizarFormula("\rabc"), "'\rabc");
  assert.equal(neutralizarFormula("Ana"), "Ana");
  assert.equal(neutralizarFormula("a=b"), "a=b", "solo importa el inicio");
  assert.equal(neutralizarFormula("1-2"), "1-2");
});

test("el dinero y los enteros VÁLIDOS no se tocan (un -12.50 sigue siendo un número), pero un «dinero» que es una fórmula sí se neutraliza", () => {
  assert.equal(celda("-12.50", "dinero"), "-12.50");
  assert.equal(celda("1234.5", "dinero"), "1234.5");
  assert.equal(celda("0.00", "dinero"), "0.00");
  assert.equal(celda("=1+1", "dinero"), "'=1+1");
  assert.equal(celda("-1.234", "dinero"), "'-1.234", "más de dos decimales no es un importe válido");
  assert.equal(celda("-5", "entero"), "-5");
  assert.equal(celda("-5", "texto"), "'-5", "el mismo texto en una columna de texto SÍ se neutraliza");
  assert.equal(celda("+5", "entero"), "'+5");
});

test("el archivo lleva BOM UTF-8, encabezado, CRLF y acentos intactos; sin BOM si se pide", () => {
  interface F { nombre: string; saldo: string; hijos: number }
  const columnas: Columna<F>[] = [
    { titulo: "Nombre", valor: (f) => f.nombre },
    { titulo: "Saldo", tipo: "dinero", valor: (f) => f.saldo },
    { titulo: "Hijos", tipo: "entero", valor: (f) => f.hijos },
  ];
  const csv = aCsv(columnas, [{ nombre: "Ñandú, José", saldo: "1049.32", hijos: 2 }, { nombre: "=cmd|' /C calc'!A0", saldo: "-0.05", hijos: 0 }]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(csv, `${BOM}Nombre,Saldo,Hijos\r\n"Ñandú, José",1049.32,2\r\n'=cmd|' /C calc'!A0,-0.05,0\r\n`);
  assert.equal(aCsv(columnas, [], { sinBom: true }), "Nombre,Saldo,Hijos\r\n");
  assert.equal(aCsv(columnas, [{ nombre: "a,b", saldo: "1.00", hijos: 1 }], { separador: ";", sinBom: true }), "Nombre;Saldo;Hijos\r\na,b;1.00;1\r\n");
});

test("el encabezado también se neutraliza (un título controlado por datos no puede ser una fórmula)", () => {
  const csv = aCsv<{ x: string }>([{ titulo: "=1+1", valor: (f) => f.x }], [{ x: "ok" }], { sinBom: true });
  assert.equal(csv, "'=1+1\r\nok\r\n");
});

test("nombre de archivo seguro: sin acentos, sin espacios ni comillas ni saltos de línea (no se cuela un encabezado)", () => {
  assert.equal(nombreDeArchivo("Estado de cuenta — Pérez"), "Estado-de-cuenta-Perez.csv");
  assert.equal(nombreDeArchivo('a"; b\r\nSet-Cookie: x'), "a-b-Set-Cookie-x.csv");
  assert.equal(nombreDeArchivo("   "), "exportacion.csv");
  assert.equal(nombreDeArchivo("reporte", "txt"), "reporte.txt");
});

test("el tipo de una columna puede depender de la fila (indicador, valor): dinero y enteros exactos, texto neutralizado", () => {
  interface R { v: string; t: "dinero" | "entero" | "texto" }
  const columnas: Columna<R>[] = [{ titulo: "Valor", tipo: (f) => f.t, valor: (f) => f.v }];
  assert.equal(aCsv(columnas, [{ v: "-5.00", t: "dinero" }, { v: "-5", t: "entero" }, { v: "-5", t: "texto" }, { v: "=1", t: "dinero" }], { sinBom: true }), "Valor\r\n-5.00\r\n-5\r\n'-5\r\n'=1\r\n");
  assert.equal(filaDeCsv(columnas, { v: "a,b", t: "texto" }), '"a,b"');
  assert.equal(encabezadoDeCsv(columnas), "Valor");
});
