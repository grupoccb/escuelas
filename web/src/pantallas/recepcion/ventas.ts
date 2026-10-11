// Lo que no necesita React de «Ventas» (R5c): cómo se dice la existencia de un producto, cuántas piezas se pueden vender y la hora de una venta. Puro: se prueba con `node --test`.
// El dinero sigue siendo texto exacto (`lib/dinero.ts`); aquí solo hay conteos de piezas.

import { diaEnZona, formatearFecha } from "../../lib/fechas.ts";
import { horaDelInstante } from "../maestro/linea-de-tiempo.ts";
import type { Producto } from "./tipos.ts";

export type TonoDeExistencia = "agotado" | "ultima" | "hay";

/** «Agotado» / «Queda 1» / «Quedan 6» y su tono (rojo, ámbar, verde: el texto dice lo mismo, el color solo refuerza). */
export function existenciaDe(stock: number): { texto: string; tono: TonoDeExistencia } {
  if (stock <= 0) return { texto: "Agotado", tono: "agotado" };
  if (stock === 1) return { texto: "Queda 1", tono: "ultima" };
  return { texto: `Quedan ${stock}`, tono: "hay" };
}

/** Los productos que se pueden vender hoy: activos y con al menos una pieza. */
export function disponibles(productos: readonly Producto[]): Producto[] {
  return productos.filter((p) => p.activo && p.stock > 0);
}

/** El producto elegido, o (si no hay elegido, o ya no tiene piezas) el primero con existencia; `undefined` si no queda ninguno. */
export function productoElegido(productos: readonly Producto[], id: string): Producto | undefined {
  const lista = disponibles(productos);
  return lista.find((p) => p.id === id) ?? lista[0];
}

/** La cantidad a vender: un entero de 1 a la existencia (con el producto agotado o sin producto, 1). */
export function cantidadPermitida(pedida: number, stock: number | undefined): number {
  const tope = stock !== undefined && stock > 0 ? stock : 1;
  return Math.min(Math.max(1, pedida), tope);
}

/** «Solo hay 3 en existencia» cuando ya se pidieron todas las piezas que hay (y se puede pedir más, o ya no); `null` si todavía caben más. */
export function avisoDeTope(cantidad: number, stock: number | undefined): string | null {
  return stock !== undefined && stock > 0 && cantidad >= stock ? `Solo hay ${stock} en existencia` : null;
}

/** El nombre de un producto con su talla: «Playera» o «Playera · talla M». */
export function nombreConTalla(p: Pick<Producto, "nombre" | "talla">): string {
  return p.talla ? `${p.nombre} · talla ${p.talla}` : p.nombre;
}

/** «11:20 am» si la venta es de hoy; con otro día, «10 oct 2026 · 11:20 am». La zona es la del dispositivo (la venta no trae la de su sucursal). */
export function cuandoSeVendio(iso: string, ahora: Date = new Date(), zona: string = Intl.DateTimeFormat().resolvedOptions().timeZone): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const hora = horaDelInstante(t, zona);
  const dia = diaEnZona(iso, zona);
  return dia === diaEnZona(ahora.toISOString(), zona) ? hora : `${formatearFecha(dia)} · ${hora}`;
}
