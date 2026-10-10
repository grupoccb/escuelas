import assert from "node:assert/strict";
import { test } from "node:test";
import { banderasDe, nombreCompleto, textoDeAntiguedad, textoDeElegibilidad, textoLegible } from "./vista.ts";

test("la antigüedad se dice en años y meses, o en días si es menos de un mes", () => {
  assert.equal(textoDeAntiguedad(null), "—");
  assert.equal(textoDeAntiguedad({ dias: 1, meses: 0 }), "1 día");
  assert.equal(textoDeAntiguedad({ dias: 20, meses: 0 }), "20 días");
  assert.equal(textoDeAntiguedad({ dias: 45, meses: 1 }), "1 mes");
  assert.equal(textoDeAntiguedad({ dias: 400, meses: 13 }), "1 año y 1 mes");
  assert.equal(textoDeAntiguedad({ dias: 730, meses: 24 }), "2 años");
  assert.equal(textoDeAntiguedad({ dias: 1000, meses: 33 }), "2 años y 9 meses");
});

test("las banderas se dicen en palabras y solo las que están encendidas", () => {
  assert.deepEqual(banderasDe({ es_responsable_pago: true, es_contacto_urgencia: false, puede_recoger: true, lo_lleva: false }), ["Responsable de pago", "Puede recogerlo"]);
  assert.deepEqual(banderasDe({ es_responsable_pago: false, es_contacto_urgencia: false, puede_recoger: false, lo_lleva: false }), []);
});

test("el nombre completo omite los apellidos ausentes", () => {
  assert.equal(nombreCompleto({ nombre: "Rosa", apellidos: null }), "Rosa");
  assert.equal(nombreCompleto({ nombre: "Rosa", apellidos: "Gómez" }), "Rosa Gómez");
});

test("la elegibilidad dice cuántas clases faltan, en singular y plural", () => {
  assert.equal(textoDeElegibilidad({ elegible: true, clases_cumplidas: 12, clases_requeridas: 10, faltan: 0 }), "Elegible (12 de 10 clases)");
  assert.equal(textoDeElegibilidad({ elegible: false, clases_cumplidas: 9, clases_requeridas: 10, faltan: 1 }), "Le faltan 1 clase (9 de 10)");
  assert.equal(textoDeElegibilidad({ elegible: false, clases_cumplidas: 3, clases_requeridas: 10, faltan: 7 }), "Le faltan 7 clases (3 de 10)");
});

test("un código de la API se dice en palabras", () => {
  assert.equal(textoLegible("no_asistio"), "No asistió");
  assert.equal(textoLegible("aprobado"), "Aprobado");
});
