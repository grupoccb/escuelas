// K2 / EH-12, EH-13 y EH-19: tres bordes de los pagos que la auditoría de la etapa H dejó pendientes.
//
//  EH-12  repetir la clave de un pago CANCELADO no devuelve «200 y el pago» (la caja lo leía como cobro): es 409 `pago_cancelado`.
//  EH-13  la fecha del pago tiene cota inferior (no se puede fechar en 1900).
//  EH-19  el barrido que materializa los cargos vencidos no se interbloquea con pagos que reparten entre esos mismos cargos en otro orden.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { barrerFinanzas } from "../finanzas/barrido.ts";
import { cuadratura } from "../finanzas/cuadratura.ts";
import { Barrera } from "../testutil/carrera.ts";
import { colectarLogs } from "../testutil/logs.ts";
import { mundoDeFinanzas } from "../testutil/finanzas.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 30);
});
after(async () => {
  await prisma.$disconnect();
});

interface Err {
  error?: { codigo?: string; detalles?: { campo?: string; mensaje: string }[] };
}

test("EH-12: repetir la clave de un pago cancelado es 409 pago_cancelado; la de un pago vigente sigue devolviendo el mismo (200)", async () => {
  const m = await mundoDeFinanzas(prisma, "EH-12");
  try {
    const ins = await m.inscribir();
    const c = ins.cargos.find((x) => x.concepto === "inscripcion")!;
    const cuerpo = { tutor_id: ins.tutorId, monto: "100.00", metodo: "efectivo", clave_idempotencia: `eh12-${randomBytes(6).toString("hex")}`, aplicaciones: [{ cargo_id: c.id, monto: "100.00" }] };
    const uno = await m.recepcion.post<{ id: string }>("/api/pagos", cuerpo);
    assert.equal(uno.estado, 201);
    assert.equal((await m.recepcion.post("/api/pagos", cuerpo)).estado, 200, "el reintento de un pago vigente sigue siendo idempotente");
    assert.equal((await m.admin.post(`/api/pagos/${uno.cuerpo.id}/cancelar`, { motivo: "Error de captura" })).estado, 200);
    const otra = await m.recepcion.post<Err>("/api/pagos", cuerpo);
    assert.equal(otra.estado, 409);
    assert.ok(JSON.stringify(otra.cuerpo).includes("pago_cancelado"), JSON.stringify(otra.cuerpo));
    assert.equal(await prisma.pago.count({ where: { organizacion_id: m.org.organizacionId, tutor_id: ins.tutorId } }), 1, "no se creó un segundo pago");
  } finally {
    await m.cerrar();
  }
});

test("EH-13: un pago no se puede fechar de hace más de 400 días ni en el futuro; hace 30 días sí", async () => {
  const m = await mundoDeFinanzas(prisma, "EH-13");
  try {
    const ins = await m.inscribir();
    const c = ins.cargos.find((x) => x.concepto === "inscripcion")!;
    const pagar = (fecha: string, monto = "10.00") => m.recepcion.post<Err>("/api/pagos", { tutor_id: ins.tutorId, monto, metodo: "efectivo", fecha, aplicaciones: [{ cargo_id: c.id, monto }] });
    const antigua = await pagar("1900-01-01");
    assert.equal(antigua.estado, 400);
    assert.ok(JSON.stringify(antigua.cuerpo).includes("fecha"), JSON.stringify(antigua.cuerpo));
    assert.equal((await pagar("2025-01-01")).estado, 400, "más de 400 días atrás (hoy es 2026-11-10 en la prueba)");
    assert.equal((await pagar("2027-01-01")).estado, 400, "futura");
    assert.equal((await pagar("2026-10-11")).estado, 201, "hace 30 días");
  } finally {
    await m.cerrar();
  }
});

test("EH-19: 4 barridos que vencen 60 cargos a la vez que 60 pagos los reparten en orden contrario → 0 errores, 0 interbloqueos, cuadratura en orden", async () => {
  const logs = colectarLogs();
  const m = await mundoDeFinanzas(prisma, "EH-19");
  try {
    // 30 hermanos de una misma familia: 60 cargos (inscripción y mensualidad de cada uno).
    const primero = await m.inscribir();
    const todos = [primero];
    for (let i = 0; i < 29; i++) todos.push(await m.inscribir({ conTutor: primero.tutorId }));
    const cargos = todos.flatMap((t) => t.cargos);
    assert.equal(cargos.length, 60);
    // Todos vencen en el mismo día, pero siguen «pendiente» hasta que corra el barrido.
    m.reloj.ahora = new Date("2027-03-01T16:00:00Z");
    const barrera = new Barrera(64);
    const pagos = Array.from({ length: 60 }, async (_, i) => {
      await barrera.esperar(15_000);
      const c = cargos[i % 2 === 0 ? i : 59 - i]!;
      return m.recepcion.post<Err>("/api/pagos", { tutor_id: primero.tutorId, monto: "1.00", metodo: "efectivo", clave_idempotencia: `eh19-${i}-${randomBytes(4).toString("hex")}`, aplicaciones: [{ cargo_id: c.id, monto: "1.00" }] });
    });
    const barridos = Array.from({ length: 4 }, async () => {
      await barrera.esperar(15_000);
      return barrerFinanzas({ prisma, reloj: () => m.reloj.ahora, organizacionId: m.org.organizacionId });
    });
    const [rp, rb] = await Promise.all([Promise.all(pagos), Promise.all(barridos)]);
    assert.ok(rp.every((r) => r.estado === 201), JSON.stringify(rp.filter((r) => r.estado !== 201).slice(0, 2)));
    assert.ok(rb.every((b) => b.errores === 0), JSON.stringify(rb));
    assert.ok((await prisma.cargo.count({ where: { organizacion_id: m.org.organizacionId, estatus: "vencido" } })) > 0, "el barrido sí venció cargos");
    assert.equal(logs.lineas.filter((l) => /40P01|deadlock|interbloqueo/i.test(l)).length, 0);
    assert.equal((await cuadratura(m.db)).ok, true);
  } finally {
    logs.detener();
    await m.cerrar();
  }
});

test("V10 / EK-22 (EH-19 determinista): el barrido de vencidos nunca sostiene el candado de un cargo mientras espera otro — un pago que ya tiene el segundo y pide el primero NO se interbloquea", async () => {
  const logs = colectarLogs();
  const m = await mundoDeFinanzas(prisma, "EH-19 determinista");
  try {
    const ins = await m.inscribir();
    const [bajo, alto] = ins.cargos.map((c) => c.id).sort() as [string, string];
    m.reloj.ahora = new Date("2027-03-01T16:00:00Z"); // los dos cargos ya vencieron, pero siguen «pendiente» hasta que corra el barrido
    const barrera = new Barrera(2);
    // El «pago»: toma primero el cargo de id ALTO (el que el barrido toca de último) y, cuando el barrido ya está esperando, pide el de id BAJO.
    const pago = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM cargo WHERE id = ${alto}::uuid FOR UPDATE`;
      await barrera.esperar(5000); // «ya tengo el alto»; el barrido sale a correr
      await new Promise((r) => setTimeout(r, 600)); // le da tiempo al barrido de procesar el bajo y quedar esperando el alto
      await tx.$queryRaw`SELECT id FROM cargo WHERE id = ${bajo}::uuid FOR UPDATE`; // con un UPDATE masivo, el barrido sostendría el bajo y esto sería un interbloqueo
      return "pago listo";
    });
    const barrido = (async () => {
      await barrera.esperar(5000);
      return barrerFinanzas({ prisma, reloj: () => m.reloj.ahora, organizacionId: m.org.organizacionId });
    })();
    const [rp, rb] = await Promise.allSettled([pago, barrido]);
    assert.equal(rp.status, "fulfilled", `el pago no se interbloquea: ${rp.status === "rejected" ? String(rp.reason) : ""}`);
    assert.equal(rb.status, "fulfilled");
    assert.equal((rb as PromiseFulfilledResult<Awaited<typeof barrido>>).value.errores, 0);
    assert.equal(await prisma.cargo.count({ where: { id: { in: [bajo, alto] }, estatus: "vencido" } }), 2, "el barrido terminó de vencer los dos");
    assert.equal(logs.lineas.filter((l) => /40P01|deadlock|interbloqueo/i.test(l)).length, 0);
  } finally {
    logs.detener();
    await m.cerrar();
  }
});
