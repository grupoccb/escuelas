import { test } from "node:test";
import assert from "node:assert/strict";
import { claveNueva, claveParaEnvio, firmaDelPago, validarReparto } from "./reparto.ts";

const cargos = [
  { id: "a", saldo: "800.00" },
  { id: "b", saldo: "500.00" },
  { id: "c", saldo: "1000.00" },
];

test("un reparto a mano que suma EXACTAMENTE el pago es válido (y descarta los ceros)", () => {
  const r = validarReparto("1300.00", cargos, { a: "800", b: "500.00", c: "0" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.aplicaciones, [{ cargo_id: "a", monto: "800.00" }, { cargo_id: "b", monto: "500.00" }]);
  assert.equal(r.suma, "1300.00");
  assert.equal(r.diferencia, "0.00");
});

test("un centavo de diferencia no pasa: dice cuánto falta o sobra, con centavos exactos", () => {
  assert.equal(validarReparto("1300.00", cargos, { a: "800.00", b: "499.99" }).diferencia, "0.01");
  assert.equal(validarReparto("1300.00", cargos, { a: "800.00", b: "499.99" }).ok, false);
  assert.equal(validarReparto("1300.00", cargos, { a: "800.00", c: "500.01" }).diferencia, "-0.01");
  // 0.10 + 0.20 contra 0.30: en flotantes no cuadra; aquí sí.
  assert.equal(validarReparto("0.30", [{ id: "x", saldo: "1.00" }, { id: "y", saldo: "1.00" }], { x: "0.10", y: "0.20" }).ok, true);
});

test("ningún cargo recibe más que su saldo, y un importe inválido se marca en su cargo", () => {
  const r = validarReparto("900.00", cargos, { a: "900.00" });
  assert.equal(r.ok, false);
  assert.equal(r.errores["a"], "Pasa del saldo de este cargo");
  const s = validarReparto("100.00", cargos, { a: "cien", b: "1e2" });
  assert.deepEqual(Object.keys(s.errores).sort(), ["a", "b"]);
  assert.equal(validarReparto("100.00", cargos, {}).ok, false, "sin ningún importe no hay reparto");
});

test("la misma firma conserva la clave (doble clic o reintento no duplica); otra firma la cambia", () => {
  const f1 = firmaDelPago({ tutor_id: "t", monto: "500.00", metodo: "efectivo", referencia: "", fecha: "", aplicaciones: null });
  const k1 = claveParaEnvio(null, f1);
  assert.match(k1.clave, /^[A-Za-z0-9._:-]{8,120}$/);
  assert.equal(claveParaEnvio(k1, f1).clave, k1.clave);
  const f2 = firmaDelPago({ tutor_id: "t", monto: "500.01", metodo: "efectivo", referencia: "", fecha: "", aplicaciones: null });
  assert.notEqual(claveParaEnvio(k1, f2).clave, k1.clave);
  const orden1 = firmaDelPago({ tutor_id: "t", monto: "1.00", metodo: "efectivo", referencia: "", fecha: "", aplicaciones: [{ cargo_id: "a", monto: "0.50" }, { cargo_id: "b", monto: "0.50" }] });
  const orden2 = firmaDelPago({ tutor_id: "t", monto: "1.00", metodo: "efectivo", referencia: " ", fecha: "", aplicaciones: [{ cargo_id: "b", monto: "0.50" }, { cargo_id: "a", monto: "0.50" }] });
  assert.equal(orden1, orden2, "el orden del reparto y los espacios no cambian la identidad del pago");
  assert.notEqual(claveNueva(), claveNueva());
});
