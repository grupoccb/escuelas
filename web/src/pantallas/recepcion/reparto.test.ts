import { test } from "node:test";
import assert from "node:assert/strict";
import { claveNueva, claveParaEnvio, firmaDelPago, mensajeDeCaptura, validarReparto } from "./reparto.ts";
import { pareceTelefono, soloTelefono } from "./telefono.ts";

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

test("un importe absurdo dice QUÉ hacer (V7): negativo, cero, letras, decimales de más, comas mal puestas y números enormes; uno bueno no dice nada", () => {
  assert.equal(mensajeDeCaptura(""), undefined);
  assert.equal(mensajeDeCaptura("1,250.50"), undefined);
  assert.match(mensajeDeCaptura("-50") ?? "", /no puede ser negativo/);
  assert.match(mensajeDeCaptura("0") ?? "", /mayor que cero/);
  assert.match(mensajeDeCaptura("abc") ?? "", /solo números/);
  assert.match(mensajeDeCaptura("12.345") ?? "", /dos decimales/);
  assert.match(mensajeDeCaptura("100,50") ?? "", /punto/);
  assert.match(mensajeDeCaptura("99999999999") ?? "", /demasiado grande/);
  // Todos empiezan con la frase que ya conocía la prueba de la pantalla, salvo el cero, que tiene la suya.
  for (const malo of ["-50", "abc", "12.345", "100,50", "99999999999"]) assert.match(mensajeDeCaptura(malo) ?? "", /^Escribe un importe válido/);
});

test("en el reparto a mano, el importe malo de un cargo también dice qué hacer", () => {
  const r = validarReparto("100.00", cargos, { a: "100,50" });
  assert.match(r.errores["a"] ?? "", /punto/);
});

test("un teléfono: con 7 o más dígitos se busca como teléfono; con menos, solo dígitos, se dice que está incompleto en lugar de buscarlo como nombre", () => {
  assert.equal(pareceTelefono("(55) 5501 0101"), true);
  assert.equal(pareceTelefono("+52 1 55 5501 0101"), true);
  assert.equal(soloTelefono("553099"), true);
  assert.equal(pareceTelefono("553099"), false);
  assert.equal(soloTelefono("Lucía 55"), false);
  assert.equal(soloTelefono("ANGEL"), false);
});
