// Lo que no necesita React del «Cierre del día» (R5c): los tipos de lo que devuelve `GET /api/pagos/corte`, cuántos pagos hubo por forma de pago, qué parte del día es cada forma y el resumen
// de lo cancelado. Todo importe es texto exacto y se suma o compara en centavos (`bigint`, `lib/dinero.ts`): nunca un número de punto flotante. Puro: se prueba con `node --test`.

import { aCentavos, sumar } from "../../lib/dinero.ts";

export interface Desglose {
  efectivo: string;
  tarjeta: string;
  transferencia: string;
  total: string;
  pagos: number;
}
export interface Persona {
  id: string;
  nombre: string;
}
export interface PagoDelDia {
  id: string;
  hora: string;
  familia: string;
  monto: string;
  metodo: string;
  referencia: string | null;
  registrado_por: Persona | null;
}
export interface PagoCancelado extends PagoDelDia {
  de_otro_dia: boolean;
  cancelado_en: string | null;
  cancelado_por: Persona | null;
  motivo: string | null;
}
export interface Corte {
  fecha: string;
  hoy: string;
  zona_horaria: string;
  cajas: { usuario: Persona | null; cobrado: Desglose }[];
  cobrado: Desglose;
  devoluciones: Desglose;
  neto: Desglose;
  cancelados: PagoCancelado[];
  pagos: PagoDelDia[];
}

export const FORMAS = [
  { clave: "efectivo", texto: "Efectivo" },
  { clave: "tarjeta", texto: "Tarjeta" },
  { clave: "transferencia", texto: "Transferencia" },
] as const;
export type ClaveDeForma = (typeof FORMAS)[number]["clave"];

/** «1 pago» / «15 pagos». */
export const textoDePagos = (n: number): string => `${n} ${n === 1 ? "pago" : "pagos"}`;

/** Cuántos pagos del día hubo por forma de pago (cuenta la lista de pagos que cuentan; una forma que no existe en la lista no suma). */
export function pagosPorForma(pagos: readonly Pick<PagoDelDia, "metodo">[]): Record<ClaveDeForma, number> {
  const cuenta: Record<ClaveDeForma, number> = { efectivo: 0, tarjeta: 0, transferencia: 0 };
  for (const p of pagos) if (p.metodo === "efectivo" || p.metodo === "tarjeta" || p.metodo === "transferencia") cuenta[p.metodo] += 1;
  return cuenta;
}

/**
 * Qué parte del total del día es esta forma de pago, en por ciento ENTERO escrito como texto («57»), con los centavos exactos (división entera de `bigint`). Lo que hubo se ve siempre (mínimo 1 %);
 * sin total o sin esta forma es «0». Es para el ancho de una barra: la cifra que se lee es el importe, no este porcentaje.
 */
export function porcentajeDelDia(parte: string, total: string): string {
  const t = aCentavos(total);
  const p = aCentavos(parte);
  if (t <= 0n || p <= 0n) return "0";
  const crudo = (p * 100n) / t;
  const acotado = crudo > 100n ? 100n : crudo;
  return (acotado === 0n ? 1n : acotado).toString();
}

/** Lo cobrado y cancelado EL MISMO DÍA: no cuenta en la caja. (Un pago de otro día cancelado hoy es una devolución y va aparte.) */
export function canceladosDeHoy(c: Pick<Corte, "cancelados">): { cantidad: number; total: string } {
  const lista = c.cancelados.filter((p) => !p.de_otro_dia);
  return { cantidad: lista.length, total: sumar("0.00", ...lista.map((p) => p.monto)) };
}

/** «15 pagos · 1 cancelado ($650.00, no cuenta)»: el renglón de abajo de la cifra grande. `formato` da forma al importe (`formatear`). */
export function notaDelDia(c: Pick<Corte, "cobrado" | "cancelados">, formato: (importe: string) => string): string {
  const base = textoDePagos(c.cobrado.pagos);
  const { cantidad, total } = canceladosDeHoy(c);
  if (cantidad === 0) return base;
  return `${base} · ${cantidad} ${cantidad === 1 ? "cancelado" : "cancelados"} (${formato(total)}, ${cantidad === 1 ? "no cuenta" : "no cuentan"})`;
}

/** ¿Hubo devoluciones (pagos de días anteriores cancelados hoy)? Entonces «Efectivo para contar» ya va neto y hay un bloque aparte con el neto del día. */
export const hayDevoluciones = (c: Pick<Corte, "devoluciones">): boolean => c.devoluciones.pagos > 0;

/** ¿Hay algo que mostrar del día (algún cobro o algún cancelado)? */
export const hayMovimientos = (c: Pick<Corte, "cobrado" | "cancelados">): boolean => c.cobrado.pagos > 0 || c.cancelados.length > 0;
