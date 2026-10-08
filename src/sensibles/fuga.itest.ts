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
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { sembrarUsuario } from "../testutil/api.ts";
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
