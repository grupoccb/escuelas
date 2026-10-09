// H1: las reglas PURAS de los cargos — qué se cobra al inscribir, cuándo vence, cuánto vale cada mensualidad y qué estatus se ve.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deTexto } from "../lib/dinero.ts";
import { descuentoDeMensualidad, diasDeAtraso, estatusEfectivo, planAlInscribir, planDeMensualidad, saldoDe, vencimientoDeMensualidad, type InscripcionParaCargos } from "./cargos.ts";

const base: InscripcionParaCargos = {
  fechaInscripcion: "2026-11-10",
  fechaInicio: "2026-11-10",
  diaCorte: 10,
  precioInscripcion: deTexto("500.00"),
  precioMensualidad: deTexto("1000.00"),
  descuentoInscripcion: 0n,
  descuentoMensualidad: 0n,
  mesesGratis: 0,
  mesesPagadosPorAdelantado: 0,
};

test("al inscribir nacen el cargo de inscripción y la primera mensualidad, con el precio de lista y sus descuentos exactos", () => {
  const p = planAlInscribir({ ...base, descuentoInscripcion: deTexto("500.00"), descuentoMensualidad: deTexto("185.18") });
  assert.equal(p.length, 2);
  assert.deepEqual([p[0]!.concepto, p[0]!.periodo, p[0]!.monto, p[0]!.descuento, p[0]!.fechaVencimiento], ["inscripcion", null, 50000n, 50000n, "2026-11-10"]);
  assert.deepEqual([p[1]!.concepto, p[1]!.periodo, p[1]!.monto, p[1]!.descuento, p[1]!.fechaVencimiento], ["mensualidad", "2026-11", 100000n, 18518n, "2026-11-10"]);
});

test("el descuento nunca pasa del monto (aunque la inscripción traiga un dato absurdo)", () => {
  const p = planAlInscribir({ ...base, descuentoInscripcion: deTexto("900.00"), descuentoMensualidad: deTexto("5000.00") });
  assert.equal(p[0]!.descuento, 50000n);
  assert.equal(p[1]!.descuento, 100000n);
});

test("los meses gratis condonan por completo las primeras n mensualidades y el descuento fijo rige en las demás", () => {
  assert.equal(descuentoDeMensualidad(100000n, 15000n, 2, 0), 100000n);
  assert.equal(descuentoDeMensualidad(100000n, 15000n, 2, 1), 100000n);
  assert.equal(descuentoDeMensualidad(100000n, 15000n, 2, 2), 15000n);
  assert.equal(descuentoDeMensualidad(100000n, 0n, 0, 0), 0n);
  const p = planAlInscribir({ ...base, mesesGratis: 1, descuentoMensualidad: 15000n });
  assert.equal(p[1]!.descuento, 100000n, "la primera mensualidad es la gratis");
});

test("el vencimiento de la mensualidad es el día de corte del periodo, con la regla del fin de mes", () => {
  assert.equal(vencimientoDeMensualidad(5, "2026-11"), "2026-11-05");
  assert.equal(vencimientoDeMensualidad(31, "2026-11"), "2026-11-30");
  assert.equal(vencimientoDeMensualidad(31, "2027-02"), "2027-02-28");
  assert.equal(vencimientoDeMensualidad(30, "2028-02"), "2028-02-29");
  assert.equal(vencimientoDeMensualidad(31, "2026-12"), "2026-12-31");
});

test("la primera mensualidad no vence antes del día en que se inscribió", () => {
  const p = planAlInscribir({ ...base, fechaInscripcion: "2026-11-20", fechaInicio: "2026-11-20", diaCorte: 5 });
  assert.equal(p[1]!.fechaVencimiento, "2026-11-20", "el corte del día 5 ya pasó: vence al inscribirse");
  const futura = planAlInscribir({ ...base, fechaInscripcion: "2026-11-20", fechaInicio: "2026-12-03", diaCorte: 3 });
  assert.deepEqual([futura[1]!.periodo, futura[1]!.fechaVencimiento], ["2026-12", "2026-12-03"], "empieza el mes siguiente: su periodo y su corte");
});

test("los meses pagados por adelantado generan esas mensualidades, todas con vencimiento el día de la inscripción, cruzando de año", () => {
  const p = planAlInscribir({ ...base, fechaInscripcion: "2026-11-20", fechaInicio: "2026-11-20", mesesPagadosPorAdelantado: 3, mesesGratis: 1 });
  assert.deepEqual(p.slice(1).map((x) => x.periodo), ["2026-11", "2026-12", "2027-01"]);
  assert.ok(p.slice(1).every((x) => x.fechaVencimiento === "2026-11-20"));
  assert.deepEqual(p.slice(1).map((x) => x.descuento), [100000n, 0n, 0n], "el mes gratis es el primero");
});

test("planDeMensualidad: el índice decide cuál es el mes gratis", () => {
  assert.equal(planDeMensualidad({ ...base, mesesGratis: 2 }, "2027-01", 1, "2027-01-10").descuento, 100000n);
  assert.equal(planDeMensualidad({ ...base, mesesGratis: 2 }, "2027-02", 2, "2027-02-10").descuento, 0n);
});

test("saldo y estatus efectivo: vencido se deriva de la fecha solo si sigue pendiente", () => {
  assert.equal(saldoDe(100000n, 25050n), 74950n);
  assert.equal(estatusEfectivo("pendiente", "2026-11-09", "2026-11-10"), "vencido");
  assert.equal(estatusEfectivo("pendiente", "2026-11-10", "2026-11-10"), "pendiente", "vence hoy: aún no está vencido");
  assert.equal(estatusEfectivo("pagado", "2026-01-01", "2026-11-10"), "pagado");
  assert.equal(estatusEfectivo("cancelado", "2026-01-01", "2026-11-10"), "cancelado");
  assert.equal(estatusEfectivo("vencido", "2026-11-12", "2026-11-10"), "vencido");
});

test("diasDeAtraso nunca es negativo", () => {
  assert.equal(diasDeAtraso("2026-11-01", "2026-11-10"), 9);
  assert.equal(diasDeAtraso("2026-11-10", "2026-11-10"), 0);
  assert.equal(diasDeAtraso("2026-11-20", "2026-11-10"), 0);
});
