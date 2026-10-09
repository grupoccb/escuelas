// H7: la cuadratura atrapa cada tipo de descuadre (reglas puras sobre filas sintéticas). Dinero en centavos exactos.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularCuadratura, type DatosParaCuadratura } from "./cuadratura.ts";

/** Una familia: dos cargos de 1000.00 y 500.00; un pago de 1200.50 repartido 1000.00 + 200.50; una venta de 2 × 75.25 con su cargo. */
function sano(): DatosParaCuadratura {
  return {
    cargos: [
      { id: "c1", tutorId: "t1", ventaId: null, montoFinal: 100000n, montoPagado: 100000n, estatus: "pagado" },
      { id: "c2", tutorId: "t1", ventaId: null, montoFinal: 50000n, montoPagado: 20050n, estatus: "pendiente" },
      { id: "c3", tutorId: "t1", ventaId: "v1", montoFinal: 15050n, montoPagado: 0n, estatus: "vencido" },
      { id: "c4", tutorId: "t1", ventaId: null, montoFinal: 9900n, montoPagado: 0n, estatus: "cancelado" },
    ],
    pagos: [{ id: "p1", tutorId: "t1", monto: 120050n, montoAplicado: 120050n, estatus: "aplicado" }],
    aplicaciones: [
      { id: "a1", pagoId: "p1", cargoId: "c1", monto: 100000n, estatus: "aplicada" },
      { id: "a2", pagoId: "p1", cargoId: "c2", monto: 20050n, estatus: "aplicada" },
    ],
    ventas: [
      { id: "v1", estatus: "registrada", esPromocional: false, cantidad: 2, precioUnitario: 7525n },
      { id: "v2", estatus: "registrada", esPromocional: true, cantidad: 1, precioUnitario: 0n },
    ],
    productos: [{ id: "pr1", stock: 3 }],
  };
}
const reglas = (d: DatosParaCuadratura): string[] => [...new Set(calcularCuadratura(d).discrepancias.map((x) => x.regla))].sort();

test("un estado sano cuadra y el resumen está en centavos exactos", () => {
  const r = calcularCuadratura(sano());
  assert.deepEqual(r.discrepancias, []);
  assert.equal(r.ok, true);
  assert.deepEqual([r.resumen.totalCargado, r.resumen.totalPagado, r.resumen.saldoTotal], ["1650.50", "1200.50", "450.00"]);
});

test("atrapa un cargo cuyo monto_pagado no es la suma de sus aplicaciones, y un cargo sobrepagado", () => {
  const d = sano();
  d.cargos[1]!.montoPagado = 30050n;
  assert.deepEqual(reglas(d), ["saldo_de_cada_cargo"]);
  const e = sano();
  e.aplicaciones[1]!.monto = 60000n;
  e.cargos[1]!.montoPagado = 60000n;
  e.pagos[0]!.montoAplicado = 160000n;
  assert.ok(reglas(e).includes("saldo_de_cada_cargo"));
});

test("atrapa un pago que no cubre su monto, uno cancelado con aplicaciones vivas y una aplicación revertida de un pago no cancelado", () => {
  const d = sano();
  d.pagos[0]!.monto = 130000n;
  assert.ok(reglas(d).includes("pagos_aplicados_igual_aplicaciones"));
  const e = sano();
  e.pagos[0]!.estatus = "cancelado";
  e.pagos[0]!.montoAplicado = 0n;
  assert.ok(reglas(e).includes("pagos_aplicados_igual_aplicaciones"));
  const f = sano();
  f.aplicaciones[0]!.estatus = "revertida";
  assert.ok(reglas(f).length > 0);
});

test("atrapa estatus que mienten: pagado con saldo, pendiente sin saldo, cancelado con pagos", () => {
  const a = sano();
  a.cargos[1]!.estatus = "pagado";
  assert.ok(reglas(a).includes("estatus_coherente_con_el_saldo"));
  const b = sano();
  b.cargos[0]!.estatus = "pendiente";
  assert.ok(reglas(b).includes("estatus_coherente_con_el_saldo"));
  const c = sano();
  c.cargos[0]!.estatus = "cancelado";
  assert.ok(reglas(c).includes("estatus_coherente_con_el_saldo"));
});

test("un cargo sin importe (mes gratis) pagado con cero aplicaciones es correcto", () => {
  const d = sano();
  d.cargos.push({ id: "c5", tutorId: "t1", ventaId: null, montoFinal: 0n, montoPagado: 0n, estatus: "pagado" });
  assert.deepEqual(calcularCuadratura(d).discrepancias, []);
});

test("atrapa un pago aplicado a un cargo de otra familia", () => {
  const d = sano();
  d.cargos[1]!.tutorId = "t2";
  assert.ok(reglas(d).includes("aplicacion_de_la_misma_familia"));
});

test("atrapa aplicaciones vivas sobre un cargo cancelado (el estado de cuenta no cuadraría)", () => {
  const d = sano();
  d.cargos[0]!.estatus = "cancelado";
  assert.ok(reglas(d).includes("estado_de_cuenta_cuadra"));
});

test("ventas ↔ cargos: sin cargo, con otro monto, con dos, una anulada con cargo vivo y un cargo de venta inexistente", () => {
  const sin = sano();
  sin.cargos = sin.cargos.filter((c) => c.id !== "c3");
  assert.ok(reglas(sin).includes("ventas_y_cargos"));
  const otro = sano();
  otro.cargos[2]!.montoFinal = 15000n;
  assert.ok(reglas(otro).includes("ventas_y_cargos"));
  const dos = sano();
  dos.cargos.push({ id: "c6", tutorId: "t1", ventaId: "v1", montoFinal: 15050n, montoPagado: 0n, estatus: "pendiente" });
  assert.ok(reglas(dos).includes("ventas_y_cargos"));
  const anulada = sano();
  anulada.ventas[0]!.estatus = "anulada";
  assert.ok(reglas(anulada).includes("ventas_y_cargos"));
  const fantasma = sano();
  fantasma.cargos[3]!.estatus = "pendiente";
  fantasma.cargos[3]!.ventaId = "v-que-no-existe";
  assert.ok(reglas(fantasma).includes("ventas_y_cargos"));
  const promo = sano();
  promo.cargos.push({ id: "c7", tutorId: "t1", ventaId: "v2", montoFinal: 0n, montoPagado: 0n, estatus: "pagado" });
  assert.ok(reglas(promo).includes("ventas_y_cargos"), "una venta promocional no tiene cargo vivo");
});

test("atrapa el stock negativo", () => {
  const d = sano();
  d.productos[0]!.stock = -1;
  assert.deepEqual(reglas(d), ["stock_no_negativo"]);
});

test("el dinero es exacto: 0.1 + 0.2 centavos-exactos no deriva (miles de aplicaciones de $0.01 cuadran)", () => {
  const d: DatosParaCuadratura = { cargos: [{ id: "c", tutorId: "t", ventaId: null, montoFinal: 10000n, montoPagado: 10000n, estatus: "pagado" }], pagos: [], aplicaciones: [], ventas: [], productos: [] };
  for (let i = 0; i < 10000; i++) {
    d.pagos.push({ id: `p${i}`, tutorId: "t", monto: 1n, montoAplicado: 1n, estatus: "aplicado" });
    d.aplicaciones.push({ id: `a${i}`, pagoId: `p${i}`, cargoId: "c", monto: 1n, estatus: "aplicada" });
  }
  assert.deepEqual(calcularCuadratura(d).discrepancias, []);
});
