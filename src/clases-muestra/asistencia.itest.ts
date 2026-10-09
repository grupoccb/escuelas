// D4: asistió / no asistió y la recuperación de quien no llegó, contra Postgres real: transiciones válidas únicamente, solo desde la hora de
// la clase, idempotente, corrección dentro de una ventana, etapa del lead, tarea «llamar», y la automatización de recuperación con el motor
// real (horario, tope de intentos espaciados, baja, frecuencia, atención humana). Reloj inyectado.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { conAlcance, altaConAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { OcupacionFija, fijarConfiguracion, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba, type TipoDeEtapa, POR_UNA_PERSONA } from "../testutil/semilla.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { MessagingProvider, TransporteFalso } from "../mensajeria/index.ts";
import { correrAutomatizaciones, type ResumenMotor } from "../automatizaciones/motor.ts";
import { agendarClaseMuestra, cancelarClaseMuestra, type ContextoDeAgenda } from "./agenda.ts";
import { marcarAsistencia } from "./asistencia.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

const HORA = 3_600_000;
const iso = (d: Date | null | undefined): string | null => d?.toISOString() ?? null;
// Lunes 2 de noviembre de 2026, 16:00 en la Ciudad de México (UTC-6) = 22:00Z. Se agenda el 20 de octubre.
const CLASE = new Date("2026-11-02T22:00:00Z");
const AGENDADA_EL = new Date("2026-10-20T18:00:00Z");

interface Opciones {
  maxIntentos?: number;
  espaciado?: number | null;
  conConversacion?: boolean;
}

async function mundo(o: Opciones = {}) {
  const org: OrganizacionDePrueba = await sembrarOrganizacion(prisma, "Asistencia");
  const etapas: Record<TipoDeEtapa, string> = await sembrarEmbudo(prisma, org);
  const sucursalId = org.sucursales[0]!.id;
  const p = await sembrarPrograma(prisma, org, { sucursalId, nombre: "Programa P", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Grupo A", cupoMaximo: 10, horarios: [[1, 960, 1020], [3, 960, 1020]] }] });
  const plantilla = await prisma.plantilla_mensaje.create({
    data: {
      organizacion_id: org.organizacionId,
      codigo: "recuperacion_no_asistio",
      content_sid: "HX00000000000000000000000000000006",
      categoria: "utility",
      clase_mensaje: "marketing",
      estado_aprobacion: "aprobada",
      cuerpo_referencia: "Hola, vimos que {{1}} no pudo asistir a su clase muestra de {{2}} del {{3}}. ¿Te gustaría reagendarla?",
      variables: [{ pos: 1, nombre: "nombre_prospecto" }, { pos: 2, nombre: "nombre_grupo" }, { pos: 3, nombre: "fecha_clase" }] as never,
    },
  });
  const automatizacion = await prisma.automatizacion.create({
    data: { organizacion_id: org.organizacionId, nombre: "Recuperación", evento_disparador: "clase_muestra_no_asistio", offset_minutos: 120, espaciado_minutos: o.espaciado === undefined ? 2880 : o.espaciado, plantilla_id: plantilla.id, max_intentos: o.maxIntentos ?? 2, dias_permitidos: [0, 1, 2, 3, 4, 5, 6] },
  });
  const usuario = await prisma.usuario.create({ data: { organizacion_id: org.organizacionId, correo: `u-${Math.random()}@p.test`, nombre: "Maestro", rol: "maestro", contrasena_hash: "x" } });
  const db = conAlcance(prisma, org.organizacionId);
  const transporte = new TransporteFalso();
  const fuente = new OcupacionFija();
  const ctx = (ahora: Date): ContextoDeAgenda => ({ ahora, fuente, origen: { tipo: "usuario", usuarioId: usuario.id } });
  async function familia(nombre = "Sofía") {
    const f = await sembrarFamilia(prisma, org, { sucursalId, nombre });
    const conv = o.conConversacion === false ? null : await prisma.conversacion.create({ data: { organizacion_id: org.organizacionId, bandeja_chatwoot_id: org.bandejaId, lead_id: f.leadId, chatwoot_conversacion_id: randomInt(1, 2_000_000_000) } });
    return { ...f, conversacionId: conv?.id ?? null };
  }
  return {
    org,
    etapas,
    db,
    transporte,
    grupoId: p.grupos[0]!.id,
    sucursalId,
    automatizacionId: automatizacion.id,
    usuarioId: usuario.id,
    ctx,
    familia,
    async agendar(prospectoId: string, fecha = CLASE, ahora = AGENDADA_EL) {
      const r = await db.$transaction((tx) => agendarClaseMuestra(tx, ctx(ahora), { prospectoId, grupoId: p.grupos[0]!.id, fechaHora: fecha }));
      assert.ok(r.ok, JSON.stringify(r));
      return r.clase.id;
    },
    marcar: (claseId: string, estatus: "asistio" | "no_asistio", ahora: Date, usuarioId = usuario.id) => db.$transaction((tx) => marcarAsistencia(tx, { claseId, estatus, usuarioId, ahora })),
    corre(ahora: Date): Promise<ResumenMotor> {
      return correrAutomatizaciones({ prisma, mensajeria: new MessagingProvider({ transporte, reloj: () => ahora }), reloj: () => ahora, organizacionId: org.organizacionId });
    },
    recuperacion: (claseId: string) =>
      db.automatizacion_ejecucion.findMany({ where: { entidad_tipo: "clase_muestra", entidad_id: claseId, automatizacion: { evento_disparador: "clase_muestra_no_asistio" } }, orderBy: { ocurrencia: "asc" }, select: { ocurrencia: true, estatus: true, motivo_omision: true, programado_para: true } }),
    tareas: (claseId: string) => db.tarea_asesor.findMany({ where: { clase_muestra_id: claseId, tipo: "llamar_no_asistio" }, select: { estado: true, descripcion: true, vence_en: true } }),
    etapaDe: async (leadId: string) => (await db.lead.findFirstOrThrow({ where: { id: leadId }, select: { etapa_id: true } })).etapa_id,
    enviados: () => transporte.envios.filter((e) => e.tipo === "plantilla"),
  };
}
type Mundo = Awaited<ReturnType<typeof mundo>>;
const filas = async (m: Mundo, claseId: string) => (await m.recuperacion(claseId)).map((e) => [e.ocurrencia, e.estatus, e.motivo_omision, iso(e.programado_para)]);

test("D4: no se marca antes de la hora de la clase (desde la hora exacta sí) y solo una clase agendada", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  assert.deepEqual(await m.marcar(claseId, "asistio", new Date(CLASE.getTime() - 60_000)), { ok: false, motivo: "aun_no_empieza" });
  assert.deepEqual(await m.marcar(claseId, "no_asistio", new Date(CLASE.getTime() - 1)), { ok: false, motivo: "aun_no_empieza" });
  assert.equal((await m.db.clase_muestra.findFirstOrThrow({ where: { id: claseId } })).estatus, "agendada");
  assert.deepEqual(await m.marcar(claseId, "asistio", CLASE), { ok: true, cambio: true, estatus: "asistio" }, "justo a la hora ya se puede");
  assert.deepEqual(await m.marcar("00000000-0000-4000-8000-0000000000ff", "asistio", CLASE), { ok: false, motivo: "clase_inexistente" });
  // Cancelada o reagendada: ya no se marcan.
  const g = await m.familia();
  const cancelada = await m.agendar(g.prospectoId, new Date("2026-11-04T22:00:00Z"));
  await m.db.$transaction((tx) => cancelarClaseMuestra(tx, cancelada, null, AGENDADA_EL, POR_UNA_PERSONA));
  assert.deepEqual(await m.marcar(cancelada, "asistio", new Date("2026-11-05T00:00:00Z")), { ok: false, motivo: "no_se_puede_marcar" });
  await prisma.clase_muestra.update({ where: { id: cancelada }, data: { estatus: "reagendada" } });
  assert.deepEqual(await m.marcar(cancelada, "no_asistio", new Date("2026-11-05T00:00:00Z")), { ok: false, motivo: "no_se_puede_marcar" });
});

test("D4 asistió: queda marcada (quién y cuándo), el lead pasa a «clase muestra asistida» y es idempotente", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  const ahora = new Date(CLASE.getTime() + HORA);
  assert.deepEqual(await m.marcar(claseId, "asistio", ahora), { ok: true, cambio: true, estatus: "asistio" });
  const c = await m.db.clase_muestra.findFirstOrThrow({ where: { id: claseId } });
  assert.deepEqual([c.estatus, iso(c.asistencia_marcada_en), c.asistencia_marcada_por_usuario_id], ["asistio", iso(ahora), m.usuarioId]);
  assert.equal(await m.etapaDe(f.leadId), m.etapas.muestra_asistida);
  assert.equal((await m.db.interaccion.findMany({ where: { lead_id: f.leadId, tipo: "cambio_etapa" } })).length, 2, "agendada y asistida");
  // Marcar lo mismo otra vez no hace nada: ni la hora de la marca, ni otra interacción.
  assert.deepEqual(await m.marcar(claseId, "asistio", new Date(CLASE.getTime() + 5 * HORA)), { ok: true, cambio: false, estatus: "asistio" });
  assert.equal(iso((await m.db.clase_muestra.findFirstOrThrow({ where: { id: claseId } })).asistencia_marcada_en), iso(ahora));
  assert.equal(await m.db.interaccion.count({ where: { lead_id: f.leadId, tipo: "nota" } }), 1);
  assert.deepEqual(await m.recuperacion(claseId), [], "no hay recuperación para quien asistió");
});

test("D4 la etapa solo avanza: un lead que ya iba en negociación no vuelve a «asistida»", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  await prisma.lead.update({ where: { id: f.leadId }, data: { etapa_id: m.etapas.negociacion } });
  await m.marcar(claseId, "asistio", CLASE);
  assert.equal(await m.etapaDe(f.leadId), m.etapas.negociacion);
});

test("D4 no asistió: se programan los intentos de recuperación (2 h y 48 h después) y queda UNA tarea «llamar a quien no llegó»; la etapa no cambia", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  const ahora = new Date("2026-11-02T23:00:00Z"); // lunes 17:00 locales
  assert.deepEqual(await m.marcar(claseId, "no_asistio", ahora), { ok: true, cambio: true, estatus: "no_asistio" });
  assert.deepEqual(await filas(m, claseId), [
    [1, "programado", null, "2026-11-03T01:00:00.000Z"], // lunes 19:00 locales: dentro de horario
    [2, "programado", null, "2026-11-05T01:00:00.000Z"], // miércoles 19:00 locales
  ]);
  const t = await m.tareas(claseId);
  assert.equal(t.length, 1);
  assert.match(t[0]!.descripcion, /Llamar a la familia de Sofía: no llegó a su clase muestra del lunes 2 de noviembre a las 16:00 \(Grupo A\)/);
  assert.equal(iso(t[0]!.vence_en), "2026-11-03T23:00:00.000Z");
  assert.equal(await m.etapaDe(f.leadId), m.etapas.muestra_agendada);
  // Repetir la marca no duplica nada.
  await m.marcar(claseId, "no_asistio", new Date(ahora.getTime() + HORA));
  assert.equal(await m.db.automatizacion_ejecucion.count({ where: { entidad_id: claseId } }), 2);
  assert.equal((await m.tareas(claseId)).length, 1);
});

test("D4 corrección: de «no asistió» a «asistió» (error del maestro) cancela la recuperación pendiente, descarta la tarea y adelanta la etapa", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  const marcada = new Date("2026-11-02T23:00:00Z");
  await m.marcar(claseId, "no_asistio", marcada);
  const corrige = new Date(marcada.getTime() + 3 * HORA);
  assert.deepEqual(await m.marcar(claseId, "asistio", corrige), { ok: true, cambio: true, estatus: "asistio" });
  assert.deepEqual((await filas(m, claseId)).map((x) => [x[1], x[2]]), [["cancelado", "asistencia_corregida"], ["cancelado", "asistencia_corregida"]]);
  assert.deepEqual((await m.tareas(claseId)).map((x) => x.estado), ["descartada"]);
  assert.equal(await m.etapaDe(f.leadId), m.etapas.muestra_asistida);
  // La recuperación cancelada no sale aunque llegue su hora.
  assert.equal((await m.corre(new Date("2026-11-03T01:00:00Z"))).enviadas, 0);
  assert.equal(m.transporte.envios.length, 0);
});

test("D4 corrección: de «asistió» a «no asistió» regresa el lead a «clase muestra agendada», programa la recuperación y deja la tarea", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  await m.marcar(claseId, "asistio", CLASE);
  assert.equal(await m.etapaDe(f.leadId), m.etapas.muestra_asistida);
  const corrige = new Date(CLASE.getTime() + 2 * HORA);
  assert.deepEqual(await m.marcar(claseId, "no_asistio", corrige), { ok: true, cambio: true, estatus: "no_asistio" });
  assert.equal(await m.etapaDe(f.leadId), m.etapas.muestra_agendada);
  assert.equal((await m.recuperacion(claseId)).length, 2);
  assert.equal((await m.tareas(claseId)).length, 1);
  assert.equal(iso((await m.db.clase_muestra.findFirstOrThrow({ where: { id: claseId } })).asistencia_marcada_en), iso(corrige), "la marca es la de la corrección");
});

test("D4 corrección: solo dentro de la ventana de la configuración (48 h por omisión), contada desde que se marcó; pasada, se rechaza", async () => {
  const m = await mundo();
  await fijarConfiguracion(prisma, m.org.organizacionId, { clase_muestra_correccion_horas: 24 });
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  const marcada = new Date(CLASE.getTime() + HORA);
  await m.marcar(claseId, "asistio", marcada);
  assert.deepEqual(await m.marcar(claseId, "no_asistio", new Date(marcada.getTime() + 24 * HORA + 1)), { ok: false, motivo: "fuera_de_la_ventana_de_correccion" });
  assert.equal((await m.db.clase_muestra.findFirstOrThrow({ where: { id: claseId } })).estatus, "asistio");
  assert.equal((await m.marcar(claseId, "no_asistio", new Date(marcada.getTime() + 24 * HORA))).ok, true, "justo en el límite todavía se puede");
  // Y marcar lo mismo después de la ventana sigue siendo idempotente (no es una corrección).
  assert.deepEqual(await m.marcar(claseId, "no_asistio", new Date(marcada.getTime() + 100 * HORA)), { ok: true, cambio: false, estatus: "no_asistio" });
});

test("D4: volver a agendar a quien no llegó da por recuperado al prospecto: se cancelan los intentos pendientes y se descarta la tarea", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  await m.marcar(claseId, "no_asistio", new Date("2026-11-02T23:00:00Z"));
  const nueva = await m.agendar(f.prospectoId, new Date("2026-11-09T22:00:00Z"), new Date("2026-11-03T15:00:00Z"));
  assert.deepEqual((await filas(m, claseId)).map((x) => [x[1], x[2]]), [["cancelado", "volvio_a_agendar"], ["cancelado", "volvio_a_agendar"]]);
  assert.deepEqual((await m.tareas(claseId)).map((x) => x.estado), ["descartada"]);
  assert.equal((await m.corre(new Date("2026-11-05T15:00:00Z"))).enviadas, 0);
  assert.ok(nueva);
  assert.equal(await m.etapaDe(f.leadId), m.etapas.muestra_agendada);
});

// ── La recuperación con el motor real ────────────────────────────────────────────────────────────────────

test("D4 recuperación: el primer intento sale 2 h después de marcarlo (por plantilla, con el alumno y la clase); el segundo, 48 h después; no hay más (tope)", async () => {
  const m = await mundo();
  // EG-05: la recuperación es marketing por su clase y el tope por omisión es 1 cada 7 días. Esta prueba trata del ESPACIADO (48 h) y del tope de INTENTOS, así que la organización permite
  // 2 por ventana (el tope es configurable); con la configuración por omisión el segundo intento se bloquea: lo prueba la siguiente.
  await fijarConfiguracion(prisma, m.org.organizacionId, { max_marketing_por_ventana: 2 });
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  const marcada = new Date("2026-11-02T23:00:00Z"); // lunes 17:00 locales
  await m.marcar(claseId, "no_asistio", marcada);
  assert.equal((await m.corre(new Date("2026-11-03T00:59:00Z"))).enviadas, 0, "antes de las 2 h no sale");
  assert.equal((await m.corre(new Date("2026-11-03T01:00:00Z"))).enviadas, 1);
  const e1 = m.enviados()[0]!;
  assert.equal(e1.plantilla?.codigo, "recuperacion_no_asistio");
  assert.deepEqual(e1.plantilla?.variables, { "1": "Sofía", "2": "Grupo A", "3": "lunes 2 de noviembre" });
  assert.equal(e1.texto, "Hola, vimos que Sofía no pudo asistir a su clase muestra de Grupo A del lunes 2 de noviembre. ¿Te gustaría reagendarla?");
  assert.equal((await m.corre(new Date("2026-11-04T01:00:00Z"))).enviadas, 0, "el segundo espera 48 h desde el primero");
  assert.equal((await m.corre(new Date("2026-11-05T01:00:00Z"))).enviadas, 1);
  assert.equal(m.enviados().length, 2);
  // Pasado el tope no sale un tercero, por mucho que se espere.
  assert.equal((await m.corre(new Date("2026-11-20T01:00:00Z"))).enviadas, 0);
  assert.equal(m.enviados().length, 2);
  assert.deepEqual((await m.recuperacion(claseId)).map((x) => x.estatus), ["enviado", "enviado"]);
});

test("EG-05: con el tope de marketing por omisión (1 cada 7 días) el segundo intento de la recuperación se bloquea con tope_frecuencia y queda omitido", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  await m.marcar(claseId, "no_asistio", new Date("2026-11-02T23:00:00Z"));
  assert.equal((await m.corre(new Date("2026-11-03T01:00:00Z"))).enviadas, 1);
  assert.equal((await m.corre(new Date("2026-11-05T01:00:00Z"))).enviadas, 0, "a las 48 h el segundo choca con el tope de 7 días");
  assert.equal(m.enviados().length, 1);
  assert.deepEqual((await m.recuperacion(claseId)).map((x) => [x.estatus, x.motivo_omision]), [["enviado", null], ["omitido", "tope_frecuencia"]]);
  // Pasados los 7 días no se reintenta: el intento ya quedó omitido y no hay un tercero (tope de 2 intentos).
  assert.equal((await m.corre(new Date("2026-11-20T01:00:00Z"))).enviadas, 0);
});

test("D4 recuperación: con tope de 1 intento sale uno solo", async () => {
  const m = await mundo({ maxIntentos: 1 });
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  await m.marcar(claseId, "no_asistio", new Date("2026-11-02T23:00:00Z"));
  assert.equal((await m.recuperacion(claseId)).length, 1);
  await m.corre(new Date("2026-11-03T01:00:00Z"));
  await m.corre(new Date("2026-11-10T01:00:00Z"));
  assert.equal(m.enviados().length, 1);
});

test("D4 recuperación: dentro del horario de envío — marcado de noche, el primer intento sale al otro día a las 09:00", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  await m.marcar(claseId, "no_asistio", new Date("2026-11-03T02:30:00Z")); // lunes 20:30 locales: +2 h = 22:30
  assert.equal((await m.recuperacion(claseId))[0]!.programado_para.toISOString(), "2026-11-03T15:00:00.000Z"); // martes 09:00 locales
  assert.equal((await m.corre(new Date("2026-11-03T05:00:00Z"))).enviadas, 0, "de madrugada no");
  assert.equal((await m.corre(new Date("2026-11-03T15:00:00Z"))).enviadas, 1);
});

test("D4 recuperación: si el servidor estuvo caído y el intento se atrasó hasta la noche, se REPROGRAMA a las 09:00 (nunca se descarta: no hay clase a la que llegar tarde)", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  await m.marcar(claseId, "no_asistio", new Date("2026-11-02T23:00:00Z")); // primer intento a las 19:00 locales
  const r = await m.corre(new Date("2026-11-03T03:00:00Z")); // 21:00 locales: ya es de noche
  assert.deepEqual([r.reprogramadas, r.descartadas, r.enviadas], [1, 0, 0]);
  assert.equal((await m.recuperacion(claseId))[0]!.programado_para.toISOString(), "2026-11-03T15:00:00.000Z");
  assert.equal((await m.corre(new Date("2026-11-03T15:00:00Z"))).enviadas, 1);
});

test("D4 recuperación: si la familia contesta después del primer intento, el segundo NO sale (contacto_respondio)", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  await m.marcar(claseId, "no_asistio", new Date("2026-11-02T23:00:00Z"));
  await m.corre(new Date("2026-11-03T01:00:00Z"));
  await prisma.conversacion.update({ where: { id: f.conversacionId! }, data: { ultimo_mensaje_entrante_en: new Date("2026-11-03T14:00:00Z") } });
  await m.corre(new Date("2026-11-05T01:00:00Z"));
  assert.equal(m.enviados().length, 1);
  assert.deepEqual((await m.recuperacion(claseId)).map((x) => [x.estatus, x.motivo_omision]), [["enviado", null], ["omitido", "contacto_respondio"]]);
});

test("D4 recuperación: el segundo intento solo sale si el primero salió", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  await m.marcar(claseId, "no_asistio", new Date("2026-11-02T23:00:00Z"));
  m.transporte.fallarSi = (e) => e.tipo === "plantilla";
  await m.corre(new Date("2026-11-03T01:00:00Z"));
  m.transporte.fallarSi = undefined;
  await m.corre(new Date("2026-11-05T01:00:00Z"));
  assert.deepEqual((await m.recuperacion(claseId)).map((x) => [x.estatus, x.motivo_omision]), [["fallido", "envio_fallido"], ["omitido", "intento_anterior_no_salio"]]);
  assert.equal(m.enviados().length, 0);
});

test("D4 recuperación: respeta baja, frecuencia y atención humana (MessagingProvider decide)", async () => {
  const a = await mundo();
  const fa = await a.familia();
  const ca = await a.agendar(fa.prospectoId);
  await a.marcar(ca, "no_asistio", new Date("2026-11-02T23:00:00Z"));
  await prisma.conversacion.update({ where: { id: fa.conversacionId! }, data: { estado: "en_atencion_humana" } });
  await a.corre(new Date("2026-11-03T01:00:00Z"));
  assert.equal((await a.recuperacion(ca))[0]!.motivo_omision, "atencion_humana");
  assert.equal(a.transporte.envios.length, 0);

  const b = await mundo();
  const fb = await b.familia();
  const cb = await b.agendar(fb.prospectoId);
  await b.marcar(cb, "no_asistio", new Date("2026-11-02T23:00:00Z"));
  await b.db.consentimiento.create({ data: altaConAlcance({ telefono: fb.telefono!, estado: "opt_out" as const, alcance: "todo" as const, origen: "palabra_clave" }) });
  await b.corre(new Date("2026-11-03T01:00:00Z"));
  assert.equal((await b.recuperacion(cb))[0]!.motivo_omision, "opt_out");

  const c = await mundo();
  await fijarConfiguracion(prisma, c.org.organizacionId, { max_automaticos_por_dia: 1 });
  const fc = await c.familia();
  const cc = await c.agendar(fc.prospectoId);
  await c.marcar(cc, "no_asistio", new Date("2026-11-02T23:00:00Z"));
  // Ya salió otro automático hoy a ese teléfono.
  const conv = await prisma.mensaje.create({ data: { organizacion_id: c.org.organizacionId, conversacion_id: fc.conversacionId!, direccion: "saliente", estatus: "enviado", origen: "automatizacion", cuerpo: "otro", proveedor: "chatwoot", enviado_en: new Date("2026-11-03T00:30:00Z") } });
  assert.ok(conv.id);
  await c.corre(new Date("2026-11-03T01:00:00Z"));
  assert.equal((await c.recuperacion(cc))[0]!.motivo_omision, "tope_frecuencia");
});

test("D4 recuperación: si la clase se corrigió o la familia ya reagendó sin pasar por la cancelación, el motor lo revisa antes de mandar", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  await m.marcar(claseId, "no_asistio", new Date("2026-11-02T23:00:00Z"));
  await prisma.clase_muestra.update({ where: { id: claseId }, data: { estatus: "asistio" } }); // por una vía que no cancela las ejecuciones
  await m.corre(new Date("2026-11-03T01:00:00Z"));
  assert.equal((await m.recuperacion(claseId))[0]!.motivo_omision, "clase_no_vigente");

  const n = await mundo();
  const g = await n.familia();
  const claseN = await n.agendar(g.prospectoId);
  await n.marcar(claseN, "no_asistio", new Date("2026-11-02T23:00:00Z"));
  await prisma.clase_muestra.create({ data: { organizacion_id: n.org.organizacionId, lead_id: g.leadId, prospecto_id: g.prospectoId, grupo_id: n.grupoId, fecha_hora: new Date("2026-11-09T22:00:00Z"), agendada_por: "usuario", agendada_por_usuario_id: n.usuarioId } });
  await n.corre(new Date("2026-11-03T01:00:00Z"));
  assert.equal((await n.recuperacion(claseN))[0]!.motivo_omision, "ya_reagendo");
  assert.equal(n.transporte.envios.length, 0);
});

test("D4 recuperación: un lead sin conversación de WhatsApp no recibe nada (omitido) y la tarea de llamar ya está para el asesor", async () => {
  const m = await mundo({ conConversacion: false });
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  await m.marcar(claseId, "no_asistio", new Date("2026-11-02T23:00:00Z"));
  await m.corre(new Date("2026-11-03T01:00:00Z"));
  assert.equal((await m.recuperacion(claseId))[0]!.motivo_omision, "sin_conversacion");
  assert.equal((await m.tareas(claseId)).length, 1);
});

test("D4: la hora de pared del horario es la de la sucursal (Nueva York, retroceso de horario): marcar a las 18:30 EDT deja el primer intento a las 09:00 EST del día siguiente", async () => {
  const m = await mundo();
  await prisma.sucursal.update({ where: { id: m.sucursalId }, data: { zona_horaria: "America/New_York" } });
  const f = await m.familia();
  // Sábado 31 de octubre de 2026: la clase del grupo (lunes y miércoles 16:00 de Nueva York) cae el lunes 2 de noviembre a las 16:00 EST = 21:00Z.
  const claseId = await m.agendar(f.prospectoId, new Date("2026-11-02T21:00:00Z"), new Date("2026-10-20T00:00:00Z"));
  await m.marcar(claseId, "no_asistio", new Date("2026-11-02T23:30:00Z")); // 18:30 EST: +2 h = 20:30 → fuera
  assert.equal((await m.recuperacion(claseId))[0]!.programado_para.toISOString(), "2026-11-03T14:00:00.000Z"); // martes 09:00 EST
});

// ── Concurrencia ─────────────────────────────────────────────────────────────────────────────────────────

test("D4 (concurrencia): seis marcas «no asistió» a la vez → UN cambio, dos intentos de recuperación y UNA tarea", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  const barrera = new Barrera(6);
  const raiz = conGanchos(prisma, { modelo: "clase_muestra", operacion: "findFirst", despues: () => barrera.esperar(400) });
  const db = conAlcance(raiz, m.org.organizacionId);
  const ahora = new Date("2026-11-02T23:00:00Z");
  const rs = await Promise.all(Array.from({ length: 6 }, () => db.$transaction((tx) => marcarAsistencia(tx, { claseId, estatus: "no_asistio", usuarioId: m.usuarioId, ahora }))));
  assert.ok(rs.every((r) => r.ok));
  assert.equal(rs.filter((r) => r.ok && r.cambio).length, 1);
  assert.equal(await m.db.automatizacion_ejecucion.count({ where: { entidad_id: claseId } }), 2);
  assert.equal((await m.tareas(claseId)).length, 1);
  assert.equal(await m.db.interaccion.count({ where: { lead_id: f.leadId, tipo: "nota" } }), 1);
});

test("D4 (concurrencia): «asistió» y «no asistió» a la vez → gana una y la otra no la pisa (cambio concurrente)", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  const barrera = new Barrera(2);
  const raiz = conGanchos(prisma, { modelo: "clase_muestra", operacion: "findFirst", despues: () => barrera.esperar(400) });
  const db = conAlcance(raiz, m.org.organizacionId);
  const ahora = new Date("2026-11-02T23:00:00Z");
  const [a, b] = await Promise.all([
    db.$transaction((tx) => marcarAsistencia(tx, { claseId, estatus: "asistio", usuarioId: m.usuarioId, ahora })),
    db.$transaction((tx) => marcarAsistencia(tx, { claseId, estatus: "no_asistio", usuarioId: m.usuarioId, ahora })),
  ]);
  const ganadoras = [a, b].filter((r) => r.ok && r.cambio);
  assert.equal(ganadoras.length, 1);
  const perdedora = [a, b].find((r) => !(r.ok && r.cambio))!;
  assert.deepEqual(perdedora, { ok: false, motivo: "cambio_concurrente" });
  const estatus = (await m.db.clase_muestra.findFirstOrThrow({ where: { id: claseId } })).estatus;
  assert.equal(estatus, (ganadoras[0] as { estatus: string }).estatus);
  // Lo derivado corresponde a lo que ganó: ni recuperación con «asistió», ni etapa adelantada con «no asistió».
  const recuperaciones = await m.db.automatizacion_ejecucion.count({ where: { entidad_id: claseId, estatus: "programado" } });
  assert.equal(recuperaciones, estatus === "no_asistio" ? 2 : 0);
  assert.equal((await m.tareas(claseId)).length, estatus === "no_asistio" ? 1 : 0);
});

test("D4 (concurrencia): dos pasadas del motor a la vez mandan UN solo intento de recuperación", async () => {
  const m = await mundo();
  const f = await m.familia();
  const claseId = await m.agendar(f.prospectoId);
  await m.marcar(claseId, "no_asistio", new Date("2026-11-02T23:00:00Z"));
  const rs = await Promise.all(Array.from({ length: 4 }, () => m.corre(new Date("2026-11-03T01:00:00Z"))));
  assert.equal(rs.reduce((n, r) => n + r.enviadas, 0), 1);
  assert.equal(m.enviados().length, 1);
});

test("D4: no-fuga entre organizaciones", async () => {
  const a = await mundo();
  const b = await mundo();
  const fa = await a.familia();
  const fb = await b.familia();
  const ca = await a.agendar(fa.prospectoId);
  const cb = await b.agendar(fb.prospectoId);
  assert.deepEqual(await a.marcar(cb, "no_asistio", CLASE), { ok: false, motivo: "clase_inexistente" }, "una clase de otra organización no existe aquí");
  await a.marcar(ca, "no_asistio", new Date("2026-11-02T23:00:00Z"));
  assert.equal((await b.recuperacion(cb)).length, 0);
  assert.equal((await a.corre(new Date("2026-11-03T01:00:00Z"))).enviadas, 1);
  assert.equal(b.transporte.envios.length, 0);
});
