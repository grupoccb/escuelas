// V10: causa raíz de la prueba intermitente de pagos parciales («pago PARCIAL: cubre en orden de antigüedad…», `pagos.itest.ts`).
//
// La falla: el segundo pago de 1299.75 salía con sus aplicaciones `[mensualidad hijo 1, inscripción hijo 2]` en lugar de `[inscripción hijo 2, mensualidad hijo 1]`. El REPARTO
// era correcto (se calcula en memoria con vencimiento → concepto → creación → id); lo que fallaba era el ORDEN EN QUE SE LEÍAN las aplicaciones: `ORDER BY creado_en` de
// `pago_aplicacion`. Esa hora la pone el cliente con milisegundos y las aplicaciones de un pago nacen una tras otra en la misma transacción: dos filas pueden compartir el
// milisegundo y entonces la base las devuelve en su orden FÍSICO (que cambia con el espacio libre que dejan las cancelaciones y el vacuum): intermitente por naturaleza.
// No era el reloj (la prueba fija el reloj en 2026-11-10 y las fechas de vencimiento salen siempre 11-10 / 11-12 / 11-10 / 11-20) ni otros tests (cada prueba tiene su organización).
//
// Aquí el estado que dispara la falla se CONSTRUYE (no se espera): filas con la misma hora de creación y guardadas al revés, o con horas al revés. Sin el arreglo, cada prueba
// falla siempre; con él, el orden es el del negocio: el cargo más antiguo primero.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { aFecha } from "../catalogo/precios.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { mundoDeFinanzas, type CargoDeApi, type MundoDeFinanzas } from "../testutil/finanzas.ts";
import { registrarPago } from "./pagos.ts";

interface PagoDeApi {
  id: string;
  aplicaciones: { cargo_id: string; monto: string; concepto: string }[];
}

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;

before(async () => {
  prisma = crearPrismaDePruebas(undefined, 10);
  m = await mundoDeFinanzas(prisma, "Orden de reparto");
});
after(async () => {
  await m.cerrar();
  await prisma.$disconnect();
});

const por = (cs: CargoDeApi[], c: string) => cs.find((x) => x.concepto === c)!;
const org = () => m.org.organizacionId;

/** Los mismos cargos que el fixture de `pagos.itest.ts`: inscripción 500 (vence 11-10) y mensualidad 1000 (11-12 o 11-20) de dos hijos de una misma familia. */
async function familia() {
  const { grupoId } = await m.programa();
  const a1 = await m.alumno();
  const a2 = await m.alumno({ conTutor: a1.tutorId });
  const i1 = await m.inscribir({ alumno: a1, grupoId, diaCorte: 12 });
  const i2 = await m.inscribir({ alumno: a2, grupoId, diaCorte: 20 });
  return { tutorId: a1.tutorId, insc1: por(i1.cargos, "inscripcion"), insc2: por(i2.cargos, "inscripcion"), mens1: por(i1.cargos, "mensualidad"), mens2: por(i2.cargos, "mensualidad") };
}

/**
 * El pago de 1299.75 del escenario de la falla, escrito DIRECTO en la base: la inscripción del hijo 2 (le faltan 299.75 tras un primer pago de 200.25) y la mensualidad del hijo 1.
 * `guardar` dice en qué orden físico se insertan y con qué hora de creación cada aplicación. El primer pago (700.25) se hace por la API.
 */
async function pagoDeLaFalla(f: Awaited<ReturnType<typeof familia>>, guardar: { orden: ("insc2" | "mens1")[]; creadoEn: Record<"insc2" | "mens1", Date> }, clave?: string) {
  const primero = await m.recepcion.post<PagoDeApi>("/api/pagos", { tutor_id: f.tutorId, monto: "700.25", metodo: "efectivo" });
  assert.equal(primero.estado, 201);
  const monto = { insc2: "299.75", mens1: "1000.00" } as const;
  const cargo = { insc2: f.insc2.id, mens1: f.mens1.id } as const;
  const pago = await prisma.$transaction(async (tx) => {
    const p = await tx.pago.create({ data: { organizacion_id: org(), tutor_id: f.tutorId, monto: "1299.75", metodo: "efectivo", fecha: aFecha("2026-11-10"), ...(clave ? { clave_idempotencia: clave } : {}) } });
    for (const que of guardar.orden) await tx.pago_aplicacion.create({ data: { organizacion_id: org(), pago_id: p.id, cargo_id: cargo[que], monto_aplicado: monto[que], creado_en: guardar.creadoEn[que] } });
    return p;
  });
  return pago.id;
}

const concepto = (p: PagoDeApi) => p.aplicaciones.map((a) => `${a.concepto}:${a.monto}`);
const ANTIGUO_PRIMERO = ["inscripcion:299.75", "mensualidad:1000.00"];
const T = new Date("2026-11-10T16:00:00.000Z");

test("la falla tal cual: misma hora de creación y la mensualidad guardada primero → el pago sale con la inscripción primero", async () => {
  const f = await familia();
  const id = await pagoDeLaFalla(f, { orden: ["mens1", "insc2"], creadoEn: { insc2: T, mens1: T } });
  const filas = await prisma.pago_aplicacion.findMany({ where: { pago_id: id }, select: { creado_en: true } });
  assert.equal(new Set(filas.map((x) => x.creado_en.getTime())).size, 1, "las dos aplicaciones comparten la hora de creación (el empate de la falla)");
  const uno = await m.recepcion.get<PagoDeApi>(`/api/pagos/${id}`);
  assert.deepEqual(concepto(uno.cuerpo), ANTIGUO_PRIMERO);
  const lista = await m.recepcion.get<{ datos: PagoDeApi[] }>(`/api/pagos?tutor_id=${f.tutorId}`);
  assert.deepEqual(concepto(lista.cuerpo.datos.find((p) => p.id === id)!), ANTIGUO_PRIMERO, "el listado ordena igual que el detalle");
});

test("horas de creación al revés (la mensualidad se aplicó «antes» que la inscripción): el orden sigue siendo el de antigüedad del cargo", async () => {
  const f = await familia();
  const id = await pagoDeLaFalla(f, { orden: ["insc2", "mens1"], creadoEn: { insc2: new Date(T.getTime() + 5), mens1: T } });
  assert.deepEqual(concepto((await m.recepcion.get<PagoDeApi>(`/api/pagos/${id}`)).cuerpo), ANTIGUO_PRIMERO);
});

test("el reintento con la misma clave de idempotencia devuelve las aplicaciones en el mismo orden de antigüedad", async () => {
  const f = await familia();
  const clave = `orden-${randomUUID()}`;
  await pagoDeLaFalla(f, { orden: ["mens1", "insc2"], creadoEn: { insc2: T, mens1: T } }, clave);
  const r = await m.db.$transaction((tx) => registrarPago(tx, { ahora: T, usuarioId: null }, { tutorId: f.tutorId, monto: 129975n, metodo: "efectivo", clave }));
  assert.equal(r.repetido, true);
  assert.deepEqual(r.aplicaciones.map((a) => a.cargoId), [f.insc2.id, f.mens1.id]);
  const http = await m.recepcion.post<PagoDeApi & { repetido: boolean }>("/api/pagos", { tutor_id: f.tutorId, monto: "1299.75", metodo: "efectivo", clave_idempotencia: clave });
  assert.deepEqual([http.estado, http.cuerpo.repetido], [200, true]);
  assert.deepEqual(concepto(http.cuerpo), ANTIGUO_PRIMERO);
});

/**
 * Una inscripción cuya primera mensualidad vence el MISMO día que la inscripción (corte = día de hoy) y cuyo identificador de mensualidad ordena ANTES que el de la inscripción:
 * justo el caso en que el desempate «por id» pondría la mensualidad primero. Los ids son uuid al azar, así que se inscribe hasta que sale así (50 % por intento; el tope
 * es 2^-40 de fallar por azar, no de pasar por azar).
 */
async function inscripcionConEmpateYMensualidadDePrimero(tutorId?: string) {
  const { grupoId } = await m.programa();
  for (let intento = 0; intento < 40; intento++) {
    const a = await m.alumno(tutorId ? { conTutor: tutorId } : {});
    const i = await m.inscribir({ alumno: a, grupoId, diaCorte: 10 });
    const insc = por(i.cargos, "inscripcion");
    const mens = por(i.cargos, "mensualidad");
    assert.equal(insc.fecha_vencimiento, mens.fecha_vencimiento, "la corte del día de hoy: ambos vencen el mismo día");
    const horas = await prisma.cargo.findMany({ where: { id: { in: [insc.id, mens.id] } }, select: { creado_en: true } });
    assert.equal(new Set(horas.map((h) => h.creado_en.getTime())).size, 1, "nacen en un solo INSERT: misma hora de creación");
    if (mens.id < insc.id) return { tutorId: a.tutorId, insc, mens };
  }
  throw assert.fail("no salió un identificador de mensualidad menor al de la inscripción en 40 intentos");
}

test("inscripción y primera mensualidad con el mismo vencimiento: la inscripción se cubre primero en la propuesta, en el pago y en el estado de cuenta", async () => {
  const { tutorId, insc, mens } = await inscripcionConEmpateYMensualidadDePrimero();
  const propuesta = await m.recepcion.get<{ aplicaciones: { cargo_id: string; monto: string }[] }>(`/api/pagos/propuesta?tutor_id=${tutorId}&monto=600.00`);
  assert.deepEqual(propuesta.cuerpo.aplicaciones.map((a) => [a.cargo_id, a.monto]), [[insc.id, "500.00"], [mens.id, "100.00"]]);
  const cuenta = await m.recepcion.get<{ hijos: { cargos: { id: string }[] }[] }>(`/api/tutores/${tutorId}/estado-cuenta`);
  assert.deepEqual(cuenta.cuerpo.hijos[0]!.cargos.map((c) => c.id), [insc.id, mens.id], "el estado de cuenta lista igual que se cobra");
  const lista = await m.recepcion.get<{ datos: { id: string }[] }>(`/api/cargos?tutor_id=${tutorId}`);
  assert.deepEqual(lista.cuerpo.datos.map((c) => c.id), [insc.id, mens.id], "el listado de cargos también");
  const pago = await m.recepcion.post<PagoDeApi>("/api/pagos", { tutor_id: tutorId, monto: "600.00", metodo: "efectivo" });
  assert.equal(pago.estado, 201);
  assert.deepEqual(pago.cuerpo.aplicaciones.map((a) => [a.cargo_id, a.monto]), [[insc.id, "500.00"], [mens.id, "100.00"]]);
});
