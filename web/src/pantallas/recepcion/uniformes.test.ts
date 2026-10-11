import { test } from "node:test";
import assert from "node:assert/strict";
import { cuandoSeEntrego, existenciaDe, origenDelBeneficio, piezasDeUnBeneficio, textoDeExistencia, tituloDelBeneficio } from "./uniformes.ts";
import type { Producto } from "./tipos.ts";

const pieza = (id: string, vertical: string, talla: string | null, stock: number, activo = true): Producto => ({ id, vertical: { id: vertical, nombre: "V" }, nombre: "Pieza", talla, precio: "350.00", stock, activo });
const productos = [pieza("a", "v1", "6", 3), pieza("b", "v1", "8", 0), pieza("c", "v2", "6", 5), pieza("d", "v1", "6", 2, false)];
const alumno = (talla: string | null) => ({ id: "x", nombre: "N", apellidos: "A", talla_uniforme: talla });

test("a un beneficio sin producto fijo le tocan las piezas activas de SU disciplina y de la talla del alumno", () => {
  assert.deepEqual(piezasDeUnBeneficio({ producto_id: null, vertical_id: "v1", alumno: alumno("6") }, productos).map((p) => p.id), ["a"]);
  assert.deepEqual(piezasDeUnBeneficio({ producto_id: null, vertical_id: "v1", alumno: alumno(null) }, productos).map((p) => p.id), ["a", "b"], "sin talla registrada, cualquiera de la disciplina");
  assert.deepEqual(piezasDeUnBeneficio({ producto_id: null, vertical_id: "v1", alumno: alumno(null) }, productos, true).map((p) => p.id), ["a"], "solo las que tienen existencia");
  assert.deepEqual(piezasDeUnBeneficio({ producto_id: null, alumno: alumno("6") }, productos).map((p) => p.id), ["a", "c"], "sin disciplina conocida no se filtra por ella");
});

test("un beneficio que fija el producto solo mira ese producto", () => {
  assert.deepEqual(piezasDeUnBeneficio({ producto_id: "c", vertical_id: "v1", alumno: alumno("8") }, productos).map((p) => p.id), ["c"]);
});

test("la existencia suma las piezas que le tocan; sin inventario o con el producto fijo fuera de los activos no se sabe", () => {
  assert.equal(existenciaDe({ producto_id: null, vertical_id: "v1", alumno: alumno("6") }, productos), 3);
  assert.equal(existenciaDe({ producto_id: null, vertical_id: "v1", alumno: alumno("8") }, productos), 0);
  assert.equal(existenciaDe({ producto_id: null, vertical_id: "v3", alumno: alumno("6") }, productos), 0);
  assert.equal(existenciaDe({ producto_id: null, vertical_id: "v1", alumno: alumno("6") }, null), null);
  assert.equal(existenciaDe({ producto_id: "d", vertical_id: "v1", alumno: alumno("6") }, productos), null);
});

test("los textos de existencia", () => {
  assert.equal(textoDeExistencia(0), "Sin existencia: pide más piezas");
  assert.equal(textoDeExistencia(1), "Queda 1 en existencia");
  assert.equal(textoDeExistencia(3), "Quedan 3 en existencia");
});

test("el título lleva la pieza y la talla; sin talla, solo el nombre", () => {
  assert.equal(tituloDelBeneficio({ descripcion: "Uniforme de bienvenida", alumno: alumno("6") }), "Uniforme de bienvenida · talla 6");
  assert.equal(tituloDelBeneficio({ descripcion: null, alumno: alumno(null) }), "Producto");
  assert.equal(tituloDelBeneficio({ descripcion: "Uniforme", alumno: alumno("6"), producto: { nombre: "Leotardo", talla: "8" } }), "Leotardo · talla 8");
});

test("el origen dice cuándo se pagó la primera mensualidad", () => {
  assert.equal(origenDelBeneficio("2026-10-08T15:00:00Z", "2026-10-11"), "Primera mensualidad pagada el 8 de octubre");
  assert.equal(origenDelBeneficio(null, "2026-10-11"), "Primera mensualidad pagada");
});

test("cuándo se entregó: hace un momento, hoy, ayer o el día", () => {
  const ahora = new Date(2026, 9, 11, 12, 0, 0);
  const antes = (min: number) => new Date(ahora.getTime() - min * 60_000).toISOString();
  assert.equal(cuandoSeEntrego(antes(1), "Rocío Méndez", ahora), "Entregado hace un momento por Rocío Méndez");
  assert.equal(cuandoSeEntrego(antes(90), "Rocío Méndez", ahora), "Entregado hoy por Rocío Méndez");
  assert.equal(cuandoSeEntrego(new Date(2026, 9, 10, 18, 0, 0).toISOString(), null, ahora), "Entregado ayer");
  assert.equal(cuandoSeEntrego(new Date(2026, 9, 2, 9, 0, 0).toISOString(), "Ana", ahora), "Entregado el 2 de octubre por Ana");
  assert.equal(cuandoSeEntrego(null, null, ahora), "Entregado");
});
