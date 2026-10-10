import { test } from "node:test";
import assert from "node:assert/strict";
import { aCentavos, comparar, multiplicar, deCentavos, esImporte, formatear, minimo, normalizarCaptura, problemaDeImporte, restar, sumar } from "./dinero.ts";

test("aCentavos y deCentavos son inversos y exactos (sin flotantes)", () => {
  for (const t of ["0.00", "0.01", "0.10", "1234.50", "9999999999.99", "-15.05", "100.00"]) assert.equal(deCentavos(aCentavos(t)), t);
  assert.equal(aCentavos("1234.5"), 123450n);
  assert.equal(aCentavos("7"), 700n);
});

test("sumar 0.10 diez veces da 1.00 y 0.1 + 0.2 da 0.30 (donde un flotante falla)", () => {
  assert.equal(sumar(...Array<string>(10).fill("0.10")), "1.00");
  assert.equal(sumar("0.10", "0.20"), "0.30");
  assert.equal(restar("1000.00", "999.99"), "0.01");
  assert.equal(sumar("9999999999.99", "0.01"), "10000000000.00");
});

test("formatear es-MX conserva todos los dígitos", () => {
  assert.equal(formatear("1234.5"), "$1,234.50");
  assert.equal(formatear("0.05"), "$0.05");
  assert.equal(formatear("-15.05"), "-$15.05");
  assert.equal(formatear("9999999999.99"), "$9,999,999,999.99"); // el tope de la API
  assert.equal(formatear("123456789012.01"), "$123,456,789,012.01");
  assert.equal(formatear(null), "—");
  assert.equal(formatear("abc"), "—");
  assert.equal(formatear("12.345"), "—", "más de dos decimales no es un importe del servidor");
});

test("comparar y minimo", () => {
  assert.equal(comparar("10.00", "9.99"), 1);
  assert.equal(comparar("1.0", "1.00"), 0);
  assert.equal(minimo("500.00", "300.50"), "300.50");
});

test("normalizarCaptura acepta lo que teclea una persona y rechaza lo dudoso", () => {
  assert.equal(normalizarCaptura("$1,234.5"), "1234.50");
  assert.equal(normalizarCaptura("300"), "300.00");
  assert.equal(normalizarCaptura(" 1 500 "), "1500.00");
  assert.equal(normalizarCaptura(".5"), "0.50");
  assert.equal(normalizarCaptura("12.345"), null);
  assert.equal(normalizarCaptura("-5"), null);
  assert.equal(normalizarCaptura("1e3"), null);
  assert.equal(normalizarCaptura(""), null);
});

test("normalizarCaptura: la coma solo es separador de miles, nunca un decimal ni algo que se adivine (V7)", () => {
  assert.equal(normalizarCaptura("1,234"), "1234.00");
  assert.equal(normalizarCaptura("12,345,678.9"), "12345678.90");
  for (const raro of ["100,50", "12,34,5", "1,5", "1,2345", ",500", "1234,567", "1,23", "99999999999"]) assert.equal(normalizarCaptura(raro), null, raro);
});

test("problemaDeImporte dice qué tiene de malo lo tecleado (para decirle a la persona qué hacer)", () => {
  assert.equal(problemaDeImporte(""), null);
  assert.equal(problemaDeImporte("1,250.50"), null);
  assert.equal(problemaDeImporte("-50"), "negativo");
  assert.equal(problemaDeImporte("0"), "cero");
  assert.equal(problemaDeImporte("0.00"), "cero");
  assert.equal(problemaDeImporte("abc"), "letras");
  assert.equal(problemaDeImporte("1e5"), "letras");
  assert.equal(problemaDeImporte("12.345"), "decimales");
  assert.equal(problemaDeImporte("1.2.3"), "decimales");
  assert.equal(problemaDeImporte("100,50"), "comas");
  assert.equal(problemaDeImporte("12,34,5"), "comas");
  assert.equal(problemaDeImporte("99999999999"), "enorme");
});

test("esImporte y aCentavos rechazan lo que no es un importe", () => {
  assert.equal(esImporte("12.50"), true);
  assert.equal(esImporte("12,50"), false);
  assert.throws(() => aCentavos("1e3"), RangeError);
  assert.throws(() => aCentavos(""), RangeError);
});

test("multiplicar un precio por piezas es exacto", () => {
  assert.equal(multiplicar("350.00", 3), "1050.00");
  assert.equal(multiplicar("0.10", 3), "0.30");
  assert.equal(multiplicar("9999999.99", 100), "999999999.00");
  assert.throws(() => multiplicar("1.00", 1.5), RangeError);
  assert.throws(() => multiplicar("1.00", -1), RangeError);
});
