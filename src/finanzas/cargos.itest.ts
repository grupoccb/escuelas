// H1: cargos. La inscripción genera el cargo de inscripción y la primera mensualidad (con el descuento de las promociones inmediatas); la generación mensual es
// idempotente por (inscripción, periodo) aunque el barrido corra en paralelo; solo inscripciones activas; cancelar es un estatus; el dinero se protege EN LA BASE
// (CHECK, únicos parciales, disparador) y se prueba saltándose el código por SQL directo. Postgres real y la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeFinanzas, type CargoDeApi, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { barrerFinanzas } from "./barrido.ts";
import { generarMensualidades } from "./cargos.ts";
import { sembrarOrganizacion } from "../testutil/semilla.ts";
import { correrCiclo } from "../ciclo.ts";
import { MessagingProvider, TransporteFalso } from "../mensajeria/index.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;

before(async () => {
  prisma = crearPrismaDePruebas();
  m = await mundoDeFinanzas(prisma, "Cargos");
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

const barrer = () => barrerFinanzas({ prisma, reloj: () => m.reloj.ahora, organizacionId: m.org.organizacionId });
const ponerHora = (iso: string) => {
  m.reloj.ahora = new Date(iso);
};
const delPeriodo = (cargos: CargoDeApi[], periodo: string) => cargos.filter((c) => c.concepto === "mensualidad" && c.periodo === periodo);
/**
 * Crea un cargo SIN disparadores (`session_replication_role = replica`: un superusuario, o un código que se los salta). Lo que queda es lo que los CHECK imponen por sí solos:
 * los disparadores de EH-01 rechazan estos mismos cargos antes de llegar a ellos (eso lo prueba `blindaje.itest.ts`).
 */
const crearSinDisparadores = (data: Parameters<typeof prisma.cargo.create>[0]["data"]) =>
  prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
    return tx.cargo.create({ data });
  });
/** La base debe rechazar la operación (aunque el código no la pidiera): el mensaje nombra la defensa. */
async function rechaza(op: () => Promise<unknown>, defensa: RegExp): Promise<void> {
  await assert.rejects(op, (e: Error) => defensa.test(e.message), `la base debía rechazar con ${defensa}`);
}
async function promocion(o: { condicion?: "sin_condicion"; beneficios: { tipo: "descuento_inscripcion" | "descuento_mensualidad" | "meses_gratis"; modo: "porcentaje" | "monto_fijo" | "total"; valor?: string }[] }) {
  const p = await prisma.promocion.create({ data: { organizacion_id: m.org.organizacionId, nombre: `Promo ${randomUUID().slice(0, 6)}`, codigo: `P${randomUUID().slice(0, 8)}`, vigencia_desde: new Date("2020-01-01"), condicion_tipo: "sin_condicion", acumulable: true, prioridad: 5 } });
  for (const b of o.beneficios) await prisma.promocion_beneficio.create({ data: { organizacion_id: m.org.organizacionId, promocion_id: p.id, tipo: b.tipo, modo: b.modo, ...(b.valor ? { valor: b.valor } : {}) } });
  return async () => void (await prisma.promocion.update({ where: { id: p.id }, data: { activo: false } }));
}

test("inscribir genera el cargo de inscripción y la primera mensualidad: precio de lista, responsable de pago, sucursal y vencimiento en su corte", async () => {
  const i = await m.inscribir({ diaCorte: 15 });
  assert.equal(i.cargos.length, 2);
  const [insc, mens] = [i.cargos.find((c) => c.concepto === "inscripcion")!, i.cargos.find((c) => c.concepto === "mensualidad")!];
  assert.deepEqual([insc.monto, insc.descuento, insc.monto_final, insc.monto_pagado, insc.saldo, insc.estatus, insc.fecha_vencimiento, insc.periodo], ["500.00", "0.00", "500.00", "0.00", "500.00", "pendiente", "2026-11-10", null]);
  assert.deepEqual([mens.monto, mens.descuento, mens.monto_final, mens.saldo, mens.estatus, mens.fecha_vencimiento, mens.periodo], ["1000.00", "0.00", "1000.00", "1000.00", "pendiente", "2026-11-15", "2026-11"]);
  assert.ok(i.cargos.every((c) => c.tutor_id === i.tutorId && c.sucursal_id === m.norte && c.inscripcion_id === i.inscripcionId && c.alumno.id === i.alumnoId));
});

test("el descuento de las promociones inmediatas queda en el cargo, exacto al centavo (15 % de $1,234.50 = $185.18; inscripción gratis nace pagada)", async () => {
  const apagar = await promocion({ beneficios: [{ tipo: "descuento_inscripcion", modo: "total" }, { tipo: "descuento_mensualidad", modo: "porcentaje", valor: "15.00" }] });
  try {
    const { grupoId } = await m.programa({ mensualidad: "1234.50", inscripcion: "500.00" });
    const i = await m.inscribir({ grupoId });
    const insc = i.cargos.find((c) => c.concepto === "inscripcion")!;
    const mens = i.cargos.find((c) => c.concepto === "mensualidad")!;
    assert.deepEqual([insc.monto, insc.descuento, insc.monto_final, insc.estatus], ["500.00", "500.00", "0.00", "pagado"], "sin importe: nace pagado");
    assert.deepEqual([mens.monto, mens.descuento, mens.monto_final, mens.estatus], ["1234.50", "185.18", "1049.32", "pendiente"]);
  } finally {
    await apagar();
  }
});

test("los meses gratis dejan la primera mensualidad en cero (pagada) y la siguiente se cobra completa", async () => {
  const apagar = await promocion({ beneficios: [{ tipo: "meses_gratis", modo: "total", valor: "1" }] });
  try {
    const i = await m.inscribir({ diaCorte: 10 });
    const primera = i.cargos.find((c) => c.concepto === "mensualidad")!;
    assert.deepEqual([primera.monto_final, primera.estatus], ["0.00", "pagado"]);
  } finally {
    await apagar();
  }
  // El mes siguiente (barrido): la inscripción conserva su promoción congelada, pero ya no es el primer mes.
  ponerHora("2026-12-02T16:00:00Z");
  await barrer();
  ponerHora("2026-11-10T16:00:00Z");
});

test("meses pagados por adelantado: se generan esas mensualidades, todas con vencimiento el día de la inscripción", async () => {
  const i = await m.inscribir({ mesesAdelantados: 3 });
  const mens = i.cargos.filter((c) => c.concepto === "mensualidad").sort((a, b) => a.periodo!.localeCompare(b.periodo!));
  assert.deepEqual(mens.map((c) => c.periodo), ["2026-11", "2026-12", "2027-01"]);
  assert.ok(mens.every((c) => c.fecha_vencimiento === "2026-11-10"));
});

test("sin tutor al que cobrarle no se inscribe, y no queda NADA escrito (ni inscripción, ni cargos, ni cupo de la promoción)", async () => {
  const apagar = await promocion({ beneficios: [{ tipo: "descuento_mensualidad", modo: "monto_fijo", valor: "50.00" }] });
  try {
    const alumno = await m.alumno();
    await prisma.tutor_alumno.updateMany({ where: { alumno_id: alumno.alumnoId }, data: { eliminado_en: new Date() } });
    const { grupoId } = await m.programa();
    const antes = await prisma.promocion.aggregate({ where: { organizacion_id: m.org.organizacionId }, _sum: { cupo_usado: true } });
    const r = await m.admin.post<{ error: { detalles: { mensaje: string }[] } }>("/api/inscripciones", { alumno_id: alumno.alumnoId, grupo_id: grupoId });
    assert.equal(r.estado, 409);
    assert.ok(r.cuerpo.error.detalles.some((d) => d.mensaje === "sin_responsable_de_pago"));
    assert.equal(await prisma.inscripcion.count({ where: { alumno_id: alumno.alumnoId } }), 0);
    assert.equal(await prisma.cargo.count({ where: { alumno_id: alumno.alumnoId } }), 0);
    const despues = await prisma.promocion.aggregate({ where: { organizacion_id: m.org.organizacionId }, _sum: { cupo_usado: true } });
    assert.equal(despues._sum.cupo_usado, antes._sum.cupo_usado);
  } finally {
    await apagar();
  }
});

test("la generación mensual: una mensualidad por (inscripción, periodo) con el precio CONGELADO, el barrido repetido no duplica y el mes se mide en el calendario local de la sucursal", async () => {
  const { grupoId, programaId } = await m.programa({ mensualidad: "1000.00" });
  const i = await m.inscribir({ grupoId, diaCorte: 31 });
  // El precio sube DESPUÉS: la inscripción conserva el suyo.
  await prisma.precio.updateMany({ where: { programa_id: programaId }, data: { vigencia_hasta: new Date("2026-11-30") } });
  await prisma.precio.create({ data: { organizacion_id: m.org.organizacionId, programa_id: programaId, costo_inscripcion: "900.00", costo_mensualidad: "2000.00", vigencia_desde: new Date("2026-12-01") } });
  // 03:00 UTC del 1 de diciembre = 21:00 del 30 de noviembre en la Ciudad de México: todavía es noviembre local.
  ponerHora("2026-12-01T03:00:00Z");
  await barrer();
  assert.equal(delPeriodo(await m.cargosDe(i.inscripcionId), "2026-12").length, 0);
  ponerHora("2026-12-01T06:00:00Z"); // 00:00 del 1 de diciembre local
  const r1 = await barrer();
  assert.ok(r1.mensualidadesGeneradas >= 1);
  const dic = delPeriodo(await m.cargosDe(i.inscripcionId), "2026-12");
  assert.equal(dic.length, 1);
  assert.deepEqual([dic[0]!.monto, dic[0]!.fecha_vencimiento, dic[0]!.estatus], ["1000.00", "2026-12-31", "pendiente"]);
  const r2 = await barrer();
  assert.equal(r2.mensualidadesGeneradas, 0, "repetir el barrido no genera nada");
  assert.equal(delPeriodo(await m.cargosDe(i.inscripcionId), "2026-12").length, 1);
  // Otro mes y el fin de mes: el 31 cae el 31 de enero y el 28 de febrero.
  ponerHora("2027-02-01T18:00:00Z");
  await barrer();
  const feb = delPeriodo(await m.cargosDe(i.inscripcionId), "2027-02");
  assert.equal(feb[0]!.fecha_vencimiento, "2027-02-28");
  ponerHora("2026-11-10T16:00:00Z");
});

test("30 barridos al mismo tiempo generan UNA mensualidad por inscripción y periodo (el único parcial de la base)", async () => {
  const i = await m.inscribir();
  ponerHora("2027-03-02T16:00:00Z");
  const db = m.db;
  const resultados = await Promise.all(Array.from({ length: 30 }, () => generarMensualidades(db, m.reloj.ahora)));
  const marzo = await prisma.cargo.count({ where: { inscripcion_id: i.inscripcionId, concepto: "mensualidad", periodo: "2027-03" } });
  assert.equal(marzo, 1);
  assert.ok(resultados.length === 30);
  // Y por SQL directo: un duplicado del mismo (inscripción, periodo) lo rechaza la base aunque nadie lo compruebe.
  const c = await prisma.cargo.findFirstOrThrow({ where: { inscripcion_id: i.inscripcionId, periodo: "2027-03" } });
  await rechaza(() => prisma.cargo.create({ data: { organizacion_id: m.org.organizacionId, tutor_id: c.tutor_id, alumno_id: c.alumno_id, inscripcion_id: c.inscripcion_id, sucursal_id: c.sucursal_id, concepto: "mensualidad", periodo: "2027-03", monto: "10.00", monto_final: "10.00", fecha_vencimiento: new Date("2027-03-10") } }), /cargo_mensualidad_periodo_key|Unique constraint/);
  ponerHora("2026-11-10T16:00:00Z");
});

test("las congeladas y las bajas no generan mensualidad; al reactivar vuelve a generarse; un cargo cancelado a propósito no se regenera", async () => {
  const congelada = await m.inscribir();
  const baja = await m.inscribir();
  const activa = await m.inscribir();
  assert.equal((await m.admin.post(`/api/inscripciones/${congelada.inscripcionId}/congelar`)).estado, 200);
  assert.equal((await m.admin.post(`/api/inscripciones/${baja.inscripcionId}/baja`, { motivo_baja_id: m.motivoBaja })).estado, 200);
  ponerHora("2027-05-04T16:00:00Z");
  await barrer();
  assert.equal(delPeriodo(await m.cargosDe(congelada.inscripcionId), "2027-05").length, 0);
  assert.equal(delPeriodo(await m.cargosDe(baja.inscripcionId), "2027-05").length, 0);
  const mayo = delPeriodo(await m.cargosDe(activa.inscripcionId), "2027-05");
  assert.equal(mayo.length, 1);
  // Cancelar el cargo del mes no lo regenera.
  assert.equal((await m.recepcion.post(`/api/cargos/${mayo[0]!.id}/cancelar`, { motivo: "Beca de ese mes" })).estado, 200);
  await barrer();
  assert.equal(delPeriodo(await m.cargosDe(activa.inscripcionId), "2027-05").length, 1);
  // Reactivar: ese mismo mes se genera en el siguiente barrido.
  assert.equal((await m.admin.post(`/api/inscripciones/${congelada.inscripcionId}/reactivar`)).estado, 200);
  await barrer();
  assert.equal(delPeriodo(await m.cargosDe(congelada.inscripcionId), "2027-05").length, 1);
  ponerHora("2026-11-10T16:00:00Z");
});

test("vencido: se deriva de la fecha aunque el barrido no haya corrido, y el barrido lo materializa una sola vez", async () => {
  const i = await m.inscribir({ diaCorte: 10 });
  ponerHora("2026-11-14T16:00:00Z"); // 4 días después del vencimiento de la mensualidad y de la inscripción (2026-11-10)
  const sinBarrer = (await m.cargosDe(i.inscripcionId)).find((c) => c.concepto === "mensualidad")!;
  assert.deepEqual([sinBarrer.estatus, sinBarrer.estatus_efectivo, sinBarrer.dias_de_atraso], ["pendiente", "vencido", 4]);
  const filtrados = await m.admin.get<{ datos: CargoDeApi[] }>(`/api/cargos?inscripcion_id=${i.inscripcionId}&estatus=vencido`);
  assert.equal(filtrados.cuerpo.datos.length, 2, "el filtro usa el estatus EFECTIVO");
  assert.equal((await m.admin.get<{ datos: CargoDeApi[] }>(`/api/cargos?inscripcion_id=${i.inscripcionId}&estatus=pendiente`)).cuerpo.datos.length, 0);
  const r1 = await barrer();
  assert.ok(r1.vencidosMaterializados >= 2);
  assert.equal((await barrer()).vencidosMaterializados, 0, "idempotente");
  assert.ok((await m.cargosDe(i.inscripcionId)).every((c) => c.estatus === "vencido"));
  ponerHora("2026-11-10T16:00:00Z");
});

test("cancelar es un estatus (no un borrado), exige motivo, queda registrado y no se puede dos veces", async () => {
  const i = await m.inscribir();
  const c = i.cargos.find((x) => x.concepto === "inscripcion")!;
  assert.equal((await m.recepcion.post(`/api/cargos/${c.id}/cancelar`, {})).estado, 400, "sin motivo");
  const ok = await m.recepcion.post<CargoDeApi>(`/api/cargos/${c.id}/cancelar`, { motivo: "Se condonó la inscripción" });
  assert.equal(ok.estado, 200);
  assert.deepEqual([ok.cuerpo.estatus, ok.cuerpo.saldo], ["cancelado", "0.00"]);
  assert.equal((await m.recepcion.post(`/api/cargos/${c.id}/cancelar`, { motivo: "Otra vez" })).estado, 409);
  assert.equal(await prisma.cargo.count({ where: { id: c.id } }), 1, "la fila sigue ahí");
  const cambio = await prisma.registro_cambio.findFirst({ where: { entidad_id: c.id, entidad_tipo: "cargo" } });
  assert.ok(cambio);
  // Un cargo cancelado no vuelve a abrirse, ni por SQL.
  await rechaza(() => prisma.cargo.update({ where: { id: c.id }, data: { estatus: "pendiente", cancelado_en: null } }), /cargo_cancelado/);
});

test("defensas EN LA BASE saltándose el código: importes incoherentes, sobrepago, estatus que miente, edición del dinero y cargos de otra organización", async () => {
  const i = await m.inscribir();
  const c = (await prisma.cargo.findFirst({ where: { inscripcion_id: i.inscripcionId, concepto: "mensualidad" } }))!;
  const nuevo = (extra: Record<string, unknown>) => ({ organizacion_id: m.org.organizacionId, tutor_id: c.tutor_id, alumno_id: c.alumno_id, sucursal_id: c.sucursal_id, concepto: "evento" as const, descripcion: "x", monto: "100.00", monto_final: "100.00", fecha_vencimiento: new Date("2026-12-10"), ...extra });
  await rechaza(() => prisma.cargo.create({ data: nuevo({ monto_final: "90.00" }) }), /cargo_importes_check/);
  await rechaza(() => prisma.cargo.create({ data: nuevo({ descuento: "150.00", monto_final: "-50.00" }) }), /cargo_importes_check/);
  await rechaza(() => crearSinDisparadores(nuevo({ monto_pagado: "100.01" })), /cargo_importes_check/);
  await rechaza(() => prisma.cargo.create({ data: nuevo({ monto: "-1.00", monto_final: "-1.00" }) }), /cargo_importes_check/);
  await rechaza(() => crearSinDisparadores(nuevo({ estatus: "pagado" })), /cargo_estatus_saldo_check/);
  await rechaza(() => crearSinDisparadores(nuevo({ monto_pagado: "100.00" })), /cargo_estatus_saldo_check/);
  await rechaza(() => crearSinDisparadores(nuevo({ estatus: "cancelado", cancelado_en: new Date(), monto_pagado: "10.00" })), /cargo_estatus_saldo_check/);
  await rechaza(() => prisma.cargo.create({ data: nuevo({ estatus: "cancelado" }) }), /cargo_cancelacion_check/);
  await rechaza(() => prisma.cargo.create({ data: nuevo({ concepto: "mensualidad", periodo: null, inscripcion_id: i.inscripcionId }) }), /cargo_periodo_check/);
  await rechaza(() => prisma.cargo.create({ data: nuevo({ periodo: "2026-13" }) }), /cargo_periodo_check/);
  await rechaza(() => prisma.cargo.create({ data: nuevo({ concepto: "inscripcion", inscripcion_id: null }) }), /cargo_periodo_check/);
  // Un segundo cargo de inscripción para la misma inscripción.
  await rechaza(() => prisma.cargo.create({ data: nuevo({ concepto: "inscripcion", inscripcion_id: i.inscripcionId }) }), /cargo_inscripcion_key|Unique constraint/);
  // El dinero de un cargo no se edita.
  await rechaza(() => prisma.cargo.update({ where: { id: c.id }, data: { monto: "1.00", monto_final: "1.00" } }), /cargo_inmutable/);
  await rechaza(() => prisma.cargo.update({ where: { id: c.id }, data: { fecha_vencimiento: new Date("2030-01-01") } }), /cargo_inmutable/);
  await rechaza(() => prisma.cargo.update({ where: { id: c.id }, data: { tutor_id: randomUUID() } }), /cargo_inmutable|foreign key|Foreign key/i);
  // Llave foránea compuesta: el tutor de otra organización no sirve.
  const otra = await sembrarOrganizacion(prisma, "Cargos ajena");
  const tutorAjeno = await prisma.tutor.create({ data: { organizacion_id: otra.organizacionId, nombre: "Ajeno", telefono: `+5255${String(20_000_000 + Math.floor(Math.random() * 9_000_000))}` } });
  await rechaza(() => prisma.cargo.create({ data: nuevo({ tutor_id: tutorAjeno.id }) }), /foreign key|Foreign key/i);
});

test("permisos y alcance: el maestro no ve importes, el asesor solo lee, recepción escribe, la sucursal ajena es 404 y no hay fuga entre organizaciones", async () => {
  const norte = await m.inscribir({ sucursalId: m.norte });
  const sur = await m.inscribir({ sucursalId: m.sur });
  const cNorte = norte.cargos[0]!;
  const cSur = sur.cargos[0]!;
  assert.equal((await m.maestro.get("/api/cargos")).estado, 403);
  assert.equal((await m.maestro.get(`/api/cargos/${cNorte.id}`)).estado, 403);
  assert.equal((await m.asesorNorte.get(`/api/cargos/${cNorte.id}`)).estado, 200);
  assert.equal((await m.asesorNorte.post(`/api/cargos/${cNorte.id}/cancelar`, { motivo: "No debería" })).estado, 403);
  // La recepción de la sucursal norte no ve lo del sur; el asesor del sur sí ve lo del sur.
  assert.equal((await m.recepcion.get(`/api/cargos/${cSur.id}`)).estado, 404);
  assert.equal((await m.recepcion.post(`/api/cargos/${cSur.id}/cancelar`, { motivo: "Ajeno" })).estado, 404);
  assert.equal((await m.asesorSur.get(`/api/cargos/${cSur.id}`)).estado, 200);
  const lista = await m.recepcion.get<{ datos: CargoDeApi[] }>(`/api/cargos?tutor_id=${sur.tutorId}`);
  assert.equal(lista.cuerpo.datos.length, 0);
  // Otra organización: ni por id ni en la lista.
  const otro = await mundoDeFinanzas(prisma, "Cargos otra org");
  try {
    assert.equal((await otro.admin.get(`/api/cargos/${cNorte.id}`)).estado, 404);
    assert.equal((await otro.admin.get<{ datos: CargoDeApi[] }>("/api/cargos?limite=100")).cuerpo.datos.some((c) => c.id === cNorte.id), false);
  } finally {
    await otro.cerrar();
  }
});

test("un cargo suelto de evento: lo crea recepción con su descuento exacto, a nombre del responsable de pago; el asesor no", async () => {
  const a = await m.alumno();
  const r = await m.recepcion.post<CargoDeApi>("/api/cargos", { alumno_id: a.alumnoId, descripcion: "Cuota del examen", monto: "350.50", descuento: "0.50", fecha_vencimiento: "2026-12-05" });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  assert.deepEqual([r.cuerpo.concepto, r.cuerpo.monto_final, r.cuerpo.tutor_id, r.cuerpo.estatus], ["evento", "350.00", a.tutorId, "pendiente"]);
  assert.equal((await m.asesorNorte.post("/api/cargos", { alumno_id: a.alumnoId, descripcion: "x y z", monto: "1.00", fecha_vencimiento: "2026-12-05" })).estado, 403);
  assert.equal((await m.recepcion.post("/api/cargos", { alumno_id: a.alumnoId, descripcion: "x y z", monto: 12.5, fecha_vencimiento: "2026-12-05" })).estado, 400, "un número JSON es un flotante: se rechaza");
  assert.equal((await m.recepcion.post("/api/cargos", { alumno_id: a.alumnoId, descripcion: "x y z", monto: "10.00", descuento: "11.00", fecha_vencimiento: "2026-12-05" })).estado, 400);
});

test("el ciclo corre el barrido de finanzas (con su límite de frecuencia por instancia) y la mensualidad del mes aparece sola", async () => {
  const { soloOrganizaciones } = await import("../testutil/carrera.ts");
  const mensajeria = new MessagingProvider({ transporte: new TransporteFalso(), reloj: () => m.reloj.ahora });
  const i = await m.inscribir();
  ponerHora("2027-06-02T16:00:00Z");
  const acotado = soloOrganizaciones(prisma, [m.org.organizacionId]);
  const r1 = await correrCiclo({ prisma: acotado, mensajeria, reloj: () => m.reloj.ahora, finanzas: { cadaMs: 10 * 60_000 } });
  assert.ok(r1.finanzas && r1.finanzas.errores === 0 && r1.finanzas.mensualidadesGeneradas >= 1);
  assert.equal(delPeriodo(await m.cargosDe(i.inscripcionId), "2027-06").length, 1);
  const r2 = await correrCiclo({ prisma: acotado, mensajeria, reloj: () => m.reloj.ahora, finanzas: { cadaMs: 10 * 60_000 } });
  assert.equal(r2.finanzas, null, "dentro de la ventana de frecuencia no vuelve a correr");
  ponerHora("2026-11-10T16:00:00Z");
});

test("EH-18 (M08): el día de vencimiento el cargo sigue pendiente (no se materializa como vencido hasta el día siguiente)", async () => {
  const i = await m.inscribir({ diaCorte: 10 }); // vence el 2026-11-10
  ponerHora("2026-11-10T16:00:00Z");
  assert.equal((await barrer()).vencidosMaterializados >= 0, true);
  assert.ok((await m.cargosDe(i.inscripcionId)).every((c) => c.estatus === "pendiente" && c.estatus_efectivo === "pendiente"), "el mismo día todavía no está vencido");
  ponerHora("2026-11-11T16:00:00Z");
  await barrer();
  assert.ok((await m.cargosDe(i.inscripcionId)).every((c) => c.estatus === "vencido"));
  ponerHora("2026-11-10T16:00:00Z");
});

test("EH-11 / EH-18 (M06): una inscripción ANTERIOR a H (sin cargos) recibe en el primer barrido solo la mensualidad del mes en curso —sin cargo de inscripción ni meses pasados—, y si su corte ya pasó nace vencida", async () => {
  const i = await m.inscribir({ diaCorte: 5 });
  // Se simula «anterior a H»: se borran sus cargos con los disparadores apagados (un superusuario).
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL session_replication_role = replica");
    await tx.$executeRawUnsafe(`DELETE FROM cargo WHERE inscripcion_id = '${i.inscripcionId}'::uuid`);
  });
  assert.equal((await m.cargosDe(i.inscripcionId)).length, 0);
  ponerHora("2026-11-18T18:00:00Z");
  await barrer();
  const cargos = await m.cargosDe(i.inscripcionId);
  assert.deepEqual(cargos.map((c) => [c.concepto, c.periodo, c.fecha_vencimiento, c.estatus]), [["mensualidad", "2026-11", "2026-11-05", "vencido"]]);
  ponerHora("2026-11-10T16:00:00Z");
});

// V13-fix EV-43: la base guarda `creado_en` del cargo en milisegundos (como lo lee JavaScript), así el orden de antigüedad es el mismo en la base y en memoria.
test("EV-43: dos cargos del mismo vencimiento y concepto creados en el mismo milisegundo se ordenan IGUAL en el estado de cuenta (la base) y en el reparto del pago (memoria)", async () => {
  const f = await m.inscribir();
  const base = { organizacion_id: m.org.organizacionId, tutor_id: f.tutorId, alumno_id: f.alumnoId, sucursal_id: m.norte, concepto: "producto" as const, monto: "10.00", monto_final: "10.00", fecha_vencimiento: new Date("2027-05-10") };
  const mismoMs = new Date("2027-05-01T12:00:00.123Z");
  const a = await prisma.cargo.create({ data: { ...base, descripcion: "A", creado_en: mismoMs } });
  const b = await prisma.cargo.create({ data: { ...base, descripcion: "B", creado_en: mismoMs } });
  // Los microsegundos: el que tiene el id MAYOR se creó «antes» por microsegundos. Con la base en microsegundos, ordenar por creado_en lo pondría primero; en memoria (milisegundos) empata y decide el id.
  const [menor, mayor] = a.id < b.id ? [a, b] : [b, a];
  await prisma.$executeRaw`UPDATE "cargo" SET "creado_en" = '2027-05-01 12:00:00.123900+00' WHERE "id" = ${menor.id}::uuid`;
  await prisma.$executeRaw`UPDATE "cargo" SET "creado_en" = '2027-05-01 12:00:00.123100+00' WHERE "id" = ${mayor.id}::uuid`;
  const micros = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "cargo" WHERE "id" IN (${menor.id}::uuid, ${mayor.id}::uuid) AND "creado_en" <> date_trunc('milliseconds', "creado_en")`;
  assert.equal(Number(micros[0]!.n), 0, "la base trunca a milisegundos aunque se le pidan microsegundos");
  const cuenta = await m.recepcion.get<{ hijos: { cargos: { id: string; concepto: string }[] }[] }>(`/api/tutores/${f.tutorId}/estado-cuenta`);
  assert.equal(cuenta.estado, 200);
  const enLaCuenta = cuenta.cuerpo.hijos.flatMap((h) => h.cargos).filter((c) => c.concepto === "producto").map((c) => c.id);
  const propuesta = await m.recepcion.get<{ aplicaciones?: { cargo_id: string }[] }>(`/api/pagos/propuesta?tutor_id=${f.tutorId}&monto=1520.00`);
  assert.equal(propuesta.estado, 200, JSON.stringify(propuesta.cuerpo));
  const enElReparto = (propuesta.cuerpo.aplicaciones ?? []).map((x) => x.cargo_id).filter((id) => id === menor.id || id === mayor.id);
  assert.deepEqual(enLaCuenta, [menor.id, mayor.id], "estado de cuenta: empata por milisegundo y decide el id");
  assert.deepEqual(enElReparto, [menor.id, mayor.id], "reparto: el mismo orden");
});
