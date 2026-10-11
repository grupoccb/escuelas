import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDeTope, cantidadPermitida, cuandoSeVendio, disponibles, existenciaDe, nombreConTalla, productoElegido } from "./ventas.ts";
import type { Producto } from "./tipos.ts";

const p = (id: string, stock: number, activo = true, talla: string | null = null): Producto => ({ id, vertical: { id: "v", nombre: "V" }, nombre: `Pieza ${id}`, talla, precio: "100.00", stock, activo });

test("la existencia se dice con palabras: agotado, queda 1 o quedan N (el color solo refuerza)", () => {
  assert.deepEqual(existenciaDe(0), { texto: "Agotado", tono: "agotado" });
  assert.deepEqual(existenciaDe(1), { texto: "Queda 1", tono: "ultima" });
  assert.deepEqual(existenciaDe(6), { texto: "Quedan 6", tono: "hay" });
  assert.equal(existenciaDe(-2).texto, "Agotado", "un inventario negativo (dato malo) no se lee como piezas");
});

test("solo se pueden vender los activos con piezas; sin elegir (o con el elegido agotado) se toma el primero", () => {
  const lista = [p("a", 0), p("b", 3), p("c", 5, false), p("d", 2)];
  assert.deepEqual(disponibles(lista).map((x) => x.id), ["b", "d"]);
  assert.equal(productoElegido(lista, "d")?.id, "d");
  assert.equal(productoElegido(lista, "a")?.id, "b", "el agotado no se elige");
  assert.equal(productoElegido(lista, "zzz")?.id, "b");
  assert.equal(productoElegido([p("a", 0)], "a"), undefined);
});

test("la cantidad va de 1 a la existencia, y avisa cuando ya se pidieron todas las piezas", () => {
  assert.equal(cantidadPermitida(0, 5), 1);
  assert.equal(cantidadPermitida(-3, 5), 1);
  assert.equal(cantidadPermitida(9, 5), 5);
  assert.equal(cantidadPermitida(4, 5), 4);
  assert.equal(cantidadPermitida(4, undefined), 1);
  assert.equal(cantidadPermitida(4, 0), 1);
  assert.equal(avisoDeTope(5, 5), "Solo hay 5 en existencia");
  assert.equal(avisoDeTope(1, 1), "Solo hay 1 en existencia");
  assert.equal(avisoDeTope(2, 5), null);
  assert.equal(avisoDeTope(1, undefined), null);
});

test("el nombre lleva la talla cuando la hay", () => {
  assert.equal(nombreConTalla({ nombre: "Playera", talla: "M" }), "Playera · talla M");
  assert.equal(nombreConTalla({ nombre: "Termo", talla: null }), "Termo");
});

test("la hora de una venta: de hoy solo la hora en 12 h; de otro día, con su fecha", () => {
  const zona = "America/Mexico_City";
  const ahora = new Date("2026-10-12T20:00:00Z"); // 2:00 pm del 12 de octubre en la Ciudad de México
  assert.equal(cuandoSeVendio("2026-10-12T17:20:00Z", ahora, zona), "11:20 am");
  assert.equal(cuandoSeVendio("2026-10-12T19:05:00Z", ahora, zona), "1:05 pm");
  assert.equal(cuandoSeVendio("2026-10-10T17:20:00Z", ahora, zona), "10 oct 2026 · 11:20 am");
  assert.equal(cuandoSeVendio("no es una fecha", ahora, zona), "—");
});
