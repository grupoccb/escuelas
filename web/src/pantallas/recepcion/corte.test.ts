import { test } from "node:test";
import assert from "node:assert/strict";
import { canceladosDeHoy, hayDevoluciones, hayMovimientos, notaDelDia, pagosPorForma, porcentajeDelDia, textoDePagos, type Corte, type PagoCancelado } from "./corte.ts";
import { formatear } from "../../lib/dinero.ts";

const cero = { efectivo: "0.00", tarjeta: "0.00", transferencia: "0.00", total: "0.00", pagos: 0 };
const cancelado = (monto: string, deOtroDia: boolean): PagoCancelado => ({ id: monto, hora: "2026-10-12T16:00:00Z", familia: "F", monto, metodo: "efectivo", referencia: null, registrado_por: null, de_otro_dia: deOtroDia, cancelado_en: null, cancelado_por: null, motivo: null });

test("los pagos se cuentan por forma de pago, y una forma desconocida no suma a ninguna", () => {
  assert.deepEqual(pagosPorForma([{ metodo: "efectivo" }, { metodo: "tarjeta" }, { metodo: "efectivo" }, { metodo: "cheque" }]), { efectivo: 2, tarjeta: 1, transferencia: 0 });
  assert.deepEqual(pagosPorForma([]), { efectivo: 0, tarjeta: 0, transferencia: 0 });
  assert.equal(textoDePagos(1), "1 pago");
  assert.equal(textoDePagos(15), "15 pagos");
});

test("el porcentaje del día es entero, con centavos exactos, y lo que hubo siempre se ve", () => {
  assert.equal(porcentajeDelDia("8450.00", "14820.00"), "57");
  assert.equal(porcentajeDelDia("4120.00", "14820.00"), "27");
  assert.equal(porcentajeDelDia("2250.00", "14820.00"), "15");
  assert.equal(porcentajeDelDia("0.01", "14820.00"), "1", "un centavo no desaparece de la barra");
  assert.equal(porcentajeDelDia("0.00", "14820.00"), "0");
  assert.equal(porcentajeDelDia("10.00", "0.00"), "0", "sin total no hay barra");
  assert.equal(porcentajeDelDia("20.00", "10.00"), "100", "nunca pasa del 100 %");
  // 0.10 + 0.20 contra 0.30: en flotantes daría 99.99…; con centavos es exacto.
  assert.equal(porcentajeDelDia("0.20", "0.30"), "66");
});

test("lo cobrado y cancelado el mismo día se cuenta aparte (no cuenta en la caja); la devolución de otro día no", () => {
  const c = { cancelados: [cancelado("650.00", false), cancelado("150.50", false), cancelado("300.00", true)] };
  assert.deepEqual(canceladosDeHoy(c), { cantidad: 2, total: "800.50" });
  assert.deepEqual(canceladosDeHoy({ cancelados: [] }), { cantidad: 0, total: "0.00" });
});

test("el renglón de abajo de la cifra: pagos y, si los hubo, cuántos se cancelaron y por cuánto", () => {
  const cobrado = { ...cero, pagos: 15, total: "14820.00" };
  assert.equal(notaDelDia({ cobrado, cancelados: [] }, formatear), "15 pagos");
  assert.equal(notaDelDia({ cobrado, cancelados: [cancelado("650.00", false)] }, formatear), "15 pagos · 1 cancelado ($650.00, no cuenta)");
  assert.equal(notaDelDia({ cobrado, cancelados: [cancelado("650.00", false), cancelado("50.00", false)] }, formatear), "15 pagos · 2 cancelados ($700.00, no cuentan)");
  assert.equal(notaDelDia({ cobrado, cancelados: [cancelado("300.00", true)] }, formatear), "15 pagos", "una devolución no es un cancelado «que no cuenta»");
});

test("hay devoluciones o movimientos solo cuando algún pago los trae", () => {
  const c = { cobrado: cero, cancelados: [], devoluciones: cero } satisfies Pick<Corte, "cobrado" | "cancelados" | "devoluciones">;
  assert.equal(hayDevoluciones(c), false);
  assert.equal(hayMovimientos(c), false);
  assert.equal(hayDevoluciones({ devoluciones: { ...cero, pagos: 1 } }), true);
  assert.equal(hayMovimientos({ cobrado: { ...cero, pagos: 1 }, cancelados: [] }), true);
  assert.equal(hayMovimientos({ cobrado: cero, cancelados: [cancelado("1.00", false)] }), true);
});
