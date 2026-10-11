// Lo que «Uniformes» (R5b) decide para mostrar: qué piezas del inventario le tocan a un beneficio, cuántas quedan, de dónde viene lo que se entrega y cuándo se entregó. Sin dinero aquí.

import { formatearDiaYMes, hoyLocal, sumarDias } from "../../lib/fechas.ts";
import type { BeneficioEntregado, BeneficioPorEntregar, Producto } from "./tipos.ts";

/** Lo que un beneficio necesita saber para elegir pieza: el producto que ya fija (si lo fija), la disciplina del grupo y la talla del alumno. */
type ParaElegir = Pick<BeneficioPorEntregar, "producto_id" | "vertical_id" | "alumno">;

/**
 * Las piezas del inventario que le tocan a un beneficio: si el beneficio ya fija el producto, solo ese; si solo dice «Uniforme», las piezas ACTIVAS de la disciplina del grupo (el servidor
 * rechaza una pieza de otra disciplina) y de la talla del alumno (sin talla registrada, de cualquier talla). `existen` pone solo las que tienen al menos una pieza.
 */
export function piezasDeUnBeneficio(b: ParaElegir, productos: readonly Producto[], existen = false): Producto[] {
  const talla = b.alumno.talla_uniforme;
  return productos.filter((p) => p.activo && (!existen || p.stock > 0) && (b.producto_id !== null ? p.id === b.producto_id : (b.vertical_id === undefined || p.vertical.id === b.vertical_id) && (talla === null || p.talla === talla)));
}

/** Cuántas piezas quedan para un beneficio, o `null` si no se sabe (no se cargó el inventario, o el producto que fija el beneficio no está entre los activos). */
export function existenciaDe(b: ParaElegir, productos: readonly Producto[] | null): number | null {
  if (productos === null) return null;
  const piezas = piezasDeUnBeneficio(b, productos);
  if (piezas.length === 0 && b.producto_id !== null) return null;
  return piezas.reduce((n, p) => n + p.stock, 0);
}

/** «Quedan 3 en existencia», «Queda 1 en existencia», «Sin existencia: pide más piezas». */
export function textoDeExistencia(n: number): string {
  return n === 0 ? "Sin existencia: pide más piezas" : n === 1 ? "Queda 1 en existencia" : `Quedan ${n} en existencia`;
}

/** «Primera mensualidad pagada el 8 de octubre»: lo que se libera nace al saldar la primera mensualidad (`liberado_en` es ese momento). */
export function origenDelBeneficio(liberadoEn: string | null, hoy: string): string {
  if (!liberadoEn) return "Primera mensualidad pagada";
  const d = new Date(liberadoEn);
  return Number.isNaN(d.getTime()) ? "Primera mensualidad pagada" : `Primera mensualidad pagada el ${formatearDiaYMes(hoyLocal(d), hoy)}`;
}

/** El título de la tarjeta: «Uniforme de bienvenida · talla 6» (la pieza entregada si ya salió; si no, lo que dice el beneficio). */
export function tituloDelBeneficio(b: Pick<BeneficioPorEntregar, "descripcion" | "alumno"> & { producto?: BeneficioEntregado["producto"] }): string {
  const nombre = b.producto?.nombre ?? b.descripcion ?? "Producto";
  const talla = b.producto ? b.producto.talla : b.alumno.talla_uniforme;
  return talla ? `${nombre} · talla ${talla}` : nombre;
}

/** «Entregado hace un momento por Rocío Méndez», «… hoy …», «… ayer …», «Entregado el 8 de octubre por …». */
export function cuandoSeEntrego(entregadoEn: string | null, por: string | null, ahora: Date = new Date()): string {
  const quien = por ? ` por ${por}` : "";
  const d = entregadoEn ? new Date(entregadoEn) : null;
  if (!d || Number.isNaN(d.getTime())) return `Entregado${quien}`;
  if (ahora.getTime() - d.getTime() < 120_000 && ahora.getTime() >= d.getTime()) return `Entregado hace un momento${quien}`;
  const hoy = hoyLocal(ahora);
  const dia = hoyLocal(d);
  if (dia === hoy) return `Entregado hoy${quien}`;
  if (dia === sumarDias(hoy, -1)) return `Entregado ayer${quien}`;
  return `Entregado el ${formatearDiaYMes(dia, hoy)}${quien}`;
}
