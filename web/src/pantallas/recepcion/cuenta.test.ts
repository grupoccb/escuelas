import { test } from "node:test";
import assert from "node:assert/strict";
import { detalleDePago, estadoDeCargo, pagadoEnElAnio, pagoQueCubrio, textoDeAtraso, textoDePagos, tramoDeAtraso } from "./cuenta.ts";
import type { CargoDeCuenta, PagoDeCuenta } from "./tipos.ts";

const cargo = (o: Partial<CargoDeCuenta>): CargoDeCuenta => ({ id: "c1", inscripcion_id: null, concepto: "mensualidad", periodo: "2026-10", descripcion: null, monto_final: "650.00", monto_pagado: "0.00", saldo: "650.00", fecha_vencimiento: "2026-10-15", estatus: "pendiente", estatus_efectivo: "pendiente", dias_de_atraso: 0, ...o });
const pago = (o: Partial<PagoDeCuenta>): PagoDeCuenta => ({ id: "3f9a12bc-0000-4000-8000-000000000000", monto: "1430.00", monto_aplicado: "1430.00", metodo: "efectivo", referencia: null, fecha: "2026-08-12", estatus: "aplicado", aplicaciones: [], ...o });
const HOY = "2026-10-11";

test("los tramos de la antigüedad caen donde dice la API (30, 60 y 90 días)", () => {
  assert.equal(tramoDeAtraso(1).texto, "1 a 30 días");
  assert.equal(tramoDeAtraso(30).texto, "1 a 30 días");
  assert.equal(tramoDeAtraso(31).texto, "31 a 60 días");
  assert.equal(tramoDeAtraso(61).texto, "61 a 90 días");
  assert.equal(tramoDeAtraso(91).texto, "Más de 90 días");
});

test("el atraso es el del cargo vencido más viejo con saldo; sin vencidos no hay texto", () => {
  assert.equal(textoDeAtraso([cargo({}), cargo({ id: "c2", estatus_efectivo: "vencido", dias_de_atraso: 27 }), cargo({ id: "c3", estatus_efectivo: "vencido", dias_de_atraso: 40 })]), "40 días de atraso (31 a 60 días)");
  assert.equal(textoDeAtraso([cargo({ estatus_efectivo: "vencido", dias_de_atraso: 1 })]), "1 día de atraso (1 a 30 días)");
  assert.equal(textoDeAtraso([cargo({ estatus_efectivo: "vencido", dias_de_atraso: 9, saldo: "0.00" })]), null, "un cargo ya pagado no cuenta");
  assert.equal(textoDeAtraso([]), null);
});

test("lo pagado en el año suma en centavos exactos solo los pagos aplicados de ese año", () => {
  const r = pagadoEnElAnio(
    [pago({ monto: "0.10", fecha: "2026-01-02" }), pago({ monto: "0.20", fecha: "2026-03-04" }), pago({ monto: "900.00", fecha: "2026-05-06", estatus: "cancelado" }), pago({ monto: "5000.00", fecha: "2025-12-31" })],
    HOY,
  );
  assert.deepEqual(r, { anio: "2026", total: "0.30", pagos: 2 });
  assert.equal(pagadoEnElAnio([], HOY).total, "0.00");
  assert.equal(textoDePagos(0), "Ningún pago en el año");
  assert.equal(textoDePagos(1), "1 pago en el año");
  assert.equal(textoDePagos(6), "6 pagos en el año");
});

test("el pago que cubrió un cargo es el aplicado más reciente que lo toca; uno cancelado no cuenta", () => {
  const reciente = pago({ id: "a", fecha: "2026-09-01", aplicaciones: [{ cargo_id: "c1", monto: "650.00", estatus: "aplicado" }] });
  const viejo = pago({ id: "b", fecha: "2026-08-01", aplicaciones: [{ cargo_id: "c1", monto: "100.00", estatus: "aplicado" }] });
  const cancelado = pago({ id: "c", fecha: "2026-10-01", estatus: "cancelado", aplicaciones: [{ cargo_id: "c1", monto: "650.00", estatus: "cancelado" }] });
  assert.equal(pagoQueCubrio("c1", [cancelado, reciente, viejo])?.id, "a");
  assert.equal(pagoQueCubrio("otro", [reciente]), null);
});

test("el estado de un cargo: pagado con su folio, pendiente, vencido con sus días, abono y cancelado", () => {
  const p = pago({ fecha: "2026-08-12", aplicaciones: [{ cargo_id: "c1", monto: "650.00", estatus: "aplicado" }] });
  assert.deepEqual(estadoDeCargo(cargo({ saldo: "0.00", monto_pagado: "650.00", estatus: "pagado", estatus_efectivo: "pagado" }), [p], HOY), { tono: "exito", texto: "Pagado", detalle: "Pagada el 12 de agosto · P-3F9A12BC" });
  assert.deepEqual(estadoDeCargo(cargo({}), [], HOY), { tono: "neutro", texto: "Pendiente", detalle: "Vence el 15 de octubre" });
  assert.deepEqual(estadoDeCargo(cargo({ fecha_vencimiento: "2026-09-15", estatus_efectivo: "vencido", dias_de_atraso: 26 }), [], HOY), { tono: "alerta", texto: "Vencido 26 d", detalle: "Venció el 15 de septiembre" });
  assert.equal(estadoDeCargo(cargo({ monto_pagado: "300.00", saldo: "350.00" }), [], HOY).detalle, "Vence el 15 de octubre · Abonado $300.00; falta $350.00");
  assert.equal(estadoDeCargo(cargo({ estatus: "cancelado", saldo: "0.00" }), [], HOY).texto, "Cancelado");
  assert.equal(estadoDeCargo(cargo({ fecha_vencimiento: "2025-12-15" }), [], HOY).detalle, "Vence el 15 de diciembre de 2025");
});

test("el detalle de un pago: método, folio, referencia y quién lo registró", () => {
  assert.equal(detalleDePago(pago({ referencia: "4471", registrado_por: "Rocío Méndez" }), "Transferencia"), "Transferencia · folio P-3F9A12BC · ref. 4471 · por Rocío Méndez");
  assert.equal(detalleDePago(pago({}), "Efectivo"), "Efectivo · folio P-3F9A12BC");
});
