import { test } from "node:test";
import assert from "node:assert/strict";
import { claveDeSalon, nombreDeSalon, salonesRepetidosPorForma } from "./salones.ts";

test("EC-05: el nombre se guarda sin espacios de más (extremos, internos, tabuladores y saltos de línea)", () => {
  assert.equal(nombreDeSalon("  Salón   A \n"), "Salón A");
  assert.equal(nombreDeSalon("Salón\tA"), "Salón A");
  assert.equal(nombreDeSalon("Salón A"), "Salón A");
});

test("EC-05: la clave ignora mayúsculas, acentos y espacios; distingue salones de verdad distintos", () => {
  const mismo = ["Salón A", "salón a", "SALÓN A", "Salón  A", "Salon A", " salon\tA\n", "SALÓN A".normalize("NFD")];
  for (const n of mismo) assert.equal(claveDeSalon(n), "salon a", JSON.stringify(n));
  for (const otro of ["Salón B", "Salón AA", "Salón 1", "Salones A"]) assert.notEqual(claveDeSalon(otro), "salon a", otro);
  assert.equal(claveDeSalon("Ñandú"), "nandu", "la eñe también pierde su marca: es un criterio de comparación, no de almacenamiento");
});

test("EC-05: salonesRepetidosPorForma agrupa por sucursal y por clave, y no mezcla sucursales", () => {
  const r = salonesRepetidosPorForma([
    { id: "3", sucursalId: "s1", nombre: "Salón A" },
    { id: "1", sucursalId: "s1", nombre: "salón a" },
    { id: "2", sucursalId: "s1", nombre: "Salón B" },
    { id: "4", sucursalId: "s2", nombre: "Salón A" },
  ]);
  assert.deepEqual(r, [{ sucursalId: "s1", clave: "salon a", ids: ["1", "3"] }]);
  assert.deepEqual(salonesRepetidosPorForma([]), []);
});

test("V10 / EF-18: los caracteres invisibles (ancho cero, guion suave, controles bidireccionales, rellenos Hangul) no cuentan: ni se guardan ni distinguen salones", () => {
  const visible = "Sala Uno";
  for (const n of ["Sala\u200B Uno", "Sala\u00AD Uno", "Sala\u200D Uno", "\u202ESala Uno", "Sala\u3164 Uno", "Sala\uFFA0 Uno", "Sala\u115F\u1160 Uno", "Sala \u2060Uno\uFEFF"]) {
    assert.equal(nombreDeSalon(n), visible, JSON.stringify(n));
    assert.equal(claveDeSalon(n), "sala uno", JSON.stringify(n));
  }
  assert.equal(nombreDeSalon("\u200B\u200B"), "", "solo invisibles queda vacío (la API lo rechaza como nombre vacío)");
});
