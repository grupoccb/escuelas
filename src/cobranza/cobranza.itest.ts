// H6: cobranza. Recordatorios de pago con el motor de automatizaciones y TODAS las reglas de MessagingProvider: horario 09:00–20:00 de la sucursal (nada de cobranza a las 6 a. m.),
// plantilla de SERVICIO que sale aunque una persona atienda, baja total, frecuencia, idempotencia por cargo y ocurrencia, tope de intentos; se cancelan al saldarse el cargo o darse
// de baja; y una tarea para el asesor cuando la deuda pasa del umbral de días. Sin datos de salud en ningún mensaje.

import { after, afterEach, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { correrAutomatizaciones } from "../automatizaciones/motor.ts";
import { conGanchos } from "../testutil/carrera.ts";
import { barrerFinanzas } from "../finanzas/barrido.ts";
import { MessagingProvider, TransporteFalso } from "../mensajeria/index.ts";
import { guardarSensible } from "../sensibles/index.ts";
import { crearCifrador } from "../sensibles/cifrado.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { fijarConfiguracion, type AlumnoSembrado } from "../testutil/semilla.ts";
import { mundoDeFinanzas, type CargoDeApi, type MundoDeFinanzas } from "../testutil/finanzas.ts";

let prisma: PrismaPruebas;
let m: MundoDeFinanzas;
const cifrador = crearCifrador(randomBytes(32));
const CENTINELA_SALUD = "CENTINELA-H6-ALERGIA";

before(() => {
  prisma = crearPrismaDePruebas(undefined, 30);
});
after(async () => {
  await prisma.$disconnect();
});
// Un mundo NUEVO por prueba: los recordatorios son de toda la organización y las familias de una prueba no deben recibir los de otra.
beforeEach(async () => {
  m = await mundoDeFinanzas(prisma, "Cobranza");
});
afterEach(async () => {
  await m.cerrar();
});

interface Cobranza {
  transporte: TransporteFalso;
  plantillaPorVencer: string;
  plantillaVencido: string;
  corre(iso: string): ReturnType<typeof correrAutomatizaciones>;
  envios(prefijo?: string): { texto: string; variables: Record<string, string> | undefined; codigo: string }[];
  ejecuciones(cargoId: string): Promise<{ ocurrencia: number; estatus: string; motivo_omision: string | null; programado_para: Date; automatizacion_id: string }[]>;
  apagar(): Promise<void>;
}

/** Las dos automatizaciones de cobranza con su plantilla de SERVICIO, y un motor con un transporte falso. Se apagan al terminar (una vez vivas, aplican a todo lo de la organización). */
async function cobranza(o: { porVencer?: boolean; vencido?: boolean; clase?: "servicio" | "marketing"; maxIntentos?: number } = {}): Promise<Cobranza> {
  const n = randomUUID().slice(0, 6);
  const plantilla = (codigo: string, cuerpo: string) =>
    prisma.plantilla_mensaje.create({
      data: {
        organizacion_id: m.org.organizacionId,
        codigo: `${codigo}_${n}`,
        content_sid: "HX0000000000000000000000000000AAAA",
        categoria: "utility",
        clase_mensaje: o.clase ?? "servicio",
        estado_aprobacion: "aprobada",
        cuerpo_referencia: cuerpo,
        variables: [{ pos: 1, nombre: "nombre_prospecto" }, { pos: 2, nombre: "concepto_cargo" }, { pos: 3, nombre: "monto_pendiente" }, { pos: 4, nombre: "fecha_vencimiento" }] as never,
      },
    });
  const pv = await plantilla("recordatorio_pago_por_vencer", "Te recordamos que el pago «{{2}}» de {{1}} por {{3}} vence el {{4}}. Si ya pagaste, ignora este mensaje.");
  const ve = await plantilla("recordatorio_pago_vencido", "El pago «{{2}}» de {{1}} por {{3}} venció el {{4}}. Responde a este mensaje para ayudarte.");
  const automatizaciones: string[] = [];
  const crear = async (nombre: string, evento: "cargo_por_vencer" | "cargo_vencido", offset: number, plantillaId: string, max: number, espaciado: number | null) => {
    const a = await prisma.automatizacion.create({
      data: { organizacion_id: m.org.organizacionId, nombre: `${nombre} ${n}`, evento_disparador: evento, offset_minutos: offset, plantilla_id: plantillaId, max_intentos: max, espaciado_minutos: espaciado, dias_permitidos: [1, 2, 3, 4, 5, 6], condiciones: { max_atraso_dias: 90 } },
    });
    automatizaciones.push(a.id);
  };
  if (o.porVencer !== false) await crear("Por vencer", "cargo_por_vencer", -4320, pv.id, 1, null);
  if (o.vencido !== false) await crear("Vencido", "cargo_vencido", 1440, ve.id, o.maxIntentos ?? 2, 10080);
  const transporte = new TransporteFalso();
  return {
    transporte,
    plantillaPorVencer: pv.codigo,
    plantillaVencido: ve.codigo,
    corre: (iso) => {
      const ahora = new Date(iso);
      m.reloj.ahora = ahora;
      return correrAutomatizaciones({ prisma, mensajeria: new MessagingProvider({ transporte, reloj: () => ahora }), reloj: () => ahora, organizacionId: m.org.organizacionId });
    },
    envios: (prefijo = "recordatorio_pago") => transporte.envios.filter((e) => e.tipo === "plantilla" && e.plantilla?.codigo.startsWith(prefijo)).map((e) => ({ texto: e.texto ?? "", variables: e.plantilla?.variables, codigo: e.plantilla!.codigo })),
    ejecuciones: (cargoId) => prisma.automatizacion_ejecucion.findMany({ where: { entidad_tipo: "cargo", entidad_id: cargoId, automatizacion_id: { in: automatizaciones } }, orderBy: [{ automatizacion_id: "asc" }, { ocurrencia: "asc" }] }),
    apagar: async () => void (await prisma.automatizacion.updateMany({ where: { id: { in: automatizaciones } }, data: { activo: false } })),
  };
}

/** Un alumno inscrito (corte el día 20) con su conversación de WhatsApp, y su inscripción pagada (500.00) para que solo quede la mensualidad (vence 2026-11-20) por cobrar. */
async function familia(o: { conversacion?: boolean; estado?: "bot" | "en_atencion_humana" | "opt_out"; pagarInscripcion?: boolean } = {}) {
  const alumno: AlumnoSembrado = await m.alumno();
  const { grupoId } = await m.programa();
  m.reloj.ahora = new Date("2026-11-10T16:00:00Z");
  const i = await m.inscribir({ alumno, grupoId, diaCorte: 20 });
  const insc = i.cargos.find((c) => c.concepto === "inscripcion")!;
  const mens = i.cargos.find((c) => c.concepto === "mensualidad")!;
  if (o.pagarInscripcion !== false) assert.equal((await m.recepcion.post("/api/pagos", { tutor_id: i.tutorId, monto: "500.00", metodo: "efectivo", aplicaciones: [{ cargo_id: insc.id, monto: "500.00" }] })).estado, 201);
  const conv = o.conversacion === false ? null : await prisma.conversacion.create({ data: { organizacion_id: m.org.organizacionId, bandeja_chatwoot_id: m.org.bandejaId, lead_id: alumno.leadId, chatwoot_conversacion_id: randomInt(1, 2_000_000_000), ...(o.estado ? { estado: o.estado } : {}) } });
  return { ...i, alumno, insc, mens, conv };
}

test("por vencer: 3 días antes, a las 09:00 locales (NUNCA a las 6 a. m.), con el concepto, el monto exacto y la fecha; y no se repite", async () => {
  const c = await cobranza({ vencido: false });
  try {
    const f = await familia();
    // 06:00 locales del 17 de noviembre (12:00 UTC): se programa, pero NO sale.
    const r1 = await c.corre("2026-11-17T12:00:00Z");
    assert.equal(r1.enviadas, 0);
    const [e] = await c.ejecuciones(f.mens.id);
    assert.equal(e!.estatus, "programado");
    assert.equal(e!.programado_para.toISOString(), "2026-11-17T15:00:00.000Z", "las 06:00 locales se recorren a las 09:00");
    assert.equal((await c.corre("2026-11-17T14:59:00Z")).enviadas, 0);
    assert.equal(c.envios().length, 0);
    assert.equal((await c.corre("2026-11-17T15:00:00Z")).enviadas, 1);
    const [envio] = c.envios();
    const nombre = (await prisma.alumno.findFirstOrThrow({ where: { id: f.alumnoId } })).nombre;
    assert.deepEqual(envio!.variables, { "1": nombre, "2": "Mensualidad de noviembre de 2026", "3": "$1,000.00", "4": "viernes 20 de noviembre" });
    assert.equal(envio!.texto, `Te recordamos que el pago «Mensualidad de noviembre de 2026» de ${envio!.variables!["1"]} por $1,000.00 vence el viernes 20 de noviembre. Si ya pagaste, ignora este mensaje.`);
    assert.equal((await c.ejecuciones(f.mens.id))[0]!.estatus, "enviado");
    // Idempotente: otra pasada no manda de nuevo.
    assert.equal((await c.corre("2026-11-17T16:00:00Z")).enviadas, 0);
    assert.equal(c.envios().length, 1);
    assert.equal((await c.ejecuciones(f.mens.id)).length, 1);
    // El cargo de la inscripción (ya pagada) no recibió nada.
    assert.equal((await c.ejecuciones(f.insc.id)).length, 0);
  } finally {
    await c.apagar();
  }
});

test("vencido: el domingo no se cobra (pasa al lunes 09:00), el segundo recordatorio sale 7 días después de que salió el primero y no hay un tercero (tope de intentos)", async () => {
  const c = await cobranza({ porVencer: false, maxIntentos: 2 });
  try {
    const f = await familia();
    // El 22 es domingo: el primero (1 día después del vencimiento) se recorre al lunes 23 a las 09:00 locales.
    await c.corre("2026-11-22T16:00:00Z");
    assert.equal(c.envios().length, 0);
    assert.equal((await c.ejecuciones(f.mens.id))[0]!.programado_para.toISOString(), "2026-11-23T15:00:00.000Z");
    assert.equal((await c.corre("2026-11-23T15:00:00Z")).enviadas, 1);
    // Aún no pasan los 7 días (6 días después, el sábado 28): ni se programa el segundo.
    assert.equal((await c.corre("2026-11-28T16:00:00Z")).enviadas, 0);
    assert.equal((await c.ejecuciones(f.mens.id)).length, 1);
    // El segundo toca el domingo 29: se programa para el lunes 30 a las 09:00 y no sale antes.
    assert.equal((await c.corre("2026-11-29T16:00:00Z")).enviadas, 0);
    assert.deepEqual((await c.ejecuciones(f.mens.id)).map((x) => [x.ocurrencia, x.programado_para.toISOString()]), [[1, "2026-11-23T15:00:00.000Z"], [2, "2026-11-30T15:00:00.000Z"]]);
    assert.equal((await c.corre("2026-11-30T14:00:00Z")).enviadas, 0);
    assert.equal((await c.corre("2026-11-30T15:00:00Z")).enviadas, 1);
    assert.deepEqual(c.envios().map((e) => e.codigo), [c.plantillaVencido, c.plantillaVencido]);
    // Ya no hay un tercero, por más que pase el tiempo.
    assert.equal((await c.corre("2026-12-14T16:00:00Z")).enviadas, 0);
    assert.equal((await c.ejecuciones(f.mens.id)).length, 2);
    assert.match(c.envios()[1]!.texto, /venció el viernes 20 de noviembre/);
  } finally {
    await c.apagar();
  }
});

test("se cancela al saldarse el cargo: pagar antes de que salga cancela la ejecución (cargo_saldado) y no sale nada", async () => {
  const c = await cobranza({ vencido: false });
  try {
    const f = await familia();
    await c.corre("2026-11-17T12:00:00Z");
    assert.equal((await c.ejecuciones(f.mens.id))[0]!.estatus, "programado");
    assert.equal((await m.recepcion.post("/api/pagos", { tutor_id: f.tutorId, monto: "1000.00", metodo: "efectivo" })).estado, 201);
    const [e] = await c.ejecuciones(f.mens.id);
    assert.deepEqual([e!.estatus, e!.motivo_omision], ["cancelado", "cargo_saldado"]);
    assert.equal((await c.corre("2026-11-17T15:00:00Z")).enviadas, 0);
    assert.equal(c.envios().length, 0);
    // Un pago PARCIAL no lo cancela, y el recordatorio dice lo que falta.
    const g = await familia();
    await c.corre("2026-11-17T12:00:00Z");
    assert.equal((await m.recepcion.post("/api/pagos", { tutor_id: g.tutorId, monto: "250.50", metodo: "efectivo" })).estado, 201);
    assert.equal((await c.ejecuciones(g.mens.id))[0]!.estatus, "programado");
    await c.corre("2026-11-17T15:00:00Z");
    assert.equal(c.envios().at(-1)!.variables!["3"], "$749.50");
  } finally {
    await c.apagar();
  }
});

test("se cancela al cancelarse el cargo o darse de baja la inscripción (la deuda sigue, pero ya no se le recuerda por WhatsApp)", async () => {
  const c = await cobranza({ vencido: false });
  try {
    const cancelado = await familia();
    const baja = await familia();
    await c.corre("2026-11-17T12:00:00Z");
    assert.equal((await m.recepcion.post(`/api/cargos/${cancelado.mens.id}/cancelar`, { motivo: "Beca de ese mes" })).estado, 200);
    assert.deepEqual([(await c.ejecuciones(cancelado.mens.id))[0]!.estatus, (await c.ejecuciones(cancelado.mens.id))[0]!.motivo_omision], ["cancelado", "cargo_cancelado"]);
    assert.equal((await m.admin.post(`/api/inscripciones/${baja.inscripcionId}/baja`, { motivo_baja_id: m.motivoBaja })).estado, 200);
    assert.deepEqual([(await c.ejecuciones(baja.mens.id))[0]!.estatus, (await c.ejecuciones(baja.mens.id))[0]!.motivo_omision], ["cancelado", "inscripcion_baja"]);
    assert.equal((await c.corre("2026-11-17T15:00:00Z")).enviadas, 0);
    // La baja tampoco recibe recordatorios nuevos aunque el barrido corra de nuevo.
    await c.corre("2026-11-20T15:00:00Z");
    assert.equal((await c.ejecuciones(baja.mens.id)).length, 1);
    const cargo = await prisma.cargo.findFirstOrThrow({ where: { id: baja.mens.id } });
    assert.equal(cargo.estatus === "pendiente" || cargo.estatus === "vencido", true, "la deuda de la baja sigue abierta");
  } finally {
    await c.apagar();
  }
});

test("MessagingProvider decide con todas sus reglas: baja total no sale, una persona atendiendo SÍ (aviso de servicio), si la plantilla se declara marketing no, el tope diario lo frena y sin conversación queda una tarea", async () => {
  const c = await cobranza({ vencido: false });
  const cMarketing = await cobranza({ vencido: false, clase: "marketing" });
  try {
    const optOut = await familia({ estado: "opt_out" });
    const humana = await familia({ estado: "en_atencion_humana" });
    const sinCanal = await familia({ conversacion: false });
    // La de marketing queda apagada hasta su caso (una sola automatización viva por cargo).
    await cMarketing.apagar();
    await c.corre("2026-11-17T15:00:00Z");
    assert.equal((await c.ejecuciones(optOut.mens.id))[0]!.estatus, "omitido", "baja total");
    assert.equal((await c.ejecuciones(humana.mens.id))[0]!.estatus, "enviado", "INV-6: el recordatorio de pago es de servicio y sale con una persona atendiendo");
    assert.equal((await prisma.conversacion.findUniqueOrThrow({ where: { id: humana.conv!.id } })).estado, "en_atencion_humana", "no le quita la conversación a la persona");
    const [sc] = await c.ejecuciones(sinCanal.mens.id);
    assert.deepEqual([sc!.estatus, sc!.motivo_omision], ["omitido", "sin_conversacion"]);
    const tarea = await prisma.tarea_asesor.findFirstOrThrow({ where: { cargo_id: sinCanal.mens.id, tipo: "cobranza_sin_canal", estado: "pendiente" } });
    assert.match(tarea.descripcion, /\$1,000\.00/);
    assert.ok(((await m.asesorNorte.get<{ datos: { id: string }[] }>("/api/tareas?tipo=cobranza_sin_canal&limite=100")).cuerpo.datos).some((t) => t.id === tarea.id), "la ve el asesor de la sucursal");
    assert.equal(((await m.asesorSur.get<{ datos: { id: string }[] }>("/api/tareas?tipo=cobranza_sin_canal&limite=100")).cuerpo.datos).some((t) => t.id === tarea.id), false);
    await c.apagar();

    // La MISMA plantilla declarada de marketing no sale con una persona atendiendo.
    const cM = await cobranza({ vencido: false, clase: "marketing" });
    const humana2 = await familia({ estado: "en_atencion_humana" });
    await cM.corre("2026-11-17T15:00:00Z");
    const [e2] = await cM.ejecuciones(humana2.mens.id);
    assert.deepEqual([e2!.estatus, e2!.motivo_omision], ["omitido", "atencion_humana"]);
    await cM.apagar();

    // El tope de automáticos por día (configurable por organización) frena el recordatorio.
    await fijarConfiguracion(prisma, m.org.organizacionId, { max_automaticos_por_dia: 0 });
    const cT = await cobranza({ vencido: false });
    const topada = await familia();
    await cT.corre("2026-11-17T15:00:00Z");
    const [e3] = await cT.ejecuciones(topada.mens.id);
    assert.deepEqual([e3!.estatus, e3!.motivo_omision], ["omitido", "tope_frecuencia"]);
    await cT.apagar();
    await fijarConfiguracion(prisma, m.org.organizacionId, { max_automaticos_por_dia: 3 });
  } finally {
    await c.apagar();
    await cMarketing.apagar();
  }
});

test("CONCURRENCIA: 6 motores a la vez sobre el mismo recordatorio mandan UN solo mensaje y dejan UNA ejecución por cargo y ocurrencia", async () => {
  const c = await cobranza({ vencido: false });
  try {
    const f = await familia();
    await c.corre("2026-11-17T12:00:00Z");
    const ahora = new Date("2026-11-17T15:00:00Z");
    m.reloj.ahora = ahora;
    await Promise.all(Array.from({ length: 6 }, () => correrAutomatizaciones({ prisma, mensajeria: new MessagingProvider({ transporte: c.transporte, reloj: () => ahora }), reloj: () => ahora, organizacionId: m.org.organizacionId })));
    assert.equal(c.envios().length, 1);
    assert.equal((await c.ejecuciones(f.mens.id)).length, 1);
    // Y por SQL: la ejecución duplicada la rechaza la llave única (invariante 8).
    const e = (await c.ejecuciones(f.mens.id))[0]!;
    await assert.rejects(prisma.automatizacion_ejecucion.create({ data: { organizacion_id: m.org.organizacionId, automatizacion_id: e.automatizacion_id, entidad_tipo: "cargo", entidad_id: f.mens.id, ocurrencia: 1, programado_para: ahora } }), /Unique constraint|automatizacion_ejecucion_idempotencia_key/);
  } finally {
    await c.apagar();
  }
});

test("tarea para el asesor cuando la deuda pasa del umbral (15 días): una por familia, se resuelve sola al saldarse y una resuelta a mano no se vuelve a crear", async () => {
  const f = await familia({ pagarInscripcion: false });
  const barrer = (iso: string) => {
    m.reloj.ahora = new Date(iso);
    return barrerFinanzas({ prisma, reloj: () => m.reloj.ahora, organizacionId: m.org.organizacionId });
  };
  const tareas = () => prisma.tarea_asesor.findMany({ where: { tipo: "deuda_vencida", inscripcion_id: f.inscripcionId }, orderBy: { creado_en: "asc" } });
  // La inscripción venció el 10 de noviembre: a los 14 días todavía no, a los 15 sí.
  assert.equal((await barrer("2026-11-24T16:00:00Z")).tareasDeCobranza >= 0, true);
  assert.equal((await tareas()).length, 0, "14 días de atraso: aún no");
  await barrer("2026-11-25T16:00:00Z");
  const [t] = await tareas();
  assert.ok(t);
  assert.equal(t.cargo_id, f.insc.id, "ligada al cargo vencido más antiguo");
  assert.match(t.descripcion, /debe \$500\.00/);
  assert.ok(!t.descripcion.includes(CENTINELA_SALUD));
  assert.equal((await m.asesorNorte.get<{ datos: { id: string }[] }>("/api/tareas?tipo=deuda_vencida&limite=100")).cuerpo.datos.some((x) => x.id === t.id), true);
  await barrer("2026-11-26T16:00:00Z");
  await barrer("2026-11-26T17:00:00Z");
  assert.equal((await tareas()).length, 1, "repetir el barrido no la duplica");
  // Se salda: la tarea se resuelve sola.
  assert.equal((await m.recepcion.post("/api/pagos", { tutor_id: f.tutorId, monto: "500.00", metodo: "efectivo", aplicaciones: [{ cargo_id: f.insc.id, monto: "500.00" }] })).estado, 201);
  await barrer("2026-11-26T18:00:00Z");
  assert.deepEqual((await tareas()).map((x) => x.estado), ["hecha"]);
  // El 20 de noviembre venció la mensualidad: a los 15 días (5 de diciembre) abre SU tarea, y si una persona la resuelve a mano no se vuelve a crear.
  await barrer("2026-12-05T16:00:00Z");
  const todas = await tareas();
  assert.equal(todas.length, 2);
  assert.equal(todas[1]!.cargo_id, f.mens.id);
  assert.equal((await m.asesorNorte.patch(`/api/tareas/${todas[1]!.id}`, { estado: "hecha" })).estado, 200);
  await barrer("2026-12-06T16:00:00Z");
  assert.equal((await tareas()).length, 2);
  // El umbral es de la organización.
  await fijarConfiguracion(prisma, m.org.organizacionId, { umbral_dias_deuda: 40 });
  const g = await familia({ pagarInscripcion: false });
  await barrer("2026-12-10T16:00:00Z");
  assert.equal(await prisma.tarea_asesor.count({ where: { tipo: "deuda_vencida", inscripcion_id: g.inscripcionId } }), 0, "con umbral de 40 días, 30 de atraso no cuentan");
  await fijarConfiguracion(prisma, m.org.organizacionId, { umbral_dias_deuda: 15 });
  m.reloj.ahora = new Date("2026-11-10T16:00:00Z");
});

test("SIN datos de salud: ni el texto, ni las variables, ni el envío, ni la ejecución, ni la tarea llevan lo que hay en la ficha de salud del alumno", async () => {
  const c = await cobranza();
  try {
    const f = await familia({ pagarInscripcion: false });
    await guardarSensible(m.db, { usuarioId: m.adminId, organizacionId: m.org.organizacionId, rol: "administrador" }, { sujetoTipo: "alumno", sujetoId: f.alumnoId, motivo: "prueba H6", valores: { alergias: CENTINELA_SALUD, medicamentos: CENTINELA_SALUD } }, { cifrador });
    await c.corre("2026-11-25T16:00:00Z");
    await barrerFinanzas({ prisma, reloj: () => m.reloj.ahora, organizacionId: m.org.organizacionId });
    assert.ok(c.envios().length >= 1, "hubo recordatorios");
    assert.ok(!JSON.stringify(c.transporte.envios).includes(CENTINELA_SALUD));
    assert.ok(!JSON.stringify(await c.ejecuciones(f.mens.id)).includes(CENTINELA_SALUD));
    assert.ok(!(await prisma.mensaje.findMany({ where: { conversacion_id: f.conv!.id } })).some((x) => (x.cuerpo ?? "").includes(CENTINELA_SALUD)));
    assert.ok(!JSON.stringify(await prisma.tarea_asesor.findMany({ where: { inscripcion_id: f.inscripcionId } })).includes(CENTINELA_SALUD));
    // Y lo que SÍ lleva es el nombre de pila, el concepto, el monto y la fecha.
    assert.ok(c.envios().every((e) => /\$/.test(e.texto) && !/alerg|medic/i.test(e.texto)));
    const cargos = await m.admin.get<{ datos: CargoDeApi[] }>(`/api/cargos?inscripcion_id=${f.inscripcionId}`);
    assert.ok(cargos.cuerpo.datos.length >= 2);
  } finally {
    await c.apagar();
    m.reloj.ahora = new Date("2026-11-10T16:00:00Z");
  }
});

test("EH-16: un pago que llega entre que el motor lee el cargo y que arma el mensaje cancela el recordatorio (no sale uno de un cargo ya pagado)", async () => {
  const c = await cobranza({ vencido: false });
  try {
    const f = await familia();
    await c.corre("2026-11-17T12:00:00Z"); // 06:00 locales: se programa para las 09:00
    const ahora = new Date("2026-11-17T15:00:00Z");
    m.reloj.ahora = ahora;
    let pagado = false;
    // Justo después de la PRIMERA lectura del cargo por el motor, la familia paga completo desde otra conexión.
    const conPago = conGanchos(prisma, {
      modelo: "cargo",
      operacion: "findFirst",
      despues: async () => {
        if (pagado) return;
        pagado = true;
        assert.equal((await m.recepcion.post("/api/pagos", { tutor_id: f.tutorId, monto: "1000.00", metodo: "efectivo", aplicaciones: [{ cargo_id: f.mens.id, monto: "1000.00" }] })).estado, 201);
      },
    });
    const r = await correrAutomatizaciones({ prisma: conPago, mensajeria: new MessagingProvider({ transporte: c.transporte, reloj: () => ahora }), reloj: () => ahora, organizacionId: m.org.organizacionId });
    assert.ok(pagado, "el pago se cruzó");
    assert.equal(r.enviadas, 0);
    assert.equal(c.envios().length, 0, "no sale un recordatorio de un cargo ya pagado");
    const [e] = await c.ejecuciones(f.mens.id);
    assert.deepEqual([e!.estatus, e!.motivo_omision], ["omitido", "cargo_saldado"]);
  } finally {
    await c.apagar();
  }
});
