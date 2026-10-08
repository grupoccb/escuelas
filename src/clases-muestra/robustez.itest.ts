// ED-05 (auditoría de la etapa D): las pruebas que faltaban para reglas de seguridad y de negocio de la clase muestra. Cada una nace de una mutación
// que sobrevivía: el acceso del maestro a la ficha de salud termina con la clase, el asesor solo agenda lo que ve, un programa o una sucursal
// inactivos no se agendan, el aviso de una clase que ya empezó no sale y la versión vigente de un documento de una vertical.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { maestroDelSujetoPorDefecto } from "../sensibles/index.ts";
import { crearVersionDeDocumento, documentoVigente } from "../legal/documentos.ts";
import { conAlcance } from "../datos/alcance.ts";
import { MessagingProvider, TransporteFalso } from "../mensajeria/index.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { OcupacionFija, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { agendarClaseMuestra, cancelarClaseMuestra, reprogramarClaseMuestra, type ContextoDeAgenda } from "./agenda.ts";
import { moverLeadAEtapa } from "../embudo/etapas.ts";
import { moverEtapaDeLead } from "../embudo/historial.ts";
import { marcarAsistencia } from "./asistencia.ts";
import { barrerAvisosMaestro } from "./avisos.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
before(() => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA });
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

// Lunes 2 de noviembre de 2026, 12:00 en la Ciudad de México.
const AHORA = new Date("2026-11-02T18:00:00Z");
const MIERCOLES_4 = new Date("2026-11-05T00:00:00Z"); // miércoles 4, 18:00 locales
const MIERCOLES_11 = new Date("2026-11-12T00:00:00Z");

interface Mundo {
  org: OrganizacionDePrueba;
  db: ReturnType<typeof conAlcance>;
  usuarioId: string;
  ctx: ContextoDeAgenda;
  /** Dos grupos con el mismo horario, cada uno con su maestro (ligado a un usuario). */
  grupoA: string;
  grupoB: string;
  maestroA: string;
  maestroB: string;
  programaId: string;
}

async function mundo(): Promise<Mundo> {
  const org = await sembrarOrganizacion(prisma, "Robustez");
  await sembrarEmbudo(prisma, org);
  const sucursalId = org.sucursales[0]!.id;
  const p = await sembrarPrograma(prisma, org, {
    sucursalId,
    nombre: "Programa P",
    edadMin: 3,
    edadMax: 12,
    grupos: [
      { nombre: "Grupo A", cupoMaximo: 10, horarios: [[3, 1080, 1140]] },
      { nombre: "Grupo B", cupoMaximo: 10, horarios: [[3, 1080, 1140]] },
    ],
  });
  const usuario = await prisma.usuario.create({ data: { organizacion_id: org.organizacionId, correo: `a-${Math.random()}@p.test`, nombre: "Asesor", rol: "asesor", contrasena_hash: "x" } });
  const ua = await prisma.usuario.create({ data: { organizacion_id: org.organizacionId, correo: `ma-${Math.random()}@p.test`, nombre: "Maestro A", rol: "maestro", contrasena_hash: "x" } });
  const ub = await prisma.usuario.create({ data: { organizacion_id: org.organizacionId, correo: `mb-${Math.random()}@p.test`, nombre: "Maestro B", rol: "maestro", contrasena_hash: "x" } });
  const ia = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: ua.id, nombre: "Maestra A" } });
  const ib = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: ub.id, nombre: "Maestro B" } });
  await prisma.grupo.update({ where: { id: p.grupos[0]!.id }, data: { instructor_id: ia.id } });
  await prisma.grupo.update({ where: { id: p.grupos[1]!.id }, data: { instructor_id: ib.id } });
  return {
    org,
    db: conAlcance(prisma, org.organizacionId),
    usuarioId: usuario.id,
    ctx: { ahora: AHORA, fuente: new OcupacionFija(), origen: { tipo: "usuario", usuarioId: usuario.id } },
    grupoA: p.grupos[0]!.id,
    grupoB: p.grupos[1]!.id,
    maestroA: ua.id,
    maestroB: ub.id,
    programaId: p.id,
  };
}

test("ED-05 (M49): el maestro lee la ficha de salud de un prospecto solo mientras tenga una clase vigente o dada en SU grupo; cancelar o reagendar la clase termina el acceso", async () => {
  const m = await mundo();
  const f = await sembrarFamilia(prisma, m.org, { sucursalId: m.org.sucursales[0]!.id });
  const puede = (usuarioId: string) => maestroDelSujetoPorDefecto(m.db, usuarioId, "prospecto", f.prospectoId);
  assert.equal(await puede(m.maestroA), false, "sin clase no hay acceso");

  const r = await m.db.$transaction((tx) => agendarClaseMuestra(tx, m.ctx, { prospectoId: f.prospectoId, grupoId: m.grupoA, fechaHora: MIERCOLES_4 }));
  assert.ok(r.ok);
  assert.equal(await puede(m.maestroA), true, "clase agendada en su grupo");
  assert.equal(await puede(m.maestroB), false, "el maestro de otro grupo nunca");

  // Reprogramar al grupo del otro maestro: el primero pierde el acceso (la clase quedó reagendada) y el segundo lo gana.
  const rep = await m.db.$transaction((tx) => reprogramarClaseMuestra(tx, m.ctx, { claseId: r.clase.id, fechaHora: MIERCOLES_11, grupoId: m.grupoB }));
  assert.ok(rep.ok);
  assert.equal(await puede(m.maestroA), false, "la clase de su grupo quedó reagendada");
  assert.equal(await puede(m.maestroB), true);

  // Cancelarla: nadie.
  const c = await m.db.$transaction((tx) => cancelarClaseMuestra(tx, rep.clase.id, null, AHORA));
  assert.ok(c.ok);
  assert.equal(await puede(m.maestroB), false, "una clase cancelada no da acceso");

  // Una clase que ya se dio (asistió o no asistió) sí conserva el acceso (decisión documentada en ED-09).
  const g = await sembrarFamilia(prisma, m.org, { sucursalId: m.org.sucursales[0]!.id });
  const r2 = await m.db.$transaction((tx) => agendarClaseMuestra(tx, m.ctx, { prospectoId: g.prospectoId, grupoId: m.grupoA, fechaHora: MIERCOLES_4 }));
  assert.ok(r2.ok);
  const dada = await m.db.$transaction((tx) => marcarAsistencia(tx, { claseId: r2.clase.id, estatus: "no_asistio", usuarioId: m.usuarioId, ahora: new Date(MIERCOLES_4.getTime() + 3_600_000) }));
  assert.ok(dada.ok);
  assert.equal(await maestroDelSujetoPorDefecto(m.db, m.maestroA, "prospecto", g.prospectoId), true);
  // Un alumno (aún no existe) nunca es de un maestro: falla cerrado.
  assert.equal(await maestroDelSujetoPorDefecto(m.db, m.maestroA, "alumno", g.prospectoId), false);
});

test("ED-05 (M85, M86): no se agenda en un grupo cuyo programa o sucursal está inactivo", async () => {
  const m = await mundo();
  const sucursalId = m.org.sucursales[0]!.id;
  const f = await sembrarFamilia(prisma, m.org, { sucursalId });
  const intenta = () => m.db.$transaction((tx) => agendarClaseMuestra(tx, m.ctx, { prospectoId: f.prospectoId, grupoId: m.grupoA, fechaHora: MIERCOLES_4 }));
  await prisma.programa.update({ where: { id: m.programaId }, data: { activo: false } });
  assert.deepEqual(await intenta(), { ok: false, motivo: "grupo_inexistente" }, "programa inactivo");
  await prisma.programa.update({ where: { id: m.programaId }, data: { activo: true } });
  await prisma.sucursal.update({ where: { id: sucursalId }, data: { activo: false } });
  assert.deepEqual(await intenta(), { ok: false, motivo: "grupo_inexistente" }, "sucursal inactiva");
  await prisma.sucursal.update({ where: { id: sucursalId }, data: { activo: true } });
  assert.equal((await intenta()).ok, true, "con todo activo sí");
});

test("ED-05 (M75, M76): un asesor solo agenda y reprograma con prospectos y grupos de las sucursales que ve (404 con lo ajeno)", async () => {
  const org = await sembrarOrganizacion(prisma, "Alcance al agendar");
  await sembrarEmbudo(prisma, org);
  const norte = org.sucursales[0]!.id;
  const sur = org.sucursales[1]!.id;
  const pn = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "PN", edadMin: 3, edadMax: 12, grupos: [{ nombre: "GN", cupoMaximo: 9, horarios: [[3, 1080, 1140]] }] });
  const ps = await sembrarPrograma(prisma, org, { sucursalId: sur, nombre: "PS", edadMin: 3, edadMax: 12, grupos: [{ nombre: "GS", cupoMaximo: 9, horarios: [[3, 1080, 1140]] }] });
  const entrar = async (rol: "administrador" | "asesor", sucursales: string[]): Promise<ClienteApi> => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  const admin = await entrar("administrador", []);
  const asesorNorte = await entrar("asesor", [norte]);
  const fNorte = await sembrarFamilia(prisma, org, { sucursalId: norte });
  const fSur = await sembrarFamilia(prisma, org, { sucursalId: sur });
  const fecha = "2026-11-04T18:00:00-06:00";
  const db = conAlcance(prisma, org.organizacionId);

  assert.equal((await asesorNorte.post("/api/clases-muestra", { prospecto_id: fSur.prospectoId, grupo_id: pn.grupos[0]!.id, fecha_hora: fecha })).estado, 404, "prospecto de otra sucursal");
  assert.equal((await asesorNorte.post("/api/clases-muestra", { prospecto_id: fNorte.prospectoId, grupo_id: ps.grupos[0]!.id, fecha_hora: fecha })).estado, 404, "grupo de otra sucursal");
  assert.equal(await db.clase_muestra.count(), 0, "no se agendó nada");

  const ok = await asesorNorte.post<{ id: string }>("/api/clases-muestra", { prospecto_id: fNorte.prospectoId, grupo_id: pn.grupos[0]!.id, fecha_hora: fecha });
  assert.equal(ok.estado, 201);
  const mover = await asesorNorte.post(`/api/clases-muestra/${ok.cuerpo.id}/reprogramar`, { fecha_hora: "2026-11-11T18:00:00-06:00", grupo_id: ps.grupos[0]!.id });
  assert.equal(mover.estado, 404, "reprogramar a un grupo de otra sucursal");
  assert.equal((await db.clase_muestra.findFirstOrThrow({ where: { id: ok.cuerpo.id } })).estatus, "agendada");
  // El administrador sí puede (control positivo).
  const adm = await admin.post(`/api/clases-muestra/${ok.cuerpo.id}/reprogramar`, { fecha_hora: "2026-11-11T18:00:00-06:00", grupo_id: ps.grupos[0]!.id });
  assert.equal(adm.estado, 201);
});

test("ED-05 (M33): el aviso al maestro de una clase que ya empezó se descarta (evento_pasado) aunque sea horario de envío", async () => {
  const m = await mundo();
  const transporte = new TransporteFalso();
  await prisma.plantilla_mensaje.create({
    data: { organizacion_id: m.org.organizacionId, codigo: "aviso_maestro_agendada", content_sid: "HX00000000000000000000000000000002", categoria: "utility", clase_mensaje: "servicio", variables: [{ pos: 1, nombre: "nombre_alumno" }] as object, cuerpo_referencia: "Nueva clase muestra: {{1}}.", estado_aprobacion: "aprobada" },
  });
  await prisma.instructor.updateMany({ where: { usuario_id: m.maestroA }, data: { telefono: "+525512340001" } });
  const f = await sembrarFamilia(prisma, m.org, { sucursalId: m.org.sucursales[0]!.id });
  const r = await m.db.$transaction((tx) => agendarClaseMuestra(tx, m.ctx, { prospectoId: f.prospectoId, grupoId: m.grupoA, fechaHora: MIERCOLES_4 }));
  assert.ok(r.ok);
  // El servidor estuvo caído y el barrido corre a las 18:30 locales, con la clase empezada hace 30 minutos (dentro de 09:00–20:00).
  const tarde = new Date(MIERCOLES_4.getTime() + 30 * 60_000);
  const resumen = await barrerAvisosMaestro({ prisma, mensajeria: new MessagingProvider({ transporte, reloj: () => tarde }), reloj: () => tarde, organizacionId: m.org.organizacionId });
  assert.equal(resumen.descartados, 1);
  assert.equal(resumen.enviados, 0);
  assert.equal(transporte.envios.length, 0, "no sale nada sobre una clase que ya empezó");
  assert.deepEqual((await m.db.aviso_maestro.findMany({ select: { entrega: true, motivo_entrega: true } })).map((a) => [a.entrega, a.motivo_entrega]), [["descartado", "evento_pasado"]]);
});

test("ED-05 (M53): la versión vigente de un documento de una vertical es la más alta que ya rige; sin documento propio, la del general", async () => {
  const org = await sembrarOrganizacion(prisma, "Documento vigente");
  const db = conAlcance(prisma, org.organizacionId);
  const otraVertical = await prisma.vertical.create({ data: { organizacion_id: org.organizacionId, nombre: "Otra", slug: "otra" } });
  const publica = async (verticalId: string | null, texto: string, desde: string) => {
    const r = await crearVersionDeDocumento(db, org.organizacionId, { tipo: "reglamento", verticalId, titulo: texto, texto, vigenteDesde: new Date(desde), usuarioId: null }, new Date("2026-11-02T12:00:00Z"));
    assert.ok(r.ok, JSON.stringify(r));
    return r.documento;
  };
  const general1 = await publica(null, "general v1", "2020-01-01T00:00:00Z");
  const propio1 = await publica(org.verticalId, "propio v1", "2020-01-01T00:00:00Z");
  const propio2 = await publica(org.verticalId, "propio v2", "2021-01-01T00:00:00Z");
  const futuro = await publica(org.verticalId, "propio v3 (futuro)", "2030-01-01T00:00:00Z");
  assert.deepEqual([propio1.version, propio2.version, futuro.version], [1, 2, 3]);
  const ahora = new Date("2026-11-02T18:00:00Z");
  assert.equal((await documentoVigente(db, "reglamento", org.verticalId, ahora))?.id, propio2.id, "la más alta de las que ya rigen (ni la v1 ni la futura)");
  assert.equal((await documentoVigente(db, "reglamento", otraVertical.id, ahora))?.id, general1.id, "otra vertical sin documento propio: el general");
  assert.equal((await documentoVigente(db, "reglamento", org.verticalId, new Date("2031-01-01T00:00:00Z")))?.id, futuro.id, "llegada su fecha, rige la v3");
});

test("ED-07: varias reprogramaciones simultáneas de la misma clase: una gana y las demás reciben «la clase ya no está agendada» (no «ya tiene una clase»)", async () => {
  const m = await mundo();
  const f = await sembrarFamilia(prisma, m.org, { sucursalId: m.org.sucursales[0]!.id });
  const r0 = await m.db.$transaction((tx) => agendarClaseMuestra(tx, m.ctx, { prospectoId: f.prospectoId, grupoId: m.grupoA, fechaHora: MIERCOLES_4 }));
  assert.ok(r0.ok);
  const fechas = [MIERCOLES_11, new Date("2026-11-19T00:00:00Z"), MIERCOLES_11, new Date("2026-11-19T00:00:00Z")];
  const rs = await Promise.all(fechas.map((fechaHora) => m.db.$transaction((tx) => reprogramarClaseMuestra(tx, m.ctx, { claseId: r0.clase.id, fechaHora }))));
  assert.equal(rs.filter((r) => r.ok).length, 1);
  assert.deepEqual([...new Set(rs.filter((r) => !r.ok).map((r) => (r as { motivo: string }).motivo))], ["clase_no_vigente"]);
  assert.equal(await m.db.clase_muestra.count({ where: { prospecto_id: f.prospectoId, estatus: "agendada" } }), 1);
});

test("ED-12: el sistema tampoco mueve a un lead cuya etapa es de cierre solo por su tipo (inscrito sin la bandera de ganado; perdido sin la bandera de perdido)", async () => {
  const org = await sembrarOrganizacion(prisma, "Etapas por tipo");
  const db = conAlcance(prisma, org.organizacionId);
  await prisma.etapa_pipeline.update({ where: { id: org.etapaInicialId }, data: { tipo_sistema: "nuevo" } });
  const crea = (nombre: string, orden: number, tipo: "muestra_agendada" | "muestra_asistida" | "inscrito" | "perdido") => prisma.etapa_pipeline.create({ data: { organizacion_id: org.organizacionId, nombre, orden, tipo_sistema: tipo } });
  const agendada = await crea("Etapa B", 2, "muestra_agendada");
  const asistida = await crea("Etapa C", 3, "muestra_asistida");
  const inscrito = await crea("Etapa D", 4, "inscrito"); // es_ganado queda en false a propósito
  const perdido = await crea("Etapa E", 5, "perdido"); // es_perdido queda en false a propósito
  const a = await sembrarFamilia(prisma, org, { etapaId: inscrito.id });
  const retrocede = await db.$transaction((tx) => moverLeadAEtapa(tx, a.leadId, "muestra_asistida", { motivo: "prueba", permitirRetroceso: true }));
  assert.equal(retrocede.movido, false, "un inscrito no se mueve aunque la escuela no haya marcado la bandera");
  assert.equal((await db.lead.findFirstOrThrow({ where: { id: a.leadId } })).etapa_id, inscrito.id);

  const b = await sembrarFamilia(prisma, org, { etapaId: perdido.id });
  const recupera = await db.$transaction((tx) => moverLeadAEtapa(tx, b.leadId, "muestra_agendada", { motivo: "prueba" }));
  assert.equal(recupera.movido, true, "un perdido (por tipo) que reaparece se recupera");
  const lead = await db.lead.findFirstOrThrow({ where: { id: b.leadId } });
  assert.deepEqual([lead.etapa_id, lead.recuperaciones], [agendada.id, 1]);
  void asistida;
});

test("ED-13: el registro de cambios del movimiento de etapa va en la misma transacción: si falla, el movimiento no se confirma", async () => {
  const m = await mundo();
  const etapas = await m.db.etapa_pipeline.findMany({ orderBy: { orden: "asc" }, select: { id: true, tipo_sistema: true } });
  const nuevo = etapas.find((x) => x.tipo_sistema === "nuevo")!;
  const contactado = etapas.find((x) => x.tipo_sistema === "contactado")!;
  const f = await sembrarFamilia(prisma, m.org, { sucursalId: m.org.sucursales[0]!.id, etapaId: nuevo.id });
  const actor = { usuarioId: m.usuarioId, organizacionId: m.org.organizacionId, esAdministrador: false, ahora: AHORA };
  await assert.rejects(
    moverEtapaDeLead(m.db, actor, { leadId: f.leadId, haciaEtapaId: contactado.id }, async () => {
      throw new Error("falla el registro");
    }),
    /falla el registro/,
  );
  assert.equal((await m.db.lead.findFirstOrThrow({ where: { id: f.leadId } })).etapa_id, nuevo.id, "la etapa no cambió");
  assert.equal(await m.db.lead_etapa_historial.count({ where: { lead_id: f.leadId, origen: "usuario" } }), 0, "ni quedó una fila de historial");
  // Con el registro bien, sí: y el callback recibe lo que cambió.
  let visto: unknown = null;
  const ok = await moverEtapaDeLead(m.db, actor, { leadId: f.leadId, haciaEtapaId: contactado.id }, async (_tx, cambio) => {
    visto = cambio;
  });
  assert.ok(ok.ok && ok.cambio);
  assert.deepEqual(visto, { antes: { etapa_id: nuevo.id, motivo_perdida_id: null, recuperaciones: 0 }, despues: { etapa_id: contactado.id, motivo_perdida_id: null, recuperaciones: 0 } });
});
