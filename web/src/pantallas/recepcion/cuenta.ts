// Lo que el estado de cuenta (R5b) calcula para mostrar: cuánto se pagó en el año, cuántos días lleva el atraso más viejo, el estado de cada cargo y el pago que lo saldó. Dinero en
// centavos `bigint`; ninguna cuenta con flotantes. Las fechas son días `AAAA-MM-DD` (texto): el año se compara como texto.

import { aCentavos, deCentavos, formatear } from "../../lib/dinero.ts";
import { formatearDiaYMes } from "../../lib/fechas.ts";
import { folioDePago } from "./reparto.ts";
import type { CargoDeCuenta, PagoDeCuenta } from "./tipos.ts";

/** Los cuatro renglones de la antigüedad de lo vencido, con el texto que se lee (el orden es el de la API). */
export const TRAMOS = [
  { clave: "de_0_a_30", texto: "1 a 30 días" },
  { clave: "de_31_a_60", texto: "31 a 60 días" },
  { clave: "de_61_a_90", texto: "61 a 90 días" },
  { clave: "mas_de_90", texto: "Más de 90 días" },
] as const;

/** El tramo de antigüedad en que cae un atraso de `dias` (1 o más). */
export function tramoDeAtraso(dias: number): (typeof TRAMOS)[number] {
  return dias <= 30 ? TRAMOS[0] : dias <= 60 ? TRAMOS[1] : dias <= 90 ? TRAMOS[2] : TRAMOS[3];
}

/** «27 días de atraso (1 a 30 días)»; el más viejo de los cargos vencidos con saldo. `null` si no hay ninguno. */
export function textoDeAtraso(cargos: readonly Pick<CargoDeCuenta, "saldo" | "estatus_efectivo" | "dias_de_atraso">[]): string | null {
  const vencidos = cargos.filter((c) => c.estatus_efectivo === "vencido" && aCentavos(c.saldo) > 0n);
  if (vencidos.length === 0) return null;
  const dias = vencidos.reduce((m, c) => (c.dias_de_atraso > m ? c.dias_de_atraso : m), 0);
  return `${dias} ${dias === 1 ? "día" : "días"} de atraso (${tramoDeAtraso(dias).texto})`;
}

export interface PagadoEnElAnio {
  anio: string;
  total: string;
  pagos: number;
}

/** Lo pagado en el año de `hoy` (pagos aplicados, no los cancelados) y cuántos pagos fueron. La API da los últimos 100 pagos de la familia: de sobra para un año. */
export function pagadoEnElAnio(pagos: readonly Pick<PagoDeCuenta, "monto" | "fecha" | "estatus">[], hoy: string): PagadoEnElAnio {
  const anio = hoy.slice(0, 4);
  const delAnio = pagos.filter((p) => p.estatus === "aplicado" && p.fecha.startsWith(`${anio}-`));
  return { anio, total: deCentavos(delAnio.reduce((s, p) => s + aCentavos(p.monto), 0n)), pagos: delAnio.length };
}

/** «6 pagos en el año», «1 pago en el año», «Ningún pago en el año». */
export function textoDePagos(n: number): string {
  return n === 0 ? "Ningún pago en el año" : `${n} ${n === 1 ? "pago" : "pagos"} en el año`;
}

/** El pago aplicado más reciente que cubrió (algo de) un cargo, o `null`. `pagos` viene del más reciente al más viejo. */
export function pagoQueCubrio(cargoId: string, pagos: readonly PagoDeCuenta[]): PagoDeCuenta | null {
  return pagos.find((p) => p.estatus === "aplicado" && p.aplicaciones.some((a) => a.cargo_id === cargoId && a.estatus !== "cancelado" && aCentavos(a.monto) > 0n)) ?? null;
}

export type TonoDeCargo = "exito" | "alerta" | "neutro";

export interface EstadoDeUnCargo {
  tono: TonoDeCargo;
  /** La píldora: «Pagado», «Vencido 27 d», «Pendiente» o «Cancelado». */
  texto: string;
  /** El renglón de abajo: «Pagada el 12 de agosto · P-0981», «Vence el 15 de octubre», «Venció el 15 de septiembre · Abonado $300.00; falta $350.00». */
  detalle: string;
}

/** El estado de un cargo en la cuenta: la píldora (con texto, nunca solo color) y el renglón de fecha. */
export function estadoDeCargo(c: CargoDeCuenta, pagos: readonly PagoDeCuenta[], hoy: string): EstadoDeUnCargo {
  if (c.estatus === "cancelado") return { tono: "neutro", texto: "Cancelado", detalle: "Cargo cancelado" };
  const saldo = aCentavos(c.saldo);
  if (saldo === 0n) {
    const p = pagoQueCubrio(c.id, pagos);
    return { tono: "exito", texto: "Pagado", detalle: p ? `Pagada el ${formatearDiaYMes(p.fecha, hoy)} · ${folioDePago(p.id)}` : "Pagado" };
  }
  const vencido = c.estatus_efectivo === "vencido";
  const fecha = `${vencido ? "Venció el" : "Vence el"} ${formatearDiaYMes(c.fecha_vencimiento, hoy)}`;
  const abonado = aCentavos(c.monto_pagado) > 0n ? ` · Abonado ${formatear(c.monto_pagado)}; falta ${formatear(c.saldo)}` : "";
  return { tono: vencido ? "alerta" : "neutro", texto: vencido ? `Vencido ${c.dias_de_atraso} d` : "Pendiente", detalle: `${fecha}${abonado}` };
}

/** Lo que dice el detalle de un pago: «Efectivo · folio P-0981 · ref. 4471 · por Rocío Méndez». */
export function detalleDePago(p: Pick<PagoDeCuenta, "id" | "referencia" | "registrado_por">, metodo: string): string {
  return [metodo, `folio ${folioDePago(p.id)}`, p.referencia ? `ref. ${p.referencia}` : null, p.registrado_por ? `por ${p.registrado_por}` : null].filter((x) => x !== null).join(" · ");
}
