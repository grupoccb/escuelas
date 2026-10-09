import assert from "node:assert/strict";
import { test } from "node:test";
import { OPCIONES_DE_BENEFICIO, opcionDe, textoDeBeneficio, valorDeBeneficio } from "./beneficios.ts";

test("cada tipo y modo de beneficio tiene su texto y no se repite", () => {
  assert.equal(new Set(OPCIONES_DE_BENEFICIO.map((o) => `${o.tipo}|${o.modo}`)).size, OPCIONES_DE_BENEFICIO.length);
  assert.equal(opcionDe("meses_gratis", "total")?.clave, "meses");
  assert.equal(opcionDe("descuento_inscripcion", "inexistente"), undefined);
});

test("un beneficio guardado se lee como lo diría una persona", () => {
  assert.equal(textoDeBeneficio({ tipo: "descuento_mensualidad", modo: "porcentaje", valor: "15.00", descripcion: null }), "Descuento en la mensualidad 15 %");
  assert.equal(textoDeBeneficio({ tipo: "descuento_inscripcion", modo: "monto_fijo", valor: "150.00", descripcion: null }), "Descuento en la inscripción $150.00");
  assert.equal(textoDeBeneficio({ tipo: "meses_gratis", modo: "total", valor: "2.00", descripcion: null }), "Meses gratis 2");
  assert.equal(textoDeBeneficio({ tipo: "producto_gratis", modo: "total", valor: null, descripcion: "Uniforme" }), "Producto gratis (Uniforme)");
});

test("el valor se valida según lo que da el beneficio, sin números flotantes", () => {
  assert.deepEqual(valorDeBeneficio("ninguno", "x"), { valor: null });
  assert.deepEqual(valorDeBeneficio("meses", "3"), { valor: "3" });
  for (const mal of ["0", "25", "1.5", "", "dos"]) assert.ok("error" in valorDeBeneficio("meses", mal), mal);
  assert.deepEqual(valorDeBeneficio("porcentaje", "12.5"), { valor: "12.5" });
  for (const mal of ["0", "100.01", "abc", "-5", ""]) assert.ok("error" in valorDeBeneficio("porcentaje", mal), mal);
  assert.deepEqual(valorDeBeneficio("monto", "$1,250.5"), { valor: "1250.50" });
  for (const mal of ["0", "0.00", "12.345", "abc", ""]) assert.ok("error" in valorDeBeneficio("monto", mal), mal);
});
