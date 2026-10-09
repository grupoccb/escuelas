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

// ── EH-08: cargos contra el precio congelado, y reglas que el resto de la cuadratura cubría por redundancia ───────────────────────────────

/** Una inscripción con precio de lista 1000.00 de mensualidad (descuento fijo 150.00) y 500.00 de inscripción (sin descuento), con sus tres cargos. */
function conInscripcion(): DatosParaCuadratura {
  return {
    cargos: [
      { id: "i1", tutorId: "t1", ventaId: null, montoFinal: 50000n, montoPagado: 0n, estatus: "pendiente", concepto: "inscripcion", inscripcionId: "n1", periodo: null, monto: 50000n, descuento: 0n },
      { id: "m1", tutorId: "t1", ventaId: null, montoFinal: 85000n, montoPagado: 0n, estatus: "pendiente", concepto: "mensualidad", inscripcionId: "n1", periodo: "2026-11", monto: 100000n, descuento: 15000n },
      { id: "m2", tutorId: "t1", ventaId: null, montoFinal: 0n, montoPagado: 0n, estatus: "pagado", concepto: "mensualidad", inscripcionId: "n1", periodo: "2026-12", monto: 100000n, descuento: 100000n },
    ],
    inscripciones: [{ id: "n1", precioInscripcion: 50000n, precioMensualidad: 100000n, descuentoInscripcion: 0n, descuentoMensualidad: 15000n }],
    pagos: [],
    aplicaciones: [],
    ventas: [],
    productos: [],
  };
}

test("EH-08: un cargo que cobra lo que la inscripción congeló cuadra (descuento fijo y mes gratis incluidos)", () => {
  assert.deepEqual(calcularCuadratura(conInscripcion()).discrepancias, []);
});

test("EH-08: atrapa un cargo de mensualidad o de inscripción con monto distinto del precio congelado", () => {
  const a = conInscripcion();
  a.cargos[1]!.monto = 90000n;
  a.cargos[1]!.montoFinal = 75000n; // sigue siendo coherente consigo mismo: solo el precio congelado lo delata
  assert.deepEqual(reglas(a), ["cargo_igual_al_precio_congelado"]);
  const b = conInscripcion();
  b.cargos[0]!.monto = 55000n;
  b.cargos[0]!.montoFinal = 55000n;
  assert.deepEqual(reglas(b), ["cargo_igual_al_precio_congelado"]);
});

test("EH-08: atrapa un descuento que no es el congelado (ni mes gratis), y que un cargo de inscripción lleve mes gratis", () => {
  const a = conInscripcion();
  a.cargos[1]!.descuento = 20000n;
  a.cargos[1]!.montoFinal = 80000n;
  assert.deepEqual(reglas(a), ["cargo_igual_al_precio_congelado"]);
  const b = conInscripcion();
  b.cargos[0]!.descuento = 50000n;
  b.cargos[0]!.montoFinal = 0n;
  b.cargos[0]!.estatus = "pagado";
  assert.deepEqual(reglas(b), ["cargo_igual_al_precio_congelado"]);
});

test("EH-08: atrapa dos cargos de la misma inscripción y periodo (lo que un soft-delete le escondería al único parcial) y un cargo de una inscripción que no existe", () => {
  const a = conInscripcion();
  a.cargos.push({ ...a.cargos[1]!, id: "m1b" });
  assert.deepEqual(reglas(a), ["cargo_igual_al_precio_congelado"]);
  const b = conInscripcion();
  b.inscripciones = [];
  assert.deepEqual(reglas(b), ["cargo_igual_al_precio_congelado"]);
  // Sin los datos de las inscripciones la regla no corre.
  const c = conInscripcion();
  delete c.inscripciones;
  assert.deepEqual(reglas(c), []);
});

test("un pago aplicado que cubre MENOS que su monto se atrapa por sí mismo, aunque otro pago exagerado compense la suma global", () => {
  const d: DatosParaCuadratura = {
    cargos: [
      { id: "c1", tutorId: "t1", ventaId: null, montoFinal: 20000n, montoPagado: 6000n, estatus: "pendiente" },
      { id: "c2", tutorId: "t1", ventaId: null, montoFinal: 20000n, montoPagado: 9000n, estatus: "pendiente" },
    ],
    pagos: [
      { id: "pA", tutorId: "t1", monto: 10000n, montoAplicado: 6000n, estatus: "aplicado" }, // dice cubrir 100.00 y cubre 60.00
      { id: "pB", tutorId: "t1", monto: 5000n, montoAplicado: 9000n, estatus: "aplicado" }, // cubre 90.00 con 50.00 (aplicado de más)
    ],
    aplicaciones: [
      { id: "a1", pagoId: "pA", cargoId: "c1", monto: 6000n, estatus: "aplicada" },
      { id: "a2", pagoId: "pB", cargoId: "c2", monto: 9000n, estatus: "aplicada" },
    ],
    ventas: [],
    productos: [],
  };
  const r = calcularCuadratura(d);
  assert.equal(r.discrepancias.some((x) => x.regla === "pagos_aplicados_igual_aplicaciones" && x.id === "pA" && /debe cubrir su monto/.test(x.detalle)), true, "pA");
  assert.equal(r.discrepancias.some((x) => x.id === "pB"), true, "pB");
});

test("una aplicación revertida de un pago que NO está cancelado se atrapa", () => {
  const d = sano();
  d.aplicaciones.push({ id: "a3", pagoId: "p1", cargoId: "c1", monto: 100n, estatus: "revertida" });
  assert.equal(calcularCuadratura(d).discrepancias.some((x) => x.id === "a3" && /revertida de un pago que no está cancelado/.test(x.detalle)), true);
});
