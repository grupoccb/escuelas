import { test } from "node:test";
import assert from "node:assert/strict";
import { atajosDeMonto, cargosAbiertos, cargosPorHijo, claveNueva, claveParaEnvio, coberturaDeCargo, detalleDelRecibo, firmaDelPago, folioDePago, mensajeDeCaptura, mensajeDeExceso, textoDeCobertura, validarReparto } from "./reparto.ts";
import type { CargoDeCuenta, EstadoDeCuenta } from "./tipos.ts";
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

// ─── R4a ───

const cargo = (id: string, saldo: string, vence: string, extra: Partial<CargoDeCuenta> = {}): CargoDeCuenta => ({ id, inscripcion_id: null, concepto: "mensualidad", periodo: null, descripcion: null, monto_final: saldo, monto_pagado: "0.00", saldo, fecha_vencimiento: vence, estatus: "pendiente", estatus_efectivo: "pendiente", dias_de_atraso: 0, ...extra });
const cero = { total_cargado: "0.00", total_pagado: "0.00", saldo: "0.00", vencido: "0.00", antiguedad: { de_0_a_30: "0.00", de_31_a_60: "0.00", de_61_a_90: "0.00", mas_de_90: "0.00" } };
const hijo = (id: string, nombre: string, cargos: CargoDeCuenta[]) => ({ ...cero, alumno: { id, nombre, apellidos: "X" }, cargos });
const estado = { hijos: [hijo("a", "Ana", [cargo("a2", "650.00", "2026-10-15"), cargo("a1", "650.00", "2026-09-15", { estatus_efectivo: "vencido", dias_de_atraso: 27 }), cargo("a0", "0.00", "2026-08-15", { estatus: "pagado" })]), hijo("b", "Beto", [cargo("b1", "780.00", "2026-10-15", { estatus: "cancelado" })]), hijo("c", "Cata", [cargo("c1", "320.50", "2026-09-30")])] } as Pick<EstadoDeCuenta, "hijos">;

test("los cargos con saldo se agrupan por hijo, el que venció antes primero, sin pagados ni cancelados ni hijos sin deuda", () => {
  const g = cargosPorHijo(estado);
  assert.deepEqual(g.map((x) => [x.alumno.nombre, x.cargos.map((c) => c.id)]), [["Ana", ["a1", "a2"]], ["Cata", ["c1"]]]);
  assert.deepEqual(cargosAbiertos(estado).map((x) => `${x.hijo}:${x.cargo.id}`), ["Ana:a1", "Cata:c1", "Ana:a2"]);
});

test("la cobertura de un cargo: total, parcial o ninguna, en centavos exactos y con el porcentaje entero de la barra", () => {
  assert.deepEqual(coberturaDeCargo("650.00", "650.00"), { estado: "total", aplica: "650.00", queda: "0.00", porcentaje: "100" });
  assert.deepEqual(coberturaDeCargo("650.00", "300.00"), { estado: "parcial", aplica: "300.00", queda: "350.00", porcentaje: "46" });
  assert.deepEqual(coberturaDeCargo("650.00", undefined), { estado: "ninguna", aplica: "0.00", queda: "650.00", porcentaje: "0" });
  assert.equal(coberturaDeCargo("650.00", "0.00").estado, "ninguna");
  // Un abono de un centavo llena al menos 1 %: la barra no se queda en blanco cuando el texto dice «se abonan».
  assert.equal(coberturaDeCargo("1000.00", "0.01").porcentaje, "1");
  // Lo que pasa del saldo no se sale de la barra.
  assert.equal(coberturaDeCargo("100.00", "150.00").estado, "total");
});

test("el renglón bajo la barra dice qué pasa con ese cargo", () => {
  const venc = { estatus_efectivo: "vencido", dias_de_atraso: 27 };
  const pend = { estatus_efectivo: "pendiente", dias_de_atraso: 0 };
  assert.equal(textoDeCobertura(coberturaDeCargo("650.00", "650.00"), venc), "Este pago lo cubre");
  assert.equal(textoDeCobertura(coberturaDeCargo("650.00", "300.00"), pend), "Se abonan $300.00; quedan $350.00");
  assert.equal(textoDeCobertura(coberturaDeCargo("650.00", undefined), venc), "Vencido 27 d");
  assert.equal(textoDeCobertura(coberturaDeCargo("650.00", undefined), pend), "Pendiente");
});

test("los atajos: «Todo el saldo» siempre que haya saldo y «Solo lo vencido» solo si hay vencido distinto del saldo", () => {
  assert.deepEqual(atajosDeMonto("2400.50", "650.00"), [{ clave: "todo", texto: "Todo el saldo", importe: "2400.50" }, { clave: "vencido", texto: "Solo lo vencido", importe: "650.00" }]);
  assert.deepEqual(atajosDeMonto("650.00", "650.00").map((a) => a.clave), ["todo"], "todo vencido: un solo atajo");
  assert.deepEqual(atajosDeMonto("650.00", "0.00").map((a) => a.clave), ["todo"], "nada vencido: un solo atajo");
  assert.deepEqual(atajosDeMonto("0.00", "0.00"), []);
});

test("un monto mayor al saldo se dice con la cifra; uno igual o menor, no", () => {
  assert.equal(mensajeDeExceso("4000.00", "3800.00"), "El monto es mayor que lo que adeuda ($3,800.00). Revisa la cantidad.");
  assert.equal(mensajeDeExceso("3800.00", "3800.00"), undefined);
  assert.equal(mensajeDeExceso("0.01", "3800.00"), undefined);
  assert.equal(mensajeDeExceso(null, "3800.00"), undefined);
});

test("el folio es el identificador abreviado y siempre el mismo", () => {
  assert.equal(folioDePago("3f9a12bc-1111-4222-8333-444455556666"), "P-3F9A12BC");
  assert.equal(folioDePago("3f9a12bc-1111-4222-8333-444455556666"), folioDePago("3f9a12bc-1111-4222-8333-444455556666"));
  assert.equal(detalleDelRecibo({ monto: "300.00", metodo: "Transferencia", referencia: "SPEI-1", id: "3f9a12bc-1111-4222-8333-444455556666" }), "$300.00 en transferencia · ref. SPEI-1 · folio P-3F9A12BC");
  assert.equal(detalleDelRecibo({ monto: "1500.00", metodo: "Efectivo", referencia: null, id: "3f9a12bc-1111-4222-8333-444455556666" }), "$1,500.00 en efectivo · folio P-3F9A12BC");
});
