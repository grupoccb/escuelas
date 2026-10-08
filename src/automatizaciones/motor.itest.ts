// Reenganche (bloque 1.6) contra Postgres real y el transporte falso: ninguna llamada real.
// Cada prueba usa su propia organización: el motor recorre todas las conversaciones a medias
// de la organización, así que compartirla mezclaría escenarios.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { conAlcance } from "../datos/alcance.ts";
import { procesarEntrante } from "../captacion/entrante.ts";
import { ENVIO_INCIERTO, MessagingProvider, TransporteFalso, type EventoEntrante } from "../mensajeria/index.ts";
import type { TransporteConversaciones } from "../mensajeria/transporte.ts";
import { normalizarTelefono } from "../lib/telefono.ts";
import { fijarConfiguracion, sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { conGanchos } from "../testutil/carrera.ts";
import { correrAutomatizaciones, RECLAMO_VENCE_MS, type DepsMotor } from "./motor.ts";

let prisma: PrismaPruebas;
let siguiente = randomInt(1_000_000, 2_000_000_000);

before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

const HORA = 60 * 60 * 1000;
/** 8-oct-2026 10:00 hora de Ciudad de México (UTC-6). El contacto escribe por última vez. */
const T0 = new Date("2026-10-08T16:00:00Z");
const en = (base: Date, horas: number): Date => new Date(base.getTime() + horas * HORA);

interface Opciones {
  ultimoEntrante?: Date;
  offsetMin?: number;
  maxIntentos?: number;
  plantilla?: { estado?: "aprobada" | "pendiente"; categoria?: "utility" | "marketing"; activo?: boolean; cuerpo?: string | null; variables?: unknown };
  sinPlantilla?: boolean;
  /** Mensajes del contacto antes de quedarse callado. Por defecto solo el saludo ("Hola"). */
  mensajes?: string[];
}

async function escenario(opc: Opciones = {}) {
  const o = await sembrarOrganizacion(prisma, "Motor");
  const ultimo = opc.ultimoEntrante ?? T0;
  const pl = opc.plantilla ?? {};
  const plantilla = await prisma.plantilla_mensaje.create({
    data: {
      organizacion_id: o.organizacionId,
      codigo: "reenganche",
      content_sid: "HX00000000000000000000000000000000",
      categoria: pl.categoria ?? "utility",
      estado_aprobacion: pl.estado ?? "aprobada",
      activo: pl.activo ?? true,
      cuerpo_referencia: pl.cuerpo === undefined ? "Hola, quedó pendiente tu consulta sobre {{1}}. ¿Quieres que la retomemos?" : pl.cuerpo,
      variables: (pl.variables ?? [{ pos: 1, nombre: "nombre_vertical" }]) as never,
    },
  });
  const automatizacion = await prisma.automatizacion.create({
    data: {
      organizacion_id: o.organizacionId,
      nombre: "Reenganche",
      evento_disparador: "lead_sin_respuesta",
      offset_minutos: opc.offsetMin ?? 1500,
      max_intentos: opc.maxIntentos ?? 1,
      plantilla_id: opc.sinPlantilla ? null : plantilla.id,
    },
  });

  // El contacto escribe en `ultimo` y se queda callado a mitad de la captura.
  const entrada = new TransporteFalso();
  const antes = { prisma, mensajeria: new MessagingProvider({ transporte: entrada, reloj: () => ultimo }), reloj: () => ultimo };
  const conversacion = randomInt(1, 2_000_000_000);
  const telefono = `+52155${randomInt(10_000_000, 99_999_999)}`;
  const evento = (contenido: string): EventoEntrante => {
    const id = String(siguiente++);
    return {
      chatwootAccountId: o.chatwootAccountId,
      chatwootInboxId: o.chatwootInboxId,
      chatwootConversacionId: conversacion,
      idMensaje: id,
      contenido,
      estadoConversacion: "pending",
      contacto: { nombre: "Mamá", telefono },
      creadoEn: null,
      llave: { proveedor: "chatwoot", id },
      numeroReceptor: null,
      crudo: null,
    };
  };
  let conversacionId = "";
  for (const m of opc.mensajes ?? ["Hola"]) conversacionId = (await procesarEntrante(antes, evento(m))).conversacionId!;

  const db = conAlcance(prisma, o.organizacionId);
  const transporte = new TransporteFalso();
  /** Corre el motor "como si fuera" `ahora`. */
  const motor = (ahora: Date, extra: Partial<DepsMotor> = {}) =>
    correrAutomatizaciones({
      prisma,
      mensajeria: new MessagingProvider({ transporte, reloj: () => ahora }),
      reloj: () => ahora,
      organizacionId: o.organizacionId,
      ...extra,
    });
  const ejecuciones = () => db.automatizacion_ejecucion.findMany({ orderBy: [{ automatizacion_id: "asc" }, { ocurrencia: "asc" }] });
  const plantillasEnviadas = () => transporte.envios.filter((e) => e.tipo === "plantilla");
  const conv = () => db.conversacion.findUniqueOrThrow({ where: { id: conversacionId }, include: { lead: true } });
  return { o, db, plantilla, automatizacion, conversacionId, conversacion, telefono: normalizarTelefono(telefono)!, evento, antes, transporte, motor, ejecuciones, plantillasEnviadas, conv };
}

test("reenganche: a las 26 h sin contestar sale la plantilla aprobada, una sola vez", async () => {
  const s = await escenario();
  const r = await s.motor(en(T0, 26));
  assert.equal(r.programadas, 1);
  assert.equal(r.enviadas, 1);

  const [envio] = s.plantillasEnviadas();
  assert.ok(envio);
  assert.equal(envio.plantilla!.codigo, "reenganche");
  assert.equal(envio.plantilla!.contentSid, "HX00000000000000000000000000000000");
  assert.deepEqual(envio.plantilla!.variables, { "1": "Vertical Prueba" });
  assert.equal(envio.texto, "Hola, quedó pendiente tu consulta sobre Vertical Prueba. ¿Quieres que la retomemos?");

  const [e] = await s.ejecuciones();
  assert.equal(e!.estatus, "enviado");
  assert.equal(e!.entidad_tipo, "conversacion");
  assert.equal(e!.entidad_id, s.conversacionId);
  const m = await s.db.mensaje.findUniqueOrThrow({ where: { id: e!.mensaje_id! } });
  assert.equal(m.origen, "automatizacion");
  assert.equal(m.plantilla_id, s.plantilla.id);
  assert.equal(m.estatus, "enviado");
  assert.deepEqual(m.variables_usadas, { "1": "Vertical Prueba" });

  // Idempotente: otra corrida no programa ni manda nada.
  const otra = await s.motor(en(T0, 27));
  assert.equal(otra.programadas + otra.enviadas, 0);
  assert.equal(s.plantillasEnviadas().length, 1);
});

test("antes de cumplirse el tiempo de silencio no se programa nada", async () => {
  const s = await escenario();
  const r = await s.motor(en(T0, 24));
  assert.equal(r.programadas, 0);
  assert.equal((await s.ejecuciones()).length, 0);
});

test("dos motores a la vez no mandan dos veces (invariante 8)", async () => {
  const s = await escenario();
  const ahora = en(T0, 26);
  await Promise.all([s.motor(ahora), s.motor(ahora), s.motor(ahora)]);
  assert.equal(s.plantillasEnviadas().length, 1);
  assert.equal((await s.ejecuciones()).length, 1);
  assert.equal(await s.db.mensaje.count({ where: { conversacion_id: s.conversacionId, origen: "automatizacion" } }), 1);
});

test("horario: lo que cae de noche se recorre a las 09:00 locales y no se manda antes (invariante 14)", async () => {
  // Última palabra del contacto a las 21:00 locales; +25 h = 22:00 locales del día siguiente.
  const s = await escenario({ ultimoEntrante: new Date("2026-10-08T03:00:00Z") });
  const noche = new Date("2026-10-09T05:00:00Z"); // 23:00 locales
  const r = await s.motor(noche);
  assert.equal(r.programadas, 1);
  assert.equal(r.enviadas, 0);
  assert.equal((await s.ejecuciones())[0]!.programado_para.toISOString(), "2026-10-09T15:00:00.000Z");

  await s.motor(new Date("2026-10-09T14:59:00Z")); // 08:59 locales
  assert.equal(s.plantillasEnviadas().length, 0);

  const manana = await s.motor(new Date("2026-10-09T15:00:00Z")); // 09:00 locales
  assert.equal(manana.enviadas, 1);
  assert.equal(s.plantillasEnviadas().length, 1);
});

test("horario: una ejecución vencida que el motor alcanza de noche se reprograma, no se manda", async () => {
  const s2 = await escenario();
  // Se programa pero el motor no corre hasta las 22:30 locales (04:30 UTC): ya pasó de las 20:00.
  const tarde = new Date("2026-10-10T04:30:00Z");
  const r = await s2.motor(tarde);
  assert.equal(r.enviadas, 0);
  assert.equal(s2.plantillasEnviadas().length, 0);
  const [e] = await s2.ejecuciones();
  assert.equal(e!.estatus, "programado");
  assert.equal(e!.programado_para.toISOString(), "2026-10-10T15:00:00.000Z");
  // A las 09:00 locales del día siguiente sale.
  assert.equal((await s2.motor(new Date("2026-10-10T15:00:00Z"))).enviadas, 1);
});

test("respuesta a quien acaba de escribir: sin restricción de horario (decisión 5)", async () => {
  const noche = new Date("2026-10-09T05:00:00Z"); // 23:00 locales
  const s = await escenario({ ultimoEntrante: noche, mensajes: ["Hola"] });
  // El saludo del bot salió aunque eran las 23:00 locales: contestar no depende del horario.
  const saludo = await s.db.mensaje.findFirstOrThrow({ where: { conversacion_id: s.conversacionId, direccion: "saliente", origen: "respuesta" } });
  assert.equal(saludo.estatus, "enviado");
});

test("si recorrerlo al siguiente horario lo deja después del evento, se descarta y se registra (decisión 6)", async () => {
  const s = await escenario();
  const ahora = new Date("2026-10-10T04:30:00Z"); // 22:30 locales
  const evento = new Date("2026-10-10T05:00:00Z"); // 23:00 locales: antes del siguiente horario válido
  const r = await s.motor(ahora, { limiteDe: () => evento });
  assert.equal(r.descartadas, 1);
  assert.equal(r.enviadas, 0);
  assert.equal(s.plantillasEnviadas().length, 0);
  const [e] = await s.ejecuciones();
  assert.equal(e!.estatus, "descartado");
  assert.equal(e!.motivo_omision, "evento_pasado");
  // No se vuelve a intentar.
  assert.equal((await s.motor(new Date("2026-10-10T15:00:00Z"))).enviadas, 0);
});

test("atención humana: si la conversación pasa a una persona antes de ejecutar, no se manda (invariante 6)", async () => {
  const s = await escenario();
  await s.db.automatizacion_ejecucion.create({
    data: { automatizacion_id: s.automatizacion.id, entidad_tipo: "conversacion", entidad_id: s.conversacionId, ocurrencia: 1, programado_para: en(T0, 25), organizacion_id: s.o.organizacionId },
  });
  await s.db.conversacion.update({ where: { id: s.conversacionId }, data: { estado: "en_atencion_humana" } });
  const r = await s.motor(en(T0, 26));
  assert.equal(r.enviadas, 0);
  assert.equal(r.omitidas, 1);
  assert.equal(s.plantillasEnviadas().length, 0);
  const [e] = await s.ejecuciones();
  assert.equal(e!.estatus, "omitido");
  assert.equal(e!.motivo_omision, "atencion_humana");
});

test("una conversación que ya está con una persona, cerrada o dada de baja ni siquiera se programa", async () => {
  for (const estado of ["en_atencion_humana", "cerrada", "opt_out"] as const) {
    const s = await escenario();
    await s.db.conversacion.update({ where: { id: s.conversacionId }, data: { estado } });
    const r = await s.motor(en(T0, 26));
    assert.equal(r.programadas, 0, estado);
  }
});

test("baja (opt-out) de la organización: si el teléfono se dio de baja en otra vertical, no se manda", async () => {
  const s = await escenario();
  await s.db.consentimiento.create({
    data: { telefono: s.telefono, estado: "opt_out", alcance: "todo", origen: "palabra_clave", organizacion_id: s.o.organizacionId },
  });
  const r = await s.motor(en(T0, 26));
  assert.equal(r.enviadas, 0);
  assert.equal(s.plantillasEnviadas().length, 0);
  const [e] = await s.ejecuciones();
  assert.equal(e!.estatus, "omitido");
  assert.equal(e!.motivo_omision, "opt_out");
});

test("baja solo de marketing: bloquea una plantilla de marketing, no una utilitaria", async () => {
  const baja = (telefono: string, o: OrganizacionDePrueba) =>
    prisma.consentimiento.create({ data: { organizacion_id: o.organizacionId, telefono, estado: "opt_out", alcance: "marketing", origen: "manual" } });

  const marketing = await escenario({ plantilla: { categoria: "marketing" } });
  await baja(marketing.telefono, marketing.o);
  await marketing.motor(en(T0, 26));
  assert.equal(marketing.plantillasEnviadas().length, 0);
  assert.equal((await marketing.ejecuciones())[0]!.motivo_omision, "opt_out");

  const utilitaria = await escenario({ plantilla: { categoria: "utility" } });
  await baja(utilitaria.telefono, utilitaria.o);
  await utilitaria.motor(en(T0, 26));
  assert.equal(utilitaria.plantillasEnviadas().length, 1);
});

test("frecuencia: con el tope de la organización en 1 por día, la segunda automatización se omite", async () => {
  const s = await escenario();
  await fijarConfiguracion(prisma, s.o.organizacionId, { max_automaticos_por_dia: 1 });
  const otra = await prisma.automatizacion.create({
    data: { organizacion_id: s.o.organizacionId, nombre: "Otro", evento_disparador: "lead_sin_respuesta", offset_minutos: 1500, plantilla_id: s.plantilla.id },
  });
  const r = await s.motor(en(T0, 26));
  assert.equal(r.programadas, 2);
  assert.equal(r.enviadas, 1);
  assert.equal(r.omitidas, 1);
  assert.equal(s.plantillasEnviadas().length, 1);
  const motivos = (await s.ejecuciones()).map((e) => [e.automatizacion_id === otra.id ? "otra" : "primera", e.estatus, e.motivo_omision]);
  assert.deepEqual(motivos.filter((m) => m[1] === "omitido"), [[motivos.find((m) => m[1] === "omitido")![0], "omitido", "tope_frecuencia"]]);
});

test("A5: el envío con tiempo agotado es incierto: la ejecución queda fallida/envio_incierto, hay tarea y NUNCA se reenvía", async () => {
  const s = await escenario();
  s.transporte.inciertoSi = (e) => e.tipo === "plantilla";
  const r = await s.motor(en(T0, 26));
  assert.equal(r.fallidas, 1);
  assert.equal(s.plantillasEnviadas().length, 1, "salió una sola vez");
  const [e] = await s.ejecuciones();
  assert.deepEqual([e!.estatus, e!.motivo_omision], ["fallido", ENVIO_INCIERTO]);
  const m = await s.db.mensaje.findUniqueOrThrow({ where: { id: e!.mensaje_id! } });
  assert.deepEqual([m.estatus, m.error], ["fallido", ENVIO_INCIERTO]);
  assert.equal(await s.db.tarea_asesor.count({ where: { conversacion_id: s.conversacionId, tipo: "revision_manual", estado: "pendiente" } }), 1);

  // Ni otra corrida ni la recuperación lo vuelven a mandar o a contar.
  s.transporte.inciertoSi = undefined;
  const otra = await s.motor(en(T0, 40));
  assert.equal(otra.enviadas, 0);
  assert.equal(s.plantillasEnviadas().length, 1);
});

test("plantilla sin aprobar, inactiva o de otra vertical: no sale y queda tarea para el asesor (invariante 5)", async () => {
  for (const plantilla of [{ estado: "pendiente" as const }, { activo: false }]) {
    const s = await escenario({ plantilla });
    await s.motor(en(T0, 26));
    assert.equal(s.plantillasEnviadas().length, 0);
    assert.equal((await s.ejecuciones())[0]!.motivo_omision, "plantilla_no_apta");
    assert.equal(await s.db.tarea_asesor.count({ where: { conversacion_id: s.conversacionId, tipo: "sin_plantilla_apta", estado: "pendiente" } }), 1);
  }
  // De otra vertical de la misma organización.
  const s = await escenario();
  const otra = await prisma.vertical.create({ data: { organizacion_id: s.o.organizacionId, nombre: "Otra", slug: "otra" } });
  await prisma.plantilla_mensaje.update({ where: { id: s.plantilla.id }, data: { vertical_id: otra.id } });
  await s.motor(en(T0, 26));
  assert.equal(s.plantillasEnviadas().length, 0);
  assert.equal((await s.ejecuciones())[0]!.motivo_omision, "plantilla_no_apta");
});

test("sin plantilla en la automatización, o con una variable que no se puede llenar: se omite sin mandar", async () => {
  const sinPlantilla = await escenario({ sinPlantilla: true });
  await sinPlantilla.motor(en(T0, 26));
  assert.equal((await sinPlantilla.ejecuciones())[0]!.motivo_omision, "sin_plantilla");

  const vacia = await escenario({ plantilla: { variables: [{ pos: 1, nombre: "nombre_prospecto" }] } });
  await vacia.motor(en(T0, 26));
  assert.equal(vacia.plantillasEnviadas().length, 0);
  assert.equal((await vacia.ejecuciones())[0]!.motivo_omision, "variable_vacia");

  const rara = await escenario({ plantilla: { variables: [{ pos: 1, nombre: "inventada" }] } });
  await rara.motor(en(T0, 26));
  assert.equal((await rara.ejecuciones())[0]!.motivo_omision, "variable_desconocida");
});

test("la variable del prospecto se llena cuando el bot ya la capturó", async () => {
  const s = await escenario({ plantilla: { variables: [{ pos: 1, nombre: "nombre_prospecto" }] , cuerpo: "Seguimos con {{1}}." }, mensajes: ["Hola", "Sofía"] });
  await s.motor(en(T0, 26));
  assert.equal(s.plantillasEnviadas()[0]?.texto, "Seguimos con Sofía.");
});

test("hasta max_intentos, espaciados; después no hay más", async () => {
  const s = await escenario({ maxIntentos: 2 });
  assert.equal((await s.motor(en(T0, 26))).enviadas, 1);
  assert.equal((await s.motor(en(T0, 40))).enviadas, 0); // aún no toca el segundo
  assert.equal((await s.motor(en(T0, 51))).enviadas, 1); // 2 × 25 h = 50 h
  assert.equal((await s.motor(en(T0, 80))).programadas, 0);
  assert.equal(s.plantillasEnviadas().length, 2);
  assert.deepEqual((await s.ejecuciones()).map((e) => [e.ocurrencia, e.estatus]), [[1, "enviado"], [2, "enviado"]]);
});

test("si el contacto contesta después del reenganche, el bot sigue la captura donde se quedó", async () => {
  const s = await escenario();
  await s.motor(en(T0, 26));
  const respuesta = en(T0, 27);
  const bot = { prisma, mensajeria: new MessagingProvider({ transporte: s.transporte, reloj: () => respuesta }), reloj: () => respuesta };
  await procesarEntrante(bot, s.evento("Ana"));
  const c = await s.conv();
  assert.equal(c.paso_captacion, "edad");
  assert.equal(c.estado, "bot");
  assert.equal(c.ventana_servicio_hasta?.toISOString(), en(respuesta, 24).toISOString());
});

test("MessagingProvider por sí solo bloquea lo automático fuera de horario aunque nadie lo programe", async () => {
  const s = await escenario();
  const noche = new Date("2026-10-09T05:00:00Z"); // 23:00 locales; ventana de servicio del contacto abierta
  const provider = new MessagingProvider({ transporte: s.transporte, reloj: () => noche });
  await s.db.conversacion.update({ where: { id: s.conversacionId }, data: { ventana_servicio_hasta: en(noche, 5) } });
  const [id] = await s.db.$transaction((tx) => provider.encolar(tx, s.conversacionId, [{ tipo: "mensaje", cuerpo: "recordatorio", origen: "automatizacion" }]));
  const r = await provider.despachar(s.db, s.conversacionId);
  assert.deepEqual(r.resultados.find((x) => x.mensajeId === id), { mensajeId: id, resultado: "bloqueado", motivo: "fuera_de_horario" });
  assert.equal(s.transporte.envios.filter((e) => e.tipo === "mensaje").length, 0);
});

// ---------------------------------------------------------------------------------------------
// F1-01: reclamos huérfanos y mensaje pendiente que sale fuera de contexto

const MINUTO = 60_000;
const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Un transporte que nunca contesta: el proceso "muere" a la mitad del envío. */
const transporteColgado: TransporteConversaciones = {
  enviarMensaje: () => new Promise(() => {}),
  enviarPlantilla: () => new Promise(() => {}),
  enviarNotaInterna: () => new Promise(() => {}),
  abrirConversacion: async () => {},
};

test("F6a: si despachar lanza DESPUÉS de encolar, el mensaje se cancela y no sale después, mezclado con otra cosa", async () => {
  const s = await escenario();
  const ahora = en(T0, 26);
  const buena = new MessagingProvider({ transporte: s.transporte, reloj: () => ahora });
  const rota = Object.create(buena) as MessagingProvider;
  rota.despachar = async () => {
    throw new Error("caída de base simulada tras encolar");
  };

  const r = await s.motor(ahora, { mensajeria: rota });
  assert.equal(r.fallidas, 1);
  const [e] = await s.ejecuciones();
  assert.deepEqual([e!.estatus, e!.motivo_omision], ["fallido", "error_interno"]);
  const m = await s.db.mensaje.findUniqueOrThrow({ where: { id: e!.mensaje_id! } });
  assert.deepEqual([m.estatus, m.motivo_bloqueo], ["bloqueado", "ejecucion_fallida"], "el mensaje encolado se cancela, no queda pendiente");

  // El contacto contesta: sale la respuesta del bot, NO el recordatorio cancelado.
  const respuesta = en(ahora, 1);
  const bot = { prisma, mensajeria: new MessagingProvider({ transporte: s.transporte, reloj: () => respuesta }), reloj: () => respuesta };
  await procesarEntrante(bot, s.evento("Ana"));
  assert.equal(s.plantillasEnviadas().length, 0);
  assert.ok(s.transporte.envios.some((x) => x.tipo === "mensaje" && /edad/i.test(x.texto ?? "")), "el bot sí contestó");
});

test("F6b: el proceso muere con el envío a medias; el barrido de recuperación lo resuelve sin reenviar y avisa al asesor", async () => {
  const s = await escenario();
  const t1 = en(T0, 26);
  // El "proceso" se cuelga en el transporte; el test no espera su fin.
  void s.motor(t1, { mensajeria: new MessagingProvider({ transporte: transporteColgado, reloj: () => t1 }) });
  await esperar(1500);

  const [e0] = await s.ejecuciones();
  assert.deepEqual([e0!.estatus, e0!.ejecutado_en?.toISOString(), e0!.mensaje_id !== null], ["programado", t1.toISOString(), true]);
  const m0 = await s.db.mensaje.findUniqueOrThrow({ where: { id: e0!.mensaje_id! } });
  assert.deepEqual([m0.estatus, m0.id_externo], ["enviando", null]);

  // Todavía no vence: ni el envío (5 min) ni el reclamo (10 min). No se toca nada.
  const poco = await s.motor(en(t1, 4 * MINUTO / 3600_000));
  assert.equal(poco.recuperadas, 0);
  assert.equal((await s.ejecuciones())[0]!.estatus, "programado");

  // Vencido: se resuelve. Nada sale.
  const despues = new Date(t1.getTime() + RECLAMO_VENCE_MS + MINUTO);
  const r = await s.motor(despues);
  assert.equal(r.recuperadas, 2, "el mensaje incierto y la ejecución");
  assert.equal(s.transporte.envios.length, 0, "a lo sumo una vez: nunca se reenvía algo que pudo haber salido");

  const [e] = await s.ejecuciones();
  assert.deepEqual([e!.estatus, e!.motivo_omision], ["fallido", ENVIO_INCIERTO]);
  const m = await s.db.mensaje.findUniqueOrThrow({ where: { id: e!.mensaje_id! } });
  assert.deepEqual([m.estatus, m.error], ["fallido", ENVIO_INCIERTO]);
  const tareas = await s.db.tarea_asesor.findMany({ where: { conversacion_id: s.conversacionId } });
  assert.deepEqual(tareas.map((t) => [t.tipo, t.estado]), [["revision_manual", "pendiente"]]);

  // Y no vuelve a pasar nada, por más que corra el motor.
  for (const horas of [27, 50, 200]) {
    const otra = await s.motor(en(T0, horas));
    assert.equal(otra.enviadas + otra.programadas + otra.recuperadas, 0, `a las ${horas} h`);
  }
  assert.equal(s.transporte.envios.length, 0);
});

/** Crea una ejecución reclamada `hace` ms (con el mensaje que se indique) y devuelve lo necesario para correr el motor. */
async function reclamadaCon(
  hace: number,
  mensaje: { estatus: "pendiente" | "enviando" | "enviado" | "bloqueado" | "fallido"; idExterno?: string; motivo?: string; error?: string } | null,
) {
  const s = await escenario();
  const ahora = en(T0, 26);
  let mensajeId: string | null = null;
  if (mensaje) {
    const m = await s.db.mensaje.create({
      data: {
        organizacion_id: s.o.organizacionId,
        conversacion_id: s.conversacionId,
        direccion: "saliente",
        estatus: mensaje.estatus,
        origen: "automatizacion",
        cuerpo: "recordatorio",
        proveedor: "chatwoot",
        id_externo: mensaje.idExterno ?? null,
        motivo_bloqueo: mensaje.motivo ?? null,
        error: mensaje.error ?? null,
      },
    });
    // El reclamo del mensaje se hizo cuando se reclamó la ejecución.
    await s.db.mensaje.updateMany({ where: { id: m.id }, data: { actualizado_en: new Date(ahora.getTime() - hace) } });
    mensajeId = m.id;
  }
  await s.db.automatizacion_ejecucion.create({
    data: {
      organizacion_id: s.o.organizacionId,
      automatizacion_id: s.automatizacion.id,
      entidad_tipo: "conversacion",
      entidad_id: s.conversacionId,
      ocurrencia: 1,
      programado_para: en(ahora, -1),
      ejecutado_en: new Date(ahora.getTime() - hace),
      mensaje_id: mensajeId,
    },
  });
  const resultado = await s.motor(ahora);
  const [e] = await s.ejecuciones();
  const m = mensajeId ? await s.db.mensaje.findUniqueOrThrow({ where: { id: mensajeId } }) : null;
  return { s, resultado, e: e!, m };
}

test("recuperación: la ejecución reclamada vencida cuyo mensaje ya tiene id del proveedor queda enviada", async () => {
  const { e, resultado, s } = await reclamadaCon(RECLAMO_VENCE_MS + MINUTO, { estatus: "enviado", idExterno: "cw-77" });
  assert.deepEqual([e.estatus, e.motivo_omision], ["enviado", null]);
  assert.equal(resultado.recuperadas, 1);
  assert.equal(s.transporte.envios.length, 0);
});

test("recuperación: aunque el mensaje siga marcado `enviando`, si ya tiene id del proveedor la ejecución queda enviada", async () => {
  const { e } = await reclamadaCon(RECLAMO_VENCE_MS + MINUTO, { estatus: "enviando", idExterno: "cw-78" });
  assert.equal(e.estatus, "enviado");
});

test("recuperación: el mensaje que seguía pendiente se cancela y la ejecución queda fallida", async () => {
  const { e, m, s } = await reclamadaCon(RECLAMO_VENCE_MS + MINUTO, { estatus: "pendiente" });
  assert.deepEqual([e.estatus, e.motivo_omision], ["fallido", "ejecucion_abandonada"]);
  assert.deepEqual([m!.estatus, m!.motivo_bloqueo], ["bloqueado", "ejecucion_abandonada"]);
  assert.equal(s.transporte.envios.length, 0);
});

test("recuperación: el mensaje `enviando` sin id (envío incierto) falla con envio_incierto y crea tarea al asesor", async () => {
  const { e, m, s } = await reclamadaCon(RECLAMO_VENCE_MS + MINUTO, { estatus: "enviando" });
  assert.deepEqual([e.estatus, e.motivo_omision], ["fallido", ENVIO_INCIERTO]);
  assert.deepEqual([m!.estatus, m!.error], ["fallido", ENVIO_INCIERTO]);
  assert.equal(await s.db.tarea_asesor.count({ where: { conversacion_id: s.conversacionId, tipo: "revision_manual", estado: "pendiente" } }), 1);
  assert.equal(s.transporte.envios.length, 0);
});

test("recuperación: bloqueado y fallido se reflejan en la ejecución; sin mensaje queda fallida sin reintentar", async () => {
  const bloqueado = await reclamadaCon(RECLAMO_VENCE_MS + MINUTO, { estatus: "bloqueado", motivo: "tope_frecuencia" });
  assert.deepEqual([bloqueado.e.estatus, bloqueado.e.motivo_omision], ["omitido", "tope_frecuencia"]);
  const fallido = await reclamadaCon(RECLAMO_VENCE_MS + MINUTO, { estatus: "fallido", error: "Chatwoot respondió 500" });
  assert.deepEqual([fallido.e.estatus, fallido.e.motivo_omision], ["fallido", "envio_fallido"]);
  const sinMensaje = await reclamadaCon(RECLAMO_VENCE_MS + MINUTO, null);
  assert.deepEqual([sinMensaje.e.estatus, sinMensaje.e.motivo_omision], ["fallido", "ejecucion_abandonada"]);
  assert.equal(sinMensaje.s.transporte.envios.length, 0, "no se reintenta: no se puede probar que nada salió");
});

test("recuperación: una ejecución reclamada hace poco (en curso) no se toca", async () => {
  const { e, m, resultado } = await reclamadaCon(RECLAMO_VENCE_MS - MINUTO, { estatus: "pendiente" });
  assert.equal(e.estatus, "programado");
  assert.equal(m!.estatus, "pendiente");
  assert.equal(resultado.recuperadas, 0);
});

test("recuperación: dos motores a la vez la resuelven una sola vez", async () => {
  const s = await escenario();
  const ahora = en(T0, 26);
  await s.db.automatizacion_ejecucion.create({
    data: {
      organizacion_id: s.o.organizacionId,
      automatizacion_id: s.automatizacion.id,
      entidad_tipo: "conversacion",
      entidad_id: s.conversacionId,
      ocurrencia: 1,
      programado_para: en(ahora, -1),
      ejecutado_en: new Date(ahora.getTime() - RECLAMO_VENCE_MS - MINUTO),
    },
  });
  const rs = await Promise.all([s.motor(ahora), s.motor(ahora), s.motor(ahora)]);
  assert.equal(rs.reduce((n, r) => n + r.recuperadas, 0), 1);
});

// ---------------------------------------------------------------------------------------------
// F1-06: el reenganche revalida antes de encolar

test("F1-06: si el contacto escribió después de programarse, el reenganche no sale (contacto_respondio)", async () => {
  // Última palabra a las 21:00 locales; +25 h = 22:00 locales del día siguiente → se recorre a las 09:00.
  const s = await escenario({ ultimoEntrante: new Date("2026-10-08T03:00:00Z") });
  const r = await s.motor(new Date("2026-10-09T05:00:00Z")); // 23:00 locales
  assert.equal(r.programadas, 1);
  assert.equal((await s.ejecuciones())[0]!.programado_para.toISOString(), "2026-10-09T15:00:00.000Z");

  // A las 08:00 locales el contacto contesta; a las 09:05 corre el motor.
  const respuesta = new Date("2026-10-09T14:00:00Z");
  const bot = { prisma, mensajeria: new MessagingProvider({ transporte: s.transporte, reloj: () => respuesta }), reloj: () => respuesta };
  await procesarEntrante(bot, s.evento("Ana"));
  const enviosAntes = s.transporte.envios.length;

  const despues = await s.motor(new Date("2026-10-09T15:05:00Z"));
  assert.equal(despues.enviadas, 0);
  assert.equal(despues.omitidas, 1);
  assert.equal(s.plantillasEnviadas().length, 0);
  assert.equal(s.transporte.envios.length, enviosAntes);
  const [e] = await s.ejecuciones();
  assert.deepEqual([e!.estatus, e!.motivo_omision], ["omitido", "contacto_respondio"]);
});

// ---------------------------------------------------------------------------------------------
// F1-07: omisiones por falta de plantilla o variables inválidas crean tarea al asesor

test("F1-07: sin plantilla, variables inválidas o plantilla sin cuerpo: se omite y queda UNA tarea de revisión manual", async () => {
  const casos: [string, Opciones][] = [
    ["sin_plantilla", { sinPlantilla: true }],
    ["variables_invalidas", { plantilla: { variables: "no es una lista" } }],
    ["variable_desconocida", { plantilla: { variables: [{ pos: 1, nombre: "inventada" }] } }],
    ["variable_vacia", { plantilla: { variables: [{ pos: 1, nombre: "nombre_prospecto" }] } }],
    ["plantilla_sin_cuerpo", { plantilla: { cuerpo: "  " } }],
  ];
  for (const [motivo, opc] of casos) {
    const s = await escenario(opc);
    await s.motor(en(T0, 26));
    assert.equal(s.transporte.envios.length, 0, motivo);
    assert.equal((await s.ejecuciones())[0]!.motivo_omision, motivo);
    const tareas = await s.db.tarea_asesor.findMany({ where: { conversacion_id: s.conversacionId } });
    assert.deepEqual(tareas.map((t) => [t.tipo, t.estado]), [["revision_manual", "pendiente"]], motivo);
    assert.match(tareas[0]!.descripcion, new RegExp(motivo));
  }
});

test("F1-07: dos automatizaciones mal configuradas sobre la misma conversación dejan una sola tarea pendiente", async () => {
  const s = await escenario({ sinPlantilla: true });
  await prisma.automatizacion.create({
    data: { organizacion_id: s.o.organizacionId, nombre: "Otro", evento_disparador: "lead_sin_respuesta", offset_minutos: 1500 },
  });
  await s.motor(en(T0, 26));
  assert.equal(await s.db.tarea_asesor.count({ where: { conversacion_id: s.conversacionId, tipo: "revision_manual", estado: "pendiente" } }), 1);
});

// ---------------------------------------------------------------------------------------------
// F1-05: un lead con eliminado_en

test("F1-05: un lead borrado no se programa ni recibe el reenganche", async () => {
  const s = await escenario();
  const c = await s.conv();
  await s.db.lead.update({ where: { id: c.lead_id }, data: { eliminado_en: new Date() } });
  const r = await s.motor(en(T0, 26));
  assert.equal(r.programadas + r.enviadas, 0);
  assert.equal(s.transporte.envios.length, 0);
});

test("F1-05: si el lead se borra después de programarse, la ejecución se omite sin mandar", async () => {
  const s = await escenario();
  assert.equal((await s.motor(en(T0, 24.9))).programadas, 0);
  await s.db.automatizacion_ejecucion.create({
    data: { automatizacion_id: s.automatizacion.id, entidad_tipo: "conversacion", entidad_id: s.conversacionId, ocurrencia: 1, programado_para: en(T0, 25), organizacion_id: s.o.organizacionId },
  });
  const c = await s.conv();
  await s.db.lead.update({ where: { id: c.lead_id }, data: { eliminado_en: new Date() } });

  const r = await s.motor(en(T0, 26));
  assert.equal(r.enviadas, 0);
  assert.equal(s.transporte.envios.length, 0);
  const [e] = await s.ejecuciones();
  assert.deepEqual([e!.estatus, e!.motivo_omision], ["omitido", "lead_eliminado"]);
});

// ---------------------------------------------------------------------------------------------
// EA-07: aislamiento de fallos. Un error persistente de UN elemento no detiene a los demás.

/** Otra conversación a medias de la misma organización, con su lead en la sucursal indicada. */
async function otraConversacion(s: Awaited<ReturnType<typeof escenario>>, sucursalId: string) {
  const id = String(siguiente++);
  const conversacion = randomInt(1, 2_000_000_000);
  const r = await procesarEntrante(s.antes, {
    chatwootAccountId: s.o.chatwootAccountId,
    chatwootInboxId: s.o.chatwootInboxId,
    chatwootConversacionId: conversacion,
    idMensaje: id,
    contenido: "Hola",
    estadoConversacion: "pending",
    contacto: { nombre: "Papá", telefono: `+52155${randomInt(10_000_000, 99_999_999)}` },
    creadoEn: null,
    llave: { proveedor: "chatwoot", id },
    numeroReceptor: null,
    crudo: null,
  });
  const conversacionId = r.conversacionId!;
  const conv = await s.db.conversacion.findUniqueOrThrow({ where: { id: conversacionId } });
  await s.db.lead.update({ where: { id: conv.lead_id }, data: { sucursal_interes_id: sucursalId } });
  return conversacionId;
}

test("EA-07: una conversación con datos defectuosos (zona horaria inválida) no impide programar a las demás", async () => {
  const s = await escenario();
  const [norte, sur] = s.o.sucursales;
  await s.db.sucursal.update({ where: { id: norte!.id }, data: { zona_horaria: "Marte/Olimpo" } });
  const mala = s.conversacionId; // primera en crearse
  await s.db.lead.update({ where: { id: (await s.conv()).lead_id }, data: { sucursal_interes_id: norte!.id } });
  const buena = await otraConversacion(s, sur!.id);

  const r = await s.motor(en(T0, 26));
  assert.equal(r.errores, 1, "el defectuoso se cuenta");
  assert.equal(r.programadas, 1);
  const ejecuciones = await s.ejecuciones();
  assert.deepEqual(ejecuciones.map((e) => e.entidad_id), [buena]);
  assert.ok(mala);
});

test("EA-07: una automatización que falla al leer no detiene a las demás de la organización", async () => {
  const s = await escenario();
  const [norte, sur] = s.o.sucursales;
  const buena = await otraConversacion(s, sur!.id);
  await s.db.lead.update({ where: { id: (await s.conv()).lead_id }, data: { sucursal_interes_id: norte!.id } });
  // Dos automatizaciones, una por sucursal; la de Norte no puede leer sus conversaciones.
  await s.db.automatizacion.update({ where: { id: s.automatizacion.id }, data: { sucursal_id: norte!.id } });
  const deSur = await s.db.automatizacion.create({
    data: { organizacion_id: s.o.organizacionId, nombre: "Sur", evento_disparador: "lead_sin_respuesta", offset_minutos: 1500, plantilla_id: s.plantilla.id, sucursal_id: sur!.id },
  });
  const raiz = conGanchos(prisma, {
    modelo: "conversacion",
    operacion: "findMany",
    cuando: (args) => JSON.stringify(args["where"]).includes(norte!.id),
    antes: async () => {
      throw new Error("falló la lectura de la automatización de Norte");
    },
  });
  const r = await s.motor(en(T0, 26), { prisma: raiz });
  assert.equal(r.errores, 1);
  const ejecuciones = await s.ejecuciones();
  assert.deepEqual(ejecuciones.map((e) => [e.automatizacion_id, e.entidad_id]), [[deSur.id, buena]]);
});

test("EA-07: si programar falla por completo, igual se ejecuta lo ya programado (las fases van aisladas)", async () => {
  const s = await escenario();
  await s.db.automatizacion_ejecucion.create({
    data: { automatizacion_id: s.automatizacion.id, entidad_tipo: "conversacion", entidad_id: s.conversacionId, ocurrencia: 1, programado_para: en(T0, 25), organizacion_id: s.o.organizacionId },
  });
  const raiz = conGanchos(prisma, {
    modelo: "automatizacion",
    operacion: "findMany",
    antes: async () => {
      throw new Error("falló programar");
    },
  });
  const r = await s.motor(en(T0, 26), { prisma: raiz });
  assert.equal(r.errores, 1);
  assert.equal(r.enviadas, 1, "lo programado salió");
});

test("EA-07: una ejecución abandonada que no se deja recuperar no impide recuperar las demás", async () => {
  const s = await escenario();
  const ahora = en(T0, 26);
  const sur = s.o.sucursales[1]!;
  const segunda = await otraConversacion(s, sur.id);
  const mensajes: string[] = [];
  for (const conversacionId of [s.conversacionId, segunda]) {
    const m = await s.db.mensaje.create({
      data: { organizacion_id: s.o.organizacionId, conversacion_id: conversacionId, direccion: "saliente", estatus: "pendiente", origen: "automatizacion", cuerpo: "recordatorio", proveedor: "chatwoot" },
    });
    mensajes.push(m.id);
    await s.db.automatizacion_ejecucion.create({
      data: {
        organizacion_id: s.o.organizacionId,
        automatizacion_id: s.automatizacion.id,
        entidad_tipo: "conversacion",
        entidad_id: conversacionId,
        ocurrencia: 1,
        programado_para: en(ahora, -1),
        ejecutado_en: new Date(ahora.getTime() - RECLAMO_VENCE_MS - MINUTO),
        mensaje_id: m.id,
      },
    });
  }
  // La primera ejecución que se intenta recuperar lanza al leer su mensaje; la otra debe resolverse.
  let lanzo = false;
  const raiz = conGanchos(prisma, {
    modelo: "mensaje",
    operacion: "findFirst",
    cuando: (args) => mensajes.some((id) => JSON.stringify(args["where"]).includes(id)),
    antes: async () => {
      if (lanzo) return;
      lanzo = true;
      throw new Error("falló la lectura del mensaje");
    },
  });
  const r = await s.motor(ahora, { prisma: raiz });
  assert.equal(r.errores, 1);
  assert.equal(r.recuperadas, 1, "la otra sí se recuperó");
});
