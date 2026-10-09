// H5: productos y ventas. Vender descuenta el stock de forma atómica (dos ventas por la última pieza: gana una) y genera su cargo; anular devuelve las piezas y cancela el
// cargo; entregar un beneficio de producto es una venta promocional de precio 0. El stock y la cuadratura ventas ↔ cargos se protegen EN LA BASE (SQL directo y carrera real).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { aFecha } from "../catalogo/precios.ts";
import { altaConAlcance, conAlcance } from "../datos/alcance.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { levantarApi, sembrarUsuario } from "../testutil/api.ts";
import { AHORA_DE_FINANZAS, mundoDeFinanzas, type CargoDeApi, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { ProveedorEconomicoDeFinanzas } from "./estado-cuenta.ts";
import { ProveedorProductosDeFinanzas } from "./productos.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;

before(async () => {
  prisma = crearPrismaDePruebas(undefined, 60);
  m = await mundoDeFinanzas(prisma, "Productos", AHORA_DE_FINANZAS, { expediente: { economico: new ProveedorEconomicoDeFinanzas(), productos: new ProveedorProductosDeFinanzas() } });
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

interface ProductoApi { id: string; nombre: string; talla: string | null; precio: string; stock: number; activo: boolean }
interface VentaApi { id: string; cantidad: number; precio_unitario: string; total: string; estatus: string; es_promocional: boolean; cargo: { id: string; estatus: string; monto_final: string; monto_pagado: string } | null; error?: unknown }
interface Errores { error: { detalles?: { campo?: string; mensaje: string }[] } }
const motivo = (r: { cuerpo: unknown }): string | undefined => (r.cuerpo as Errores).error?.detalles?.find((d) => d.campo === "motivo")?.mensaje;
async function rechaza(op: () => Promise<unknown>, defensa: RegExp): Promise<void> {
  await assert.rejects(op, (e: Error) => defensa.test(e.message), `la base debía rechazar con ${defensa}`);
}
const stockDe = async (id: string) => (await prisma.producto.findFirstOrThrow({ where: { id } })).stock;
async function producto(o: { stock?: number; precio?: string; nombre?: string; talla?: string; verticalId?: string } = {}): Promise<ProductoApi> {
  const r = await m.admin.post<ProductoApi>("/api/productos", { vertical_id: o.verticalId ?? m.org.verticalId, nombre: o.nombre ?? `Producto ${randomUUID().slice(0, 5)}`, ...(o.talla ? { talla: o.talla } : {}), precio: o.precio ?? "250.50", stock: o.stock ?? 10 });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  return r.cuerpo;
}
const vender = (cliente: typeof m.recepcion, alumnoId: string, productoId: string, cantidad = 1, extra: Record<string, unknown> = {}) => cliente.post<VentaApi>("/api/ventas", { alumno_id: alumnoId, producto_id: productoId, cantidad, ...extra });

test("catálogo: solo el administrador lo escribe, recepción ajusta inventario, el asesor lee y el maestro no ve precios; el stock nunca baja de cero", async () => {
  const p = await producto({ stock: 5, nombre: "Camiseta", talla: "M", precio: "199.99" });
  assert.deepEqual([p.precio, p.stock, p.talla], ["199.99", 5, "M"]);
  assert.equal((await m.recepcion.post("/api/productos", { vertical_id: m.org.verticalId, nombre: "X", precio: "1.00" })).estado, 403);
  assert.equal((await m.admin.post("/api/productos", { vertical_id: m.org.verticalId, nombre: "Mala", precio: 19.99 })).estado, 400, "un número JSON es un flotante");
  assert.equal((await m.admin.post("/api/productos", { vertical_id: randomUUID(), nombre: "Mala", precio: "19.99" })).estado, 400);
  assert.equal((await m.asesorNorte.get(`/api/productos/${p.id}`)).estado, 200);
  assert.equal((await m.asesorNorte.post(`/api/productos/${p.id}/ajuste-stock`, { delta: 1, motivo: "No puede" })).estado, 403);
  assert.equal((await m.maestro.get("/api/productos")).estado, 403);
  const mas = await m.recepcion.post<ProductoApi>(`/api/productos/${p.id}/ajuste-stock`, { delta: 7, motivo: "Llegó el pedido" });
  assert.equal(mas.cuerpo.stock, 12);
  const demasiado = await m.recepcion.post(`/api/productos/${p.id}/ajuste-stock`, { delta: -13, motivo: "Conteo" });
  assert.equal(demasiado.estado, 409);
  assert.equal(await stockDe(p.id), 12, "un ajuste que deja el inventario bajo cero no se aplica");
  assert.equal((await m.recepcion.post<ProductoApi>(`/api/productos/${p.id}/ajuste-stock`, { delta: -12, motivo: "Conteo" })).cuerpo.stock, 0);
  const cambio = await m.admin.patch<ProductoApi>(`/api/productos/${p.id}`, { precio: "210.00" });
  assert.equal(cambio.cuerpo.precio, "210.00");
  assert.equal((await m.admin.delete(`/api/productos/${p.id}`)).estado, 204);
  assert.equal((await m.admin.get(`/api/productos/${p.id}`)).estado, 404);
  const otro = await producto();
  await rechaza(() => prisma.producto.update({ where: { id: otro.id }, data: { stock: -1 } }), /producto_stock_check/);
});

test("vender: descuenta el stock, congela el precio y genera su cargo de producto (cantidad × precio, exacto) a nombre del responsable de pago", async () => {
  const p = await producto({ stock: 10, precio: "250.50", nombre: "Gorra", talla: "U" });
  const a = await m.alumno();
  const v = await vender(m.recepcion, a.alumnoId, p.id, 3);
  assert.equal(v.estado, 201, JSON.stringify(v.cuerpo));
  assert.deepEqual([v.cuerpo.precio_unitario, v.cuerpo.total, v.cuerpo.estatus, v.cuerpo.es_promocional], ["250.50", "751.50", "registrada", false]);
  assert.deepEqual([v.cuerpo.cargo?.monto_final, v.cuerpo.cargo?.estatus], ["751.50", "pendiente"]);
  assert.equal(await stockDe(p.id), 7);
  const cargo = await m.admin.get<CargoDeApi>(`/api/cargos/${v.cuerpo.cargo!.id}`);
  assert.deepEqual([cargo.cuerpo.concepto, cargo.cuerpo.tutor_id, cargo.cuerpo.fecha_vencimiento, (cargo.cuerpo as { descripcion?: string }).descripcion], ["producto", a.tutorId, "2026-11-10", "Gorra (talla U) × 3"]);
  // El precio sube después: la venta vieja conserva el suyo y la nueva usa el nuevo.
  await m.admin.patch(`/api/productos/${p.id}`, { precio: "300.00" });
  const v2 = await vender(m.recepcion, a.alumnoId, p.id, 1);
  assert.equal(v2.cuerpo.precio_unitario, "300.00");
  assert.equal((await m.recepcion.get<VentaApi>(`/api/ventas/${v.cuerpo.id}`)).cuerpo.precio_unitario, "250.50");
  // Se cobra como cualquier cargo: un pago lo salda.
  const pago = await m.recepcion.post("/api/pagos", { tutor_id: a.tutorId, monto: "1051.50", metodo: "efectivo" });
  assert.equal(pago.estado, 201);
  // Errores: cantidad, alumno ajeno, sin stock, producto inactivo.
  assert.equal((await vender(m.recepcion, a.alumnoId, p.id, 0)).estado, 400);
  assert.equal((await vender(m.recepcion, a.alumnoId, p.id, 8)).estado, 409);
  assert.equal(motivo(await vender(m.recepcion, a.alumnoId, p.id, 8)), "sin_stock");
  assert.equal(await stockDe(p.id), 6, "la venta rechazada no movió el stock");
  assert.equal((await vender(m.recepcion, randomUUID(), p.id, 1)).estado, 404);
  assert.equal((await vender(m.asesorNorte, a.alumnoId, p.id, 1)).estado, 403);
  assert.equal((await m.maestro.get("/api/ventas")).estado, 403);
});

test("ventas: la sucursal se deduce del alumno, el alcance es por sucursal y no hay fuga entre organizaciones", async () => {
  const p = await producto({ stock: 20 });
  const norte = await m.alumno({ sucursalId: m.norte });
  const sur = await m.alumno({ sucursalId: m.sur });
  const vn = await vender(m.recepcion, norte.alumnoId, p.id);
  assert.equal(vn.estado, 201);
  assert.equal((await vender(m.recepcion, sur.alumnoId, p.id)).estado, 404, "recepción del norte no vende a un alumno del sur");
  const vs = await vender(m.admin, sur.alumnoId, p.id);
  assert.equal(vs.estado, 201);
  assert.equal((await m.recepcion.get(`/api/ventas/${vs.cuerpo.id}`)).estado, 404);
  assert.equal((await m.asesorNorte.get(`/api/ventas/${vn.cuerpo.id}`)).estado, 200);
  const lista = await m.recepcion.get<{ datos: VentaApi[] }>("/api/ventas?limite=100");
  assert.equal(lista.cuerpo.datos.some((v) => v.id === vs.cuerpo.id), false);
  const otro = await mundoDeFinanzas(prisma, "Productos otra org");
  try {
    assert.equal((await otro.admin.get(`/api/ventas/${vn.cuerpo.id}`)).estado, 404);
    assert.equal((await otro.admin.get(`/api/productos/${p.id}`)).estado, 404);
    assert.equal((await vender(otro.admin, norte.alumnoId, p.id)).estado, 404);
  } finally {
    await otro.cerrar();
  }
});

test("anular una venta cancela su cargo y devuelve las piezas; con pagos no se anula hasta cancelar el pago; el cargo de una venta no se cancela suelto", async () => {
  const p = await producto({ stock: 5, precio: "100.00" });
  const a = await m.alumno();
  const v = await vender(m.recepcion, a.alumnoId, p.id, 2);
  assert.equal(await stockDe(p.id), 3);
  const suelto = await m.recepcion.post(`/api/cargos/${v.cuerpo.cargo!.id}/cancelar`, { motivo: "A mano" });
  assert.equal(suelto.estado, 409);
  assert.equal((suelto.cuerpo as Errores).error.detalles?.find((d) => d.campo === "motivo")?.mensaje, "de_venta");
  const pago = await m.recepcion.post<{ id: string }>("/api/pagos", { tutor_id: a.tutorId, monto: "50.00", metodo: "efectivo" });
  const conPagos = await m.recepcion.post(`/api/ventas/${v.cuerpo.id}/anular`, { motivo: "Se arrepintió" });
  assert.equal(conPagos.estado, 409);
  assert.equal(motivo(conPagos), "cargo_con_pagos");
  assert.equal(await stockDe(p.id), 3, "el rechazo lo revirtió todo: la venta sigue registrada y el stock igual");
  assert.equal((await m.recepcion.get<VentaApi>(`/api/ventas/${v.cuerpo.id}`)).cuerpo.estatus, "registrada");
  await m.recepcion.post(`/api/pagos/${pago.cuerpo.id}/cancelar`, { motivo: "Prueba" });
  const ok = await m.recepcion.post<VentaApi>(`/api/ventas/${v.cuerpo.id}/anular`, { motivo: "Se arrepintió" });
  assert.equal(ok.estado, 200, JSON.stringify(ok.cuerpo));
  assert.deepEqual([ok.cuerpo.estatus, ok.cuerpo.cargo?.estatus], ["anulada", "cancelado"]);
  assert.equal(await stockDe(p.id), 5, "las piezas regresaron");
  assert.equal((await m.recepcion.post(`/api/ventas/${v.cuerpo.id}/anular`, { motivo: "Otra vez" })).estado, 409);
  assert.equal(await stockDe(p.id), 5, "anular dos veces no devuelve dos veces");
  assert.equal((await m.asesorNorte.post(`/api/ventas/${v.cuerpo.id}/anular`, { motivo: "No puede" })).estado, 403);
});

test("SQL directo: la base exige el cargo de cada venta (cantidad × precio), no deja el stock bajo cero, y una venta no se edita ni se borra", async () => {
  const p = await producto({ stock: 3, precio: "100.00" });
  const a = await m.alumno();
  const org = m.org.organizacionId;
  const base = { organizacion_id: org, tutor_id: a.tutorId, alumno_id: a.alumnoId, producto_id: p.id, sucursal_id: m.norte, cantidad: 1, precio_unitario: "100.00", fecha: aFecha("2026-11-10") };
  // Una venta SIN cargo: la base lo rechaza al confirmar, y el stock descontado se revierte con ella.
  await rechaza(() => prisma.venta.create({ data: base }), /venta_cuadra_con_su_cargo/);
  assert.equal(await stockDe(p.id), 3);
  // Con un cargo de OTRO monto.
  await rechaza(async () => {
    await prisma.$transaction(async (tx) => {
      const v = await tx.venta.create({ data: base });
      await tx.cargo.create({ data: { organizacion_id: org, tutor_id: a.tutorId, alumno_id: a.alumnoId, sucursal_id: m.norte, venta_id: v.id, concepto: "producto", monto: "99.00", monto_final: "99.00", fecha_vencimiento: aFecha("2026-11-10") } });
    });
  }, /venta_cuadra_con_su_cargo/);
  // Más piezas que el stock.
  await rechaza(async () => {
    await prisma.$transaction(async (tx) => {
      const v = await tx.venta.create({ data: { ...base, cantidad: 4 } });
      await tx.cargo.create({ data: { organizacion_id: org, tutor_id: a.tutorId, alumno_id: a.alumnoId, sucursal_id: m.norte, venta_id: v.id, concepto: "producto", monto: "400.00", monto_final: "400.00", fecha_vencimiento: aFecha("2026-11-10") } });
    });
  }, /producto_stock_check/);
  assert.equal(await stockDe(p.id), 3);
  // Importes y promocional incoherentes.
  await rechaza(() => prisma.venta.create({ data: { ...base, cantidad: 0 } }), /venta_importes_check/);
  await rechaza(() => prisma.venta.create({ data: { ...base, precio_unitario: "-1.00" } }), /venta_importes_check/);
  await rechaza(() => prisma.venta.create({ data: { ...base, es_promocional: true } }), /venta_promocional_check/);
  await rechaza(() => prisma.venta.create({ data: { ...base, promocion_aplicacion_id: randomUUID() } }), /venta_promocional_check/);
  // Una venta buena, y luego intentos de editarla o borrarla.
  const v = await vender(m.recepcion, a.alumnoId, p.id, 1);
  await rechaza(() => prisma.venta.update({ where: { id: v.cuerpo.id }, data: { cantidad: 2 } }), /venta_inmutable/);
  await rechaza(() => prisma.venta.update({ where: { id: v.cuerpo.id }, data: { precio_unitario: "1.00" } }), /venta_inmutable/);
  await rechaza(() => prisma.venta.delete({ where: { id: v.cuerpo.id } }), /venta_inmutable/);
  assert.equal(await stockDe(p.id), 2);
  // Anular la venta por SQL sin cancelar su cargo: la base lo rechaza al confirmar.
  await rechaza(() => prisma.venta.update({ where: { id: v.cuerpo.id }, data: { estatus: "anulada", anulada_en: new Date() } }), /venta_cuadra_con_su_cargo/);
  assert.equal(await stockDe(p.id), 2, "el rechazo devolvió también el stock");
});

test("CONCURRENCIA (solo la base): 20 ventas por SQL de la ÚLTIMA pieza → entra exactamente una; con 5 piezas y 20 ventas, exactamente cinco; el stock nunca baja de cero", async () => {
  const org = m.org.organizacionId;
  for (const [piezas, hilos] of [[1, 20], [5, 20]] as const) {
    const p = await producto({ stock: piezas, precio: "50.00" });
    const a = await m.alumno();
    const barrera = new Barrera(hilos);
    const dbx = conAlcance(conGanchos(prisma, { modelo: "venta", operacion: "create", antes: () => barrera.esperar(5000) }), org);
    const venta = () =>
      dbx.$transaction(async (tx) => {
        const v = await tx.venta.create({ data: altaConAlcance({ tutor_id: a.tutorId, alumno_id: a.alumnoId, producto_id: p.id, sucursal_id: m.norte, cantidad: 1, precio_unitario: "50.00", fecha: aFecha("2026-11-10") }), select: { id: true } });
        await tx.cargo.create({ data: altaConAlcance({ tutor_id: a.tutorId, alumno_id: a.alumnoId, sucursal_id: m.norte, venta_id: v.id, concepto: "producto" as const, monto: "50.00", monto_final: "50.00", fecha_vencimiento: aFecha("2026-11-10") }) });
      });
    const rs = await Promise.allSettled(Array.from({ length: hilos }, venta));
    assert.equal(rs.filter((r) => r.status === "fulfilled").length, piezas, rs.map((r) => (r.status === "rejected" ? String(r.reason.message).slice(-90) : "ok")).slice(0, 2).join(" | "));
    assert.ok(rs.filter((r) => r.status === "rejected").every((r) => /producto_stock_check/.test((r as PromiseRejectedResult).reason.message)));
    assert.ok(barrera.completa, "los hilos llegaron juntos (la carrera fue real)");
    assert.equal(await stockDe(p.id), 0);
    assert.equal(await prisma.venta.count({ where: { producto_id: p.id } }), piezas);
    assert.equal(await prisma.cargo.count({ where: { alumno_id: a.alumnoId, concepto: "producto" } }), piezas, "ninguna venta perdedora dejó cargo");
  }
});

test("CONCURRENCIA (API): 12 ventas simultáneas de la última pieza → gana una, las demás 409 sin_stock, ningún 500, y un solo cargo", async () => {
  const p = await producto({ stock: 1, precio: "80.00" });
  const a = await m.alumno();
  const barrera = new Barrera(12);
  const servidor = levantarApi(conGanchos(prisma, { modelo: "venta", operacion: "create", cuando: (x) => JSON.stringify(x["data"]).includes(p.id), antes: () => barrera.esperar(5000) }), { reloj: () => m.reloj.ahora });
  try {
    const u = await sembrarUsuario(prisma, m.org.organizacionId, { rol: "recepcion", sucursales: [m.norte] });
    const primero = servidor.cliente();
    assert.equal((await primero.login(m.org.slug, u.correo, u.contrasena)).estado, 201);
    const clientes = Array.from({ length: 12 }, () => {
      const c = servidor.cliente();
      c.cookieDeSesion = primero.cookieDeSesion;
      return c;
    });
    const rs = await Promise.all(clientes.map((c) => vender(c, a.alumnoId, p.id)));
    assert.equal(rs.filter((r) => r.estado === 201).length, 1, JSON.stringify(rs.map((r) => r.estado)));
    assert.equal(rs.filter((r) => r.estado === 409 && motivo(r) === "sin_stock").length, 11);
    assert.equal(rs.filter((r) => r.estado >= 500).length, 0);
    assert.ok(barrera.completa);
    assert.equal(await stockDe(p.id), 0);
    assert.equal(await prisma.cargo.count({ where: { alumno_id: a.alumnoId, concepto: "producto", estatus: { not: "cancelado" } } }), 1);
  } finally {
    await servidor.cerrar();
  }
});

// ── La entrega de un beneficio de producto (H4 + H5) ─────────────────────────────────────────────────────────────

async function promocionConUniforme(productoId?: string): Promise<() => Promise<void>> {
  const p = await prisma.promocion.create({ data: { organizacion_id: m.org.organizacionId, nombre: `Uniforme ${randomUUID().slice(0, 5)}`, codigo: `U${randomUUID().slice(0, 8)}`, vigencia_desde: new Date("2020-01-01"), condicion_tipo: "al_pagar_primera_mensualidad", acumulable: true, prioridad: 5 } });
  await prisma.promocion_beneficio.create({ data: { organizacion_id: m.org.organizacionId, promocion_id: p.id, tipo: "producto_gratis", modo: "total", momento_disparo: "al_cumplir_condicion", descripcion: "Uniforme", ...(productoId ? { producto_id: productoId } : {}) } });
  return async () => void (await prisma.promocion.update({ where: { id: p.id }, data: { activo: false } }));
}
const liberadoDe = async (inscripcionId: string) => (await prisma.promocion_aplicacion.findFirstOrThrow({ where: { inscripcion_id: inscripcionId } }));
async function inscritoYPagado() {
  const i = await m.inscribir();
  assert.equal((await m.recepcion.post("/api/pagos", { tutor_id: i.tutorId, monto: "1500.00", metodo: "efectivo" })).estado, 201);
  return { ...i, aplicacion: await liberadoDe(i.inscripcionId) };
}

test("entregar un uniforme: la venta promocional de precio 0 descuenta el stock, no genera cargo y queda ligada al beneficio; el expediente la muestra", async () => {
  const uniforme = await producto({ stock: 4, nombre: "Uniforme", talla: "8" });
  const apagar = await promocionConUniforme();
  try {
    const x = await inscritoYPagado();
    assert.equal(x.aplicacion.estatus, "liberado");
    const sin = await m.recepcion.post(`/api/beneficios/${x.aplicacion.id}/entregar`, {});
    assert.equal(motivo(sin), "requiere_producto");
    const ok = await m.recepcion.post<{ estatus: string; venta_id: string }>(`/api/beneficios/${x.aplicacion.id}/entregar`, { producto_id: uniforme.id });
    assert.equal(ok.estado, 200, JSON.stringify(ok.cuerpo));
    assert.equal(await stockDe(uniforme.id), 3);
    const venta = await m.recepcion.get<VentaApi>(`/api/ventas/${ok.cuerpo.venta_id}`);
    assert.deepEqual([venta.cuerpo.es_promocional, venta.cuerpo.precio_unitario, venta.cuerpo.total, venta.cuerpo.cargo], [true, "0.00", "0.00", null]);
    assert.deepEqual([(await liberadoDe(x.inscripcionId)).estatus, (await liberadoDe(x.inscripcionId)).fecha_entrega !== null], ["entregado", true]);
    assert.equal(motivo(await m.recepcion.post(`/api/beneficios/${x.aplicacion.id}/entregar`, { producto_id: uniforme.id })), "ya_entregado");
    assert.equal(await stockDe(uniforme.id), 3, "entregar dos veces no descuenta dos veces");
    // La venta promocional no se anula.
    assert.equal(motivo(await m.recepcion.post(`/api/ventas/${ok.cuerpo.venta_id}/anular`, { motivo: "Intento" })), "venta_promocional");
    // El expediente del alumno ya muestra lo que compró/recibió.
    const e = await m.admin.get<{ operativo: { productos_comprados: { disponible: boolean; productos: { producto: string; cantidad: number; fecha: string }[] } } }>(`/api/alumnos/${x.alumnoId}/expediente`);
    assert.deepEqual(e.cuerpo.operativo.productos_comprados.productos.map((p) => [p.producto, p.cantidad, p.fecha]), [["Uniforme (talla 8)", 1, "2026-11-10"]]);
  } finally {
    await apagar();
  }
});

test("entregar: sin existencias, de otra vertical o con un producto distinto del que fija el beneficio → no se entrega nada y el beneficio sigue liberado", async () => {
  const sinStock = await producto({ stock: 0, nombre: "Uniforme agotado" });
  const otraVertical = (await prisma.vertical.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Otra vertical", slug: `otra-${randomUUID().slice(0, 6)}` } })).id;
  const ajeno = await producto({ stock: 5, verticalId: otraVertical, nombre: "Zapatos" });
  const fijo = await producto({ stock: 5, nombre: "Uniforme fijo" });
  const otroFijo = await producto({ stock: 5, nombre: "Otro" });
  const apagar = await promocionConUniforme();
  try {
    const x = await inscritoYPagado();
    assert.equal(motivo(await m.recepcion.post(`/api/beneficios/${x.aplicacion.id}/entregar`, { producto_id: sinStock.id })), "sin_stock");
    assert.equal((await m.recepcion.post(`/api/beneficios/${x.aplicacion.id}/entregar`, { producto_id: ajeno.id })).estado, 400, "de otra vertical");
    assert.equal(await stockDe(ajeno.id), 5);
    assert.equal((await liberadoDe(x.inscripcionId)).estatus, "liberado");
    assert.equal(await prisma.venta.count({ where: { promocion_aplicacion_id: x.aplicacion.id } }), 0);
  } finally {
    await apagar();
  }
  const apagarFijo = await promocionConUniforme(fijo.id);
  try {
    const y = await inscritoYPagado();
    assert.equal((await m.recepcion.post(`/api/beneficios/${y.aplicacion.id}/entregar`, { producto_id: otroFijo.id })).estado, 400, "el beneficio ya fija su producto");
    const ok = await m.recepcion.post(`/api/beneficios/${y.aplicacion.id}/entregar`, {});
    assert.equal(ok.estado, 200, JSON.stringify(ok.cuerpo));
    assert.equal(await stockDe(fijo.id), 4);
  } finally {
    await apagarFijo();
  }
});

test("CONCURRENCIA: el último uniforme para dos beneficios → entrega uno; el otro recibe sin_stock y sigue liberado. Y 8 entregas simultáneas del MISMO beneficio entregan una sola vez", async () => {
  const uniforme = await producto({ stock: 1, nombre: "Último uniforme" });
  const apagar = await promocionConUniforme();
  try {
    const [x, y] = [await inscritoYPagado(), await inscritoYPagado()];
    const rs = await Promise.all([m.recepcion.post(`/api/beneficios/${x.aplicacion.id}/entregar`, { producto_id: uniforme.id }), m.recepcion.post(`/api/beneficios/${y.aplicacion.id}/entregar`, { producto_id: uniforme.id })]);
    assert.deepEqual(rs.map((r) => r.estado).sort(), [200, 409]);
    assert.equal(await stockDe(uniforme.id), 0);
    const perdedor = rs[0]!.estado === 409 ? x : y;
    assert.equal((await liberadoDe(perdedor.inscripcionId)).estatus, "liberado");
    // El mismo beneficio entregado 8 veces a la vez.
    const otro = await producto({ stock: 20, nombre: "Uniformes" });
    const z = await inscritoYPagado();
    const ocho = await Promise.all(Array.from({ length: 8 }, () => m.recepcion.post(`/api/beneficios/${z.aplicacion.id}/entregar`, { producto_id: otro.id })));
    assert.equal(ocho.filter((r) => r.estado === 200).length, 1, JSON.stringify(ocho.map((r) => r.estado)));
    assert.equal(ocho.filter((r) => r.estado >= 500).length, 0);
    assert.equal(await stockDe(otro.id), 19);
    assert.equal(await prisma.venta.count({ where: { promocion_aplicacion_id: z.aplicacion.id } }), 1);
  } finally {
    await apagar();
  }
});

test("EH-05: vender con una sucursal que no existe, o que es de OTRA organización, es 400 (no 500), y no mueve stock ni deja venta ni cargo", async () => {
  const p = await producto({ stock: 5 });
  const al = await m.alumno();
  const otra = await mundoDeFinanzas(prisma, "Productos otra org");
  try {
    for (const sucursal of [randomUUID(), otra.norte]) {
      const r = await vender(m.admin, al.alumnoId, p.id, 1, { sucursal_id: sucursal });
      assert.equal(r.estado, 400, JSON.stringify(r.cuerpo));
    }
    assert.equal(await stockDe(p.id), 5);
    assert.equal(await prisma.venta.count({ where: { producto_id: p.id } }), 0);
    // La sucursal propia sigue sirviendo.
    assert.equal((await vender(m.admin, al.alumnoId, p.id, 1, { sucursal_id: m.sur })).estado, 201);
    assert.equal(await stockDe(p.id), 4);
  } finally {
    await otra.cerrar();
  }
});
