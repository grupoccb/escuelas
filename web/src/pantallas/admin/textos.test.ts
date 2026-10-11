import assert from "node:assert/strict";
import { test } from "node:test";
import { hayCambioDeTexto, resumenDeTexto, revisarHuecos, tituloDeTexto, vistaPrevia } from "./textos.ts";

test("la vista previa llena los huecos con datos de ejemplo y deja vacío el que no conoce", () => {
  assert.equal(vistaPrevia("Mucho gusto. ¿Qué edad tiene {nombre}?"), "Mucho gusto. ¿Qué edad tiene Sofía?");
  assert.equal(vistaPrevia("Responde con el número:\n{lista}"), "Responde con el número:\n1. Primera opción\n2. Segunda opción");
  assert.equal(vistaPrevia("Hola {inventado}."), "Hola .");
});

test("se avisa de los huecos que sobran y de los obligatorios que faltan", () => {
  assert.deepEqual(revisarHuecos("Hola {nombre} {edad}", ["nombre"], []), { sobran: ["edad"], faltan: [] });
  assert.deepEqual(revisarHuecos("Elige una", ["lista"], ["lista"]), { sobran: [], faltan: ["lista"] });
  assert.deepEqual(revisarHuecos("Elige:\n{lista}", ["lista"], ["lista"]), { sobran: [], faltan: [] });
});

test("el nombre de cada paso sale de su clave, y el resumen de la lista cabe en una línea", () => {
  assert.equal(tituloDeTexto("saludo"), "Saludo");
  assert.equal(tituloDeTexto("pregunta_edad"), "Pregunta edad");
  assert.equal(tituloDeTexto("ofrecer_otras_sucursales"), "Ofrecer otras sucursales");
  assert.equal(tituloDeTexto("cotizacion_vencida"), "Cotización vencida");
  assert.equal(tituloDeTexto("pidio_asesor"), "Pidió asesor");
  assert.equal(resumenDeTexto("Responde con el número:\n{lista}"), "Responde con el número: {lista}");
  const largo = resumenDeTexto("a".repeat(200), 90);
  assert.equal(largo.length, 90);
  assert.ok(largo.endsWith("…"));
});

test("un texto cambió solo si se escribió algo distinto (los espacios de las orillas no cuentan)", () => {
  assert.equal(hayCambioDeTexto("Hola", "Hola"), false);
  assert.equal(hayCambioDeTexto("  Hola \n", "Hola"), false);
  assert.equal(hayCambioDeTexto("Hola a todos", "Hola"), true);
});
