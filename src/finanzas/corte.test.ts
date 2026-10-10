import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularCorte, presentarCorte, type PagoParaCorte } from "./corte.ts";
import { limitesDelDia } from "../mensajeria/reglas.ts";

// El día 9 de octubre de 2026 en Ciudad de México (UTC−6, sin horario de verano desde 2022).
const DIA = limitesDelDia("2026-10-09", "America/Mexico_City");
const rita = { id: "u-rita", nombre: "Rita" };
const beto = { id: "u-beto", nombre: "Beto" };
let n = 0;
const pago = (monto: bigint, metodo: PagoParaCorte["metodo"], creado: string, o: Partial<PagoParaCorte> = {}): PagoParaCorte => ({
  id: `p${++n}`,
  monto,
  metodo,
  referencia: null,
  creado_en: new Date(creado),
  cancelado_en: null,
  motivo_cancelacion: null,
  familia: "Familia",
  registrado_por: rita,
  cancelado_por: null,
  ...o,
});

test("limitesDelDia: el día de la sucursal en su zona, de medianoche a medianoche (también el día de 23 horas del cambio de horario)", () => {
  assert.equal(DIA.desde.toISOString(), "2026-10-09T06:00:00.000Z");
  assert.equal(DIA.hasta.toISOString(), "2026-10-10T06:00:00.000Z");
  const nueva = limitesDelDia("2026-03-08", "America/New_York"); // un día de 23 horas
  assert.equal((nueva.hasta.getTime() - nueva.desde.getTime()) / 3_600_000, 23);
});

test("lo cobrado se agrupa por quien lo registró y por forma de pago, al centavo", () => {
  const c = calcularCorte(
    [
      pago(150_000n, "efectivo", "2026-10-09T15:00:00Z"),
      pago(123_456n, "efectivo", "2026-10-09T16:00:00Z"),
      pago(99_999n, "tarjeta", "2026-10-09T17:00:00Z", { registrado_por: beto }),
      pago(1n, "transferencia", "2026-10-09T18:00:00Z", { registrado_por: beto }),
    ],
    DIA,
  );
  const t = presentarCorte(c);
  assert.equal(t.cobrado.efectivo, "2734.56");
  assert.equal(t.cobrado.tarjeta, "999.99");
  assert.equal(t.cobrado.transferencia, "0.01");
  assert.equal(t.cobrado.total, "3734.56");
  assert.equal(t.cobrado.pagos, 4);
  assert.deepEqual(t.cajas.map((x) => [x.usuario?.nombre, x.cobrado.total]), [["Beto", "1000.00"], ["Rita", "2734.56"]]);
  assert.equal(t.neto.total, t.cobrado.total);
});

test("fuera del día no cuenta: un segundo antes de empezar y el primer instante del día siguiente", () => {
  const c = calcularCorte([pago(100n, "efectivo", "2026-10-09T05:59:59Z"), pago(200n, "efectivo", "2026-10-09T06:00:00Z"), pago(400n, "efectivo", "2026-10-10T05:59:59Z"), pago(800n, "efectivo", "2026-10-10T06:00:00Z")], DIA);
  assert.equal(presentarCorte(c).cobrado.efectivo, "6.00");
});

test("un pago registrado y cancelado el mismo día no se cobró: sale en los cancelados y no en el neto", () => {
  const c = calcularCorte([pago(50_000n, "efectivo", "2026-10-09T15:00:00Z", { cancelado_en: new Date("2026-10-09T16:00:00Z"), cancelado_por: rita, motivo_cancelacion: "Cobré de más" }), pago(30_000n, "efectivo", "2026-10-09T17:00:00Z")], DIA);
  const t = presentarCorte(c);
  assert.equal(t.cobrado.efectivo, "300.00");
  assert.equal(t.devoluciones.efectivo, "0.00");
  assert.equal(t.neto.efectivo, "300.00");
  assert.equal(t.cancelados.length, 1);
  assert.equal(t.cancelados[0]?.de_otro_dia, false);
  assert.equal(t.cancelados[0]?.motivo, "Cobré de más");
});

test("un pago de ayer cancelado hoy es una devolución: no estaba en el cobrado de hoy y se resta del neto, por forma de pago", () => {
  const c = calcularCorte(
    [
      pago(80_000n, "efectivo", "2026-10-08T17:00:00Z", { cancelado_en: new Date("2026-10-09T18:00:00Z"), cancelado_por: rita, motivo_cancelacion: "Era de otra familia" }),
      pago(25_000n, "tarjeta", "2026-10-08T17:00:00Z", { cancelado_en: new Date("2026-10-09T19:00:00Z"), cancelado_por: rita, motivo_cancelacion: "Doble cobro" }),
      pago(100_000n, "efectivo", "2026-10-09T20:00:00Z"),
    ],
    DIA,
  );
  const t = presentarCorte(c);
  assert.equal(t.cobrado.efectivo, "1000.00");
  assert.equal(t.devoluciones.efectivo, "800.00");
  assert.equal(t.devoluciones.tarjeta, "250.00");
  assert.equal(t.neto.efectivo, "200.00");
  assert.equal(t.neto.tarjeta, "-250.00");
  assert.equal(t.neto.total, "-50.00");
  assert.equal(t.cancelados.filter((x) => x.de_otro_dia).length, 2);
});

test("al mirar un día pasado, un pago cancelado DESPUÉS de ese día sí contaba ese día", () => {
  const c = calcularCorte([pago(70_000n, "efectivo", "2026-10-09T15:00:00Z", { cancelado_en: new Date("2026-10-12T15:00:00Z") })], DIA);
  const t = presentarCorte(c);
  assert.equal(t.cobrado.efectivo, "700.00");
  assert.equal(t.cancelados.length, 0);
});

test("sin movimientos: todo en cero y sin cajas", () => {
  const t = presentarCorte(calcularCorte([], DIA));
  assert.equal(t.cobrado.total, "0.00");
  assert.equal(t.neto.efectivo, "0.00");
  assert.deepEqual(t.cajas, []);
  assert.deepEqual(t.pagos, []);
});
