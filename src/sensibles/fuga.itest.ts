// RED DE SEGURIDAD (decisión 12): ningún dato de salud de un menor aparece en un log, en una nota de
// Chatwoot, en un mensaje saliente ni en NINGUNA otra tabla en claro.
//
// Se arma una organización cuyos menores tienen una ficha de salud con VALORES CENTINELA (textos
// únicos e inconfundibles), se ejecutan los flujos existentes que registran logs, arman notas y mandan
// mensajes (captura completa con handoff, aviso de los 30 min, reenganche, baja y baja que vuelve a
// escribir, entrega fallida, nota fallida, denegaciones) con el TransporteFalso y un colector de logs,
// y se exige que ningún centinela aparezca. Si alguien agrega un campo de la ficha a una nota o a un
// log, este test falla.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomInt } from "node:crypto";
import pg from "pg";
import { correrAutomatizaciones } from "../automatizaciones/motor.ts";
import { barrerTiemposDeEspera } from "../captacion/espera.ts";
import { procesarEntrante } from "../captacion/entrante.ts";
import { conAlcance } from "../datos/alcance.ts";
import { log } from "../lib/log.ts";
import { MessagingProvider, TransporteFalso, registrarEstadoEntrega, type EventoEntrante } from "../mensajeria/index.ts";
import { colectarLogs, type ColectorDeLogs } from "../testutil/logs.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { OcupacionFija, sembrarDocumentosLegales, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { escenarioBot } from "../testutil/bot.ts";
import { agendarClaseMuestra, cancelarClaseMuestra, reprogramarClaseMuestra } from "../clases-muestra/agenda.ts";
import { barrerAvisosMaestro } from "../clases-muestra/avisos.ts";
import { marcarAsistencia } from "../clases-muestra/asistencia.ts";
import { levantarApi, sembrarUsuario } from "../testutil/api.ts";
import { crearCifrador } from "./cifrado.ts";
import { ErrorAccesoSensible, guardarSensible, leerSensible } from "./index.ts";

const SUFIJO = randomBytes(4).toString("hex");
const TEL_EMERGENCIA = `+5255${randomInt(10_000_000, 99_999_999)}`;
/** Valores únicos: si cualquiera de ellos aparece en cualquier parte, hubo una fuga. */
const CENTINELAS = {
  alergias: `CENTINELA-ALERGIA-${SUFIJO}`,
  condiciones_medicas: `CENTINELA-CONDICION-${SUFIJO}`,
  medicamentos: `CENTINELA-MEDICAMENTO-${SUFIJO}`,
  contacto_emergencia: { nombre: `CENTINELA-EMERGENCIA-${SUFIJO}`, telefono: TEL_EMERGENCIA },
};
const TODOS = [CENTINELAS.alergias, CENTINELAS.condiciones_medicas, CENTINELAS.medicamentos, CENTINELAS.contacto_emergencia.nombre, TEL_EMERGENCIA, TEL_EMERGENCIA.slice(1)];
const fugas = (texto: string): string[] => TODOS.filter((c) => texto.includes(c));

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const T0 = new Date("2026-10-08T16:00:00Z");
const despues = (ms: number): Date => new Date(T0.getTime() + ms);

let prisma: PrismaPruebas;
let org: OrganizacionDePrueba;
let siguiente = randomInt(1_000_000, 2_000_000_000);
const cifrador = crearCifrador(randomBytes(32));

before(async () => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

test("ningún centinela de salud aparece en logs, notas, mensajes ni tablas, tras ejecutar todos los flujos", async () => {
  org = await sembrarOrganizacion(prisma, "Fuga");
  const db = conAlcance(prisma, org.organizacionId);
  const admin = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  const maestro = await sembrarUsuario(prisma, org.organizacionId, { rol: "maestro" });
  const transporte = new TransporteFalso();
  const proveedor = (ahora: Date) => new MessagingProvider({ transporte, reloj: () => ahora });

  // Reenganche configurado, para que el motor tenga algo que mandar.
  const plantilla = await prisma.plantilla_mensaje.create({
    data: { organizacion_id: org.organizacionId, codigo: "reenganche", content_sid: "HX00000000000000000000000000000000", categoria: "utility", estado_aprobacion: "aprobada", cuerpo_referencia: "Hola, quedó pendiente tu consulta sobre {{1}}.", variables: [{ pos: 1, nombre: "nombre_vertical" }] as never },
  });
  await prisma.automatizacion.create({ data: { organizacion_id: org.organizacionId, nombre: "Reenganche", evento_disparador: "lead_sin_respuesta", offset_minutos: 1500, plantilla_id: plantilla.id } });

  /** Un contacto con su conversación, que escribe en el instante dado. */
  const contacto = () => {
    const conversacion = randomInt(1, 2_000_000_000);
    const telefono = `+5255${randomInt(10_000_000, 99_999_999)}`;
    const evento = (contenido: string): EventoEntrante => {
      const id = String(siguiente++);
      return { chatwootAccountId: org.chatwootAccountId, chatwootInboxId: org.chatwootInboxId, chatwootConversacionId: conversacion, idMensaje: id, contenido, estadoConversacion: "pending", contacto: { nombre: "Mamá", telefono }, creadoEn: null, llave: { proveedor: "chatwoot", id }, numeroReceptor: null, crudo: null };
    };
    const escribe = (contenido: string, cuando: Date) => procesarEntrante({ prisma, mensajeria: proveedor(cuando), reloj: () => cuando }, evento(contenido));
    const lead = () => db.lead.findFirstOrThrow({ where: { telefono }, select: { id: true } });
    return { escribe, lead, telefono };
  };
  /** Le pone ficha de salud con centinelas al menor que el bot capturó. */
  const ponerFicha = async (leadId: string): Promise<string> => {
    const p = await db.prospecto.findFirstOrThrow({ where: { lead_id: leadId }, select: { id: true } });
    await guardarSensible(db, { usuarioId: admin.id, organizacionId: org.organizacionId, rol: "administrador" }, { sujetoTipo: "prospecto", sujetoId: p.id, motivo: "captura de la inscripción", ruta: "prueba", valores: { ...CENTINELAS } }, { cifrador });
    return p.id;
  };

  const colector: ColectorDeLogs = colectarLogs();
  let prospectoConFicha: string;
  try {
    // 1. Captura completa con handoff: la ficha existe ANTES de que se arme la nota con el resumen.
    const a = contacto();
    await a.escribe("Hola", T0);
    await a.escribe("Ana", T0);
    prospectoConFicha = await ponerFicha((await a.lead()).id);
    await a.escribe("7", despues(1 * MIN));
    await a.escribe("2", despues(2 * MIN));

    // 2. Lead a medias: el aviso de los 30 min arma otra nota con los datos parciales.
    const b = contacto();
    await b.escribe("Hola", T0);
    await b.escribe("Beto", T0);
    await ponerFicha((await b.lead()).id);
    await barrerTiemposDeEspera({ prisma, mensajeria: proveedor(despues(31 * MIN)), organizacionId: org.organizacionId, reloj: () => despues(31 * MIN) });

    // 3. Reenganche de 25 h sobre la conversación a medias de un tercero.
    const c = contacto();
    await c.escribe("Hola", T0);
    await c.escribe("Carla", T0);
    await ponerFicha((await c.lead()).id);
    await correrAutomatizaciones({ prisma, mensajeria: proveedor(despues(26 * HORA)), reloj: () => despues(26 * HORA), organizacionId: org.organizacionId });

    // 4. Baja y baja que vuelve a escribir (tarea con el texto del contacto).
    const d = contacto();
    await d.escribe("Hola", T0);
    await d.escribe("Diana", T0);
    await ponerFicha((await d.lead()).id);
    await d.escribe("BAJA", despues(3 * MIN));
    await d.escribe("quiero volver", despues(4 * MIN));

    // 5. Entrega fallida de un mensaje saliente: tarea con el código de error.
    const salientes = await db.mensaje.findMany({ where: { direccion: "saliente", id_externo: { not: null } }, select: { id_externo: true }, take: 1 });
    assert.equal(salientes.length, 1);
    await registrarEstadoEntrega(
      { prisma },
      { proveedor: "chatwoot", idExterno: salientes[0]!.id_externo!, idProveedor: null, estado: "fallido", ocurrioEn: null, errorCodigo: 63016, errorTexto: "Failed to send freeform message", bandeja: { chatwootAccountId: org.chatwootAccountId, chatwootInboxId: org.chatwootInboxId } },
    );

    // 6. La nota del handoff falla (error del transporte): ruta de errores con logs.
    const e = contacto();
    await e.escribe("Hola", T0);
    await e.escribe("Elena", T0);
    await ponerFicha((await e.lead()).id);
    transporte.fallarSi = (envio) => envio.tipo === "nota_interna";
    await e.escribe("8", despues(5 * MIN));
    await e.escribe("1", despues(6 * MIN));
    transporte.fallarSi = undefined;

    // 7. El acceso a los datos sí pasa por su puerta: el administrador lee; el maestro es rechazado.
    const leida = await leerSensible(db, { usuarioId: admin.id, organizacionId: org.organizacionId, rol: "administrador" }, { sujetoTipo: "prospecto", sujetoId: prospectoConFicha, motivo: "prueba de fuga", ruta: "prueba" }, { cifrador });
    assert.equal(leida.campos.alergias?.revelar(), CENTINELAS.alergias, "el dato sí está en el sistema (control positivo)");
    await assert.rejects(leerSensible(db, { usuarioId: maestro.id, organizacionId: org.organizacionId, rol: "maestro" }, { sujetoTipo: "prospecto", sujetoId: prospectoConFicha, motivo: "curiosidad" }, { cifrador }), ErrorAccesoSensible);
    // Un descuido: se pasa el valor leído (envuelto) y un objeto con la clave sensible a un log.
    log.info("descuido_simulado", { ficha: leida, alergias: CENTINELAS.alergias, anidado: { medicamentos: CENTINELAS.medicamentos }, valor: leida.campos.condiciones_medicas });
    log.error("otro_descuido", { contactoEmergencia: CENTINELAS.contacto_emergencia });
  } finally {
    colector.detener();
  }

  // ── Los flujos corrieron de verdad ──
  assert.ok(colector.lineas.length >= 5, `el colector debe haber visto logs (vio ${colector.lineas.length})`);
  assert.ok(transporte.envios.some((x) => x.tipo === "nota_interna"), "hubo notas internas");
  assert.ok(transporte.envios.some((x) => x.tipo === "mensaje"), "hubo mensajes al contacto");
  assert.ok(transporte.envios.some((x) => x.tipo === "plantilla"), "hubo una plantilla (reenganche)");
  assert.ok(await prisma.tarea_asesor.count({ where: { organizacion_id: org.organizacionId, tipo: "baja_volvio_a_escribir" } }), "la baja que vuelve a escribir dejó su tarea");
  assert.ok(await prisma.tarea_asesor.count({ where: { organizacion_id: org.organizacionId, tipo: "entrega_fallida" } }), "la entrega fallida dejó su tarea");
  assert.ok(await prisma.ficha_salud.count({ where: { organizacion_id: org.organizacionId } }) >= 5, "hay fichas con centinelas");

  // ── Ningún centinela, en ningún lado ──
  assert.deepEqual(fugas(colector.texto()), [], "logs");
  assert.match(colector.texto(), /\[REDACTADO\]/, "la redacción se aplicó a los descuidos simulados");
  assert.deepEqual(fugas(JSON.stringify(transporte.envios)), [], "notas y mensajes enviados (TransporteFalso)");

  // Todas las tablas de la organización, fila por fila, en claro. La ficha de salud guarda texto CIFRADO.
  const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await cliente.connect();
  try {
    const tablas = (await cliente.query<{ table_name: string }>(`SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'organizacion_id'`)).rows.map((r) => r.table_name);
    assert.ok(tablas.includes("mensaje") && tablas.includes("interaccion") && tablas.includes("tarea_asesor") && tablas.includes("ficha_salud"));
    let filas = 0;
    for (const tabla of tablas) {
      const r = await cliente.query<{ j: string }>(`SELECT row_to_json(t)::text AS j FROM "${tabla}" t WHERE organizacion_id = $1`, [org.organizacionId]);
      for (const fila of r.rows) {
        filas++;
        assert.deepEqual(fugas(fila.j), [], `tabla ${tabla}`);
      }
    }
    assert.ok(filas > 30, `se revisaron ${filas} filas`);
  } finally {
    await cliente.end();
  }
});

test("control: el detector SÍ ve una fuga (un centinela en un log sin pasar por la redacción, en un mensaje o en una nota)", async () => {
  const c = colectarLogs();
  try {
    console.log(`algo que se coló: ${CENTINELAS.alergias}`);
    log.info("con_texto_libre", { descripcion: `la niña tiene ${CENTINELAS.medicamentos}` });
  } finally {
    c.detener();
  }
  // La redacción es por CLAVE: un texto libre con el valor SÍ pasa. Por eso existen la guarda estática
  // `check:sensibles` (impide escribir esos campos en logs/mensajes) y este test.
  assert.deepEqual(fugas(c.texto()).sort(), [CENTINELAS.alergias, CENTINELAS.medicamentos].sort());
  const transporte = new TransporteFalso();
  await transporte.enviarNotaInterna({ chatwootAccountId: 1, chatwootConversacionId: 1 }, `Nota: ${CENTINELAS.condiciones_medicas}`);
  assert.deepEqual(fugas(JSON.stringify(transporte.envios)), [CENTINELAS.condiciones_medicas]);
});

test("D1-D4: ningún centinela de salud aparece en el aviso al maestro, los recordatorios, la recuperación, las notas del bot ni las tareas de la clase muestra", async () => {
  const AHORA = new Date("2026-11-02T18:00:00Z"); // lunes 12:00 locales
  // ── A. El bot agenda la clase (nota al asesor con «Clase muestra: …»), con la ficha de salud ya guardada ──
  const e = await escenarioBot(prisma, { claseMuestra: true, embudo: true, programas: [{ sucursal: 0, nombre: "Programa uno", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Grupo A", cupoMaximo: 5, horarios: [[1, 960, 1020]] }], precio: { inscripcion: "500.00", mensualidad: "300.00" } }] });
  const db = conAlcance(prisma, e.org.organizacionId);
  const admin = await sembrarUsuario(prisma, e.org.organizacionId, { rol: "administrador" });
  const colector: ColectorDeLogs = colectarLogs();
  try {
    const c = e.contacto();
    for (const t of ["Hola", "Luis"]) await c.escribe(t, AHORA);
    const p = await db.prospecto.findFirstOrThrow({ where: { lead: { telefono: c.telefono } }, select: { id: true } });
    await guardarSensible(db, { usuarioId: admin.id, organizacionId: e.org.organizacionId, rol: "administrador" }, { sujetoTipo: "prospecto", sujetoId: p.id, motivo: "captura de la inscripción", ruta: "prueba", valores: { ...CENTINELAS } }, { cifrador });
    for (const t of ["8", "1", "1", "2"]) await c.escribe(t, AHORA); // edad, sucursal, horario, fecha
    assert.equal(await db.clase_muestra.count({ where: { prospecto_id: p.id, estatus: "agendada" } }), 1, "el bot agendó de verdad");

    // ── B. Otra clase: aviso al maestro, recordatorios, reprogramar, cancelar, asistencia, recuperación ──
    const grupoId = e.programas[0]!.grupos[0]!.id;
    const instructor = await prisma.instructor.create({ data: { organizacion_id: e.org.organizacionId, nombre: "Maestra Ana", telefono: `+5255${randomInt(10_000_000, 99_999_999)}` } });
    await prisma.grupo.update({ where: { id: grupoId }, data: { instructor_id: instructor.id } });
    for (const [codigo, vars, cuerpo] of [
      ["aviso_maestro_agendada", [{ pos: 1, nombre: "nombre_alumno" }, { pos: 2, nombre: "nombre_grupo" }], "Nueva clase muestra: {{1}} en {{2}}"],
      ["aviso_maestro_cancelada", [{ pos: 1, nombre: "nombre_alumno" }, { pos: 2, nombre: "nombre_grupo" }], "Se canceló: {{1}} en {{2}}"],
      ["aviso_maestro_reprogramada", [{ pos: 1, nombre: "nombre_alumno" }, { pos: 2, nombre: "nombre_grupo" }], "Se cambió: {{1}} en {{2}}"],
      ["recordatorio_clase_muestra", [{ pos: 1, nombre: "nombre_prospecto" }, { pos: 2, nombre: "nombre_grupo" }, { pos: 3, nombre: "fecha_clase" }], "Recordatorio {{1}} {{2}} {{3}}"],
      ["recuperacion_no_asistio", [{ pos: 1, nombre: "nombre_prospecto" }], "No pudo asistir {{1}}"],
    ] as const) {
      await prisma.plantilla_mensaje.create({ data: { organizacion_id: e.org.organizacionId, codigo, content_sid: "HX0", categoria: "utility", variables: vars as never, cuerpo_referencia: cuerpo, estado_aprobacion: "aprobada" } });
    }
    const plantillaR = await prisma.plantilla_mensaje.findFirstOrThrow({ where: { organizacion_id: e.org.organizacionId, codigo: "recordatorio_clase_muestra" } });
    const plantillaN = await prisma.plantilla_mensaje.findFirstOrThrow({ where: { organizacion_id: e.org.organizacionId, codigo: "recuperacion_no_asistio" } });
    await prisma.automatizacion.create({ data: { organizacion_id: e.org.organizacionId, nombre: "R24", evento_disparador: "clase_muestra_proxima", offset_minutos: -1440, plantilla_id: plantillaR.id, dias_permitidos: [0, 1, 2, 3, 4, 5, 6] } });
    await prisma.automatizacion.create({ data: { organizacion_id: e.org.organizacionId, nombre: "NA", evento_disparador: "clase_muestra_no_asistio", offset_minutos: 120, espaciado_minutos: 2880, max_intentos: 2, plantilla_id: plantillaN.id, dias_permitidos: [0, 1, 2, 3, 4, 5, 6] } });
    const usuario = await prisma.usuario.create({ data: { organizacion_id: e.org.organizacionId, correo: `f-${Math.random()}@p.test`, nombre: "Asesor", rol: "asesor", contrasena_hash: "x" } });
    const f = await sembrarFamilia(prisma, e.org, { sucursalId: e.org.sucursales[0]!.id, nombre: "Mateo" });
    await prisma.conversacion.create({ data: { organizacion_id: e.org.organizacionId, bandeja_chatwoot_id: e.org.bandejaId, lead_id: f.leadId, chatwoot_conversacion_id: randomInt(1, 2_000_000_000) } });
    await guardarSensible(db, { usuarioId: admin.id, organizacionId: e.org.organizacionId, rol: "administrador" }, { sujetoTipo: "prospecto", sujetoId: f.prospectoId, motivo: "captura de la inscripción", ruta: "prueba", valores: { ...CENTINELAS } }, { cifrador });
    const ctx = { ahora: AHORA, fuente: new OcupacionFija(), origen: { tipo: "usuario" as const, usuarioId: usuario.id } };
    const r1 = await db.$transaction((tx) => agendarClaseMuestra(tx, ctx, { prospectoId: f.prospectoId, grupoId, fechaHora: new Date("2026-11-09T22:00:00Z") }));
    assert.ok(r1.ok);
    const r2 = await db.$transaction((tx) => reprogramarClaseMuestra(tx, ctx, { claseId: r1.clase.id, fechaHora: new Date("2026-11-16T22:00:00Z") }));
    assert.ok(r2.ok);
    await barrerAvisosMaestro({ prisma, mensajeria: new MessagingProvider({ transporte: e.transporte, reloj: () => AHORA }), reloj: () => AHORA, organizacionId: e.org.organizacionId });
    await correrAutomatizaciones({ prisma, mensajeria: new MessagingProvider({ transporte: e.transporte, reloj: () => new Date("2026-11-15T23:00:00Z") }), reloj: () => new Date("2026-11-15T23:00:00Z"), organizacionId: e.org.organizacionId });
    await db.$transaction((tx) => marcarAsistencia(tx, { claseId: r2.clase.id, estatus: "no_asistio", usuarioId: usuario.id, ahora: new Date("2026-11-16T23:00:00Z") }));
    await correrAutomatizaciones({ prisma, mensajeria: new MessagingProvider({ transporte: e.transporte, reloj: () => new Date("2026-11-17T16:00:00Z") }), reloj: () => new Date("2026-11-17T16:00:00Z"), organizacionId: e.org.organizacionId });
    const otra = await db.$transaction((tx) => agendarClaseMuestra(tx, ctx, { prospectoId: f.prospectoId, grupoId, fechaHora: new Date("2026-11-23T22:00:00Z") }));
    assert.ok(otra.ok);
    await db.$transaction((tx) => cancelarClaseMuestra(tx, otra.clase.id, "cambio de planes", AHORA));
  } finally {
    colector.detener();
  }
  // Los flujos corrieron de verdad.
  assert.ok(e.transporte.envios.some((x) => x.tipo === "iniciar"), "se abrió la conversación del instructor");
  assert.ok(e.transporte.envios.filter((x) => x.tipo === "plantilla").length >= 3, "aviso al maestro, recordatorio y recuperación salieron");
  assert.ok(e.transporte.envios.some((x) => x.tipo === "nota_interna" && /Clase muestra:/.test(x.texto ?? "")), "la nota del bot lleva la clase muestra");
  assert.ok(await db.tarea_asesor.count({ where: { tipo: "llamar_no_asistio" } }), "quedó la tarea de llamar");
  assert.ok(await db.aviso_maestro.count() >= 4, "hay avisos al maestro");
  assert.deepEqual(fugas(colector.texto()), [], "logs");
  assert.deepEqual(fugas(JSON.stringify(e.transporte.envios)), [], "notas y mensajes enviados");
  const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await cliente.connect();
  try {
    const tablas = (await cliente.query<{ table_name: string }>(`SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'organizacion_id'`)).rows.map((r) => r.table_name);
    assert.ok(tablas.includes("clase_muestra") && tablas.includes("aviso_maestro") && tablas.includes("conversacion_instructor"));
    let filas = 0;
    for (const tabla of tablas) {
      const r = await cliente.query<{ j: string }>(`SELECT row_to_json(t)::text AS j FROM "${tabla}" t WHERE organizacion_id = $1`, [e.org.organizacionId]);
      for (const fila of r.rows) {
        filas++;
        assert.deepEqual(fugas(fila.j), [], `tabla ${tabla}`);
      }
    }
    assert.ok(filas > 30, `se revisaron ${filas} filas`);
  } finally {
    await cliente.end();
  }
});

test("D5: ningún centinela de salud aparece en logs, respuestas, errores, registro de cambios ni en ninguna tabla tras capturar, validar, completar y cerrar el registro de la clase muestra", async () => {
  const AHORA = new Date("2026-11-10T18:00:00Z");
  const organizacion = await sembrarOrganizacion(prisma, "Fuga registro");
  const db = conAlcance(prisma, organizacion.organizacionId);
  const api = levantarApi(prisma, { reloj: () => AHORA, sensibles: { cifrador } });
  const colector: ColectorDeLogs = colectarLogs();
  const respuestas: string[] = [];
  try {
    const entrar = async (rol: "administrador" | "asesor" | "maestro") => {
      const u = await sembrarUsuario(prisma, organizacion.organizacionId, { rol, sucursales: rol === "asesor" ? [organizacion.sucursales[0]!.id] : [] });
      const c = api.cliente();
      assert.equal((await c.login(organizacion.slug, u.correo, u.contrasena)).estado, 201);
      return { c, id: u.id };
    };
    const admin = await entrar("administrador");
    const asesor = await entrar("asesor");
    const maestro = await entrar("maestro");
    const instructor = await prisma.instructor.create({ data: { organizacion_id: organizacion.organizacionId, usuario_id: maestro.id, nombre: "Maestro" } });
    const programa = await sembrarPrograma(prisma, organizacion, { sucursalId: organizacion.sucursales[0]!.id, nombre: "Programa", edadMin: 3, edadMax: 14, grupos: [{ nombre: "Grupo", cupoMaximo: 20, horarios: [[1, 960, 1020]] }] });
    await prisma.grupo.update({ where: { id: programa.grupos[0]!.id }, data: { instructor_id: instructor.id } });
    const documentos = await sembrarDocumentosLegales(prisma, organizacion);
    const familia = await sembrarFamilia(prisma, organizacion, { sucursalId: organizacion.sucursales[0]!.id });
    const clase = await prisma.clase_muestra.create({ data: { organizacion_id: organizacion.organizacionId, lead_id: familia.leadId, prospecto_id: familia.prospectoId, grupo_id: programa.grupos[0]!.id, fecha_hora: new Date("2026-11-09T22:00:00Z"), agendada_por: "usuario", agendada_por_usuario_id: admin.id } });
    const url = `/api/clases-muestra/${clase.id}/registro`;
    const anotar = <T>(r: { estado: number; cuerpo: T }): { estado: number; cuerpo: T } => {
      respuestas.push(JSON.stringify(r.cuerpo));
      return r;
    };
    const tutor = { nombre: "Rosa", apellidos: "Mena", parentesco: "madre", telefono: "+525511112222", correo: "rosa@correo.test", es_responsable_pago: true, lo_lleva: true };

    // El asesor captura todo menos la salud; intenta la salud y se le niega (la respuesta tampoco repite el valor).
    assert.equal(anotar(await asesor.c.patch(url, { alumno: { nombre: "Mateo", apellidos: "Soto", fecha_nacimiento: "2018-05-04", sexo: "masculino" }, tutores: [tutor], antecedentes: { practico_antes: false, motivo_clase: "disciplina" } })).estado, 200);
    assert.equal(anotar(await asesor.c.patch(url, { salud: { alergias: CENTINELAS.alergias } })).estado, 403);
    // Errores de validación con valores de salud dentro: el error no los repite.
    const malos = [
      { salud: { alergias: CENTINELAS.alergias, contacto_emergencia: { nombre: CENTINELAS.contacto_emergencia.nombre, telefono: "12" } } },
      { salud: { medicamentos: CENTINELAS.medicamentos, desconocido: CENTINELAS.condiciones_medicas } },
      { salud: { contacto_emergencia: { nombre: "Rosa Mena", telefono: TEL_EMERGENCIA } } },
      { observacion: { notas: `Tiene alergia: ${CENTINELAS.alergias}` } },
      { observacion: { nivel_observado: `toma ${CENTINELAS.medicamentos}` } },
    ];
    for (const m of malos) assert.equal(anotar(await maestro.c.patch(url, m)).estado, 400);
    // El maestro captura la salud con los centinelas; el administrador también (otra vez, con la lectura que la ruta de salud permite).
    assert.equal(anotar(await maestro.c.patch(url, { salud: { alergias: CENTINELAS.alergias, condiciones_medicas: CENTINELAS.condiciones_medicas, medicamentos: CENTINELAS.medicamentos, contacto_emergencia: { ...CENTINELAS.contacto_emergencia, parentesco: "tía" }, autorizacion_atencion_medica: true } })).estado, 200);
    // El asesor cambia los tutores (valida el contacto sin leerlo); un tutor igual al contacto se rechaza sin repetirlo.
    assert.equal(anotar(await asesor.c.patch(url, { tutores: [tutor, { nombre: "Otra", parentesco: "tía", telefono: TEL_EMERGENCIA }] })).estado, 400);
    assert.equal(anotar(await asesor.c.patch(url, { tutores: [tutor, { nombre: "Pedro", parentesco: "abuelo", telefono: "+525533334444", puede_recoger: true }] })).estado, 200);
    assert.equal(anotar(await admin.c.patch(url, { observacion: { asistio: true, interes_percibido: "alto" } })).estado, 200);
    assert.equal(anotar(await maestro.c.post(`${url}/completar`, {})).estado, 200);
    assert.equal(anotar(await asesor.c.get(url)).estado, 200);
    assert.equal(anotar(await maestro.c.get(url)).estado, 200);
    assert.equal(anotar(await admin.c.post(`${url}/aceptaciones`, { documento_id: documentos.reglamento, version: 1, resultado: "aceptada", aceptante: { nombre: "Rosa Mena", parentesco: "madre" }, canal: "presencial" })).estado, 201);
    assert.equal(anotar(await admin.c.post(`${url}/cerrar`, {})).estado, 200);
    assert.equal(anotar(await admin.c.post(`${url}/reabrir`, {})).estado, 200);
    // Lo que SÍ puede salir: el maestro lee la ficha por la ruta de salud (control positivo: el dato está en el sistema).
    const leida = anotar(await maestro.c.get<{ campos: { alergias: string } }>(`/api/salud/prospecto/${familia.prospectoId}?motivo=fuga`));
    assert.equal(leida.cuerpo.campos.alergias, CENTINELAS.alergias);
    respuestas.pop(); // esa respuesta es la única autorizada a llevar el valor
  } finally {
    colector.detener();
    await api.cerrar();
  }
  assert.ok(colector.lineas.length >= 3 && /acceso_dato_sensible_denegado/.test(colector.texto()), `el colector vio los logs de los inicios de sesión y de la denegación (${colector.lineas.length})`);
  assert.deepEqual(fugas(colector.texto()), [], "logs");
  assert.deepEqual(fugas(respuestas.join("\n")), [], "respuestas y errores de la API (menos la lectura autorizada de la ruta de salud)");
  const cliente = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await cliente.connect();
  try {
    const tablas = (await cliente.query<{ table_name: string }>(`SELECT DISTINCT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'organizacion_id'`)).rows.map((r) => r.table_name);
    assert.ok(tablas.includes("registro_clase_muestra") && tablas.includes("registro_tutor") && tablas.includes("registro_cambio") && tablas.includes("acceso_dato_sensible"));
    let filas = 0;
    for (const tabla of tablas) {
      const r = await cliente.query<{ j: string }>(`SELECT row_to_json(t)::text AS j FROM "${tabla}" t WHERE organizacion_id = $1`, [organizacion.organizacionId]);
      for (const fila of r.rows) {
        filas++;
        assert.deepEqual(fugas(fila.j), [], `tabla ${tabla}`);
      }
    }
    assert.ok(filas > 15, `se revisaron ${filas} filas`);
  } finally {
    await cliente.end();
  }
  assert.ok(await db.registro_cambio.count({ where: { entidad_tipo: "registro_clase_muestra" } }) >= 4, "el registro de cambios sí tiene entradas");
  assert.ok(await db.acceso_dato_sensible.count({ where: { accion: "validar" } }) >= 1, "la comparación interna del contacto quedó registrada como «validar»");
});
