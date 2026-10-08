// D1: agendar, reprogramar y cancelar la clase muestra contra Postgres real: la fecha tiene que ser una sesión del grupo,
// respetar la anticipación y el horizonte, y los LUGARES de la sesión (cupo − ocupados − clases muestra de esa fecha); la última
// plaza bajo concurrencia la gana una persona; reprogramar es atómico; la etapa del lead se mueve por su tipo de sistema.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { conAlcance, type BaseDatos } from "../datos/alcance.ts";
import { esViolacionUnica } from "../datos/prisma.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { OcupacionFija, fijarConfiguracion, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba, type TipoDeEtapa } from "../testutil/semilla.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { agendarClaseMuestra, cancelarClaseMuestra, lugaresDeSesion, proximasSesionesConLugar, reprogramarClaseMuestra, type ContextoDeAgenda } from "./agenda.ts";

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

// Lunes 12 de octubre de 2026, 16:00 en la Ciudad de México (UTC-6) = 22:00 UTC. El «ahora» de los tests es el lunes 5.
const AHORA = new Date("2026-10-05T18:00:00Z"); // lunes 5, 12:00 local
const LUNES_5 = new Date("2026-10-05T22:00:00Z");
const MIERCOLES_14 = new Date("2026-10-15T00:00:00Z"); // miércoles 14, 18:00 local (grupo B)
const LUNES_12 = new Date("2026-10-12T22:00:00Z");
const LUNES_19 = new Date("2026-10-19T22:00:00Z");
const LUNES_26 = new Date("2026-10-26T22:00:00Z");

interface Mundo {
  org: OrganizacionDePrueba;
  db: BaseDatos;
  etapas: Record<TipoDeEtapa, string>;
  fuente: OcupacionFija;
  grupoId: string;
  grupo2Id: string;
  sucursalId: string;
  ctx(usuarioId?: string): ContextoDeAgenda;
  familia(o?: Parameters<typeof sembrarFamilia>[2]): ReturnType<typeof sembrarFamilia>;
  usuarioId: string;
}

async function mundo(cupo = 3): Promise<Mundo> {
  const org = await sembrarOrganizacion(prisma, "Agenda de clase muestra");
  const etapas = await sembrarEmbudo(prisma, org);
  const sucursalId = org.sucursales[0]!.id;
  const p = await sembrarPrograma(prisma, org, {
    sucursalId,
    nombre: "Programa P",
    edadMin: 3,
    edadMax: 12,
    grupos: [
      { nombre: "Grupo A", cupoMaximo: cupo, horarios: [[1, 960, 1020]] }, // lunes 16:00
      { nombre: "Grupo B", cupoMaximo: cupo, horarios: [[3, 1080, 1140]] }, // miércoles 18:00
    ],
  });
  const usuario = await prisma.usuario.create({ data: { organizacion_id: org.organizacionId, correo: `a-${Math.random()}@p.test`, nombre: "Asesor", rol: "asesor", contrasena_hash: "x" } });
  const fuente = new OcupacionFija();
  return {
    org,
    db: conAlcance(prisma, org.organizacionId),
    etapas,
    fuente,
    grupoId: p.grupos[0]!.id,
    grupo2Id: p.grupos[1]!.id,
    sucursalId,
    usuarioId: usuario.id,
    ctx: (usuarioId = usuario.id) => ({ ahora: AHORA, fuente, origen: { tipo: "usuario", usuarioId } }),
    familia: (o) => sembrarFamilia(prisma, org, { sucursalId, ...o }),
  };
}

const agendar = (m: Mundo, prospectoId: string, fechaHora: Date, grupoId = m.grupoId, ctx = m.ctx()) => m.db.$transaction((tx) => agendarClaseMuestra(tx, ctx, { prospectoId, grupoId, fechaHora }));
const etapaDe = async (m: Mundo, leadId: string) => (await m.db.lead.findFirstOrThrow({ where: { id: leadId }, select: { etapa_id: true } })).etapa_id;
const lugares = async (m: Mundo, fecha: Date, grupoId = m.grupoId) => {
  const g = await m.db.grupo.findFirstOrThrow({ where: { id: grupoId }, select: { id: true, cupo_maximo: true } });
  return (await lugaresDeSesion(m.db, m.fuente, g, fecha)).lugares;
};

test("D1: agenda la clase en una sesión del grupo: queda agendada, ocupa un lugar y el lead pasa a «clase muestra agendada»", async () => {
  const m = await mundo(3);
  const f = await m.familia();
  const r = await agendar(m, f.prospectoId, LUNES_12);
  assert.ok(r.ok);
  const fila = await m.db.clase_muestra.findFirstOrThrow({ where: { id: r.clase.id } });
  assert.equal(fila.estatus, "agendada");
  assert.equal(fila.fecha_hora.toISOString(), LUNES_12.toISOString());
  assert.equal(fila.agendada_por, "usuario");
  assert.equal(fila.agendada_por_usuario_id, m.usuarioId);
  assert.equal(fila.lead_id, f.leadId);
  assert.equal(await lugares(m, LUNES_12), 2, "3 − 0 ocupados − 1 muestra");
  assert.equal(await lugares(m, LUNES_19), 3, "otra sesión del mismo grupo conserva sus lugares");
  assert.equal(await etapaDe(m, f.leadId), m.etapas.muestra_agendada);
  const mov = await m.db.interaccion.findMany({ where: { lead_id: f.leadId, tipo: "cambio_etapa" } });
  assert.equal(mov.length, 1);
  assert.equal((mov[0]!.datos as { tipo_sistema: string }).tipo_sistema, "muestra_agendada");
});

test("D1: la fecha tiene que ser una sesión del grupo (día y hora de pared en la zona de la sucursal)", async () => {
  const m = await mundo();
  const f = await m.familia();
  for (const mala of [new Date("2026-10-13T22:00:00Z"), new Date("2026-10-12T21:00:00Z"), new Date("2026-10-12T22:05:00Z"), new Date("2026-10-12T16:00:00Z")]) {
    const r = await agendar(m, f.prospectoId, mala);
    assert.deepEqual(r, { ok: false, motivo: "no_es_sesion" }, mala.toISOString());
  }
  assert.equal(await m.db.clase_muestra.count(), 0);
  // La zona manda: si la sucursal está en Tokio, el lunes 16:00 de Tokio (07:00Z) es la sesión y las 22:00Z ya no lo son.
  await prisma.sucursal.update({ where: { id: m.sucursalId }, data: { zona_horaria: "Asia/Tokyo" } });
  assert.deepEqual(await agendar(m, f.prospectoId, LUNES_12), { ok: false, motivo: "no_es_sesion" });
  assert.equal((await agendar(m, f.prospectoId, new Date("2026-10-12T07:00:00Z"), m.grupoId, { ...m.ctx(), ahora: new Date("2026-10-05T00:00:00Z") })).ok, true);
});

test("D1: anticipación mínima configurable (inclusiva) y horizonte", async () => {
  const m = await mundo();
  const f = await m.familia();
  await fijarConfiguracion(prisma, m.org.organizacionId, { clase_muestra_anticipacion_min: 120, clase_muestra_horizonte_dias: 30 });
  // Faltan 119 min → no; 120 → sí.
  assert.deepEqual(await agendar(m, f.prospectoId, LUNES_12, m.grupoId, { ...m.ctx(), ahora: new Date("2026-10-12T20:01:00Z") }), { ok: false, motivo: "sin_anticipacion" });
  assert.equal((await agendar(m, f.prospectoId, LUNES_12, m.grupoId, { ...m.ctx(), ahora: new Date("2026-10-12T20:00:00Z") })).ok, true);
  const g = await m.familia();
  // Ya pasó.
  assert.deepEqual(await agendar(m, g.prospectoId, LUNES_12, m.grupoId, { ...m.ctx(), ahora: new Date("2026-10-13T00:00:00Z") }), { ok: false, motivo: "sin_anticipacion" });
  // Horizonte de 30 días: el 12 de octubre cabe desde el 12 de septiembre; el 26 de octubre ya no desde el 25 de septiembre.
  assert.deepEqual(await agendar(m, g.prospectoId, LUNES_26, m.grupoId, { ...m.ctx(), ahora: new Date("2026-09-25T00:00:00Z") }), { ok: false, motivo: "fuera_de_horizonte" });
  assert.equal((await agendar(m, g.prospectoId, LUNES_26, m.grupoId, { ...m.ctx(), ahora: new Date("2026-09-26T22:00:00Z") })).ok, true, "30 días exactos caben");
  // La anticipación es configurable: con 0 minutos se puede agendar la que empieza ya.
  await fijarConfiguracion(prisma, m.org.organizacionId, { clase_muestra_anticipacion_min: 0 });
  const h = await m.familia();
  assert.equal((await agendar(m, h.prospectoId, LUNES_19, m.grupoId, { ...m.ctx(), ahora: LUNES_19 })).ok, true);
});

test("D1: respeta los lugares de LA SESIÓN: cupo − ocupados − clases muestra de esa fecha", async () => {
  const m = await mundo(3);
  m.fuente.fijar(m.grupoId, 1); // una plaza ya inscrita
  const [a, b, c] = [await m.familia(), await m.familia(), await m.familia()];
  assert.equal((await agendar(m, a.prospectoId, LUNES_12)).ok, true);
  assert.equal((await agendar(m, b.prospectoId, LUNES_12)).ok, true);
  assert.equal(await lugares(m, LUNES_12), 0, "3 − 1 ocupado − 2 muestras");
  assert.deepEqual(await agendar(m, c.prospectoId, LUNES_12), { ok: false, motivo: "sin_lugar" });
  // La del lunes siguiente es otra sesión: ahí cabe.
  assert.equal((await agendar(m, c.prospectoId, LUNES_19)).ok, true);
  // Las clases de OTRO grupo no ocupan lugares de este.
  assert.equal(await lugares(m, MIERCOLES_14, m.grupo2Id), 3);
  // Una clase cancelada libera su lugar, una reagendada también.
  const viva = await m.db.clase_muestra.findFirstOrThrow({ where: { prospecto_id: a.prospectoId, estatus: "agendada" } });
  assert.equal((await m.db.$transaction((tx) => cancelarClaseMuestra(tx, viva.id, "no puede", AHORA))).ok, true);
  assert.equal(await lugares(m, LUNES_12), 1);
  assert.equal((await agendar(m, c.prospectoId, LUNES_12, m.grupoId)).ok, false, "c ya tiene una vigente en este grupo");
});

test("D1: un prospecto no tiene dos clases muestra vigentes en el mismo grupo (la regla y el índice único parcial)", async () => {
  const m = await mundo();
  const f = await m.familia();
  assert.equal((await agendar(m, f.prospectoId, LUNES_12)).ok, true);
  assert.deepEqual(await agendar(m, f.prospectoId, LUNES_12), { ok: false, motivo: "ya_tiene_clase" });
  assert.deepEqual(await agendar(m, f.prospectoId, LUNES_19), { ok: false, motivo: "ya_tiene_clase" }, "otra fecha del mismo grupo tampoco");
  // En otro grupo sí puede (es otra clase).
  assert.equal((await agendar(m, f.prospectoId, MIERCOLES_14, m.grupo2Id)).ok, true);
  // La base lo impide aunque se salten las reglas del código.
  await assert.rejects(
    () => prisma.clase_muestra.create({ data: { organizacion_id: m.org.organizacionId, lead_id: f.leadId, prospecto_id: f.prospectoId, grupo_id: m.grupoId, fecha_hora: LUNES_19, agendada_por: "usuario", agendada_por_usuario_id: m.usuarioId } }),
    (e) => esViolacionUnica(e),
  );
  // Reagendada o cancelada no estorba: la vigente es la que cuenta.
  await m.db.clase_muestra.updateMany({ where: { prospecto_id: f.prospectoId, grupo_id: m.grupoId }, data: { estatus: "cancelada" } });
  assert.equal((await agendar(m, f.prospectoId, LUNES_19)).ok, true);
});

test("D1: rechazos por datos: prospecto inexistente o de otra organización, grupo inactivo o inexistente, grupo de otra vertical", async () => {
  const m = await mundo();
  const otra = await mundo();
  const f = await m.familia();
  const ajena = await otra.familia();
  assert.deepEqual(await agendar(m, ajena.prospectoId, LUNES_12), { ok: false, motivo: "prospecto_inexistente" }, "un prospecto de otra organización no existe aquí");
  assert.deepEqual(await agendar(m, f.prospectoId, LUNES_12, otra.grupoId), { ok: false, motivo: "grupo_inexistente" }, "ni un grupo de otra organización");
  await prisma.grupo.update({ where: { id: m.grupoId }, data: { activo: false } });
  assert.deepEqual(await agendar(m, f.prospectoId, LUNES_12), { ok: false, motivo: "grupo_inexistente" });
  await prisma.grupo.update({ where: { id: m.grupoId }, data: { activo: true } });
  // Otra vertical: el grupo es de un programa de una vertical distinta a la del prospecto.
  const v2 = await prisma.vertical.create({ data: { organizacion_id: m.org.organizacionId, nombre: "Vertical dos", slug: "vertical-dos" } });
  const p2 = await prisma.programa.create({ data: { organizacion_id: m.org.organizacionId, vertical_id: v2.id, sucursal_id: m.sucursalId, nombre: "Programa dos", edad_min: 3, edad_max: 12 } });
  const g2 = await prisma.grupo.create({ data: { organizacion_id: m.org.organizacionId, programa_id: p2.id, nombre: "Grupo dos", cupo_maximo: 5 } });
  await prisma.grupo_horario.create({ data: { organizacion_id: m.org.organizacionId, grupo_id: g2.id, dia_semana: 1, hora_inicio_min: 960, hora_fin_min: 1020 } });
  assert.deepEqual(await agendar(m, f.prospectoId, LUNES_12, g2.id), { ok: false, motivo: "grupo_de_otra_vertical" });
});

test("D1: cancelar libera el lugar y devuelve al lead a «contactado» si era su única clase; cancelar dos veces no hace nada", async () => {
  const m = await mundo(1);
  const f = await m.familia();
  const g = await m.familia();
  const r = await agendar(m, f.prospectoId, LUNES_12);
  assert.ok(r.ok);
  assert.deepEqual(await agendar(m, g.prospectoId, LUNES_12), { ok: false, motivo: "sin_lugar" });
  const c = await m.db.$transaction((tx) => cancelarClaseMuestra(tx, r.clase.id, "se enfermó", AHORA));
  assert.ok(c.ok);
  const fila = await m.db.clase_muestra.findFirstOrThrow({ where: { id: r.clase.id } });
  assert.deepEqual([fila.estatus, fila.motivo_cancelacion], ["cancelada", "se enfermó"]);
  assert.equal(await etapaDe(m, f.leadId), m.etapas.contactado);
  assert.equal((await agendar(m, g.prospectoId, LUNES_12)).ok, true, "el lugar liberado lo toma otra familia");
  assert.deepEqual(await m.db.$transaction((tx) => cancelarClaseMuestra(tx, r.clase.id, null, AHORA)), { ok: false, motivo: "clase_no_vigente" });
  assert.deepEqual(await m.db.$transaction((tx) => cancelarClaseMuestra(tx, "00000000-0000-4000-8000-0000000000ff", null, AHORA)), { ok: false, motivo: "clase_no_vigente" });
});

test("D1: con otra clase vigente en el lead, cancelar una no lo regresa de etapa", async () => {
  const m = await mundo();
  const lead = await m.familia();
  const hermano = await prisma.prospecto.create({ data: { organizacion_id: m.org.organizacionId, lead_id: lead.leadId, vertical_interes_id: m.org.verticalId, nombre: "Hermano", edad_declarada: 6, origen: "asesor" } });
  const a = await agendar(m, lead.prospectoId, LUNES_12);
  const b = await agendar(m, hermano.id, LUNES_12);
  assert.ok(a.ok && b.ok);
  await m.db.$transaction((tx) => cancelarClaseMuestra(tx, a.clase.id, null, AHORA));
  assert.equal(await etapaDe(m, lead.leadId), m.etapas.muestra_agendada, "el hermano sigue con su clase");
  await m.db.$transaction((tx) => cancelarClaseMuestra(tx, b.clase.id, null, AHORA));
  assert.equal(await etapaDe(m, lead.leadId), m.etapas.contactado);
});

test("D1: la etapa solo avanza (nunca baja a un lead que ya iba más lejos), salvo que estuviera perdido; un inscrito no se mueve", async () => {
  const m = await mundo();
  const adelantado = await m.familia({ etapaId: m.etapas.negociacion });
  const perdido = await m.familia({ etapaId: m.etapas.perdido });
  const inscrito = await m.familia({ etapaId: m.etapas.inscrito });
  for (const f of [adelantado, perdido, inscrito]) assert.equal((await agendar(m, f.prospectoId, LUNES_12)).ok, true);
  assert.equal(await etapaDe(m, adelantado.leadId), m.etapas.negociacion);
  assert.equal(await etapaDe(m, perdido.leadId), m.etapas.muestra_agendada, "reaparecer después de perderse lo recupera");
  assert.equal(await etapaDe(m, inscrito.leadId), m.etapas.inscrito);
});

test("D1: sin etapas de sistema configuradas, agendar funciona y la etapa no se toca", async () => {
  const org = await sembrarOrganizacion(prisma, "Sin embudo");
  const sucursalId = org.sucursales[0]!.id;
  const p = await sembrarPrograma(prisma, org, { sucursalId, nombre: "P", edadMin: 3, edadMax: 12, grupos: [{ nombre: "G", horarios: [[1, 960, 1020]] }] });
  const f = await sembrarFamilia(prisma, org, { sucursalId });
  const usuario = await prisma.usuario.create({ data: { organizacion_id: org.organizacionId, correo: `s-${Math.random()}@p.test`, nombre: "A", rol: "asesor", contrasena_hash: "x" } });
  const db = conAlcance(prisma, org.organizacionId);
  const r = await db.$transaction((tx) => agendarClaseMuestra(tx, { ahora: AHORA, fuente: new OcupacionFija(), origen: { tipo: "usuario", usuarioId: usuario.id } }, { prospectoId: f.prospectoId, grupoId: p.grupos[0]!.id, fechaHora: LUNES_12 }));
  assert.ok(r.ok);
  assert.equal((await db.lead.findFirstOrThrow({ where: { id: f.leadId } })).etapa_id, org.etapaInicialId);
});

test("D1: el lead queda en la sucursal de la clase (de ahí sale su horario de envío)", async () => {
  const m = await mundo();
  const f = await m.familia({ sucursalId: m.org.sucursales[1]!.id });
  assert.equal((await agendar(m, f.prospectoId, LUNES_12)).ok, true);
  assert.equal((await m.db.lead.findFirstOrThrow({ where: { id: f.leadId } })).sucursal_interes_id, m.sucursalId);
});

test("D1: reprogramar = cancelar la anterior y agendar la nueva en UNA transacción", async () => {
  const m = await mundo(2);
  const f = await m.familia();
  const r = await agendar(m, f.prospectoId, LUNES_12);
  assert.ok(r.ok);
  const nueva = await m.db.$transaction((tx) => reprogramarClaseMuestra(tx, m.ctx(), { claseId: r.clase.id, fechaHora: LUNES_19 }));
  assert.ok(nueva.ok);
  const vieja = await m.db.clase_muestra.findFirstOrThrow({ where: { id: r.clase.id } });
  const fila = await m.db.clase_muestra.findFirstOrThrow({ where: { id: nueva.clase.id } });
  assert.equal(vieja.estatus, "reagendada");
  assert.deepEqual([fila.estatus, fila.reprogramada_de_id, fila.fecha_hora.toISOString()], ["agendada", r.clase.id, LUNES_19.toISOString()]);
  assert.equal(await lugares(m, LUNES_12), 2, "la sesión de antes quedó libre");
  assert.equal(await lugares(m, LUNES_19), 1);
  assert.equal(await etapaDe(m, f.leadId), m.etapas.muestra_agendada, "la etapa se queda");
  // La reagendada ya no se puede reprogramar ni cancelar; la misma sesión tampoco.
  assert.deepEqual(await m.db.$transaction((tx) => reprogramarClaseMuestra(tx, m.ctx(), { claseId: r.clase.id, fechaHora: LUNES_26 })), { ok: false, motivo: "clase_no_vigente" });
  assert.deepEqual(await m.db.$transaction((tx) => reprogramarClaseMuestra(tx, m.ctx(), { claseId: nueva.clase.id, fechaHora: LUNES_19 })), { ok: false, motivo: "misma_sesion" });
  // A otro grupo (miércoles 18:00 del grupo B).
  const aB = await m.db.$transaction((tx) => reprogramarClaseMuestra(tx, m.ctx(), { claseId: nueva.clase.id, fechaHora: MIERCOLES_14, grupoId: m.grupo2Id }));
  assert.ok(aB.ok);
  assert.equal((await m.db.clase_muestra.findFirstOrThrow({ where: { id: aB.clase.id } })).grupo_id, m.grupo2Id);
});

test("D1: si la sesión nueva no tiene lugar, la anterior sigue intacta (no se escribe NADA)", async () => {
  const m = await mundo(1);
  const f = await m.familia();
  const otra = await m.familia();
  const r = await agendar(m, f.prospectoId, LUNES_12);
  assert.ok(r.ok);
  assert.equal((await agendar(m, otra.prospectoId, LUNES_19)).ok, true); // el lunes 19 está lleno
  const antes = await m.db.clase_muestra.count();
  assert.deepEqual(await m.db.$transaction((tx) => reprogramarClaseMuestra(tx, m.ctx(), { claseId: r.clase.id, fechaHora: LUNES_19 })), { ok: false, motivo: "sin_lugar" });
  assert.deepEqual(await m.db.$transaction((tx) => reprogramarClaseMuestra(tx, m.ctx(), { claseId: r.clase.id, fechaHora: new Date("2026-10-20T22:00:00Z") })), { ok: false, motivo: "no_es_sesion" });
  assert.equal((await m.db.clase_muestra.findFirstOrThrow({ where: { id: r.clase.id } })).estatus, "agendada");
  assert.equal(await m.db.clase_muestra.count(), antes);
  assert.equal(await lugares(m, LUNES_12), 0, "la anterior conserva su lugar");
});

test("D1: una reprogramación que falla a mitad de la escritura revierte todo (la anterior sigue agendada)", async () => {
  const m = await mundo(2);
  const f = await m.familia();
  const r = await agendar(m, f.prospectoId, LUNES_12);
  assert.ok(r.ok);
  await assert.rejects(() =>
    m.db.$transaction(async (tx) => {
      const x = await reprogramarClaseMuestra(tx, m.ctx(), { claseId: r.clase.id, fechaHora: LUNES_19 });
      assert.ok(x.ok);
      throw new Error("falla después de reprogramar"); // p. ej. el registro de cambios
    }),
  );
  assert.equal((await m.db.clase_muestra.findFirstOrThrow({ where: { id: r.clase.id } })).estatus, "agendada");
  assert.equal(await m.db.clase_muestra.count({ where: { reprogramada_de_id: r.clase.id } }), 0);
});

test("D1: proximasSesionesConLugar lista las sesiones agendables, sin las llenas (o con ellas) y sin pasarse del máximo", async () => {
  const m = await mundo(1);
  const f = await m.familia();
  assert.equal((await agendar(m, f.prospectoId, LUNES_12)).ok, true);
  const fechas = (s: { fechaHora: Date }[]) => s.map((x) => x.fechaHora.toISOString());
  assert.deepEqual(fechas(await proximasSesionesConLugar(m.db, m.fuente, m.grupoId, AHORA, { maximo: 3 })), [LUNES_5.toISOString(), LUNES_19.toISOString(), LUNES_26.toISOString()], "la del 12 está llena y se salta");
  const con = await proximasSesionesConLugar(m.db, m.fuente, m.grupoId, AHORA, { maximo: 2, incluirLlenas: true });
  assert.deepEqual(con.map((s) => [s.fechaHora.toISOString(), s.lugares]), [[LUNES_5.toISOString(), 1], [LUNES_12.toISOString(), 0]]);
  assert.deepEqual(await proximasSesionesConLugar(m.db, m.fuente, m.grupoId, new Date("2026-10-12T21:30:00Z"), { maximo: 1 }).then(fechas), [LUNES_19.toISOString()], "a 30 min de empezar ya no alcanza la anticipación");
});

// ── Concurrencia ─────────────────────────────────────────────────────────────────────────────────────────

test("D1 (concurrencia): ocho familias piden la ÚLTIMA plaza de una sesión al mismo tiempo → gana UNA", async () => {
  const m = await mundo(1);
  const familias = await Promise.all(Array.from({ length: 8 }, () => m.familia()));
  // La barrera va entre la lectura de los lugares y la escritura: sin el candado del cupo, las 8 leen «hay lugar» y las 8 escriben.
  const barrera = new Barrera(8);
  const raiz = conGanchos(prisma, { modelo: "clase_muestra", operacion: "count", despues: () => barrera.esperar(400) });
  const db = conAlcance(raiz, m.org.organizacionId);
  const res = await Promise.all(familias.map((f) => db.$transaction((tx) => agendarClaseMuestra(tx, m.ctx(), { prospectoId: f.prospectoId, grupoId: m.grupoId, fechaHora: LUNES_12 }))));
  assert.equal(res.filter((r) => r.ok).length, 1, "una sola gana la última plaza");
  assert.equal(res.filter((r) => !r.ok && r.motivo === "sin_lugar").length, 7);
  assert.equal(await m.db.clase_muestra.count({ where: { grupo_id: m.grupoId, estatus: "agendada" } }), 1);
  assert.equal(barrera.completa, false, "el candado puso a las demás en fila (si se solaparan, la prueba no probaría nada)");
});

test("D1 (concurrencia): con cupo 3 y 10 familias entran exactamente 3, y el que ya estaba inscrito cuenta", async () => {
  const m = await mundo(4);
  m.fuente.fijar(m.grupoId, 1); // 1 ocupado → quedan 3 lugares
  const familias = await Promise.all(Array.from({ length: 10 }, () => m.familia()));
  const res = await Promise.all(familias.map((f) => agendar(m, f.prospectoId, LUNES_12)));
  assert.equal(res.filter((r) => r.ok).length, 3);
  assert.equal(await lugares(m, LUNES_12), 0);
});

test("D1 (concurrencia): dos reprogramaciones cruzadas entre dos grupos no se interbloquean y no pasan del cupo", async () => {
  const m = await mundo(1);
  const [a, b] = [await m.familia(), await m.familia()];
  const ra = await agendar(m, a.prospectoId, LUNES_12, m.grupoId);
  const rb = await agendar(m, b.prospectoId, MIERCOLES_14, m.grupo2Id);
  assert.ok(ra.ok && rb.ok);
  // a pasa al grupo B y b pasa al grupo A, a la vez: con cupo 1 cada sesión recibe a lo más una.
  const res = await Promise.all([
    m.db.$transaction((tx) => reprogramarClaseMuestra(tx, m.ctx(), { claseId: ra.clase.id, fechaHora: MIERCOLES_14, grupoId: m.grupo2Id })),
    m.db.$transaction((tx) => reprogramarClaseMuestra(tx, m.ctx(), { claseId: rb.clase.id, fechaHora: LUNES_12, grupoId: m.grupoId })),
  ]);
  for (const sesion of [[m.grupoId, LUNES_12], [m.grupo2Id, MIERCOLES_14]] as const) {
    assert.ok((await m.db.clase_muestra.count({ where: { grupo_id: sesion[0], fecha_hora: sesion[1], estatus: "agendada" } })) <= 1);
  }
  assert.ok(res.every((r) => r.ok || r.motivo === "sin_lugar"));
});

test("D1 (concurrencia): cancelar y reprogramar la MISMA clase a la vez: una sola operación tiene efecto", async () => {
  const m = await mundo(3);
  const f = await m.familia();
  const r = await agendar(m, f.prospectoId, LUNES_12);
  assert.ok(r.ok);
  const [c, p] = await Promise.all([
    m.db.$transaction((tx) => cancelarClaseMuestra(tx, r.clase.id, null, AHORA)),
    m.db.$transaction((tx) => reprogramarClaseMuestra(tx, m.ctx(), { claseId: r.clase.id, fechaHora: LUNES_19 })),
  ]);
  assert.equal([c.ok, p.ok].filter(Boolean).length, 1);
  const vivas = await m.db.clase_muestra.count({ where: { prospecto_id: f.prospectoId, estatus: "agendada" } });
  assert.equal(vivas, p.ok ? 1 : 0);
});

test("D1: no-fuga entre organizaciones: ni los lugares ni las clases de una cruzan a la otra", async () => {
  const a = await mundo(1);
  const b = await mundo(1);
  const fa = await a.familia();
  assert.equal((await agendar(a, fa.prospectoId, LUNES_12)).ok, true);
  assert.equal(await b.db.clase_muestra.count(), 0);
  assert.equal(await lugares(b, LUNES_12), 1);
  const fb = await b.familia();
  assert.equal((await agendar(b, fb.prospectoId, LUNES_12)).ok, true, "la otra organización tiene su propio lugar");
});
