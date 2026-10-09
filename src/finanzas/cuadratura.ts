// Cuadratura (H7): la comprobación de que el dinero cuadra, SIEMPRE, en decimales exactos (centavos `bigint`). Es lo que se corre tras cada paso de las pruebas de propiedad, al
// terminar los datos de demo y, como comando (`npm run cuadratura`), contra una base real. La base ya impide casi todo lo de aquí (CHECK y disparadores de H1 a H5); esto es el
// SEGUNDO par de ojos: compara las columnas que la base mantiene contra las filas que las justifican y atrapa lo que se hubiera colado (un disparador apagado, un UPDATE de un
// superusuario, un error de código en un camino nuevo).
//
// REGLAS (cada una devuelve una `Discrepancia` con su nombre, nunca lanza):
//   1. pagos_aplicados_igual_aplicaciones — Σ monto de pagos aplicados = Σ monto de aplicaciones vivas; y por pago, su `monto_aplicado` = Σ de sus aplicaciones vivas, un pago aplicado
//      cubre exactamente su monto y uno cancelado no tiene aplicaciones vivas.
//   2. saldo_de_cada_cargo — `monto_pagado` de cada cargo = Σ de sus aplicaciones vivas; saldo = monto_final − Σ ≥ 0; ningún cargo sobrepagado.
//   3. estatus_coherente_con_el_saldo — pagado ⇔ saldo 0; pendiente/vencido ⇔ saldo > 0; cancelado ⇒ sin pagos.
//   4. aplicacion_de_la_misma_familia — el pago y el cargo de cada aplicación viva son del mismo tutor.
//   5. estado_de_cuenta_cuadra — Σ cargos (no cancelados) − Σ aplicaciones vivas = Σ de los saldos por familia (el saldo total del estado de cuenta).
//   6. ventas_y_cargos — toda venta normal registrada tiene un solo cargo vivo de cantidad × precio; una anulada o promocional, ninguno; todo cargo vivo de venta es de una venta registrada.
//   7. stock_no_negativo.

import type { BaseDatos } from "../datos/alcance.ts";
import { aTexto, deDecimal, multiplicar, sumar, type Centavos } from "../lib/dinero.ts";

export interface Discrepancia {
  regla: string;
  detalle: string;
  id?: string;
}

export interface DatosParaCuadratura {
  cargos: { id: string; tutorId: string; ventaId: string | null; montoFinal: Centavos; montoPagado: Centavos; estatus: string }[];
  pagos: { id: string; tutorId: string; monto: Centavos; montoAplicado: Centavos; estatus: string }[];
  aplicaciones: { id: string; pagoId: string; cargoId: string; monto: Centavos; estatus: string }[];
  ventas: { id: string; estatus: string; esPromocional: boolean; cantidad: number; precioUnitario: Centavos }[];
  productos: { id: string; stock: number }[];
}

export interface ResumenDeCuadratura {
  cargos: number;
  pagos: number;
  aplicaciones: number;
  ventas: number;
  totalCargado: string;
  totalPagado: string;
  saldoTotal: string;
}

export interface ResultadoDeCuadratura {
  ok: boolean;
  discrepancias: Discrepancia[];
  resumen: ResumenDeCuadratura;
}

const centavos = (c: Centavos): string => aTexto(c);

/** PURA: las reglas sobre las filas ya cargadas. */
export function calcularCuadratura(d: DatosParaCuadratura): ResultadoDeCuadratura {
  const x: Discrepancia[] = [];
  const vivas = d.aplicaciones.filter((a) => a.estatus === "aplicada");
  const sumaPorPago = new Map<string, Centavos>();
  const sumaPorCargo = new Map<string, Centavos>();
  for (const a of vivas) {
    sumaPorPago.set(a.pagoId, (sumaPorPago.get(a.pagoId) ?? 0n) + a.monto);
    sumaPorCargo.set(a.cargoId, (sumaPorCargo.get(a.cargoId) ?? 0n) + a.monto);
  }
  const pagoPorId = new Map(d.pagos.map((p) => [p.id, p]));
  const cargoPorId = new Map(d.cargos.map((c) => [c.id, c]));

  // 1. Pagos ↔ aplicaciones.
  const pagosAplicados = d.pagos.filter((p) => p.estatus === "aplicado");
  const sumaPagos = sumar(...pagosAplicados.map((p) => p.monto));
  const sumaAplicaciones = sumar(...vivas.map((a) => a.monto));
  if (sumaPagos !== sumaAplicaciones) x.push({ regla: "pagos_aplicados_igual_aplicaciones", detalle: `Σ pagos aplicados ${centavos(sumaPagos)} ≠ Σ aplicaciones vivas ${centavos(sumaAplicaciones)}` });
  for (const p of d.pagos) {
    const suma = sumaPorPago.get(p.id) ?? 0n;
    if (p.montoAplicado !== suma) x.push({ regla: "pagos_aplicados_igual_aplicaciones", id: p.id, detalle: `el pago dice aplicado ${centavos(p.montoAplicado)} pero sus aplicaciones vivas suman ${centavos(suma)}` });
    if (p.estatus === "aplicado" && suma !== p.monto) x.push({ regla: "pagos_aplicados_igual_aplicaciones", id: p.id, detalle: `un pago aplicado debe cubrir su monto ${centavos(p.monto)} y cubre ${centavos(suma)}` });
    if (p.estatus === "cancelado" && suma !== 0n) x.push({ regla: "pagos_aplicados_igual_aplicaciones", id: p.id, detalle: `un pago cancelado no puede tener aplicaciones vivas (${centavos(suma)})` });
  }
  for (const a of d.aplicaciones) {
    const p = pagoPorId.get(a.pagoId);
    if (!p) x.push({ regla: "pagos_aplicados_igual_aplicaciones", id: a.id, detalle: "aplicación de un pago que no existe" });
    else if (a.estatus === "revertida" && p.estatus !== "cancelado") x.push({ regla: "pagos_aplicados_igual_aplicaciones", id: a.id, detalle: "aplicación revertida de un pago que no está cancelado" });
  }

  // 2 y 3. Cada cargo.
  for (const c of d.cargos) {
    const suma = sumaPorCargo.get(c.id) ?? 0n;
    const saldo = c.montoFinal - suma;
    if (c.montoPagado !== suma) x.push({ regla: "saldo_de_cada_cargo", id: c.id, detalle: `monto_pagado ${centavos(c.montoPagado)} ≠ Σ aplicaciones vivas ${centavos(suma)}` });
    if (saldo < 0n) x.push({ regla: "saldo_de_cada_cargo", id: c.id, detalle: `cargo sobrepagado: monto final ${centavos(c.montoFinal)}, aplicado ${centavos(suma)}` });
    if (c.estatus === "cancelado") {
      if (suma !== 0n) x.push({ regla: "estatus_coherente_con_el_saldo", id: c.id, detalle: `cargo cancelado con pagos vivos (${centavos(suma)})` });
    } else if (c.estatus === "pagado") {
      if (saldo !== 0n) x.push({ regla: "estatus_coherente_con_el_saldo", id: c.id, detalle: `cargo pagado con saldo ${centavos(saldo)}` });
    } else if (saldo === 0n) {
      x.push({ regla: "estatus_coherente_con_el_saldo", id: c.id, detalle: `cargo ${c.estatus} sin saldo (debería estar pagado)` });
    }
  }

  // 4. Misma familia.
  for (const a of vivas) {
    const p = pagoPorId.get(a.pagoId);
    const c = cargoPorId.get(a.cargoId);
    if (!c) x.push({ regla: "aplicacion_de_la_misma_familia", id: a.id, detalle: "aplicación a un cargo que no existe" });
    else if (p && p.tutorId !== c.tutorId) x.push({ regla: "aplicacion_de_la_misma_familia", id: a.id, detalle: "el pago y el cargo son de familias distintas" });
  }

  // 5. El estado de cuenta: Σ cargos − Σ aplicaciones = Σ de los saldos por familia.
  const vivosCargos = d.cargos.filter((c) => c.estatus !== "cancelado");
  const totalCargado = sumar(...vivosCargos.map((c) => c.montoFinal));
  const saldosPorFamilia = new Map<string, Centavos>();
  for (const c of vivosCargos) saldosPorFamilia.set(c.tutorId, (saldosPorFamilia.get(c.tutorId) ?? 0n) + (c.montoFinal - (sumaPorCargo.get(c.id) ?? 0n)));
  const saldoTotal = sumar(...saldosPorFamilia.values());
  const aplicadoAVivos = sumar(...vivosCargos.map((c) => sumaPorCargo.get(c.id) ?? 0n));
  if (totalCargado - aplicadoAVivos !== saldoTotal) x.push({ regla: "estado_de_cuenta_cuadra", detalle: `Σ cargos ${centavos(totalCargado)} − Σ aplicaciones ${centavos(aplicadoAVivos)} ≠ saldo total ${centavos(saldoTotal)}` });
  if (aplicadoAVivos !== sumaAplicaciones) x.push({ regla: "estado_de_cuenta_cuadra", detalle: `hay aplicaciones vivas sobre cargos cancelados o inexistentes (${centavos(sumaAplicaciones - aplicadoAVivos)})` });

  // 6. Ventas ↔ cargos.
  const cargosPorVenta = new Map<string, typeof d.cargos>();
  for (const c of vivosCargos) if (c.ventaId) (cargosPorVenta.get(c.ventaId) ?? cargosPorVenta.set(c.ventaId, []).get(c.ventaId)!).push(c);
  const ventaPorId = new Map(d.ventas.map((v) => [v.id, v]));
  for (const v of d.ventas) {
    const cs = cargosPorVenta.get(v.id) ?? [];
    if (v.estatus === "registrada" && !v.esPromocional) {
      const esperado = multiplicar(v.precioUnitario, v.cantidad);
      if (cs.length !== 1) x.push({ regla: "ventas_y_cargos", id: v.id, detalle: `la venta registrada debe tener un cargo vivo y tiene ${cs.length}` });
      else if (cs[0]!.montoFinal !== esperado) x.push({ regla: "ventas_y_cargos", id: v.id, detalle: `el cargo (${centavos(cs[0]!.montoFinal)}) no es cantidad × precio (${centavos(esperado)})` });
    } else if (cs.length > 0) {
      x.push({ regla: "ventas_y_cargos", id: v.id, detalle: "una venta anulada o promocional no debe tener cargo vivo" });
    }
  }
  for (const c of vivosCargos) if (c.ventaId && !ventaPorId.has(c.ventaId)) x.push({ regla: "ventas_y_cargos", id: c.id, detalle: "cargo de una venta que no existe" });

  // 7. Stock.
  for (const p of d.productos) if (p.stock < 0) x.push({ regla: "stock_no_negativo", id: p.id, detalle: `stock ${p.stock}` });

  return {
    ok: x.length === 0,
    discrepancias: x,
    resumen: { cargos: d.cargos.length, pagos: d.pagos.length, aplicaciones: d.aplicaciones.length, ventas: d.ventas.length, totalCargado: centavos(totalCargado), totalPagado: centavos(sumaPagos), saldoTotal: centavos(saldoTotal) },
  };
}

/** Carga las filas de la organización (el alcance de `db`) y aplica las reglas. Solo lee. */
export async function cuadratura(db: BaseDatos): Promise<ResultadoDeCuadratura> {
  const [cargos, pagos, aplicaciones, ventas, productos] = await Promise.all([
    db.cargo.findMany({ select: { id: true, tutor_id: true, venta_id: true, monto_final: true, monto_pagado: true, estatus: true } }),
    db.pago.findMany({ select: { id: true, tutor_id: true, monto: true, monto_aplicado: true, estatus: true } }),
    db.pago_aplicacion.findMany({ select: { id: true, pago_id: true, cargo_id: true, monto_aplicado: true, estatus: true } }),
    db.venta.findMany({ select: { id: true, estatus: true, es_promocional: true, cantidad: true, precio_unitario: true } }),
    db.producto.findMany({ select: { id: true, stock: true } }),
  ]);
  return calcularCuadratura({
    cargos: cargos.map((c) => ({ id: c.id, tutorId: c.tutor_id, ventaId: c.venta_id, montoFinal: deDecimal(c.monto_final), montoPagado: deDecimal(c.monto_pagado), estatus: c.estatus })),
    pagos: pagos.map((p) => ({ id: p.id, tutorId: p.tutor_id, monto: deDecimal(p.monto), montoAplicado: deDecimal(p.monto_aplicado), estatus: p.estatus })),
    aplicaciones: aplicaciones.map((a) => ({ id: a.id, pagoId: a.pago_id, cargoId: a.cargo_id, monto: deDecimal(a.monto_aplicado), estatus: a.estatus })),
    ventas: ventas.map((v) => ({ id: v.id, estatus: v.estatus, esPromocional: v.es_promocional, cantidad: v.cantidad, precioUnitario: deDecimal(v.precio_unitario) })),
    productos,
  });
}
