// H2: pagos. Un pago de la familia se reparte entre varios cargos de varios hijos; parcial; el excedente se rechaza; cancelar no borra; idempotente por clave. Lo que
// mueve dinero se prueba con CONCURRENCIA REAL (barrera forzada, 10–20 hilos) y SALTÁNDOSE EL CÓDIGO por SQL directo: la base falla cerrada (regla de Eduardo).

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { aFecha } from "../catalogo/precios.ts";
import { altaConAlcance, conAlcance } from "../datos/alcance.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeFinanzas, type CargoDeApi, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { levantarApi, sembrarUsuario } from "../testutil/api.ts";

interface PagoDeApi {
  id: string;
  tutor_id: string;
  monto: string;
  monto_aplicado: string;
  estatus: string;
  repetido?: boolean;
  aplicaciones: { cargo_id: string; monto: string; estatus: string; concepto: string }[];
  error?: { codigo: string; detalles?: { campo?: string; mensaje: string }[] };
}

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;

before(async () => {
  prisma = crearPrismaDePruebas(undefined, 60); // pool grande: los hilos de las carreras (20–50) tienen que estar a la vez dentro de su transacción
  m = await mundoDeFinanzas(prisma, "Pagos");
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

const motivo = (r: { cuerpo: PagoDeApi }): string | undefined => r.cuerpo.error?.detalles?.find((d) => d.campo === "motivo")?.mensaje;
async function rechaza(op: () => Promise<unknown>, defensa: RegExp): Promise<void> {
  await assert.rejects(op, (e: Error) => defensa.test(e.message), `la base debía rechazar con ${defensa}`);
}
const cargo = (id: string) => prisma.cargo.findFirstOrThrow({ where: { id } });
const dec = (d: { toFixed(n: number): string }) => d.toFixed(2);

/**
 * Una familia con DOS hijos inscritos: cargos (todos de la misma familia)
 *   hijo 1: inscripción 500.00 vence 2026-11-10, mensualidad 1000.00 vence 2026-11-12
 *   hijo 2: inscripción 500.00 vence 2026-11-10, mensualidad 1000.00 vence 2026-11-20
 * Total adeudado: 3000.00. El orden «más antiguo primero» es: insc. hijo 1, insc. hijo 2, mens. hijo 1, mens. hijo 2.
 */
async function familia(o: { mensualidad?: string } = {}) {
  const { grupoId } = await m.programa({ ...(o.mensualidad ? { mensualidad: o.mensualidad } : {}) });
  const a1 = await m.alumno();
  const a2 = await m.alumno({ conTutor: a1.tutorId });
  const i1 = await m.inscribir({ alumno: a1, grupoId, diaCorte: 12 });
  const i2 = await m.inscribir({ alumno: a2, grupoId, diaCorte: 20 });
  const por = (cs: CargoDeApi[], c: string) => cs.find((x) => x.concepto === c)!;
  return { tutorId: a1.tutorId, i1, i2, insc1: por(i1.cargos, "inscripcion"), insc2: por(i2.cargos, "inscripcion"), mens1: por(i1.cargos, "mensualidad"), mens2: por(i2.cargos, "mensualidad") };
}
const pagar = (cliente: typeof m.recepcion, tutorId: string, monto: string, extra: Record<string, unknown> = {}) => cliente.post<PagoDeApi>("/api/pagos", { tutor_id: tutorId, monto, metodo: "efectivo", ...extra });

test("un pago de la mamá cubre las cuentas de DOS hijos, más antiguo primero, y la base queda cuadrada", async () => {
  const f = await familia();
  const r = await pagar(m.recepcion, f.tutorId, "3000.00");
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  assert.deepEqual([r.cuerpo.monto, r.cuerpo.monto_aplicado, r.cuerpo.estatus, r.cuerpo.repetido], ["3000.00", "3000.00", "aplicado", false]);
  assert.deepEqual(r.cuerpo.aplicaciones.map((a) => a.cargo_id).sort(), [f.insc1.id, f.insc2.id, f.mens1.id, f.mens2.id].sort());
  for (const c of [f.insc1, f.insc2, f.mens1, f.mens2]) {
    const fila = await cargo(c.id);
    assert.deepEqual([fila.estatus, dec(fila.monto_pagado)], ["pagado", dec(fila.monto_final)]);
  }
  // Ya no se debe nada: otro pago se rechaza (no hay saldo a favor).
  const otro = await pagar(m.recepcion, f.tutorId, "1.00");
  assert.equal(otro.estado, 409);
  assert.equal(motivo(otro), "excedente_sin_cargo");
});

test("pago PARCIAL: cubre en orden de antigüedad y el último cargo alcanzado queda pendiente con su saldo", async () => {
  const f = await familia();
  const r = await pagar(m.recepcion, f.tutorId, "700.25", { metodo: "transferencia", referencia: "SPEI 123" });
  assert.equal(r.estado, 201);
  const cubierto = new Map(r.cuerpo.aplicaciones.map((a) => [a.cargo_id, a.monto]));
  assert.deepEqual([...cubierto.entries()], [[f.insc1.id, "500.00"], [f.insc2.id, "200.25"]]);
  const segundo = await cargo(f.insc2.id);
  assert.deepEqual([segundo.estatus, dec(segundo.monto_pagado), dec(segundo.monto_final)], ["pendiente", "200.25", "500.00"]);
  const api = await m.admin.get<CargoDeApi>(`/api/cargos/${f.insc2.id}`);
  assert.deepEqual([api.cuerpo.saldo, api.cuerpo.monto_pagado], ["299.75", "200.25"]);
  // El segundo pago completa ese cargo y sigue por el siguiente.
  const r2 = await pagar(m.recepcion, f.tutorId, "1299.75");
  assert.deepEqual(r2.cuerpo.aplicaciones.map((a) => [a.cargo_id, a.monto]), [[f.insc2.id, "299.75"], [f.mens1.id, "1000.00"]]);
});

test("la propuesta dice cómo se repartiría un pago sin registrarlo, y avisa del excedente", async () => {
  const f = await familia();
  const antes = await prisma.pago.count({ where: { tutor_id: f.tutorId } });
  const p = await m.recepcion.get<{ ok: boolean; adeudado: string; aplicaciones: { cargo_id: string; monto: string }[]; excedente: string | null }>(`/api/pagos/propuesta?tutor_id=${f.tutorId}&monto=1100.00`);
  assert.equal(p.estado, 200);
  assert.deepEqual([p.cuerpo.ok, p.cuerpo.adeudado, p.cuerpo.aplicaciones.map((a) => [a.cargo_id, a.monto])], [true, "3000.00", [[f.insc1.id, "500.00"], [f.insc2.id, "500.00"], [f.mens1.id, "100.00"]]]);
  const mucho = await m.recepcion.get<{ ok: boolean; excedente: string }>(`/api/pagos/propuesta?tutor_id=${f.tutorId}&monto=3000.01`);
  assert.deepEqual([mucho.cuerpo.ok, mucho.cuerpo.excedente], [false, "0.01"]);
  assert.equal(await prisma.pago.count({ where: { tutor_id: f.tutorId } }), antes);
});

test("un pago MAYOR a lo adeudado se rechaza entero (409 excedente_sin_cargo) y no deja nada escrito", async () => {
  const f = await familia();
  const r = await pagar(m.recepcion, f.tutorId, "3000.01");
  assert.equal(r.estado, 409);
  assert.equal(motivo(r), "excedente_sin_cargo");
  assert.equal(await prisma.pago.count({ where: { tutor_id: f.tutorId } }), 0);
  assert.equal((await cargo(f.mens1.id)).estatus, "pendiente");
});

test("recepción puede ajustar el reparto a mano, pero tiene que sumar el pago, ser de la familia y no pasar del saldo de cada cargo", async () => {
  const f = await familia();
  const otra = await familia();
  const ok = await pagar(m.recepcion, f.tutorId, "1500.00", { aplicaciones: [{ cargo_id: f.mens2.id, monto: "1000.00" }, { cargo_id: f.mens1.id, monto: "500.00" }] });
  assert.equal(ok.estado, 201, JSON.stringify(ok.cuerpo));
  assert.equal(dec((await cargo(f.mens2.id)).monto_pagado), "1000.00");
  assert.equal(dec((await cargo(f.insc1.id)).monto_pagado), "0.00", "lo que recepción no eligió no se toca");
  const casos: [string, Record<string, unknown>, string][] = [
    ["se aplica de más que el pago", { monto: "100.00", aplicaciones: [{ cargo_id: f.insc1.id, monto: "100.00" }, { cargo_id: f.insc2.id, monto: "50.00" }] }, "reparto_invalido"],
    ["de más: pasa del saldo del cargo", { monto: "600.00", aplicaciones: [{ cargo_id: f.insc1.id, monto: "600.00" }] }, "reparto_invalido"],
    ["cargo de OTRA familia", { monto: "100.00", aplicaciones: [{ cargo_id: otra.insc1.id, monto: "100.00" }] }, "reparto_invalido"],
    ["cargo repetido", { monto: "100.00", aplicaciones: [{ cargo_id: f.insc1.id, monto: "50.00" }, { cargo_id: f.insc1.id, monto: "50.00" }] }, "reparto_invalido"],
    ["el reparto cubre de menos: sobra", { monto: "800.00", aplicaciones: [{ cargo_id: f.insc1.id, monto: "500.00" }] }, "excedente_sin_cargo"],
  ];
  for (const [nombre, cuerpo, esperado] of casos) {
    const r = await pagar(m.recepcion, f.tutorId, String(cuerpo["monto"]), { aplicaciones: cuerpo["aplicaciones"] });
    assert.equal(r.estado, 409, nombre);
    assert.equal(motivo(r), esperado, nombre);
  }
  assert.equal(await prisma.pago.count({ where: { tutor_id: f.tutorId } }), 1, "ningún rechazo dejó un pago");
  assert.equal((await pagar(m.recepcion, f.tutorId, "10.00", { aplicaciones: [{ cargo_id: f.insc1.id, monto: 10.5 }] })).estado, 400, "un número JSON es un flotante");
  assert.equal((await pagar(m.recepcion, f.tutorId, "10.005")).estado, 400);
  assert.equal((await pagar(m.recepcion, f.tutorId, "0.00")).estado, 400);
  assert.equal((await pagar(m.recepcion, f.tutorId, "-5.00")).estado, 400);
  assert.equal((await pagar(m.recepcion, f.tutorId, "10.00", { fecha: "2027-01-01" })).estado, 400, "fecha futura");
});

test("idempotencia: el mismo POST con la misma clave no registra dos pagos; con otro contenido es un conflicto; también por encabezado", async () => {
  const f = await familia();
  const clave = `clave-${randomUUID()}`;
  const a = await pagar(m.recepcion, f.tutorId, "300.00", { clave_idempotencia: clave });
  const b = await pagar(m.recepcion, f.tutorId, "300.00", { clave_idempotencia: clave });
  assert.deepEqual([a.estado, a.cuerpo.repetido, b.estado, b.cuerpo.repetido, a.cuerpo.id === b.cuerpo.id], [201, false, 200, true, true]);
  assert.equal(await prisma.pago.count({ where: { tutor_id: f.tutorId } }), 1);
  assert.equal(dec((await cargo(f.insc1.id)).monto_pagado), "300.00", "el reintento no cobró dos veces");
  const otro = await pagar(m.recepcion, f.tutorId, "301.00", { clave_idempotencia: clave });
  assert.equal(otro.estado, 409);
  assert.equal(motivo(otro), "clave_reutilizada");
  const porEncabezado = await m.recepcion.pedir<PagoDeApi>("POST", "/api/pagos", { tutor_id: f.tutorId, monto: "50.00", metodo: "tarjeta" }, { "idempotency-key": `encabezado-${randomUUID()}` });
  assert.equal(porEncabezado.estado, 201);
  const clave2 = `ok-${randomUUID()}`;
  const [x, y] = [await pagar(m.recepcion, f.tutorId, "10.00", { clave_idempotencia: clave2 }), await pagar(m.admin, f.tutorId, "10.00", { clave_idempotencia: clave2 })];
  assert.equal(x.cuerpo.id, y.cuerpo.id, "otra persona con la misma clave y el mismo contenido recibe el mismo pago");
});

test("cancelar NO borra: el pago pasa a cancelado, sus aplicaciones a revertidas y los cargos recalculan su saldo; no se puede dos veces", async () => {
  const f = await familia();
  const p = await pagar(m.recepcion, f.tutorId, "3000.00");
  // Un cargo con pagos no se puede cancelar: primero se cancela el pago.
  const c = await m.recepcion.post(`/api/cargos/${f.mens1.id}/cancelar`, { motivo: "Intento con pagos" });
  assert.equal(c.estado, 409);
  assert.equal((await m.asesorNorte.post(`/api/pagos/${p.cuerpo.id}/cancelar`, { motivo: "no puede" })).estado, 403);
  assert.equal((await m.recepcion.post(`/api/pagos/${p.cuerpo.id}/cancelar`, {})).estado, 400, "exige motivo");
  const cancelado = await m.recepcion.post<PagoDeApi>(`/api/pagos/${p.cuerpo.id}/cancelar`, { motivo: "Se registró en la familia equivocada" });
  assert.equal(cancelado.estado, 200, JSON.stringify(cancelado.cuerpo));
  assert.deepEqual([cancelado.cuerpo.estatus, cancelado.cuerpo.monto_aplicado, cancelado.cuerpo.aplicaciones.every((a) => a.estatus === "revertida")], ["cancelado", "0.00", true]);
  assert.equal(await prisma.pago.count({ where: { id: p.cuerpo.id } }), 1, "la fila sigue ahí (auditable)");
  assert.equal(await prisma.pago_aplicacion.count({ where: { pago_id: p.cuerpo.id } }), 4);
  for (const x of [f.insc1, f.insc2, f.mens1, f.mens2]) {
    const fila = await cargo(x.id);
    assert.deepEqual([fila.estatus, dec(fila.monto_pagado)], ["pendiente", "0.00"]);
  }
  const otra = await m.recepcion.post(`/api/pagos/${p.cuerpo.id}/cancelar`, { motivo: "Otra vez" });
  assert.equal(otra.estado, 409);
  assert.equal(motivo(otra as { cuerpo: PagoDeApi }), "ya_cancelado");
  // Los cargos vuelven a poder cobrarse (y ahora sí cancelarse).
  assert.equal((await pagar(m.recepcion, f.tutorId, "3000.00")).estado, 201);
  assert.ok(await prisma.registro_cambio.findFirst({ where: { entidad_tipo: "pago", entidad_id: p.cuerpo.id, accion: "actualizar" } }), "la cancelación queda registrada");
});

test("cancelar el pago de un cargo ya pagado lo regresa a pendiente y la cuenta del hijo vuelve a deber", async () => {
  const f = await familia();
  const p1 = await pagar(m.recepcion, f.tutorId, "500.00", { aplicaciones: [{ cargo_id: f.insc1.id, monto: "500.00" }] });
  await pagar(m.recepcion, f.tutorId, "200.00", { aplicaciones: [{ cargo_id: f.insc2.id, monto: "200.00" }] });
  assert.equal((await cargo(f.insc1.id)).estatus, "pagado");
  assert.equal((await m.recepcion.post(`/api/pagos/${p1.cuerpo.id}/cancelar`, { motivo: "Error de captura" })).estado, 200);
  assert.deepEqual([(await cargo(f.insc1.id)).estatus, dec((await cargo(f.insc1.id)).monto_pagado)], ["pendiente", "0.00"]);
  assert.equal(dec((await cargo(f.insc2.id)).monto_pagado), "200.00", "el otro pago sigue intacto");
});

test("permisos y alcance: maestro 403, asesor solo lee, la familia de otra sucursal es 404 y no hay fuga entre organizaciones", async () => {
  const f = await familia();
  const sur = await m.inscribir({ sucursalId: m.sur });
  const p = await pagar(m.recepcion, f.tutorId, "100.00");
  assert.equal((await m.maestro.get("/api/pagos")).estado, 403);
  assert.equal((await m.maestro.get(`/api/pagos/${p.cuerpo.id}`)).estado, 403);
  assert.equal((await m.asesorNorte.get(`/api/pagos/${p.cuerpo.id}`)).estado, 200);
  assert.equal((await pagar(m.asesorNorte, f.tutorId, "10.00")).estado, 403);
  assert.equal((await m.asesorSur.get(`/api/pagos/${p.cuerpo.id}`)).estado, 404);
  assert.equal((await pagar(m.recepcion, sur.tutorId, "10.00")).estado, 404, "recepción del norte no cobra a una familia del sur");
  assert.equal((await m.recepcion.get<{ datos: PagoDeApi[] }>("/api/pagos?limite=100")).cuerpo.datos.some((x) => x.tutor_id === sur.tutorId), false);
  const otro = await mundoDeFinanzas(prisma, "Pagos otra org");
  try {
    assert.equal((await otro.admin.get(`/api/pagos/${p.cuerpo.id}`)).estado, 404);
    assert.equal((await pagar(otro.admin, f.tutorId, "10.00")).estado, 404);
  } finally {
    await otro.cerrar();
  }
});

// ── La base falla cerrada (sin pasar por el código) ──────────────────────────────────────────────────────────────

test("SQL directo: la base rechaza sobrepagar un cargo, pagos que no cubren su monto, aplicaciones a cargos de otra familia o cancelados, y toda edición o borrado", async () => {
  const f = await familia();
  const org = m.org.organizacionId;
  const nuevoPago = (tutorId: string, monto: string) => prisma.pago.create({ data: { organizacion_id: org, tutor_id: tutorId, monto, metodo: "efectivo", fecha: aFecha("2026-11-10") } });

  // Sobrepago de un cargo (500.00) con un pago mayor.
  await rechaza(async () => {
    await prisma.$transaction(async (tx) => {
      const p = await tx.pago.create({ data: { organizacion_id: org, tutor_id: f.tutorId, monto: "500.01", metodo: "efectivo", fecha: aFecha("2026-11-10") } });
      await tx.pago_aplicacion.create({ data: { organizacion_id: org, pago_id: p.id, cargo_id: f.insc1.id, monto_aplicado: "500.01" } });
    });
  }, /cargo_importes_check/);
  // Aplicar más que el monto del pago.
  await rechaza(async () => {
    await prisma.$transaction(async (tx) => {
      const p = await tx.pago.create({ data: { organizacion_id: org, tutor_id: f.tutorId, monto: "100.00", metodo: "efectivo", fecha: aFecha("2026-11-10") } });
      await tx.pago_aplicacion.create({ data: { organizacion_id: org, pago_id: p.id, cargo_id: f.insc1.id, monto_aplicado: "100.01" } });
    });
  }, /pago_importes_check/);
  // Un pago que al confirmar no cubre su monto (no hay saldo a favor).
  await rechaza(() => nuevoPago(f.tutorId, "50.00"), /pago_cubre_su_monto/);
  await rechaza(async () => {
    await prisma.$transaction(async (tx) => {
      const p = await tx.pago.create({ data: { organizacion_id: org, tutor_id: f.tutorId, monto: "100.00", metodo: "efectivo", fecha: aFecha("2026-11-10") } });
      await tx.pago_aplicacion.create({ data: { organizacion_id: org, pago_id: p.id, cargo_id: f.insc1.id, monto_aplicado: "99.99" } });
    });
  }, /pago_cubre_su_monto/);
  // Montos no positivos.
  await rechaza(() => prisma.pago.create({ data: { organizacion_id: org, tutor_id: f.tutorId, monto: "0.00", metodo: "efectivo", fecha: aFecha("2026-11-10") } }), /pago_importes_check/);
  // Cargo de OTRA familia.
  const otra = await familia();
  await rechaza(async () => {
    await prisma.$transaction(async (tx) => {
      const p = await tx.pago.create({ data: { organizacion_id: org, tutor_id: f.tutorId, monto: "100.00", metodo: "efectivo", fecha: aFecha("2026-11-10") } });
      await tx.pago_aplicacion.create({ data: { organizacion_id: org, pago_id: p.id, cargo_id: otra.insc1.id, monto_aplicado: "100.00" } });
    });
  }, /cargo_no_aplicable/);
  // Cargo cancelado.
  assert.equal((await m.recepcion.post(`/api/cargos/${f.insc2.id}/cancelar`, { motivo: "Condonado" })).estado, 200);
  await rechaza(async () => {
    await prisma.$transaction(async (tx) => {
      const p = await tx.pago.create({ data: { organizacion_id: org, tutor_id: f.tutorId, monto: "100.00", metodo: "efectivo", fecha: aFecha("2026-11-10") } });
      await tx.pago_aplicacion.create({ data: { organizacion_id: org, pago_id: p.id, cargo_id: f.insc2.id, monto_aplicado: "100.00" } });
    });
  }, /cargo_no_aplicable/);
  // Pago de otra organización: la llave foránea compuesta.
  const ajena = await mundoDeFinanzas(prisma, "Pagos ajena");
  try {
    const t = (await prisma.tutor.findFirst({ where: { organizacion_id: ajena.org.organizacionId } })) ?? (await prisma.tutor.create({ data: { organizacion_id: ajena.org.organizacionId, nombre: "Ajeno", telefono: `+5255${String(60_000_000 + Math.floor(Math.random() * 9_000_000))}` } }));
    await rechaza(() => prisma.pago.create({ data: { organizacion_id: org, tutor_id: t.id, monto: "10.00", metodo: "efectivo", fecha: aFecha("2026-11-10") } }), /foreign key|Foreign key/i);
  } finally {
    await ajena.cerrar();
  }

  // Un pago válido y luego intentos de editarlo o borrarlo.
  const ok = await pagar(m.recepcion, f.tutorId, "100.00");
  const [pagoId, aplicacionId] = [ok.cuerpo.id, (await prisma.pago_aplicacion.findFirstOrThrow({ where: { pago_id: ok.cuerpo.id } })).id];
  await rechaza(() => prisma.pago.update({ where: { id: pagoId }, data: { monto: "1.00" } }), /pago_inmutable/);
  await rechaza(() => prisma.pago.update({ where: { id: pagoId }, data: { tutor_id: otra.tutorId } }), /pago_inmutable/);
  await rechaza(() => prisma.pago.delete({ where: { id: pagoId } }), /pago_inmutable/);
  await rechaza(() => prisma.pago_aplicacion.update({ where: { id: aplicacionId }, data: { monto_aplicado: "1.00" } }), /solo de anexar|solo anexar/);
  await rechaza(() => prisma.pago_aplicacion.update({ where: { id: aplicacionId }, data: { cargo_id: otra.insc1.id } }), /solo de anexar|solo anexar/);
  await rechaza(() => prisma.pago_aplicacion.delete({ where: { id: aplicacionId } }), /solo de anexar|solo anexar/);
  await rechaza(() => prisma.cargo.delete({ where: { id: f.insc1.id } }), /cargo_inmutable/);
  // Truncar tampoco.
  await rechaza(() => prisma.$executeRawUnsafe('TRUNCATE TABLE "pago_aplicacion", "pago" CASCADE'), /solo de anexar|solo anexar|pago_inmutable|cargo_inmutable/);
  // Poner a mano `monto_pagado` de un cargo sin respaldo de una aplicación pasa los CHECK pero NO el cuadre: lo atrapa la cuadratura (H7), no la base.
  assert.equal(dec((await cargo(f.insc1.id)).monto_pagado), "100.00");
});

test("SQL directo: revertir una aplicación a mano descuenta del cargo y del pago, y el cargo pagado vuelve a pendiente", async () => {
  const f = await familia();
  const p = await pagar(m.recepcion, f.tutorId, "500.00", { aplicaciones: [{ cargo_id: f.insc1.id, monto: "500.00" }] });
  assert.equal((await cargo(f.insc1.id)).estatus, "pagado");
  const ap = await prisma.pago_aplicacion.findFirstOrThrow({ where: { pago_id: p.cuerpo.id } });
  // Revertir SOLO la aplicación (sin cancelar el pago) deja al pago sin cubrir su monto: la base lo rechaza al confirmar.
  await rechaza(() => prisma.pago_aplicacion.update({ where: { id: ap.id }, data: { estatus: "revertida", revertida_en: new Date() } }), /pago_cubre_su_monto/);
  assert.equal((await cargo(f.insc1.id)).estatus, "pagado", "la transacción completa se revirtió");
});

// ── Concurrencia real ───────────────────────────────────────────────────────────────────────────────────────────

/** Un pago crudo (sin pasar por el candado de la familia ni por las reglas del código): solo la base decide. */
async function pagoCrudo(dbx: ReturnType<typeof conAlcance>, tutorId: string, cargoId: string, monto: string): Promise<void> {
  await dbx.$transaction(async (tx) => {
    const p = await tx.pago.create({ data: altaConAlcance({ tutor_id: tutorId, monto, metodo: "efectivo" as const, fecha: aFecha("2026-11-10") }), select: { id: true } });
    await tx.pago_aplicacion.create({ data: altaConAlcance({ pago_id: p.id, cargo_id: cargoId, monto_aplicado: monto }) });
  });
}
/** `n` clientes con la MISMA sesión (se inicia una sola vez: el login tiene su propio límite de intentos). */
async function clientesConSesion(servidor: ReturnType<typeof levantarApi>, rol: "administrador" | "recepcion", n: number) {
  const u = await sembrarUsuario(prisma, m.org.organizacionId, { rol, sucursales: rol === "recepcion" ? [m.norte] : [] });
  const primero = servidor.cliente();
  assert.equal((await primero.login(m.org.slug, u.correo, u.contrasena)).estado, 201);
  return Array.from({ length: n }, () => {
    const c = servidor.cliente();
    c.cookieDeSesion = primero.cookieDeSesion;
    return c;
  });
}
const conBarrera = (n: number) => {
  const barrera = new Barrera(n);
  return { barrera, dbx: conAlcance(conGanchos(prisma, { modelo: "pago_aplicacion", operacion: "create", antes: () => barrera.esperar(5000) }), m.org.organizacionId) };
};

test("CONCURRENCIA (solo la base): 20 pagos de $500 al MISMO cargo de $500 por SQL, sin candado de la familia → gana exactamente uno y nunca se sobrepaga", async () => {
  const f = await familia();
  const { barrera, dbx } = conBarrera(20);
  const rs = await Promise.allSettled(Array.from({ length: 20 }, () => pagoCrudo(dbx, f.tutorId, f.insc1.id, "500.00")));
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1, rs.map((r) => (r.status === "rejected" ? String(r.reason.message).slice(-160) : "ok")).slice(0, 3).join(" | "));
  assert.ok(rs.filter((r) => r.status === "rejected").every((r) => /cargo_importes_check|cargo_no_aplicable/.test((r as PromiseRejectedResult).reason.message)));
  assert.ok(barrera.completa, "los 20 llegaron juntos al disparador (la carrera fue real)");
  const fila = await cargo(f.insc1.id);
  assert.deepEqual([fila.estatus, dec(fila.monto_pagado)], ["pagado", "500.00"]);
  assert.equal(await prisma.pago.count({ where: { tutor_id: f.tutorId } }), 1, "los 19 perdedores no dejaron pago");
});

test("CONCURRENCIA (solo la base): 15 pagos de $100 contra un cargo de $1,000 → entran exactamente 10 y el saldo cuadra al centavo", async () => {
  const f = await familia();
  const { barrera, dbx } = conBarrera(15);
  const rs = await Promise.allSettled(Array.from({ length: 15 }, () => pagoCrudo(dbx, f.tutorId, f.mens1.id, "100.00")));
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 10);
  assert.ok(barrera.completa);
  const fila = await cargo(f.mens1.id);
  assert.deepEqual([fila.estatus, dec(fila.monto_pagado)], ["pagado", "1000.00"]);
  const suma = await prisma.pago_aplicacion.aggregate({ where: { cargo_id: f.mens1.id, estatus: "aplicada" }, _sum: { monto_aplicado: true } });
  assert.equal(dec(suma._sum.monto_aplicado!), "1000.00");
});

test("CONCURRENCIA (solo la base): 12 pagos de $600 contra un cargo de $1,000 (montos que no encajan) → entra uno solo: ni el estatus ni el filtro lo salvan, lo para el CHECK del cargo", async () => {
  const f = await familia();
  const { barrera, dbx } = conBarrera(12);
  const rs = await Promise.allSettled(Array.from({ length: 12 }, () => pagoCrudo(dbx, f.tutorId, f.mens1.id, "600.00")));
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(barrera.completa);
  const fila = await cargo(f.mens1.id);
  assert.deepEqual([fila.estatus, dec(fila.monto_pagado)], ["pendiente", "600.00"]);
});

test("CONCURRENCIA (API): 20 pagos simultáneos de $600 a una familia que debe $3,000 → entran 5, los otros 15 reciben excedente_sin_cargo, ningún 500 y todo cuadra", async () => {
  const f = await familia();
  const barrera = new Barrera(20);
  const apiCarrera = levantarApi(conGanchos(prisma, { modelo: "tutor", operacion: "updateMany", cuando: (a) => JSON.stringify(a["where"]).includes(f.tutorId), antes: () => barrera.esperar(5000) }), { reloj: () => m.reloj.ahora });
  try {
    const clientes = await clientesConSesion(apiCarrera, "administrador", 20);
    const rs = await Promise.all(clientes.map((c) => pagar(c, f.tutorId, "600.00")));
    assert.equal(rs.filter((r) => r.estado === 201).length, 5, JSON.stringify(rs.map((r) => r.estado)));
    assert.equal(rs.filter((r) => r.estado === 409 && motivo(r) === "excedente_sin_cargo").length, 15);
    assert.equal(rs.filter((r) => r.estado >= 500).length, 0);
    assert.ok(barrera.completa, "los 20 llegaron al candado de la familia a la vez");
    for (const c of [f.insc1, f.insc2, f.mens1, f.mens2]) assert.equal((await cargo(c.id)).estatus, "pagado");
    const total = await prisma.pago.aggregate({ where: { tutor_id: f.tutorId, estatus: "aplicado" }, _sum: { monto: true, monto_aplicado: true } });
    assert.equal(dec(total._sum.monto!), "3000.00");
    assert.equal(dec(total._sum.monto_aplicado!), "3000.00");
  } finally {
    await apiCarrera.cerrar();
  }
});

test("CONCURRENCIA: 20 reintentos simultáneos del MISMO pago (misma clave) registran UN solo pago y todos reciben ese pago", async () => {
  const f = await familia();
  const barrera = new Barrera(20);
  const apiCarrera = levantarApi(conGanchos(prisma, { modelo: "tutor", operacion: "updateMany", cuando: (a) => JSON.stringify(a["where"]).includes(f.tutorId), antes: () => barrera.esperar(5000) }), { reloj: () => m.reloj.ahora });
  try {
    const clientes = await clientesConSesion(apiCarrera, "recepcion", 20);
    const clave = `reintento-${randomUUID()}`;
    const rs = await Promise.all(clientes.map((c) => pagar(c, f.tutorId, "250.00", { clave_idempotencia: clave })));
    assert.equal(rs.filter((r) => r.estado === 201).length, 1);
    assert.equal(rs.filter((r) => r.estado === 200 && r.cuerpo.repetido).length, 19);
    assert.equal(new Set(rs.map((r) => r.cuerpo.id)).size, 1);
    assert.equal(await prisma.pago.count({ where: { tutor_id: f.tutorId } }), 1);
    assert.equal(dec((await cargo(f.insc1.id)).monto_pagado), "250.00");
    assert.ok(barrera.completa);
  } finally {
    await apiCarrera.cerrar();
  }
});

test("CONCURRENCIA: 10 cancelaciones simultáneas del mismo pago → una surte efecto, las demás 409, y el saldo de cada cargo se revierte UNA vez", async () => {
  const f = await familia();
  const p = await pagar(m.recepcion, f.tutorId, "1500.00");
  const rs = await Promise.all(Array.from({ length: 10 }, () => m.recepcion.post<PagoDeApi>(`/api/pagos/${p.cuerpo.id}/cancelar`, { motivo: "Cancelación repetida" })));
  assert.equal(rs.filter((r) => r.estado === 200).length, 1, JSON.stringify(rs.map((r) => r.estado)));
  assert.equal(rs.filter((r) => r.estado === 409).length, 9);
  for (const c of [f.insc1, f.insc2, f.mens1, f.mens2]) assert.equal(dec((await cargo(c.id)).monto_pagado), "0.00");
  assert.equal(dec((await prisma.pago.findFirstOrThrow({ where: { id: p.cuerpo.id } })).monto_aplicado), "0.00");
});

test("CONCURRENCIA: pagar un cargo y cancelarlo al mismo tiempo (10 rondas) nunca deja un cargo cancelado con pagos ni un pago sobre un cargo cancelado", async () => {
  for (let ronda = 0; ronda < 10; ronda++) {
    const f = await familia();
    const [pago, cancelar] = await Promise.all([
      pagar(m.recepcion, f.tutorId, "500.00", { aplicaciones: [{ cargo_id: f.insc1.id, monto: "500.00" }] }),
      m.recepcion.post(`/api/cargos/${f.insc1.id}/cancelar`, { motivo: "Carrera de prueba" }),
    ]);
    assert.ok([pago.estado, cancelar.estado].every((e) => e < 500), `ronda ${ronda}: ${pago.estado}/${cancelar.estado}`);
    assert.ok((pago.estado === 201) !== (cancelar.estado === 200), `ronda ${ronda}: exactamente uno gana (${pago.estado}/${cancelar.estado})`);
    const fila = await cargo(f.insc1.id);
    if (cancelar.estado === 200) assert.deepEqual([fila.estatus, dec(fila.monto_pagado)], ["cancelado", "0.00"]);
    else assert.deepEqual([fila.estatus, dec(fila.monto_pagado)], ["pagado", "500.00"]);
  }
});
