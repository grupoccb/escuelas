// Entregar un beneficio diferido (H4): recepción se lo da a la familia. Un beneficio que no es un producto (descuento, meses gratis) solo se marca entregado; el de producto crea la
// venta promocional de precio 0 y descuenta el stock en la misma transacción (H5, `entregarProducto`).

import type { Consultas } from "../datos/alcance.ts";
import { marcarEntregado, type ContextoDeBeneficio } from "./beneficios.ts";
import { RechazoDeVenta, entregarProducto } from "./productos.ts";

export type MotivoDeRechazoDeEntrega = "inexistente" | "no_liberado" | "ya_entregado" | "requiere_producto" | "producto_inexistente" | "producto_de_otra_vertical" | "sin_stock";

export type ResultadoDeEntregaDeBeneficio = { ok: true; aplicacionId: string; ventaId: string | null } | { ok: false; motivo: MotivoDeRechazoDeEntrega; mensaje: string };

const MENSAJES: Record<MotivoDeRechazoDeEntrega, string> = {
  inexistente: "No se encontró el beneficio",
  no_liberado: "El beneficio todavía no se liberó (falta pagar la primera mensualidad) o la inscripción está dada de baja",
  ya_entregado: "El beneficio ya se entregó",
  requiere_producto: "Un beneficio de producto se entrega con un producto del catálogo (producto_id)",
  producto_inexistente: "No se encontró el producto",
  producto_de_otra_vertical: "El producto es de otra vertical",
  sin_stock: "No hay existencias de ese producto",
};
export const mensajeDeEntrega = (m: MotivoDeRechazoDeEntrega): string => MENSAJES[m];

export async function entregarBeneficio(tx: Consultas, ctx: ContextoDeBeneficio, e: { aplicacionId: string; productoId: string | null }): Promise<ResultadoDeEntregaDeBeneficio> {
  const a = await tx.promocion_aplicacion.findFirst({ where: { id: e.aplicacionId }, select: { id: true, beneficio: { select: { tipo: true } } } });
  if (!a) return { ok: false, motivo: "inexistente", mensaje: MENSAJES.inexistente };
  if (a.beneficio.tipo === "producto_gratis") {
    try {
      const r = await entregarProducto(tx, ctx, e);
      return { ok: true, aplicacionId: r.aplicacionId, ventaId: r.ventaId };
    } catch (error) {
      if (!(error instanceof RechazoDeVenta)) throw error;
      const motivo = error.motivo === "venta_inexistente" ? "inexistente" : (error.motivo as MotivoDeRechazoDeEntrega);
      if (!(motivo in MENSAJES)) throw error;
      return { ok: false, motivo, mensaje: error.message };
    }
  }
  const r = await marcarEntregado(tx, ctx, e.aplicacionId);
  if (!r.ok) return { ok: false, motivo: r.motivo === "inexistente" ? "inexistente" : r.motivo === "ya_entregado" ? "ya_entregado" : "no_liberado", mensaje: MENSAJES[r.motivo === "inexistente" ? "inexistente" : r.motivo === "ya_entregado" ? "ya_entregado" : "no_liberado"] };
  return { ok: true, aplicacionId: r.aplicacionId, ventaId: null };
}
