// Blindaje del dinero EN LA BASE contra quien escribe por SQL directo con el rol de la aplicación (sin dueño, sin TRIGGER, sin `session_replication_role`): EH-01 (los
// contadores del dinero solo los mueven las aplicaciones de pago y lo que mueve dinero no se «borra»), EH-02 (el cargo de una venta no se cancela suelto) y EH-03 (el beneficio
// diferido solo se libera con la PRIMERA mensualidad pagada). Todo con disparadores ACTIVOS: es lo que pasa si el código se equivoca.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeFinanzas, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { cuadratura } from "./cuadratura.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;

before(async () => {
  prisma = crearPrismaDePruebas(undefined, 20);
  m = await mundoDeFinanzas(prisma, "Blindaje");
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

async function rechaza(op: () => Promise<unknown>, defensa: RegExp): Promise<void> {
  await assert.rejects(op, (e: Error) => defensa.test(e.message), `la base debía rechazar con ${defensa}`);
}
const sql = (consulta: string, ...args: unknown[]) => prisma.$executeRawUnsafe(consulta, ...args);

test("EH-01: los contadores del dinero no se falsean por SQL directo (UPDATE o INSERT): cargo «pagado» sin pago, pago «aplicado» sin aplicaciones", async () => {
  const i = await m.inscribir();
  const c = (await prisma.cargo.findFirst({ where: { inscripcion_id: i.inscripcionId, concepto: "mensualidad" } }))!;
  // UPDATE: lo pagado de un cargo (y su paso a «pagado») solo lo mueven las aplicaciones.
  await rechaza(() => sql(`UPDATE cargo SET monto_pagado = monto_final, estatus = 'pagado' WHERE id = $1::uuid`, c.id), /cargo_contadores/);
  await rechaza(() => sql(`UPDATE cargo SET monto_pagado = 10 WHERE id = $1::uuid`, c.id), /cargo_contadores/);
  await rechaza(() => sql(`UPDATE cargo SET estatus = 'pagado' WHERE id = $1::uuid`, c.id), /cargo_contadores|cargo_estatus_saldo_check/);
  // INSERT: un cargo nace sin pagos; solo uno sin importe nace «pagado».
  const nuevo = `INSERT INTO cargo (organizacion_id, tutor_id, alumno_id, sucursal_id, concepto, descripcion, monto, descuento, monto_final, monto_pagado, fecha_vencimiento, estatus)
                 VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'evento', 'x', 100, 0, 100, $5::numeric, '2026-12-10', $6::estatus_cargo)`;
  await rechaza(() => sql(nuevo, c.organizacion_id, c.tutor_id, c.alumno_id, c.sucursal_id, 100, "pagado"), /cargo_contadores/);
  await rechaza(() => sql(nuevo, c.organizacion_id, c.tutor_id, c.alumno_id, c.sucursal_id, 0, "pagado"), /cargo_contadores|cargo_estatus_saldo_check/);
  // El soft-delete de un cargo (sobre todo uno pagado) dejaría que el barrido generara otra mensualidad del mismo periodo.
  await rechaza(() => sql(`UPDATE cargo SET eliminado_en = now() WHERE id = $1::uuid`, c.id), /cargo_inmutable/);
  // Pago: nace sin nada aplicado; lo aplicado solo lo mueven sus aplicaciones; no se borra ni de forma lógica.
  const pagoNuevo = `INSERT INTO pago (organizacion_id, tutor_id, monto, monto_aplicado, metodo, fecha) VALUES ($1::uuid, $2::uuid, 100, 100, 'efectivo', current_date)`;
  await rechaza(() => sql(pagoNuevo, c.organizacion_id, c.tutor_id), /pago_contadores/);
  const p = await m.recepcion.post<{ id: string }>("/api/pagos", { tutor_id: i.tutorId, monto: "100.00", metodo: "efectivo", aplicaciones: [{ cargo_id: c.id, monto: "100.00" }] });
  assert.equal(p.estado, 201);
  await rechaza(() => sql(`UPDATE pago SET monto_aplicado = 50 WHERE id = $1::uuid`, p.cuerpo.id), /pago_contadores/);
  await rechaza(() => sql(`UPDATE pago SET eliminado_en = now() WHERE id = $1::uuid`, p.cuerpo.id), /pago_inmutable/);
  // Una aplicación se revierte (nada más), y no a escondidas de forma lógica.
  await rechaza(() => sql(`UPDATE pago_aplicacion SET eliminado_en = now() WHERE pago_id = $1::uuid`, p.cuerpo.id), /de solo anexar/);
  await rechaza(() => sql(`UPDATE pago_aplicacion SET estatus = 'revertida', revertida_en = now(), eliminado_en = now() WHERE pago_id = $1::uuid`, p.cuerpo.id), /de solo anexar/);
  // Una venta no se «borra»: se anula (devuelve las piezas).
  const ventaId = await vender();
  await rechaza(() => sql(`UPDATE venta SET eliminado_en = now() WHERE id = $1::uuid`, ventaId), /venta_inmutable/);
  // Nada de lo anterior dejó huella: la cuadratura sigue limpia y el cargo conserva lo que de verdad se le aplicó.
  assert.deepEqual((await cuadratura(m.db)).discrepancias, []);
  assert.equal((await prisma.cargo.findFirstOrThrow({ where: { id: c.id } })).monto_pagado.toFixed(2), "100.00");
});

async function vender(): Promise<string> {
  const v = await prisma.vertical.findFirstOrThrow({ where: { organizacion_id: m.org.organizacionId } });
  const pr = await m.admin.post<{ id: string }>("/api/productos", { vertical_id: v.id, nombre: "Gorra", precio: "80.00", stock: 5 });
  const al = await m.alumno();
  const venta = await m.recepcion.post<{ id: string }>("/api/ventas", { alumno_id: al.alumnoId, producto_id: pr.cuerpo.id, cantidad: 1 });
  assert.equal(venta.estado, 201, JSON.stringify(venta.cuerpo));
  return venta.cuerpo.id;
}

test("los caminos legítimos siguen funcionando con los blindajes: pagar, cancelar el pago, cancelar el cargo, vender y anular", async () => {
  const i = await m.inscribir();
  const mens = i.cargos.find((x) => x.concepto === "mensualidad")!;
  const p = await m.recepcion.post<{ id: string }>("/api/pagos", { tutor_id: i.tutorId, monto: "1000.00", metodo: "efectivo", aplicaciones: [{ cargo_id: mens.id, monto: "1000.00" }] });
  assert.equal(p.estado, 201);
  assert.equal((await prisma.cargo.findFirstOrThrow({ where: { id: mens.id } })).estatus, "pagado");
  assert.equal((await m.recepcion.post(`/api/pagos/${p.cuerpo.id}/cancelar`, { motivo: "error de captura" })).estado, 200);
  assert.equal((await prisma.cargo.findFirstOrThrow({ where: { id: mens.id } })).estatus, "pendiente");
  assert.equal((await m.recepcion.post(`/api/cargos/${mens.id}/cancelar`, { motivo: "se condonó" })).estado, 200);
  const venta = await vender();
  assert.equal((await m.recepcion.post(`/api/ventas/${venta}/anular`, { motivo: "se arrepintió" })).estado, 200);
  assert.deepEqual((await cuadratura(m.db)).discrepancias, []);
});

test("EH-02: el cargo de una venta no se cancela suelto (ni por la API ni por SQL): se anula la venta, que devuelve las piezas", async () => {
  const ventaId = await vender();
  const v = await prisma.venta.findFirstOrThrow({ where: { id: ventaId } });
  const cargo = await prisma.cargo.findFirstOrThrow({ where: { venta_id: ventaId } });
  // La API: 409 `de_venta`.
  const r = await m.recepcion.post<{ error: { detalles: { campo?: string; mensaje: string }[] } }>(`/api/cargos/${cargo.id}/cancelar`, { motivo: "sin avisar a nadie" });
  assert.equal(r.estado, 409);
  assert.equal(r.cuerpo.error.detalles.find((d) => d.campo === "motivo")?.mensaje, "de_venta");
  // La base, si el código se equivoca: la venta registrada no se queda sin su cargo.
  await rechaza(() => sql(`UPDATE cargo SET estatus = 'cancelado', cancelado_en = now() WHERE id = $1::uuid`, cargo.id), /venta_cuadra_con_su_cargo/);
  assert.equal((await prisma.cargo.findFirstOrThrow({ where: { id: cargo.id } })).estatus, "pendiente");
  assert.equal((await prisma.producto.findFirstOrThrow({ where: { id: v.producto_id } })).stock, 4);
  // Anular la venta sí cancela su cargo y devuelve la pieza, en una sola transacción.
  assert.equal((await m.recepcion.post(`/api/ventas/${ventaId}/anular`, { motivo: "se arrepintió" })).estado, 200);
  assert.equal((await prisma.cargo.findFirstOrThrow({ where: { id: cargo.id } })).estatus, "cancelado");
  assert.equal((await prisma.producto.findFirstOrThrow({ where: { id: v.producto_id } })).stock, 5);
  assert.deepEqual((await cuadratura(m.db)).discrepancias, []);
});

test("EH-09: un pago cubre un cargo UNA vez: una segunda aplicación del mismo pago al mismo cargo la rechaza el único de la base", async () => {
  const i = await m.inscribir();
  const c = (await prisma.cargo.findFirst({ where: { inscripcion_id: i.inscripcionId, concepto: "mensualidad" } }))!;
  const p = await m.recepcion.post<{ id: string }>("/api/pagos", { tutor_id: i.tutorId, monto: "100.00", metodo: "efectivo", aplicaciones: [{ cargo_id: c.id, monto: "100.00" }] });
  assert.equal(p.estado, 201);
  await rechaza(() => sql(`INSERT INTO pago_aplicacion (organizacion_id, pago_id, cargo_id, monto_aplicado) VALUES ($1::uuid, $2::uuid, $3::uuid, 1)`, c.organizacion_id, p.cuerpo.id, c.id), /pago_aplicacion_pago_cargo_key|Unique constraint/);
  assert.deepEqual((await cuadratura(m.db)).discrepancias, []);
});

test("EH-18 (S02): un pago no se cancela a escondidas con aplicaciones vivas: `pago_cancelacion_check` exige monto_aplicado = 0", async () => {
  const i = await m.inscribir();
  const c = (await prisma.cargo.findFirst({ where: { inscripcion_id: i.inscripcionId, concepto: "mensualidad" } }))!;
  const p = await m.recepcion.post<{ id: string }>("/api/pagos", { tutor_id: i.tutorId, monto: "100.00", metodo: "efectivo", aplicaciones: [{ cargo_id: c.id, monto: "100.00" }] });
  assert.equal(p.estado, 201);
  await rechaza(() => sql(`UPDATE pago SET estatus = 'cancelado', cancelado_en = now() WHERE id = $1::uuid`, p.cuerpo.id), /pago_cancelacion_check/);
  assert.equal((await prisma.pago.findFirstOrThrow({ where: { id: p.cuerpo.id } })).estatus, "aplicado");
});
