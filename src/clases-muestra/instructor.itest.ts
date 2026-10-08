// ED-01 y ED-02 (auditoría de la etapa D): el instructor que escribe por WhatsApp. Su baja (BAJA, STOP, CANCELAR, NO MOLESTAR) se registra y se
// confirma una vez, y los avisos siguientes se bloquean; y el que ya tiene una conversación y escribe desde otra no pierde el mensaje.
// Postgres real y el transporte falso.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { procesarEntrante } from "../captacion/entrante.ts";
import { textos } from "../captacion/maquina.ts";
import { estaDadoDeBaja } from "../mensajeria/consentimiento.ts";
import { MessagingProvider, type EventoEntrante } from "../mensajeria/index.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { escenarioBot, type EscenarioBot } from "../testutil/bot.ts";
import { OcupacionFija, sembrarFamilia } from "../testutil/semilla.ts";
import { agendarClaseMuestra } from "./agenda.ts";
import { barrerAvisosMaestro } from "./avisos.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

// Lunes 2 de noviembre de 2026, 12:00 en la Ciudad de México.
const AHORA = new Date("2026-11-02T18:00:00Z");
const MIERCOLES_4 = new Date("2026-11-05T00:00:00Z"); // miércoles 4, 18:00 locales
const MIERCOLES_11 = new Date("2026-11-12T00:00:00Z");

interface Mundo {
  e: EscenarioBot;
  telefono: string;
  instructorId: string;
  grupoId: string;
  escribe(contenido: string, conversacion?: number, creadoEn?: Date): ReturnType<typeof procesarEntrante>;
  agendar(fecha: Date): Promise<void>;
  barrer(): ReturnType<typeof barrerAvisosMaestro>;
  avisos(): Promise<{ entrega: string; motivo_entrega: string | null }[]>;
}

async function mundo(): Promise<Mundo> {
  const e = await escenarioBot(prisma, { cotizador: false, embudo: true, programas: [{ sucursal: 0, nombre: "Programa P", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Grupo A", cupoMaximo: 20, horarios: [[3, 1080, 1140]] }] }] });
  const telefono = `+5255${randomInt(10_000_000, 99_999_999)}`;
  const instructor = await prisma.instructor.create({ data: { organizacion_id: e.org.organizacionId, nombre: "Maestra Ana", telefono } });
  const grupoId = e.programas[0]!.grupos[0]!.id;
  await prisma.grupo.update({ where: { id: grupoId }, data: { instructor_id: instructor.id } });
  await prisma.plantilla_mensaje.create({
    data: {
      organizacion_id: e.org.organizacionId,
      codigo: "aviso_maestro_agendada",
      content_sid: "HX00000000000000000000000000000002",
      categoria: "utility",
      clase_mensaje: "servicio",
      variables: [{ pos: 1, nombre: "nombre_alumno" }, { pos: 2, nombre: "nombre_grupo" }] as object,
      cuerpo_referencia: "Nueva clase muestra: {{1}} en {{2}}.",
      estado_aprobacion: "aprobada",
    },
  });
  const usuario = await prisma.usuario.create({ data: { organizacion_id: e.org.organizacionId, correo: `a-${Math.random()}@p.test`, nombre: "Asesor", rol: "asesor", contrasena_hash: "x" } });
  let n = 0;
  const evento = (contenido: string, conversacion: number, creadoEn: Date | null = null): EventoEntrante => {
    const id = `instr-${randomInt(1_000_000_000)}-${++n}`;
    return {
      chatwootAccountId: e.org.chatwootAccountId,
      chatwootInboxId: e.org.chatwootInboxId,
      chatwootConversacionId: conversacion,
      idMensaje: id,
      contenido,
      estadoConversacion: "pending",
      contacto: { nombre: "Maestra Ana", telefono },
      creadoEn,
      llave: { proveedor: "chatwoot", id },
      numeroReceptor: null,
      crudo: null,
    };
  };
  const conversacionInicial = randomInt(1, 2_000_000_000);
  return {
    e,
    telefono,
    instructorId: instructor.id,
    grupoId,
    escribe: (contenido, conversacion = conversacionInicial, creadoEn) => procesarEntrante(e.deps(AHORA), evento(contenido, conversacion, creadoEn ?? null)),
    async agendar(fecha) {
      const f = await sembrarFamilia(prisma, e.org, { sucursalId: e.org.sucursales[0]!.id });
      const r = await e.db.$transaction((tx) => agendarClaseMuestra(tx, { ahora: AHORA, fuente: new OcupacionFija(), origen: { tipo: "usuario", usuarioId: usuario.id } }, { prospectoId: f.prospectoId, grupoId, fechaHora: fecha }));
      assert.ok(r.ok, JSON.stringify(r));
    },
    barrer: () => barrerAvisosMaestro({ prisma, mensajeria: new MessagingProvider({ transporte: e.transporte, reloj: () => AHORA }), reloj: () => AHORA, organizacionId: e.org.organizacionId }),
    avisos: () => e.db.aviso_maestro.findMany({ select: { entrega: true, motivo_entrega: true }, orderBy: { creado_en: "asc" } }),
  };
}

const delInstructor = (m: Mundo) => m.e.transporte.envios.filter((x) => x.tipo === "mensaje" && x.texto === textos.confirmacionBaja);

test("ED-01: el instructor que pide la baja (BAJA, STOP, CANCELAR, NO MOLESTAR) queda dado de baja, se le confirma UNA vez y los avisos siguientes no salen", async () => {
  for (const palabra of ["BAJA", "stop", "Cancelar", "no molestar"]) {
    const m = await mundo();
    await m.agendar(MIERCOLES_4);
    // Antes de la baja, un mensaje cualquiera del instructor no lo da de baja.
    assert.equal((await m.escribe("Hola, recibido")).resultado, "instructor");
    assert.equal(await estaDadoDeBaja(m.e.db, m.telefono, "todo"), false, palabra);
    assert.equal(delInstructor(m).length, 0);

    const r = await m.escribe(palabra);
    assert.equal(r.resultado, "instructor", palabra);
    assert.equal(await estaDadoDeBaja(m.e.db, m.telefono, "todo"), true, `${palabra}: la baja quedó registrada`);
    const filas = await m.e.db.consentimiento.findMany({ where: { telefono: m.telefono } });
    assert.equal(filas.length, 1);
    assert.deepEqual([filas[0]!.estado, filas[0]!.alcance, filas[0]!.origen], ["opt_out", "todo", "palabra_clave"]);
    assert.equal(delInstructor(m).length, 1, `${palabra}: se le confirma una vez`);

    // Repetirla no duplica la baja ni la confirmación (el mismo mensaje, ni otro igual).
    await m.escribe(palabra);
    assert.equal(await m.e.db.consentimiento.count({ where: { telefono: m.telefono } }), 1);
    assert.equal(delInstructor(m).length, 1);

    // El aviso pendiente no sale: bloqueado por opt_out, sin plantilla ni mensaje al instructor, y sin lead de por medio.
    const antes = m.e.transporte.envios.length;
    const barrido = await m.barrer();
    assert.deepEqual([barrido.enviados, barrido.bloqueados], [0, 1]);
    assert.equal(m.e.transporte.envios.length, antes, "nada más sale");
    assert.deepEqual((await m.avisos()).map((x) => [x.entrega, x.motivo_entrega]), [["bloqueado", "opt_out"]]);
    assert.equal(await m.e.db.lead.count({ where: { telefono: m.telefono } }), 0, "el instructor no es un lead");
  }
});

test("ED-01: la baja del instructor no afecta a otra organización con el mismo teléfono", async () => {
  const m = await mundo();
  const otra = await mundo();
  await prisma.instructor.updateMany({ where: { id: otra.instructorId }, data: { telefono: m.telefono } });
  await m.escribe("BAJA");
  assert.equal(await estaDadoDeBaja(m.e.db, m.telefono, "todo"), true);
  assert.equal(await estaDadoDeBaja(otra.e.db, m.telefono, "todo"), false);
});

test("ED-01: sin ventana de servicio abierta no hay confirmación libre (pero la baja queda registrada)", async () => {
  const m = await mundo();
  const proveedor = new MessagingProvider({ transporte: m.e.transporte, reloj: () => new Date(AHORA.getTime() + 30 * 3_600_000) });
  await m.escribe("Hola");
  const ci = await m.e.db.conversacion_instructor.findFirstOrThrow({ select: { id: true } });
  // 30 h después de su último mensaje la ventana de 24 h ya cerró: la confirmación no puede salir como mensaje libre.
  assert.equal(await proveedor.confirmarBajaDeInstructor(m.e.db, ci.id, textos.confirmacionBaja), "bloqueado");
  assert.equal(delInstructor(m).length, 0);
});

test("ED-02: el instructor que ya tiene su conversación y escribe desde OTRA conversación de Chatwoot no pierde el mensaje: se le cambia la conversación", async () => {
  const m = await mundo();
  const primera = randomInt(1, 2_000_000_000);
  const segunda = primera + 1;
  assert.equal((await m.escribe("Hola", primera)).resultado, "instructor");
  const antes = await m.e.db.conversacion_instructor.findMany({});
  assert.equal(antes.length, 1);
  assert.equal(antes[0]!.chatwoot_conversacion_id, primera);

  // Chatwoot le abre otra conversación (se resolvió la anterior): antes reventaba con la unicidad y el mensaje se perdía.
  const r = await m.escribe("No puedo ese día", segunda);
  assert.equal(r.resultado, "instructor");
  const despues = await m.e.db.conversacion_instructor.findMany({});
  assert.equal(despues.length, 1, "sigue siendo UNA conversación del instructor");
  assert.equal(despues[0]!.chatwoot_conversacion_id, segunda);
  assert.equal(despues[0]!.id, antes[0]!.id);
  assert.ok(despues[0]!.ventana_servicio_hasta && despues[0]!.ventana_servicio_hasta.getTime() > AHORA.getTime(), "su ventana de 24 h se abrió");
  assert.equal(await m.e.db.lead.count({ where: { telefono: m.telefono } }), 0);

  // El siguiente aviso sale por la conversación vigente (mensaje libre: la ventana está abierta).
  await m.agendar(MIERCOLES_11);
  assert.equal((await m.barrer()).enviados, 1);
  const salida = m.e.transporte.envios.filter((x) => x.destino.chatwootConversacionId === segunda && x.tipo === "mensaje");
  assert.equal(salida.length, 1);
  assert.equal(m.e.transporte.envios.filter((x) => x.destino.chatwootConversacionId === primera).length, 0);

  // Y una baja desde la conversación nueva también se registra.
  await m.escribe("BAJA", segunda + 1);
  assert.equal(await estaDadoDeBaja(m.e.db, m.telefono, "todo"), true);
});

test("ED-02 (concurrencia): dos mensajes del instructor desde dos conversaciones nuevas a la vez terminan en UNA conversación y ninguno falla", async () => {
  const m = await mundo();
  assert.equal((await m.escribe("Hola", 7_000_001)).resultado, "instructor");
  const base = randomInt(1_000, 1_000_000);
  const rs = await Promise.all([m.escribe("a", base), m.escribe("b", base + 1), m.escribe("c", base + 2)]);
  assert.deepEqual(rs.map((r) => r.resultado), ["instructor", "instructor", "instructor"]);
  assert.equal(await m.e.db.conversacion_instructor.count({}), 1);
});

test("ED-05 (M88): si el teléfono del instructor también es el de un contacto de esa vertical, su mensaje se atiende como contacto (no como instructor)", async () => {
  const m = await mundo();
  const f = await sembrarFamilia(prisma, m.e.org, { sucursalId: m.e.org.sucursales[0]!.id, telefono: m.telefono });
  const r = await m.escribe("Hola, quiero informes", randomInt(1, 2_000_000_000));
  assert.notEqual(r.resultado, "instructor");
  assert.equal(await m.e.db.conversacion_instructor.count({}), 0, "no se le abrió conversación de instructor");
  assert.equal(await m.e.db.conversacion.count({ where: { lead_id: f.leadId } }), 1, "la conversación es la del contacto");
});

test("ED-05 (M89): un mensaje tardío del instructor (un reintento de Chatwoot) nunca acorta su ventana de 24 h", async () => {
  const m = await mundo();
  await m.escribe("Hola"); // recibido en AHORA
  const ci = await m.e.db.conversacion_instructor.findFirstOrThrow({});
  assert.equal(ci.ultimo_mensaje_entrante_en?.toISOString(), AHORA.toISOString());
  // Llega después un mensaje que Chatwoot fechó dos horas antes: la ventana sigue contando desde el último real.
  await m.escribe("(reintento tardío)", undefined, new Date(AHORA.getTime() - 2 * 3_600_000));
  const despues = await m.e.db.conversacion_instructor.findFirstOrThrow({});
  assert.equal(despues.ultimo_mensaje_entrante_en?.toISOString(), AHORA.toISOString());
  assert.equal(despues.ventana_servicio_hasta?.toISOString(), new Date(AHORA.getTime() + 24 * 3_600_000).toISOString());
});
