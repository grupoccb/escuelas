// H4: beneficios diferidos. El pago que salda la primera mensualidad libera «lo que se gana al pagarla» en la MISMA transacción; una baja no libera nada; cancelar el pago
// lo regresa a pendiente (o lo deja en revisión si ya se entregó); la lista de por entregar es de recepción. La base falla cerrada en las transiciones.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { levantarApi } from "../testutil/api.ts";
import { mundoDeFinanzas, type MundoDeFinanzas } from "../testutil/finanzas.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;

before(async () => {
  prisma = crearPrismaDePruebas(undefined, 40);
  m = await mundoDeFinanzas(prisma, "Beneficios");
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

async function rechaza(op: () => Promise<unknown>, defensa: RegExp): Promise<void> {
  await assert.rejects(op, (e: Error) => defensa.test(e.message), `la base debía rechazar con ${defensa}`);
}
interface Lista { datos: { id: string; inscripcion_id: string; alumno: { id: string; nombre: string; talla_uniforme: string | null }; tutor: { id: string } | null; tipo: string; descripcion: string | null }[]; paginacion: { total: number } }
interface Errores { error: { detalles?: { campo?: string; mensaje: string }[] } }
const motivo = (r: { cuerpo: unknown }): string | undefined => (r.cuerpo as Errores).error?.detalles?.find((d) => d.campo === "motivo")?.mensaje;

/** Una promoción «al pagar la primera mensualidad»: un uniforme (producto) y un 10 % de descuento en la mensualidad, los dos diferidos. Se apaga al terminar. */
async function promocionDiferida(): Promise<() => Promise<void>> {
  const p = await prisma.promocion.create({ data: { organizacion_id: m.org.organizacionId, nombre: `Al pagar ${randomUUID().slice(0, 5)}`, codigo: `D${randomUUID().slice(0, 8)}`, vigencia_desde: new Date("2020-01-01"), condicion_tipo: "al_pagar_primera_mensualidad", acumulable: true, prioridad: 5 } });
  await prisma.promocion_beneficio.create({ data: { organizacion_id: m.org.organizacionId, promocion_id: p.id, tipo: "producto_gratis", modo: "total", momento_disparo: "al_cumplir_condicion", descripcion: "Uniforme" } });
  await prisma.promocion_beneficio.create({ data: { organizacion_id: m.org.organizacionId, promocion_id: p.id, tipo: "descuento_mensualidad", modo: "porcentaje", valor: "10.00", momento_disparo: "al_cumplir_condicion", descripcion: "10 % de la mensualidad" } });
  return async () => void (await prisma.promocion.update({ where: { id: p.id }, data: { activo: false } }));
}
const aplicaciones = (inscripcionId: string) => prisma.promocion_aplicacion.findMany({ where: { inscripcion_id: inscripcionId }, include: { beneficio: true }, orderBy: { beneficio: { tipo: "asc" } } });
const pagar = (tutorId: string, monto: string, extra: Record<string, unknown> = {}) => m.recepcion.post<{ id: string }>("/api/pagos", { tutor_id: tutorId, monto, metodo: "efectivo", ...extra });
const porEntregar = async (cliente = m.recepcion) => (await cliente.get<Lista>("/api/beneficios/por-entregar?limite=100")).cuerpo;

test("inscribir deja los beneficios PENDIENTES; el pago de la inscripción y un pago parcial de la mensualidad no liberan; el que SALDA la primera mensualidad sí, en el mismo POST", async () => {
  const apagar = await promocionDiferida();
  try {
    const i = await m.inscribir({ diaCorte: 12 });
    assert.deepEqual((await aplicaciones(i.inscripcionId)).map((a) => a.estatus), ["pendiente", "pendiente"]);
    const insc = i.cargos.find((c) => c.concepto === "inscripcion")!;
    assert.equal((await pagar(i.tutorId, "500.00", { aplicaciones: [{ cargo_id: insc.id, monto: "500.00" }] })).estado, 201);
    assert.deepEqual((await aplicaciones(i.inscripcionId)).map((a) => a.estatus), ["pendiente", "pendiente"], "pagar la inscripción no libera");
    assert.equal((await pagar(i.tutorId, "999.99")).estado, 201);
    assert.deepEqual((await aplicaciones(i.inscripcionId)).map((a) => a.estatus), ["pendiente", "pendiente"], "un centavo de menos no libera");
    assert.equal((await porEntregar()).paginacion.total >= 0, true);
    const pago = await pagar(i.tutorId, "0.01");
    assert.equal(pago.estado, 201);
    const filas = await aplicaciones(i.inscripcionId);
    assert.deepEqual(filas.map((a) => a.estatus), ["liberado", "liberado"], "en la misma transacción del pago");
    assert.ok(filas.every((a) => a.liberado_por_pago_id === pago.cuerpo.id && a.liberado_en !== null && a.fecha_entrega === null));
    // La lista de recepción.
    const lista = await porEntregar();
    const mios = lista.datos.filter((d) => d.inscripcion_id === i.inscripcionId);
    assert.deepEqual(mios.map((d) => d.tipo).sort(), ["descuento_mensualidad", "producto_gratis"]);
    assert.equal(mios[0]!.tutor?.id, i.tutorId);
  } finally {
    await apagar();
  }
});

test("liberar es idempotente: otro pago después, o repetir el POST con la misma clave, no vuelve a liberar ni cambia la fecha", async () => {
  const apagar = await promocionDiferida();
  try {
    const i = await m.inscribir();
    const clave = `liberar-${randomUUID()}`;
    const p1 = await pagar(i.tutorId, "1500.00", { clave_idempotencia: clave });
    assert.equal(p1.estado, 201);
    const antes = await aplicaciones(i.inscripcionId);
    assert.ok(antes.every((a) => a.estatus === "liberado"));
    const p2 = await pagar(i.tutorId, "1500.00", { clave_idempotencia: clave });
    assert.equal(p2.estado, 200);
    // Un cargo nuevo del mes siguiente y su pago tampoco tocan lo ya liberado.
    const otro = await m.recepcion.post<{ id: string }>("/api/cargos", { alumno_id: i.alumnoId, descripcion: "Cuota de evento", monto: "100.00", fecha_vencimiento: "2026-12-20" });
    assert.equal(otro.estado, 201);
    assert.equal((await pagar(i.tutorId, "100.00")).estado, 201);
    const despues = await aplicaciones(i.inscripcionId);
    assert.deepEqual(despues.map((a) => [a.liberado_en?.toISOString(), a.liberado_por_pago_id]), antes.map((a) => [a.liberado_en?.toISOString(), a.liberado_por_pago_id]));
  } finally {
    await apagar();
  }
});

test("una inscripción dada de BAJA no libera nada, aunque pague (bloqueo de F5); y la lista de por entregar no la muestra", async () => {
  const apagar = await promocionDiferida();
  try {
    const i = await m.inscribir();
    assert.equal((await m.admin.post(`/api/inscripciones/${i.inscripcionId}/baja`, { motivo_baja_id: m.motivoBaja })).estado, 200);
    assert.equal((await pagar(i.tutorId, "1500.00")).estado, 201);
    assert.deepEqual((await aplicaciones(i.inscripcionId)).map((a) => a.estatus), ["pendiente", "pendiente"]);
    assert.equal((await porEntregar()).datos.some((d) => d.inscripcion_id === i.inscripcionId), false);
  } finally {
    await apagar();
  }
});

test("cancelar el pago que liberó el beneficio, sin entregar, lo regresa a pendiente; al pagar de nuevo se libera otra vez", async () => {
  const apagar = await promocionDiferida();
  try {
    const i = await m.inscribir();
    const p = await pagar(i.tutorId, "1500.00");
    assert.ok((await aplicaciones(i.inscripcionId)).every((a) => a.estatus === "liberado"));
    assert.equal((await m.recepcion.post(`/api/pagos/${p.cuerpo.id}/cancelar`, { motivo: "Error de captura" })).estado, 200);
    const filas = await aplicaciones(i.inscripcionId);
    assert.ok(filas.every((a) => a.estatus === "pendiente" && a.liberado_en === null && a.liberado_por_pago_id === null && a.revision_en === null));
    assert.equal((await porEntregar()).datos.some((d) => d.inscripcion_id === i.inscripcionId), false);
    await pagar(i.tutorId, "1500.00");
    assert.ok((await aplicaciones(i.inscripcionId)).every((a) => a.estatus === "liberado"));
  } finally {
    await apagar();
  }
});

test("cancelar el pago de un beneficio que YA se entregó no lo recoge: queda marcado para revisión y deja UNA tarea al asesor", async () => {
  const apagar = await promocionDiferida();
  try {
    const i = await m.inscribir();
    const p = await pagar(i.tutorId, "1500.00");
    const descuento = (await aplicaciones(i.inscripcionId)).find((a) => a.beneficio.tipo === "descuento_mensualidad")!;
    const entrega = await m.recepcion.post<{ estatus: string }>(`/api/beneficios/${descuento.id}/entregar`);
    assert.equal(entrega.estado, 200, JSON.stringify(entrega.cuerpo));
    assert.equal((await m.recepcion.post(`/api/pagos/${p.cuerpo.id}/cancelar`, { motivo: "Se pagó en la familia equivocada" })).estado, 200);
    const filas = await aplicaciones(i.inscripcionId);
    const entregado = filas.find((a) => a.id === descuento.id)!;
    assert.deepEqual([entregado.estatus, entregado.revision_en !== null, entregado.fecha_entrega !== null], ["entregado", true, true]);
    assert.equal(filas.find((a) => a.beneficio.tipo === "producto_gratis")!.estatus, "pendiente", "lo no entregado sí regresa a pendiente");
    const tareas = await prisma.tarea_asesor.findMany({ where: { inscripcion_id: i.inscripcionId, tipo: "beneficio_en_revision" } });
    assert.equal(tareas.length, 1);
    assert.equal(tareas[0]!.estado, "pendiente");
    const visible = await m.asesorNorte.get<{ datos: { tipo: string }[] }>("/api/tareas?tipo=beneficio_en_revision&limite=100");
    assert.ok(visible.cuerpo.datos.length >= 1, "el asesor de la sucursal la ve");
  } finally {
    await apagar();
  }
});

test("la entrega: recepción entrega lo liberado; lo pendiente, lo ya entregado y un producto sin catálogo dan 409; el asesor solo lee; el maestro no ve nada", async () => {
  const apagar = await promocionDiferida();
  try {
    const i = await m.inscribir();
    const [producto, descuento] = [(await aplicaciones(i.inscripcionId)).find((a) => a.beneficio.tipo === "producto_gratis")!, (await aplicaciones(i.inscripcionId)).find((a) => a.beneficio.tipo === "descuento_mensualidad")!];
    const pendiente = await m.recepcion.post(`/api/beneficios/${descuento.id}/entregar`);
    assert.equal(pendiente.estado, 409);
    assert.equal(motivo(pendiente), "no_liberado");
    await pagar(i.tutorId, "1500.00");
    assert.equal((await m.asesorNorte.post(`/api/beneficios/${descuento.id}/entregar`)).estado, 403);
    assert.equal((await m.maestro.get("/api/beneficios/por-entregar")).estado, 403);
    assert.equal((await m.asesorNorte.get("/api/beneficios/por-entregar")).estado, 200);
    assert.equal((await m.asesorSur.get<Lista>("/api/beneficios/por-entregar?limite=100")).cuerpo.datos.some((d) => d.inscripcion_id === i.inscripcionId), false, "otra sucursal no lo ve");
    assert.equal((await m.asesorSur.post(`/api/beneficios/${descuento.id}/entregar`)).estado, 403, "el asesor no entrega, de ninguna sucursal");
    const ok = await m.recepcion.post<{ estatus: string }>(`/api/beneficios/${descuento.id}/entregar`);
    assert.deepEqual([ok.estado, ok.cuerpo.estatus], [200, "entregado"]);
    const otra = await m.recepcion.post(`/api/beneficios/${descuento.id}/entregar`);
    assert.equal(motivo(otra), "ya_entregado");
    assert.equal(motivo(await m.recepcion.post(`/api/beneficios/${producto.id}/entregar`)), "requiere_producto");
    assert.equal((await m.recepcion.post("/api/beneficios/00000000-0000-4000-8000-0000000000aa/entregar")).estado, 404);
    assert.equal((await porEntregar()).datos.some((d) => d.id === descuento.id), false, "ya no está por entregar");
  } finally {
    await apagar();
  }
});

test("SQL directo: la base solo libera con un pago aplicado, la primera mensualidad pagada y una inscripción que no esté de baja; las transiciones son las válidas", async () => {
  const apagar = await promocionDiferida();
  try {
    const i = await m.inscribir();
    const [a] = await aplicaciones(i.inscripcionId);
    const liberar = (pagoId: string | null, id = a!.id) => prisma.promocion_aplicacion.update({ where: { id }, data: { estatus: "liberado", liberado_en: new Date(), liberado_por_pago_id: pagoId } });
    await rechaza(() => liberar(null), /beneficio_sin_pago|promocion_aplicacion_liberacion_check/);
    // Con un pago aplicado de OTRA cosa (la inscripción) pero sin la primera mensualidad pagada.
    const insc = i.cargos.find((c) => c.concepto === "inscripcion")!;
    const p1 = await pagar(i.tutorId, "500.00", { aplicaciones: [{ cargo_id: insc.id, monto: "500.00" }] });
    await rechaza(() => liberar(p1.cuerpo.id), /beneficio_condicion_no_cumplida/);
    await rechaza(() => liberar(randomUUID()), /beneficio_sin_pago|foreign key|Foreign key/i);
    await rechaza(() => prisma.promocion_aplicacion.update({ where: { id: a!.id }, data: { estatus: "pendiente", liberado_en: new Date() } }), /promocion_aplicacion_liberacion_check/);
    // Pagada la mensualidad, pero la inscripción se da de baja ANTES de que se libere (se suelta a mano el candado del código).
    const p2 = await pagar(i.tutorId, "1000.00", { aplicaciones: [{ cargo_id: i.cargos.find((c) => c.concepto === "mensualidad")!.id, monto: "1000.00" }] });
    assert.ok((await aplicaciones(i.inscripcionId)).every((x) => x.estatus === "liberado"));
    // liberado → entregado → nada más.
    await prisma.promocion_aplicacion.update({ where: { id: a!.id }, data: { estatus: "entregado", fecha_entrega: new Date() } });
    await rechaza(() => prisma.promocion_aplicacion.update({ where: { id: a!.id }, data: { estatus: "liberado", fecha_entrega: null } }), /beneficio_transicion_invalida|promocion_aplicacion_entrega_check/);
    await rechaza(() => prisma.promocion_aplicacion.update({ where: { id: a!.id }, data: { estatus: "pendiente", fecha_entrega: null, liberado_en: null, liberado_por_pago_id: null } }), /beneficio_transicion_invalida/);
    // Una inscripción dada de baja: lo pendiente no se puede liberar ni con pago.
    const j = await m.inscribir();
    const jb = await aplicaciones(j.inscripcionId);
    const pj = await pagar(j.tutorId, "1500.00");
    assert.ok((await aplicaciones(j.inscripcionId)).every((x) => x.estatus === "liberado"));
    await prisma.promocion_aplicacion.update({ where: { id: jb[0]!.id }, data: { estatus: "pendiente", liberado_en: null, liberado_por_pago_id: null } });
    await m.admin.post(`/api/inscripciones/${j.inscripcionId}/baja`, { motivo_baja_id: m.motivoBaja });
    await rechaza(() => liberar(pj.cuerpo.id, jb[0]!.id), /beneficio_inscripcion_baja/);
    void p2;
  } finally {
    await apagar();
  }
});

test("CONCURRENCIA: dos pagos parciales simultáneos que juntos saldan la primera mensualidad liberan UNA vez, con el pago que de verdad la saldó", async () => {
  const apagar = await promocionDiferida();
  try {
    const i = await m.inscribir();
    const insc = i.cargos.find((c) => c.concepto === "inscripcion")!;
    const mens = i.cargos.find((c) => c.concepto === "mensualidad")!;
    await pagar(i.tutorId, "500.00", { aplicaciones: [{ cargo_id: insc.id, monto: "500.00" }] });
    const barrera = new Barrera(2);
    const servidor = levantarApi(conGanchos(prisma, { modelo: "tutor", operacion: "updateMany", cuando: (a) => JSON.stringify(a["where"]).includes(i.tutorId), antes: () => barrera.esperar(5000) }), { reloj: () => m.reloj.ahora });
    try {
      const u = await (await import("../testutil/api.ts")).sembrarUsuario(prisma, m.org.organizacionId, { rol: "recepcion", sucursales: [m.norte] });
      const [c1, c2] = [servidor.cliente(), servidor.cliente()];
      assert.equal((await c1.login(m.org.slug, u.correo, u.contrasena)).estado, 201);
      c2.cookieDeSesion = c1.cookieDeSesion;
      const [r1, r2] = await Promise.all([
        c1.post<{ id: string }>("/api/pagos", { tutor_id: i.tutorId, monto: "600.00", metodo: "efectivo", aplicaciones: [{ cargo_id: mens.id, monto: "600.00" }] }),
        c2.post<{ id: string }>("/api/pagos", { tutor_id: i.tutorId, monto: "400.00", metodo: "efectivo", aplicaciones: [{ cargo_id: mens.id, monto: "400.00" }] }),
      ]);
      assert.deepEqual([r1.estado, r2.estado], [201, 201]);
      assert.ok(barrera.completa);
      const filas = await aplicaciones(i.inscripcionId);
      assert.ok(filas.every((a) => a.estatus === "liberado"));
      const ultimo = (await prisma.pago_aplicacion.findMany({ where: { cargo_id: mens.id }, orderBy: { creado_en: "desc" } }))[0]!;
      assert.ok(filas.every((a) => a.liberado_por_pago_id === ultimo.pago_id), "lo liberó el pago que completó la mensualidad");
      assert.equal(new Set(filas.map((a) => a.liberado_por_pago_id)).size, 1);
    } finally {
      await servidor.cerrar();
    }
  } finally {
    await apagar();
  }
});

test("EH-03: pagar el SEGUNDO mes sin el primero no libera nada, ni por el código ni por SQL directo (la base exige la PRIMERA mensualidad pagada)", async () => {
  const apagar = await promocionDiferida();
  try {
    const i = await m.inscribir({ mesesAdelantados: 2 });
    const mensualidades = i.cargos.filter((c) => c.concepto === "mensualidad").sort((a, b) => (a.periodo ?? "").localeCompare(b.periodo ?? ""));
    assert.equal(mensualidades.length, 2);
    const [primera, segunda] = [mensualidades[0]!, mensualidades[1]!];
    // Se paga solo la segunda: el pago se registra (201) y el beneficio sigue pendiente.
    const p = await pagar(i.tutorId, "1000.00", { aplicaciones: [{ cargo_id: segunda.id, monto: "1000.00" }] });
    assert.equal(p.estado, 201, JSON.stringify(p.cuerpo));
    assert.deepEqual((await aplicaciones(i.inscripcionId)).map((a) => a.estatus), ["pendiente", "pendiente"]);
    // Si el código se equivocara, la base lo rechaza.
    const [una] = await aplicaciones(i.inscripcionId);
    await rechaza(() => prisma.promocion_aplicacion.update({ where: { id: una!.id }, data: { estatus: "liberado", liberado_en: new Date(), liberado_por_pago_id: p.cuerpo.id } }), /beneficio_condicion_no_cumplida/);
    // Al pagar la primera, sí.
    assert.equal((await pagar(i.tutorId, "1000.00", { aplicaciones: [{ cargo_id: primera.id, monto: "1000.00" }] })).estado, 201);
    assert.deepEqual((await aplicaciones(i.inscripcionId)).map((a) => a.estatus), ["liberado", "liberado"]);
  } finally {
    await apagar();
  }
});
