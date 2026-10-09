// Productos y ventas (H5). Dinero en centavos `bigint`; el stock es un entero que NUNCA baja de cero.
//
// VENDER: se inserta la `venta` con el precio unitario CONGELADO y se genera su `cargo` (concepto `producto`, vence el día de la venta) en la misma transacción. El stock lo descuenta
// la BASE por disparador en el mismo INSERT (regla de Eduardo: cupo y dinero se protegen en la base): dos ventas por la última pieza se forman en la fila del producto, gana una y la
// otra recibe `sin_stock`; el CHECK `stock >= 0` es la red aunque el código se equivoque. Además, al confirmar, la base exige que toda venta registrada tenga su cargo (cantidad × precio).
// ANULAR una venta cancela su cargo (si ya tiene pagos, primero se cancela el pago) y devuelve las piezas. ENTREGAR un beneficio de producto (H4) es una venta PROMOCIONAL de precio 0:
// sin cargo, ligada a su `promocion_aplicacion` (una sola venta por aplicación), que descuenta el stock igual.

import { aFecha, deFecha, type FechaISO } from "../catalogo/precios.ts";
import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import { esViolacionUnica } from "../datos/prisma.ts";
import type { ProductosDelAlumno, ProveedorProductos } from "../expediente/proveedores.ts";
import { aTexto, deDecimal, multiplicar, type Centavos } from "../lib/dinero.ts";
import { fechaLocal } from "../lib/horario.ts";
import { responsableDePago } from "./cargos.ts";
import { marcarEntregado, type ContextoDeBeneficio } from "./beneficios.ts";

export type MotivoDeRechazoDeVenta =
  | "producto_inexistente"
  | "alumno_inexistente"
  | "tutor_invalido"
  | "sin_responsable_de_pago"
  | "sin_sucursal"
  | "sin_stock"
  | "venta_inexistente"
  | "ya_anulada"
  | "venta_promocional"
  | "cargo_con_pagos"
  | "producto_de_otra_vertical"
  | "requiere_producto"
  | "no_liberado"
  | "ya_entregado"
  | "stock_insuficiente_para_ajuste";

/** Un rechazo de negocio: se LANZA para que la transacción de quien llama se revierta entera. */
export class RechazoDeVenta extends Error {
  readonly motivo: MotivoDeRechazoDeVenta;
  constructor(motivo: MotivoDeRechazoDeVenta, mensaje: string) {
    super(mensaje);
    this.motivo = motivo;
  }
}

export interface ContextoDeVenta {
  ahora: Date;
  usuarioId: string | null;
}

const esFaltaDeStock = (e: unknown): boolean => e instanceof Error && /producto_stock_check/.test(e.message);

async function sucursalDelAlumno(tx: Consultas, alumno: { id: string; sucursal_id: string | null }): Promise<string | null> {
  if (alumno.sucursal_id) return alumno.sucursal_id;
  const i = await tx.inscripcion.findFirst({ where: { alumno_id: alumno.id, estatus: { in: ["activa", "congelada"] } }, orderBy: [{ creado_en: "asc" }, { id: "asc" }], select: { grupo: { select: { programa: { select: { sucursal_id: true } } } } } });
  return i?.grupo.programa.sucursal_id ?? null;
}

async function hoyDe(tx: Consultas, sucursalId: string, ahora: Date): Promise<FechaISO> {
  const s = await tx.sucursal.findFirst({ where: { id: sucursalId }, select: { zona_horaria: true } });
  return fechaLocal(ahora, s?.zona_horaria ?? "America/Mexico_City");
}

const nombreDelProducto = (p: { nombre: string; talla: string | null }): string => (p.talla ? `${p.nombre} (talla ${p.talla})` : p.nombre);

export interface VentaRegistrada {
  ventaId: string;
  cargoId: string;
  tutorId: string;
  sucursalId: string;
  total: Centavos;
}

/** Vende `cantidad` piezas de un producto a la familia de un alumno, con su cargo. Lanza `RechazoDeVenta`. */
export async function venderProducto(tx: Consultas, ctx: ContextoDeVenta, e: { alumnoId: string; productoId: string; cantidad: number; tutorId?: string | null; sucursalId?: string | null }): Promise<VentaRegistrada> {
  const producto = await tx.producto.findFirst({ where: { id: e.productoId, activo: true }, select: { id: true, nombre: true, talla: true, precio: true, stock: true } });
  if (!producto) throw new RechazoDeVenta("producto_inexistente", "No se encontró el producto, o ya no está activo");
  const alumno = await tx.alumno.findFirst({ where: { id: e.alumnoId }, select: { id: true, sucursal_id: true } });
  if (!alumno) throw new RechazoDeVenta("alumno_inexistente", "No se encontró el alumno");
  let tutorId = e.tutorId ?? null;
  if (tutorId) {
    if (!(await tx.tutor_alumno.findFirst({ where: { alumno_id: alumno.id, tutor_id: tutorId, tutor: { eliminado_en: null } }, select: { id: true } }))) throw new RechazoDeVenta("tutor_invalido", "Ese tutor no es de la familia del alumno");
  } else {
    tutorId = await responsableDePago(tx, alumno.id);
    if (!tutorId) throw new RechazoDeVenta("sin_responsable_de_pago", "El alumno no tiene un tutor al que cobrarle");
  }
  const sucursalId = e.sucursalId ?? (await sucursalDelAlumno(tx, alumno));
  if (!sucursalId) throw new RechazoDeVenta("sin_sucursal", "No se sabe en qué sucursal se vende: indica la sucursal");
  if (producto.stock < e.cantidad) throw new RechazoDeVenta("sin_stock", `No hay existencias suficientes de ${nombreDelProducto(producto)} (quedan ${producto.stock})`);
  const precio = deDecimal(producto.precio);
  const total = multiplicar(precio, e.cantidad);
  const hoy = await hoyDe(tx, sucursalId, ctx.ahora);
  try {
    const venta = await tx.venta.create({
      data: altaConAlcance({ tutor_id: tutorId, alumno_id: alumno.id, producto_id: producto.id, sucursal_id: sucursalId, cantidad: e.cantidad, precio_unitario: aTexto(precio), es_promocional: false, fecha: aFecha(hoy), registrada_por_usuario_id: ctx.usuarioId }),
      select: { id: true },
    });
    const cargo = await tx.cargo.create({
      data: altaConAlcance({
        tutor_id: tutorId,
        alumno_id: alumno.id,
        sucursal_id: sucursalId,
        venta_id: venta.id,
        concepto: "producto" as const,
        descripcion: `${nombreDelProducto(producto)} × ${e.cantidad}`,
        monto: aTexto(total),
        descuento: "0.00",
        monto_final: aTexto(total),
        fecha_vencimiento: aFecha(hoy),
        estatus: total === 0n ? ("pagado" as const) : ("pendiente" as const),
        creado_por_usuario_id: ctx.usuarioId,
      }),
      select: { id: true },
    });
    return { ventaId: venta.id, cargoId: cargo.id, tutorId, sucursalId, total };
  } catch (error) {
    if (esFaltaDeStock(error)) throw new RechazoDeVenta("sin_stock", "Otra venta se llevó las últimas piezas: no hay existencias suficientes");
    throw error;
  }
}

/** Anula una venta normal: cancela su cargo (sin pagos vivos) y devuelve las piezas al stock (por disparador). Lanza `RechazoDeVenta`. */
export async function anularVenta(tx: Consultas, ctx: ContextoDeVenta, e: { ventaId: string; motivo: string }): Promise<{ ventaId: string }> {
  const v = await tx.venta.findFirst({ where: { id: e.ventaId }, select: { id: true, es_promocional: true, estatus: true } });
  if (!v) throw new RechazoDeVenta("venta_inexistente", "No se encontró la venta");
  if (v.es_promocional) throw new RechazoDeVenta("venta_promocional", "La entrega de un beneficio no se anula");
  const r = await tx.venta.updateMany({ where: { id: v.id, estatus: "registrada" }, data: { estatus: "anulada", anulada_en: ctx.ahora, anulada_por_usuario_id: ctx.usuarioId, motivo_anulacion: e.motivo } });
  if (r.count !== 1) throw new RechazoDeVenta("ya_anulada", "La venta ya estaba anulada");
  const c = await tx.cargo.updateMany({ where: { venta_id: v.id, estatus: { in: ["pendiente", "vencido"] }, monto_pagado: "0.00" }, data: { estatus: "cancelado", cancelado_en: ctx.ahora, cancelado_por_usuario_id: ctx.usuarioId, motivo_cancelacion: `Venta anulada: ${e.motivo}` } });
  if (c.count !== 1) throw new RechazoDeVenta("cargo_con_pagos", "El cargo de la venta tiene pagos: cancela primero el pago");
  return { ventaId: v.id };
}

/** Ajusta el inventario de un producto de forma atómica (`delta` puede ser negativo, nunca deja el stock bajo cero). Devuelve el stock resultante. */
export async function ajustarStock(tx: Consultas, productoId: string, delta: number): Promise<number> {
  const r = await tx.producto.updateMany({ where: { id: productoId, ...(delta < 0 ? { stock: { gte: -delta } } : {}) }, data: { stock: { increment: delta } } });
  if (r.count !== 1) {
    if (!(await tx.producto.findFirst({ where: { id: productoId }, select: { id: true } }))) throw new RechazoDeVenta("producto_inexistente", "No se encontró el producto");
    throw new RechazoDeVenta("stock_insuficiente_para_ajuste", "El ajuste dejaría el inventario por debajo de cero");
  }
  return (await tx.producto.findFirstOrThrow({ where: { id: productoId }, select: { stock: true } })).stock;
}

/**
 * Entrega un beneficio de PRODUCTO (H4): crea la venta promocional de precio 0 (descuenta el stock) y marca el beneficio entregado, en la misma transacción. El producto sale
 * del beneficio (`producto_id`) o, si éste solo dice «Uniforme», del que elija recepción (una talla). Debe ser de la vertical de la inscripción.
 */
export async function entregarProducto(tx: Consultas, ctx: ContextoDeBeneficio, e: { aplicacionId: string; productoId: string | null; cantidad: number }): Promise<{ aplicacionId: string; ventaId: string }> {
  const a = await tx.promocion_aplicacion.findFirst({
    where: { id: e.aplicacionId },
    select: {
      id: true,
      estatus: true,
      beneficio: { select: { tipo: true, producto_id: true } },
      inscripcion: { select: { id: true, estatus: true, alumno_id: true, grupo: { select: { programa: { select: { vertical_id: true, sucursal_id: true } } } } } },
    },
  });
  if (!a) throw new RechazoDeVenta("venta_inexistente", "No se encontró el beneficio");
  if (a.estatus === "entregado") throw new RechazoDeVenta("ya_entregado", "El beneficio ya se entregó");
  if (a.estatus !== "liberado" || a.inscripcion.estatus === "baja") throw new RechazoDeVenta("no_liberado", "El beneficio todavía no se liberó (falta pagar la primera mensualidad) o la inscripción está dada de baja");
  const productoId = a.beneficio.producto_id ?? e.productoId;
  if (!productoId) throw new RechazoDeVenta("requiere_producto", "Un beneficio de producto se entrega con un producto del catálogo (producto_id)");
  if (a.beneficio.producto_id && e.productoId && e.productoId !== a.beneficio.producto_id) throw new RechazoDeVenta("producto_inexistente", "El beneficio ya fija su producto");
  const producto = await tx.producto.findFirst({ where: { id: productoId, activo: true }, select: { id: true, vertical_id: true, stock: true, nombre: true, talla: true } });
  if (!producto) throw new RechazoDeVenta("producto_inexistente", "No se encontró el producto, o ya no está activo");
  if (producto.vertical_id !== a.inscripcion.grupo.programa.vertical_id) throw new RechazoDeVenta("producto_de_otra_vertical", "El producto es de otra vertical");
  if (producto.stock < e.cantidad) throw new RechazoDeVenta("sin_stock", `No hay existencias de ${nombreDelProducto(producto)}`);
  const tutorId = await responsableDePago(tx, a.inscripcion.alumno_id);
  if (!tutorId) throw new RechazoDeVenta("sin_responsable_de_pago", "El alumno no tiene un tutor");
  const sucursalId = a.inscripcion.grupo.programa.sucursal_id;
  const hoy = await hoyDe(tx, sucursalId, ctx.ahora);
  let ventaId: string;
  try {
    const v = await tx.venta.create({
      data: altaConAlcance({ tutor_id: tutorId, alumno_id: a.inscripcion.alumno_id, producto_id: producto.id, sucursal_id: sucursalId, cantidad: e.cantidad, precio_unitario: "0.00", es_promocional: true, promocion_aplicacion_id: a.id, fecha: aFecha(hoy), registrada_por_usuario_id: ctx.usuarioId }),
      select: { id: true },
    });
    ventaId = v.id;
  } catch (error) {
    if (esFaltaDeStock(error)) throw new RechazoDeVenta("sin_stock", "Otra venta se llevó las últimas piezas: no hay existencias");
    // Otra entrega del MISMO beneficio ganó la carrera (único parcial: una venta por aplicación).
    if (esViolacionUnica(error)) throw new RechazoDeVenta("ya_entregado", "El beneficio ya se entregó");
    throw error;
  }
  const m = await marcarEntregado(tx, ctx, a.id);
  if (!m.ok) throw new RechazoDeVenta(m.motivo === "ya_entregado" ? "ya_entregado" : "no_liberado", "El beneficio cambió mientras se entregaba: vuelve a intentarlo");
  return { aplicacionId: a.id, ventaId };
}

/** Lo que el expediente muestra de los productos que compró la familia (G5, `ProveedorProductos`): las ventas no anuladas del alumno, promocionales incluidas. */
export class ProveedorProductosDeFinanzas implements ProveedorProductos {
  async productosComprados(db: Consultas, alumnoId: string): Promise<ProductosDelAlumno> {
    const ventas = await db.venta.findMany({ where: { alumno_id: alumnoId, estatus: "registrada" }, orderBy: [{ fecha: "desc" }, { creado_en: "desc" }, { id: "asc" }], select: { cantidad: true, fecha: true, producto: { select: { nombre: true, talla: true } } } });
    return { disponible: true, productos: ventas.map((v) => ({ producto: nombreDelProducto(v.producto), cantidad: v.cantidad, fecha: deFecha(v.fecha) })) };
  }
}
