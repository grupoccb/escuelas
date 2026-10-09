// V1: lo que corre solo (el motor de automatizaciones y los barridos del ciclo) respeta los módulos. Un módulo apagado no programa ni manda nada; lo que ya estaba programado
// se omite sin mandar (queda registrado como `modulo_apagado`); y encenderlo después no revive lo omitido. Postgres real y el transporte falso.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { correrAutomatizaciones } from "../automatizaciones/motor.ts";
import { barrerAvisosMaestro } from "../clases-muestra/avisos.ts";
import { barrerFinanzas } from "../finanzas/barrido.ts";
import { MessagingProvider, TransporteFalso } from "../mensajeria/index.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { fijarConfiguracion, sembrarOrganizacion } from "../testutil/semilla.ts";
import { mundoDeFinanzas } from "../testutil/finanzas.ts";
import { DEFINICION_DE_MODULOS, MODULOS_APAGABLES, MODULO_DE_EVENTO, TODOS_ENCENDIDOS, aFilaDeModulos, type EventoDeAutomatizacion, type ModuloApagable, type ModulosEncendidos } from "./index.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas(undefined, 30);
});
after(async () => {
  await prisma.$disconnect();
});

function apagadoCon(modulo: ModuloApagable): ModulosEncendidos {
  const estado: ModulosEncendidos = { ...TODOS_ENCENDIDOS, [modulo]: false };
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const x of MODULOS_APAGABLES) {
      if (estado[x] && DEFINICION_DE_MODULOS[x].requiere.some((r) => !estado[r])) {
        estado[x] = false;
        cambio = true;
      }
    }
  }
  return estado;
}
const fijar = (organizacionId: string, estado: ModulosEncendidos) => fijarConfiguracion(prisma, organizacionId, aFilaDeModulos(estado));

// ── El motor ejecuta: lo ya programado de un módulo apagado se omite sin mandar ───────────────────────

const CASOS: { evento: EventoDeAutomatizacion; entidad: string; modulo: ModuloApagable }[] = [
  { evento: "promocion_por_vencer", entidad: "aviso_promocion", modulo: "cotizador" },
  { evento: "clase_muestra_proxima", entidad: "clase_muestra", modulo: "clase_muestra" },
  { evento: "clase_muestra_no_asistio", entidad: "clase_muestra", modulo: "clase_muestra" },
  { evento: "clase_muestra_reprogramada", entidad: "clase_muestra", modulo: "clase_muestra" },
  { evento: "clase_muestra_cancelada", entidad: "clase_muestra", modulo: "clase_muestra" },
  { evento: "inscripcion_creada", entidad: "inscripcion", modulo: "inscripcion" },
  { evento: "cargo_por_vencer", entidad: "cargo", modulo: "finanzas" },
  { evento: "cargo_vencido", entidad: "cargo", modulo: "finanzas" },
];

test("la tabla de casos cubre todos los eventos de los módulos apagables (y la operación y los tableros no tienen ninguno que correr solo)", () => {
  const apagables = (Object.keys(MODULO_DE_EVENTO) as EventoDeAutomatizacion[]).filter((e) => MODULO_DE_EVENTO[e] !== "captacion");
  assert.deepEqual(CASOS.map((c) => c.evento).sort(), apagables.sort());
  assert.ok(!(Object.values(MODULO_DE_EVENTO) as string[]).some((m) => m === "operacion" || m === "tableros"));
});

for (const caso of CASOS) {
  test(`${caso.evento} (módulo ${caso.modulo}): apagado, lo ya programado NO se manda: se omite como «modulo_apagado»; encender después no lo revive`, async () => {
    const org = await sembrarOrganizacion(prisma, "Módulos motor");
    const plantilla = await prisma.plantilla_mensaje.create({
      data: { organizacion_id: org.organizacionId, codigo: `p_${randomUUID().slice(0, 6)}`, content_sid: "HX00000000000000000000000000000000", categoria: "utility", clase_mensaje: "servicio", estado_aprobacion: "aprobada", cuerpo_referencia: "Hola {{1}}", variables: [{ pos: 1, nombre: "nombre_prospecto" }] as never },
    });
    const automatizacion = await prisma.automatizacion.create({ data: { organizacion_id: org.organizacionId, nombre: `Prueba ${caso.evento}`, evento_disparador: caso.evento, offset_minutos: 0, plantilla_id: plantilla.id } });
    const ejecucion = (ocurrencia: number) =>
      prisma.automatizacion_ejecucion.create({ data: { organizacion_id: org.organizacionId, automatizacion_id: automatizacion.id, entidad_tipo: caso.entidad, entidad_id: randomUUID(), ocurrencia, programado_para: new Date("2026-11-10T15:00:00Z") } });
    const transporte = new TransporteFalso();
    const motor = (ahora: string) => correrAutomatizaciones({ prisma, mensajeria: new MessagingProvider({ transporte, reloj: () => new Date(ahora) }), reloj: () => new Date(ahora), organizacionId: org.organizacionId });
    const estatusDe = async (id: string) => prisma.automatizacion_ejecucion.findUniqueOrThrow({ where: { id } });

    // Apagado: se omite, sin mandar nada.
    await fijar(org.organizacionId, apagadoCon(caso.modulo));
    const primera = await ejecucion(1);
    const r = await motor("2026-11-10T16:00:00Z");
    assert.equal(r.errores, 0);
    assert.equal(r.enviadas, 0);
    assert.equal(r.omitidas, 1);
    assert.deepEqual([(await estatusDe(primera.id)).estatus, (await estatusDe(primera.id)).motivo_omision], ["omitido", "modulo_apagado"]);
    assert.equal(transporte.envios.length, 0);

    // Encendido: lo omitido se queda omitido (no sale tarde); lo nuevo sigue las reglas de siempre (aquí la entidad no existe: se omite por OTRA razón, no por el módulo).
    await fijar(org.organizacionId, TODOS_ENCENDIDOS);
    const segunda = await ejecucion(2);
    const r2 = await motor("2026-11-10T17:00:00Z");
    assert.equal(r2.errores, 0);
    assert.equal(r2.enviadas, 0);
    assert.equal((await estatusDe(primera.id)).motivo_omision, "modulo_apagado", "no se revive");
    assert.notEqual((await estatusDe(segunda.id)).motivo_omision, "modulo_apagado");
    assert.equal(transporte.envios.length, 0);
  });
}

test("el reenganche (captación) NO depende de ningún interruptor: con todo lo demás apagado, el motor lo sigue ejecutando", async () => {
  const org = await sembrarOrganizacion(prisma, "Módulos captación");
  await fijar(org.organizacionId, { captacion: true, cotizador: false, clase_muestra: false, inscripcion: false, operacion: false, finanzas: false, tableros: false });
  const automatizacion = await prisma.automatizacion.create({ data: { organizacion_id: org.organizacionId, nombre: "Reenganche", evento_disparador: "lead_sin_respuesta", offset_minutos: 1500 } });
  const e = await prisma.automatizacion_ejecucion.create({ data: { organizacion_id: org.organizacionId, automatizacion_id: automatizacion.id, entidad_tipo: "conversacion", entidad_id: randomUUID(), programado_para: new Date("2026-11-10T15:00:00Z") } });
  const r = await correrAutomatizaciones({ prisma, mensajeria: new MessagingProvider({ transporte: new TransporteFalso() }), reloj: () => new Date("2026-11-10T16:00:00Z"), organizacionId: org.organizacionId });
  assert.equal(r.errores, 0);
  assert.notEqual((await prisma.automatizacion_ejecucion.findUniqueOrThrow({ where: { id: e.id } })).motivo_omision, "modulo_apagado");
});

// ── El motor programa y los barridos del ciclo: finanzas ──────────────────────────────────────────────

test("finanzas: apagado, el motor no programa ningún recordatorio de pago y el barrido no genera mensualidades; encendido, sí (idempotente)", async () => {
  const m = await mundoDeFinanzas(prisma, "Módulos finanzas");
  try {
    const n = randomUUID().slice(0, 6);
    const plantilla = await prisma.plantilla_mensaje.create({
      data: { organizacion_id: m.org.organizacionId, codigo: `pago_${n}`, content_sid: "HX0000000000000000000000000000AAAA", categoria: "utility", clase_mensaje: "servicio", estado_aprobacion: "aprobada", cuerpo_referencia: "Pago de {{1}}: {{2}}", variables: [{ pos: 1, nombre: "nombre_prospecto" }, { pos: 2, nombre: "concepto_cargo" }] as never },
    });
    const auto = await prisma.automatizacion.create({
      data: { organizacion_id: m.org.organizacionId, nombre: `Por vencer ${n}`, evento_disparador: "cargo_por_vencer", offset_minutos: -4320, plantilla_id: plantilla.id, dias_permitidos: [1, 2, 3, 4, 5, 6], condiciones: { max_atraso_dias: 90 } },
    });
    m.reloj.ahora = new Date("2026-11-10T16:00:00Z");
    const i = await m.inscribir({ diaCorte: 20 });
    const mens = i.cargos.find((c) => c.concepto === "mensualidad")!;
    const transporte = new TransporteFalso();
    const motor = (iso: string) => correrAutomatizaciones({ prisma, mensajeria: new MessagingProvider({ transporte, reloj: () => new Date(iso) }), reloj: () => new Date(iso), organizacionId: m.org.organizacionId });
    const ejecuciones = () => prisma.automatizacion_ejecucion.count({ where: { automatizacion_id: auto.id, entidad_id: mens.id } });

    // Apagado.
    await fijar(m.org.organizacionId, apagadoCon("finanzas"));
    const apagado = await motor("2026-11-17T12:00:00Z");
    assert.equal(apagado.programadas, 0);
    assert.equal(await ejecuciones(), 0);
    const barridoApagado = await barrerFinanzas({ prisma, reloj: () => new Date("2026-12-10T16:00:00Z"), organizacionId: m.org.organizacionId });
    assert.deepEqual([barridoApagado.mensualidadesGeneradas, barridoApagado.vencidosMaterializados, barridoApagado.tareasDeCobranza, barridoApagado.errores], [0, 0, 0, 0]);
    assert.equal(await prisma.cargo.count({ where: { inscripcion_id: i.inscripcionId, concepto: "mensualidad" } }), 1, "no se generó la mensualidad de diciembre");
    assert.equal((await prisma.cargo.findUniqueOrThrow({ where: { id: mens.id } })).estatus, "pendiente", "ni se venció el cargo de noviembre");

    // Encendido: ahora sí (y solo la del mes en curso, no los meses del apagón).
    await fijar(m.org.organizacionId, TODOS_ENCENDIDOS);
    const encendido = await motor("2026-11-17T12:00:00Z");
    assert.equal(encendido.programadas, 1);
    assert.equal(await ejecuciones(), 1);
    const barrido = await barrerFinanzas({ prisma, reloj: () => new Date("2026-12-10T16:00:00Z"), organizacionId: m.org.organizacionId });
    assert.equal(barrido.mensualidadesGeneradas, 1);
    assert.equal((await barrerFinanzas({ prisma, reloj: () => new Date("2026-12-10T16:00:00Z"), organizacionId: m.org.organizacionId })).mensualidadesGeneradas, 0, "idempotente");
  } finally {
    await m.cerrar();
  }
});

// ── Los avisos al maestro (clase muestra) ──────────────────────────────────────────────────────────────

test("clase muestra: apagada, el barrido de avisos al maestro no toca nada (ni manda ni recupera); encendida, corre", async () => {
  const org = await sembrarOrganizacion(prisma, "Módulos avisos");
  const llamadas: string[] = [];
  const espia = { recuperarAvisosInciertos: async () => (llamadas.push("recuperar"), 0), avisarAInstructor: async () => (llamadas.push("avisar"), { resultado: "enviado" }) } as unknown as MessagingProvider;
  await fijar(org.organizacionId, apagadoCon("clase_muestra"));
  const apagado = await barrerAvisosMaestro({ prisma, mensajeria: espia, organizacionId: org.organizacionId, reloj: () => new Date("2026-11-10T16:00:00Z") });
  assert.equal(apagado.errores, 0);
  assert.deepEqual(llamadas, []);
  await fijar(org.organizacionId, TODOS_ENCENDIDOS);
  await barrerAvisosMaestro({ prisma, mensajeria: espia, organizacionId: org.organizacionId, reloj: () => new Date("2026-11-10T16:00:00Z") });
  assert.deepEqual(llamadas, ["recuperar"]);
});
