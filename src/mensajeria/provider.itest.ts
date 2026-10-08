// MessagingProvider contra Postgres real y el transporte falso: reclamo por mensaje,
// "iniciado por el sistema" por contenido y no por etiqueta, y recuperación de envíos inciertos.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { altaConAlcance, conAlcance } from "../datos/alcance.ts";
import { fijarConfiguracion, sembrarEntrante, sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { ENVIO_INCIERTO, ENVIO_INCIERTO_MS, ErrorOrigenSaliente, MessagingProvider, PENDIENTE_VIGENCIA_MS, TransporteFalso, asegurarTareaAsesor, respuestaA, type Saliente } from "./index.ts";

let prisma: PrismaPruebas;

before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
/** 8-oct-2026 12:00 hora de Ciudad de México (UTC-6). */
const MEDIODIA = new Date("2026-10-08T18:00:00Z");
/** 8-oct-2026 03:00 hora de Ciudad de México. */
const MADRUGADA = new Date("2026-10-08T09:00:00Z");

async function escenario(ahora: Date, opc: { ventanaAbiertaHasta?: Date | null } = {}) {
  const o: OrganizacionDePrueba = await sembrarOrganizacion(prisma, "Provider");
  const db = conAlcance(prisma, o.organizacionId);
  const lead = await db.lead.create({
    data: altaConAlcance({
      vertical_interes_id: o.verticalId,
      sucursal_interes_id: o.sucursales[0]!.id,
      etapa_id: o.etapaInicialId,
      telefono: `+5255${randomInt(10_000_000, 99_999_999)}`,
    }),
  });
  const conv = await db.conversacion.create({
    data: altaConAlcance({
      bandeja_chatwoot_id: o.bandejaId,
      lead_id: lead.id,
      chatwoot_conversacion_id: randomInt(1, 2_000_000_000),
      ventana_servicio_hasta: opc.ventanaAbiertaHasta === undefined ? new Date(ahora.getTime() + 2 * HORA) : opc.ventanaAbiertaHasta,
    }),
  });
  const plantilla = await db.plantilla_mensaje.create({
    data: altaConAlcance({
      codigo: "aviso",
      content_sid: "HX00000000000000000000000000000000",
      categoria: "utility" as const,
      estado_aprobacion: "aprobada" as const,
      cuerpo_referencia: "Aviso",
    }),
  });
  const transporte = new TransporteFalso();
  const provider = new MessagingProvider({ transporte, reloj: () => ahora });
  return { o, db, lead, conv, plantilla, transporte, provider };
}

test("tres despachar simultáneos del mismo pendiente: un solo envío (reclamo por mensaje, F1-12)", async () => {
  const s = await escenario(MEDIODIA);
  const [id] = await s.db.$transaction((tx) => s.provider.encolar(tx, s.conv.id, [{ tipo: "mensaje", origen: "automatizacion", cuerpo: "uno" }]));
  // Carrera REAL (EA-08): una barrera obliga a que las tres lean «hay un pendiente» ANTES de que
  // cualquiera lo reclame. Sin el reclamo condicional (pendiente → enviando) saldrían tres envíos.
  const barrera = new Barrera(3);
  const db = conAlcance(
    conGanchos(prisma, {
      modelo: "mensaje",
      operacion: "findMany",
      cuando: (args) => (args["where"] as { estatus?: unknown } | undefined)?.estatus === "pendiente",
      despues: () => barrera.esperar(),
    }),
    s.o.organizacionId,
  );
  const resumenes = await Promise.all([s.provider.despachar(db, s.conv.id), s.provider.despachar(db, s.conv.id), s.provider.despachar(db, s.conv.id)]);
  assert.equal(barrera.completa, true, "las tres leyeron el mismo pendiente antes de reclamar");

  assert.equal(s.transporte.envios.filter((e) => e.tipo === "mensaje" && e.texto === "uno").length, 1);
  assert.equal(resumenes.reduce((n, r) => n + r.enviados, 0), 1);
  const m = await s.db.mensaje.findUniqueOrThrow({ where: { id: id! } });
  assert.equal(m.estatus, "enviado");
  assert.ok(m.id_externo);
});

test("horario por contenido, no por etiqueta: una plantilla que dice ser respuesta, a las 03:00 y sin ventana, NO sale (F1-04, invariante 14)", async () => {
  const s = await escenario(MADRUGADA, { ventanaAbiertaHasta: null });
  const entrante = await sembrarEntrante(s.db, s.conv.id);
  const [id] = await s.db.$transaction((tx) =>
    s.provider.encolar(tx, s.conv.id, [respuestaA(entrante, "promo", { id: s.plantilla.id, variables: {} })]),
  );
  const r = await s.provider.despachar(s.db, s.conv.id);
  assert.deepEqual(r.resultados.find((x) => x.mensajeId === id), { mensajeId: id, resultado: "bloqueado", motivo: "fuera_de_horario" });
  assert.equal(s.transporte.envios.length, 0);
});

test("la misma plantilla en horario sale; la segunda del día se frena por frecuencia (F1-04)", async () => {
  const s = await escenario(MEDIODIA, { ventanaAbiertaHasta: null });
  // El tope diario es de la organización (A6): aquí se fija en 1 para probar la regla sin depender del valor por defecto.
  await fijarConfiguracion(prisma, s.o.organizacionId, { max_automaticos_por_dia: 1 });
  const ids = await s.db.$transaction((tx) =>
    s.provider.encolar(tx, s.conv.id, [
      { tipo: "mensaje", origen: "automatizacion", cuerpo: "primera", plantilla: { id: s.plantilla.id, variables: {} } },
      { tipo: "mensaje", origen: "automatizacion", cuerpo: "segunda", plantilla: { id: s.plantilla.id, variables: {} } },
    ]),
  );
  const r = await s.provider.despachar(s.db, s.conv.id);
  assert.deepEqual(r.resultados.map((x) => [x.mensajeId, x.resultado, x.motivo]), [
    [ids[0], "enviado", undefined],
    [ids[1], "bloqueado", "tope_frecuencia"],
  ]);
  assert.equal(s.transporte.envios.filter((e) => e.tipo === "plantilla").length, 1);
});

test("contestar a quien acaba de escribir (ventana abierta, sin plantilla) no tiene restricción de horario (decisión 5)", async () => {
  const s = await escenario(MADRUGADA);
  const entrante = await sembrarEntrante(s.db, s.conv.id);
  await s.db.$transaction((tx) => s.provider.encolar(tx, s.conv.id, [respuestaA(entrante, "respuesta nocturna")]));
  const r = await s.provider.despachar(s.db, s.conv.id);
  assert.equal(r.enviados, 1);
  assert.deepEqual(s.transporte.envios.map((e) => e.texto), ["respuesta nocturna"]);
});

test("lo iniciado por el sistema (`automatizacion`) con la ventana abierta, a las 03:00, NO sale: texto libre ni plantilla (EA-10)", async () => {
  for (const conPlantilla of [false, true]) {
    const s = await escenario(MADRUGADA); // ventana de servicio abierta
    const saliente: Saliente = { tipo: "mensaje", origen: "automatizacion", cuerpo: "recordatorio", ...(conPlantilla ? { plantilla: { id: s.plantilla.id, variables: {} } } : {}) };
    const [id] = await s.db.$transaction((tx) => s.provider.encolar(tx, s.conv.id, [saliente]));
    const r = await s.provider.despachar(s.db, s.conv.id);
    assert.deepEqual(r.resultados.find((x) => x.mensajeId === id), { mensajeId: id, resultado: "bloqueado", motivo: "fuera_de_horario" }, conPlantilla ? "plantilla" : "texto libre");
    assert.equal(s.transporte.envios.length, 0);
  }
});

test("EA-10: una respuesta exige contestar al ÚLTIMO mensaje entrante de su conversación; si no, no se encola", async () => {
  const s = await escenario(MEDIODIA);
  const otra = await escenario(MEDIODIA);
  const encolar = (db: typeof s.db, convId: string, r: Saliente) => db.$transaction((tx) => s.provider.encolar(tx, convId, [r]));

  // Sin ningún entrante: no hay a quién contestar.
  await assert.rejects(() => encolar(s.db, s.conv.id, respuestaA("00000000-0000-4000-8000-000000000001", "hola")), ErrorOrigenSaliente);
  const viejo = await sembrarEntrante(s.db, s.conv.id);
  const ultimo = await sembrarEntrante(s.db, s.conv.id);
  // Un entrante anterior al último, uno de otra conversación, y un saliente: ninguno vale.
  await assert.rejects(() => encolar(s.db, s.conv.id, respuestaA(viejo, "tarde")), ErrorOrigenSaliente);
  const deOtra = await sembrarEntrante(otra.db, otra.conv.id);
  await assert.rejects(() => encolar(s.db, s.conv.id, respuestaA(deOtra, "ajeno")), ErrorOrigenSaliente);
  const [saliente] = await encolar(s.db, s.conv.id, respuestaA(ultimo, "ok"));
  await assert.rejects(() => encolar(s.db, s.conv.id, respuestaA(saliente!, "a un saliente")), ErrorOrigenSaliente);
  // Nada de lo rechazado quedó guardado.
  assert.equal(await s.db.mensaje.count({ where: { conversacion_id: s.conv.id, direccion: "saliente" } }), 1);
  // Y la confirmación de baja tiene la misma exigencia.
  await assert.rejects(
    () => encolar(s.db, s.conv.id, { tipo: "mensaje", origen: "confirmacion_baja", respondeA: viejo, cuerpo: "baja" }),
    ErrorOrigenSaliente,
  );
});

test("EA-10 (compilación): `origen` es obligatorio y `respuesta` exige `respondeA`", () => {
  // Estas líneas no compilan; `tsc` (npm run typecheck) falla si alguna deja de fallar.
  // @ts-expect-error falta el origen: ya no hay valor por defecto
  const sinOrigen: Saliente = { tipo: "mensaje", cuerpo: "recordatorio" };
  // @ts-expect-error una respuesta sin el entrante al que contesta
  const sinEntrante: Saliente = { tipo: "mensaje", origen: "respuesta", cuerpo: "hola" };
  // @ts-expect-error una automatización no puede decir a quién contesta: o es del sistema o es respuesta
  const mezclado: Saliente = { tipo: "mensaje", origen: "automatizacion", respondeA: "x", cuerpo: "hola" };
  // @ts-expect-error tampoco una nota interna sin origen
  const notaSinOrigen: Saliente = { tipo: "nota_interna", cuerpo: "n" };
  assert.ok(sinOrigen && sinEntrante && mezclado && notaSinOrigen);
});

test("una etiqueta de origen distinta de `respuesta` basta para ser del sistema, con o sin plantilla", async () => {
  const s = await escenario(MADRUGADA);
  const [id] = await s.db.$transaction((tx) => s.provider.encolar(tx, s.conv.id, [{ tipo: "mensaje", cuerpo: "recordatorio", origen: "automatizacion" }]));
  const r = await s.provider.despachar(s.db, s.conv.id);
  assert.deepEqual(r.resultados.find((x) => x.mensajeId === id), { mensajeId: id, resultado: "bloqueado", motivo: "fuera_de_horario" });
});

// ---------------------------------------------------------------------------------------------
// EA-09: un pendiente huérfano no sale días después, antes de lo nuevo

test("EA-09: un pendiente de hace 3 días no sale antes de la respuesta nueva: queda bloqueado/obsoleto, sin tarea", async () => {
  const s = await escenario(MEDIODIA);
  const transporte = new TransporteFalso();
  // Hace 3 días el proceso murió entre encolar y despachar: el mensaje quedó `pendiente`.
  const viejo = new MessagingProvider({ transporte, reloj: () => MEDIODIA });
  const entranteViejo = await sembrarEntrante(s.db, s.conv.id);
  const [idViejo] = await s.db.$transaction((tx) => viejo.encolar(tx, s.conv.id, [respuestaA(entranteViejo, "VIEJO: ¿cuál es tu nombre?")]));

  // Hoy el contacto vuelve a escribir y el bot contesta lo nuevo.
  const hoy = new Date(MEDIODIA.getTime() + 3 * 24 * HORA);
  await s.db.conversacion.update({ where: { id: s.conv.id }, data: { ventana_servicio_hasta: new Date(hoy.getTime() + 24 * HORA) } });
  const nuevo = new MessagingProvider({ transporte, reloj: () => hoy });
  const entranteNuevo = await sembrarEntrante(s.db, s.conv.id);
  const [idNuevo] = await s.db.$transaction((tx) => nuevo.encolar(tx, s.conv.id, [respuestaA(entranteNuevo, "Mucho gusto. ¿Qué edad tiene Ana?")]));
  const r = await nuevo.despachar(s.db, s.conv.id);

  assert.deepEqual(r.resultados, [
    { mensajeId: idViejo, resultado: "bloqueado", motivo: "obsoleto" },
    { mensajeId: idNuevo, resultado: "enviado" },
  ]);
  assert.deepEqual(transporte.envios.map((e) => e.texto), ["Mucho gusto. ¿Qué edad tiene Ana?"], "lo viejo no salió, ni antes ni después");
  const m = await s.db.mensaje.findUniqueOrThrow({ where: { id: idViejo! } });
  assert.deepEqual([m.estatus, m.motivo_bloqueo], ["bloqueado", "obsoleto"]);
  assert.equal(await s.db.tarea_asesor.count({ where: { conversacion_id: s.conv.id } }), 0, "sin tarea: el bot repregunta");
});

test("EA-09: la vigencia del pendiente es configurable y se mide con el reloj del provider (10 min por defecto)", async () => {
  const sale = async (esperaMs: number, vigenciaPendienteMs?: number) => {
    const s = await escenario(MEDIODIA);
    const transporte = new TransporteFalso();
    const entrante = await sembrarEntrante(s.db, s.conv.id);
    const antes = new MessagingProvider({ transporte, reloj: () => MEDIODIA });
    const [id] = await s.db.$transaction((tx) => antes.encolar(tx, s.conv.id, [respuestaA(entrante, "hola")]));
    const despues = new MessagingProvider({ transporte, reloj: () => new Date(MEDIODIA.getTime() + esperaMs), ...(vigenciaPendienteMs ? { vigenciaPendienteMs } : {}) });
    await despues.despachar(s.db, s.conv.id);
    return (await s.db.mensaje.findUniqueOrThrow({ where: { id: id! } })).estatus;
  };
  assert.equal(PENDIENTE_VIGENCIA_MS, 10 * MINUTO);
  assert.equal(await sale(10 * MINUTO), "enviado", "justo en el límite todavía sale");
  assert.equal(await sale(10 * MINUTO + 1000), "bloqueado");
  assert.equal(await sale(30 * MINUTO, HORA), "enviado", "con una vigencia de 1 h, 30 min sí salen");
  assert.equal(await sale(2 * HORA, HORA), "bloqueado");
});

// ---------------------------------------------------------------------------------------------
// EA-06: una nota interna fallida no es un mensaje perdido para el contacto

test("EA-06: una NOTA interna que falla (definitivo o incierto) no pasa la conversación a humano; deja una tarea `nota_fallida` y no frena los mensajes que siguen", async () => {
  for (const modo of ["definitivo", "incierto"] as const) {
    const s = await escenario(MEDIODIA);
    if (modo === "definitivo") s.transporte.fallarSi = (e) => e.tipo === "nota_interna";
    else s.transporte.inciertoSi = (e) => e.tipo === "nota_interna";
    const entrante = await sembrarEntrante(s.db, s.conv.id);
    const [idNota, idMensaje] = await s.db.$transaction((tx) =>
      s.provider.encolar(tx, s.conv.id, [{ tipo: "nota_interna", origen: "respuesta", cuerpo: "resumen para el asesor" }, respuestaA(entrante, "sigue la conversación")]),
    );
    const r = await s.provider.despachar(s.db, s.conv.id);

    assert.equal(r.pasoAAsesor, false, modo);
    const conv = await s.db.conversacion.findUniqueOrThrow({ where: { id: s.conv.id } });
    assert.deepEqual([conv.estado, conv.pasar_a_asesor_pendiente], ["bot", false], modo);
    assert.equal(await s.db.interaccion.count({ where: { conversacion_id: s.conv.id, tipo: "pase_a_asesor" } }), 0, modo);
    const nota = await s.db.mensaje.findUniqueOrThrow({ where: { id: idNota! } });
    assert.equal(nota.estatus, "fallido", modo);
    assert.equal(nota.error === ENVIO_INCIERTO, modo === "incierto", modo);
    assert.deepEqual((await s.db.tarea_asesor.findMany({ where: { conversacion_id: s.conv.id } })).map((t) => [t.tipo, t.estado]), [["nota_fallida", "pendiente"]], modo);
    assert.equal((await s.db.mensaje.findUniqueOrThrow({ where: { id: idMensaje! } })).estatus, "enviado", `${modo}: la nota no frena al mensaje que sigue`);

    // Repetir el fallo no llena la bandeja: una pendiente por conversación.
    const otra = await s.db.$transaction((tx) => s.provider.encolar(tx, s.conv.id, [{ tipo: "nota_interna", origen: "respuesta", cuerpo: "otra nota" }]));
    await s.provider.despachar(s.db, s.conv.id);
    assert.ok(otra[0]);
    assert.equal(await s.db.tarea_asesor.count({ where: { conversacion_id: s.conv.id, tipo: "nota_fallida" } }), 1, modo);
  }
});

test("EA-06: lo contrario sigue igual: un MENSAJE al contacto que falla sí pasa la conversación a un asesor", async () => {
  const s = await escenario(MEDIODIA);
  s.transporte.fallarSi = (e) => e.tipo === "mensaje";
  const entrante = await sembrarEntrante(s.db, s.conv.id);
  await s.db.$transaction((tx) => s.provider.encolar(tx, s.conv.id, [respuestaA(entrante, "hola")]));
  const r = await s.provider.despachar(s.db, s.conv.id);
  assert.equal(r.pasoAAsesor, true);
  assert.equal((await s.db.conversacion.findUniqueOrThrow({ where: { id: s.conv.id } })).estado, "en_atencion_humana");
  assert.equal(await s.db.tarea_asesor.count({ where: { conversacion_id: s.conv.id, tipo: "nota_fallida" } }), 0);
});

// ---------------------------------------------------------------------------------------------
// EA-14: una tarea pendiente de una causa no se traga el aviso de otra

test("EA-14: con una tarea pendiente de otra causa, un envío incierto igual deja SU tarea", async () => {
  const s = await conMensajeEnviando(MEDIODIA, ENVIO_INCIERTO_MS + MINUTO);
  await asegurarTareaAsesor(s.db, { leadId: s.lead.id, conversacionId: s.conv.id, tipo: "automatizacion_omitida", descripcion: "CAUSA A" });
  await asegurarTareaAsesor(s.db, { leadId: s.lead.id, conversacionId: s.conv.id, tipo: "baja_solicitada", descripcion: "CAUSA B" });
  assert.equal(await s.provider.recuperarEnviosInciertos(s.db), 1);
  const tareas = await s.db.tarea_asesor.findMany({ where: { conversacion_id: s.conv.id }, orderBy: { creado_en: "asc" } });
  assert.deepEqual(tareas.map((t) => t.tipo).sort(), ["automatizacion_omitida", "baja_solicitada", "envio_incierto"]);
  assert.match(tareas.find((t) => t.tipo === "envio_incierto")!.descripcion, /no se sabe si salió/);
  // Y la misma causa repetida sigue sin duplicarse.
  await asegurarTareaAsesor(s.db, { leadId: s.lead.id, conversacionId: s.conv.id, tipo: "envio_incierto", descripcion: "repetida" });
  assert.equal(await s.db.tarea_asesor.count({ where: { conversacion_id: s.conv.id, tipo: "envio_incierto" } }), 1);
});

// ---------------------------------------------------------------------------------------------
// F1-01: envío incierto

async function conMensajeEnviando(ahora: Date, hace: number, extra: { idExterno?: string; direccion?: "saliente" | "nota_interna" } = {}) {
  const s = await escenario(ahora);
  const m = await s.db.mensaje.create({
    data: altaConAlcance({
      conversacion_id: s.conv.id,
      direccion: extra.direccion ?? ("saliente" as const),
      estatus: "enviando" as const,
      cuerpo: "quedó a medias",
      proveedor: "chatwoot",
      ...(extra.idExterno ? { id_externo: extra.idExterno } : {}),
    }),
  });
  // El reclamo deja su hora en actualizado_en: se simula uno de hace `hace` ms.
  await s.db.mensaje.updateMany({ where: { id: m.id }, data: { actualizado_en: new Date(ahora.getTime() - hace) } });
  return { ...s, m };
}

test("un mensaje en `enviando` sin id del proveedor pasa a fallido/envio_incierto, con tarea, y NUNCA se reenvía", async () => {
  const s = await conMensajeEnviando(MEDIODIA, ENVIO_INCIERTO_MS + MINUTO);
  assert.equal(await s.provider.recuperarEnviosInciertos(s.db), 1);

  const m = await s.db.mensaje.findUniqueOrThrow({ where: { id: s.m.id } });
  assert.deepEqual([m.estatus, m.error], ["fallido", ENVIO_INCIERTO]);
  assert.equal(s.transporte.envios.length, 0, "no se reenvía algo que pudo haber salido");
  const tareas = await s.db.tarea_asesor.findMany({ where: { conversacion_id: s.conv.id } });
  assert.equal(tareas.length, 1);
  assert.deepEqual([tareas[0]!.tipo, tareas[0]!.estado], ["envio_incierto", "pendiente"]);
  assert.match(tareas[0]!.descripcion, /no se sabe si salió/);

  // Idempotente: no vuelve a contarlo ni duplica la tarea.
  assert.equal(await s.provider.recuperarEnviosInciertos(s.db), 0);
  assert.equal(await s.db.tarea_asesor.count({ where: { conversacion_id: s.conv.id } }), 1);
});

test("lo reciente y lo que ya tiene id del proveedor no se tocan; una nota interna perdida no genera tarea de envío incierto", async () => {
  const reciente = await conMensajeEnviando(MEDIODIA, ENVIO_INCIERTO_MS - MINUTO);
  assert.equal(await reciente.provider.recuperarEnviosInciertos(reciente.db), 0);
  assert.equal((await reciente.db.mensaje.findUniqueOrThrow({ where: { id: reciente.m.id } })).estatus, "enviando");

  const conId = await conMensajeEnviando(MEDIODIA, 3 * HORA, { idExterno: "cw-1" });
  assert.equal(await conId.provider.recuperarEnviosInciertos(conId.db), 0, "con id_externo sí salió: no es incierto");

  const nota = await conMensajeEnviando(MEDIODIA, 3 * HORA, { direccion: "nota_interna" });
  assert.equal(await nota.provider.recuperarEnviosInciertos(nota.db), 1);
  assert.equal((await nota.db.mensaje.findUniqueOrThrow({ where: { id: nota.m.id } })).estatus, "fallido");
  // Una nota perdida no es un mensaje perdido al contacto: no hay tarea de envío incierto. Desde EA-06
  // sí deja SU tarea (`nota_fallida`): el asesor se quedó sin el resumen.
  assert.equal(await nota.db.tarea_asesor.count({ where: { conversacion_id: nota.conv.id, tipo: "envio_incierto" } }), 0);
  assert.equal(await nota.db.tarea_asesor.count({ where: { conversacion_id: nota.conv.id } }), 1);
  assert.equal(await nota.db.tarea_asesor.count({ where: { conversacion_id: nota.conv.id, tipo: "nota_fallida" } }), 1);
});

test("la recuperación respeta la organización: no toca mensajes de otra", async () => {
  const a = await conMensajeEnviando(MEDIODIA, 3 * HORA);
  const b = await conMensajeEnviando(MEDIODIA, 3 * HORA);
  assert.equal(await a.provider.recuperarEnviosInciertos(a.db), 1);
  assert.equal((await b.db.mensaje.findUniqueOrThrow({ where: { id: b.m.id } })).estatus, "enviando");
});
