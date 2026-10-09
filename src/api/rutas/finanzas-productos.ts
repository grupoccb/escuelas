// Productos y ventas (H5). Dinero SIEMPRE como texto con dos decimales.
//
//   GET    /api/productos?vertical_id=&activo=&con_stock=&limite=&pagina=                        (productos:leer)
//   GET    /api/productos/:id                                                                   (productos:leer)
//   POST   /api/productos { vertical_id, nombre, talla?, precio, stock? }                       (productos:escribir)  catálogo: solo el administrador
//   PATCH  /api/productos/:id { nombre?, talla?, precio?, activo? }                             (productos:escribir)  el precio nuevo rige para ventas futuras
//   DELETE /api/productos/:id                                                                   (productos:escribir)  baja lógica
//   POST   /api/productos/:id/ajuste-stock { delta, motivo }                                    (productos:stock)     atómico: nunca deja el inventario bajo cero
//   GET    /api/ventas?alumno_id=&tutor_id=&producto_id=&estatus=&limite=&pagina=               (ventas:leer)
//   GET    /api/ventas/:id                                                                      (ventas:leer)
//   POST   /api/ventas { alumno_id, producto_id, cantidad, tutor_id?, sucursal_id? }            (ventas:registrar)    descuenta el stock y genera su cargo
//   POST   /api/ventas/:id/anular { motivo }                                                    (ventas:anular)       cancela el cargo y devuelve las piezas
//
// El precio unitario se congela al vender. Vender descuenta el stock EN LA BASE (disparador + CHECK `stock >= 0`): dos ventas por la última pieza, gana una (la otra, 409
// `sin_stock`). Una venta normal genera un cargo de concepto `producto` que vence el día de la venta; no se cancela suelto, se ANULA la venta (409 `cargo_con_pagos` si ya hay
// pagos: primero se cancela el pago). La entrega de un beneficio de producto (H4) es una venta promocional de precio 0 que no se anula. Permisos: el catálogo lo escribe el
// administrador, el stock también recepción, las ventas las registra y anula recepción (y el administrador); el asesor lee; el maestro no ve precios (403).

import express, { Router } from "express";
import { altaConAlcance } from "../../datos/alcance.ts";
import { dondeAlumnoVisible } from "../../familias/alcance.ts";
import { ajustarStock, anularVenta, RechazoDeVenta, venderProducto } from "../../finanzas/productos.ts";
import { deFecha } from "../../catalogo/precios.ts";
import { aTexto, deDecimal, multiplicar } from "../../lib/dinero.ts";
import { filtroDeSucursal } from "../alcance.ts";
import { requierePermiso } from "../autorizar.ts";
import { contextoDe, type ContextoApi, type DepsApi } from "../contexto.ts";
import { LIMITE_CUERPO_API } from "../cuerpos.ts";
import { conflicto, noEncontrado, validacion } from "../errores.ts";
import { esquemaPaginacion, leerPaginacion, paginar } from "../paginacion.ts";
import { registrarCambio } from "../registro.ts";
import { booleano, booleanoDeTexto, dinero, entero, enumerado, objeto, opcional, parsear, parsearQuery, texto, uuid } from "../validar.ts";

const esquemaId = objeto({ id: uuid() });
const esquemaListadoProductos = objeto({ ...esquemaPaginacion, vertical_id: opcional(uuid()), activo: opcional(booleanoDeTexto()), con_stock: opcional(booleanoDeTexto()) });
const esquemaProducto = objeto({ vertical_id: uuid(), nombre: texto({ min: 2, max: 120 }), talla: opcional(texto({ min: 1, max: 20 })), precio: dinero(), stock: opcional(entero({ min: 0, max: 100000 })) });
const esquemaCambio = objeto({ nombre: opcional(texto({ min: 2, max: 120 })), talla: opcional(texto({ min: 1, max: 20 })), precio: opcional(dinero()), activo: opcional(booleano()) });
const esquemaAjuste = objeto({ delta: entero({ min: -100000, max: 100000 }), motivo: texto({ min: 3, max: 200 }) });
const esquemaListadoVentas = objeto({ ...esquemaPaginacion, alumno_id: opcional(uuid()), tutor_id: opcional(uuid()), producto_id: opcional(uuid()), estatus: opcional(enumerado(["registrada", "anulada"] as const)) });
const esquemaVenta = objeto({ alumno_id: uuid(), producto_id: uuid(), cantidad: entero({ min: 1, max: 100 }), tutor_id: opcional(uuid()), sucursal_id: opcional(uuid()) });
const esquemaAnular = objeto({ motivo: texto({ min: 3, max: 300 }) });

const SELECCION_PRODUCTO = { id: true, vertical_id: true, nombre: true, talla: true, precio: true, stock: true, activo: true, creado_en: true, vertical: { select: { id: true, nombre: true } } } as const;
const presentarProducto = (p: { id: string; vertical_id: string; nombre: string; talla: string | null; precio: { toFixed(n: number): string }; stock: number; activo: boolean; creado_en: Date; vertical: { id: string; nombre: string } }) => ({
  id: p.id,
  vertical: p.vertical,
  nombre: p.nombre,
  talla: p.talla,
  precio: aTexto(deDecimal(p.precio)),
  stock: p.stock,
  activo: p.activo,
  creado_en: p.creado_en,
});

const SELECCION_VENTA = {
  id: true,
  tutor_id: true,
  cantidad: true,
  precio_unitario: true,
  es_promocional: true,
  promocion_aplicacion_id: true,
  fecha: true,
  estatus: true,
  sucursal_id: true,
  motivo_anulacion: true,
  alumno: { select: { id: true, nombre: true, apellidos: true } },
  producto: { select: { id: true, nombre: true, talla: true } },
  cargos: { select: { id: true, estatus: true, monto_final: true, monto_pagado: true } },
} as const;
type FilaDeVenta = {
  id: string;
  tutor_id: string;
  cantidad: number;
  precio_unitario: { toFixed(n: number): string };
  es_promocional: boolean;
  promocion_aplicacion_id: string | null;
  fecha: Date;
  estatus: string;
  sucursal_id: string;
  motivo_anulacion: string | null;
  alumno: { id: string; nombre: string; apellidos: string };
  producto: { id: string; nombre: string; talla: string | null };
  cargos: { id: string; estatus: string; monto_final: { toFixed(n: number): string }; monto_pagado: { toFixed(n: number): string } }[];
};
const presentarVenta = (v: FilaDeVenta) => {
  const unitario = deDecimal(v.precio_unitario);
  const cargo = v.cargos.find((c) => c.estatus !== "cancelado") ?? v.cargos[0] ?? null;
  return {
    id: v.id,
    tutor_id: v.tutor_id,
    alumno: v.alumno,
    producto: v.producto,
    sucursal_id: v.sucursal_id,
    cantidad: v.cantidad,
    precio_unitario: aTexto(unitario),
    total: aTexto(multiplicar(unitario, v.cantidad)),
    es_promocional: v.es_promocional,
    promocion_aplicacion_id: v.promocion_aplicacion_id,
    fecha: deFecha(v.fecha),
    estatus: v.estatus,
    motivo_anulacion: v.motivo_anulacion,
    cargo: cargo ? { id: cargo.id, estatus: cargo.estatus, monto_final: aTexto(deDecimal(cargo.monto_final)), monto_pagado: aTexto(deDecimal(cargo.monto_pagado)) } : null,
  };
};

/** Un rechazo de negocio de `productos.ts` en el error de la convención. */
function errorDeVenta(e: RechazoDeVenta): never {
  if (e.motivo === "producto_inexistente" || e.motivo === "alumno_inexistente" || e.motivo === "venta_inexistente") throw noEncontrado(e.message);
  if (e.motivo === "tutor_invalido" || e.motivo === "sin_sucursal") throw validacion([{ campo: e.motivo === "sin_sucursal" ? "sucursal_id" : "tutor_id", mensaje: e.message }], e.message);
  throw conflicto(e.message, [{ campo: "motivo", mensaje: e.motivo }]);
}

export function rutasDeProductos(_deps: DepsApi): express.Router {
  const r = Router();
  const json = express.json({ limit: LIMITE_CUERPO_API });

  async function dondeVentaVisible(ctx: ContextoApi): Promise<Record<string, unknown>> {
    if (ctx.usuario.rol === "administrador") return {};
    if (ctx.usuario.rol === "maestro") return { id: { in: [] } };
    const filtro = filtroDeSucursal(await ctx.alcance());
    return filtro ? { sucursal_id: filtro } : {};
  }
  async function leerProducto(ctx: ContextoApi, id: string) {
    const p = await ctx.db.producto.findFirst({ where: { id }, select: SELECCION_PRODUCTO });
    if (!p) throw noEncontrado();
    return p;
  }
  async function leerVenta(ctx: ContextoApi, id: string): Promise<FilaDeVenta> {
    const v = await ctx.db.venta.findFirst({ where: { id, ...(await dondeVentaVisible(ctx)) }, select: SELECCION_VENTA });
    if (!v) throw noEncontrado();
    return v as unknown as FilaDeVenta;
  }

  // ── Catálogo ──
  r.get("/productos", requierePermiso("productos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListadoProductos, req.query);
    const pag = leerPaginacion(q);
    const where = { ...(q.vertical_id ? { vertical_id: q.vertical_id } : {}), ...(q.activo !== undefined ? { activo: q.activo } : {}), ...(q.con_stock === true ? { stock: { gt: 0 } } : {}) };
    res.json(await paginar(pag, () => ctx.db.producto.count({ where }), async (saltar, tomar) => (await ctx.db.producto.findMany({ where, select: SELECCION_PRODUCTO, orderBy: [{ nombre: "asc" }, { talla: "asc" }, { id: "asc" }], skip: saltar, take: tomar })).map(presentarProducto)));
  });

  r.get("/productos/:id", requierePermiso("productos:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    res.json(presentarProducto(await leerProducto(ctx, id)));
  });

  r.post("/productos", requierePermiso("productos:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaProducto, req.body);
    if (!(await ctx.db.vertical.findFirst({ where: { id: e.vertical_id }, select: { id: true } }))) throw validacion([{ campo: "vertical_id", mensaje: "No existe esa vertical" }]);
    const id = await ctx.db.$transaction(async (tx) => {
      const p = await tx.producto.create({ data: altaConAlcance({ vertical_id: e.vertical_id, nombre: e.nombre, talla: e.talla ?? null, precio: aTexto(e.precio), stock: e.stock ?? 0 }), select: { id: true } });
      await registrarCambio(tx, ctx, { entidad: "producto", entidadId: p.id, accion: "crear", despues: { vertical_id: e.vertical_id, nombre: e.nombre, talla: e.talla ?? null, precio: aTexto(e.precio), stock: e.stock ?? 0, activo: true } });
      return p.id;
    });
    res.status(201).json(presentarProducto(await leerProducto(ctx, id)));
  });

  r.patch("/productos/:id", requierePermiso("productos:escribir"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const e = parsear(esquemaCambio, req.body);
    const antes = await leerProducto(ctx, id);
    await ctx.db.$transaction(async (tx) => {
      await tx.producto.updateMany({ where: { id }, data: { ...(e.nombre !== undefined ? { nombre: e.nombre } : {}), ...(e.talla !== undefined ? { talla: e.talla } : {}), ...(e.precio !== undefined ? { precio: aTexto(e.precio) } : {}), ...(e.activo !== undefined ? { activo: e.activo } : {}) } });
      await registrarCambio(tx, ctx, {
        entidad: "producto",
        entidadId: id,
        accion: "actualizar",
        antes: { nombre: antes.nombre, talla: antes.talla, precio: aTexto(deDecimal(antes.precio)), activo: antes.activo },
        despues: { nombre: e.nombre ?? antes.nombre, talla: e.talla ?? antes.talla, precio: e.precio !== undefined ? aTexto(e.precio) : aTexto(deDecimal(antes.precio)), activo: e.activo ?? antes.activo },
      });
    });
    res.json(presentarProducto(await leerProducto(ctx, id)));
  });

  r.delete("/productos/:id", requierePermiso("productos:escribir"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    await leerProducto(ctx, id);
    await ctx.db.$transaction(async (tx) => {
      await tx.producto.updateMany({ where: { id }, data: { eliminado_en: ctx.ahora(), activo: false } });
      await registrarCambio(tx, ctx, { entidad: "producto", entidadId: id, accion: "eliminar" });
    });
    res.status(204).end();
  });

  r.post("/productos/:id/ajuste-stock", requierePermiso("productos:stock"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const e = parsear(esquemaAjuste, req.body);
    const antes = await leerProducto(ctx, id);
    try {
      const stock = await ctx.db.$transaction(async (tx) => {
        const s = await ajustarStock(tx, id, e.delta);
        await registrarCambio(tx, ctx, { entidad: "producto", entidadId: id, accion: "actualizar", antes: { stock: antes.stock }, despues: { stock: s }, soloDiferencias: false });
        return s;
      });
      res.json({ ...presentarProducto(await leerProducto(ctx, id)), stock });
    } catch (error) {
      if (error instanceof RechazoDeVenta) errorDeVenta(error);
      throw error;
    }
  });

  // ── Ventas ──
  r.get("/ventas", requierePermiso("ventas:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const q = parsearQuery(esquemaListadoVentas, req.query);
    const pag = leerPaginacion(q);
    const where = { ...(await dondeVentaVisible(ctx)), ...(q.alumno_id ? { alumno_id: q.alumno_id } : {}), ...(q.tutor_id ? { tutor_id: q.tutor_id } : {}), ...(q.producto_id ? { producto_id: q.producto_id } : {}), ...(q.estatus ? { estatus: q.estatus } : {}) };
    res.json(await paginar(pag, () => ctx.db.venta.count({ where }), async (saltar, tomar) => (await ctx.db.venta.findMany({ where, select: SELECCION_VENTA, orderBy: [{ fecha: "desc" }, { creado_en: "desc" }, { id: "desc" }], skip: saltar, take: tomar })).map((v) => presentarVenta(v as unknown as FilaDeVenta))));
  });

  r.get("/ventas/:id", requierePermiso("ventas:leer"), async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    res.json(presentarVenta(await leerVenta(ctx, id)));
  });

  r.post("/ventas", requierePermiso("ventas:registrar"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const e = parsear(esquemaVenta, req.body);
    if (!(await ctx.db.alumno.findFirst({ where: { id: e.alumno_id, ...(await dondeAlumnoVisible(ctx)) }, select: { id: true } }))) throw noEncontrado("No se encontró el alumno");
    if (e.sucursal_id) {
      const alcance = await ctx.alcance();
      if (!alcance.todas && !alcance.sucursalIds.includes(e.sucursal_id)) throw noEncontrado("No se encontró la sucursal");
    }
    let ventaId: string;
    try {
      ventaId = await ctx.db.$transaction(async (tx) => {
        const v = await venderProducto(tx, { ahora: ctx.ahora(), usuarioId: ctx.usuario.id }, { alumnoId: e.alumno_id, productoId: e.producto_id, cantidad: e.cantidad, tutorId: e.tutor_id ?? null, sucursalId: e.sucursal_id ?? null });
        await registrarCambio(tx, ctx, { entidad: "venta", entidadId: v.ventaId, accion: "crear", despues: { tutor_id: v.tutorId, alumno_id: e.alumno_id, producto_id: e.producto_id, cantidad: e.cantidad, total: aTexto(v.total), estatus: "registrada" } });
        return v.ventaId;
      });
    } catch (error) {
      if (error instanceof RechazoDeVenta) errorDeVenta(error);
      throw error;
    }
    res.status(201).json(presentarVenta(await leerVenta(ctx, ventaId)));
  });

  r.post("/ventas/:id/anular", requierePermiso("ventas:anular"), json, async (req, res) => {
    const ctx = contextoDe(res);
    const { id } = parsear(esquemaId, req.params);
    const { motivo } = parsear(esquemaAnular, req.body);
    await leerVenta(ctx, id);
    try {
      await ctx.db.$transaction(async (tx) => {
        await anularVenta(tx, { ahora: ctx.ahora(), usuarioId: ctx.usuario.id }, { ventaId: id, motivo });
        await registrarCambio(tx, ctx, { entidad: "venta", entidadId: id, accion: "actualizar", antes: { estatus: "registrada" }, despues: { estatus: "anulada" } });
      });
    } catch (error) {
      if (error instanceof RechazoDeVenta) errorDeVenta(error);
      throw error;
    }
    res.json(presentarVenta(await leerVenta(ctx, id)));
  });

  return r;
}
