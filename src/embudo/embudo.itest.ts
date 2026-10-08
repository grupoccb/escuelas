// D7: el embudo con historial. Cambios de etapa por una persona (reglas, motivo de pérdida, recuperación, matriz configurable), por el sistema
// (clase agendada, asistió), el historial de solo anexar, el tiempo en cada etapa, la alerta de lead estancado (una consulta) y la
// concurrencia de dos movimientos del mismo lead.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { conAlcance } from "../datos/alcance.ts";
import { agendarClaseMuestra } from "../clases-muestra/agenda.ts";
import { marcarAsistencia } from "../clases-muestra/asistencia.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { OcupacionFija, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba, type TipoDeEtapa } from "../testutil/semilla.ts";
import { escenarioBot } from "../testutil/bot.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";

// Martes 10 de noviembre de 2026, 12:00 en la Ciudad de México.
const AHORA = new Date("2026-11-10T18:00:00Z");
const DIA = 24 * 3_600_000;

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let ajena: OrganizacionDePrueba;
let etapas: Record<TipoDeEtapa, string>;
let admin: ClienteApi;
let asesorNorte: ClienteApi;
let asesorSur: ClienteApi;
let recepcion: ClienteApi;
let maestro: ClienteApi;
let adminId: string;
let norte: string;
let sur: string;
let motivos: Record<string, string>;
const db = () => conAlcance(prisma, org.organizacionId);

interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
interface Movido { cambio: boolean; movimiento?: string; lead: { id: string; etapa_id: string; motivo_perdida_id: string | null; recuperaciones: number } }
interface Historial {
  etapa_actual: { id: string };
  recuperaciones: number;
  motivo_perdida: { codigo: string } | null;
  cambios: { desde: { id: string } | null; hacia: { id: string }; origen: string; usuario: { nombre: string } | null; motivo: string | null; motivo_perdida: { codigo: string } | null; nota: string | null; es_recuperacion: boolean; segundos_en_la_etapa: number }[];
  tiempo_por_etapa: { etapa: { id: string }; segundos: number; veces: number }[];
}

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA });
  org = await sembrarOrganizacion(prisma, "Embudo");
  ajena = await sembrarOrganizacion(prisma, "Embudo ajena");
  etapas = await sembrarEmbudo(prisma, org);
  norte = org.sucursales[0]!.id;
  sur = org.sucursales[1]!.id;
  const entrar = async (rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return { c, id: u.id };
  };
  const a = await entrar("administrador");
  admin = a.c;
  adminId = a.id;
  asesorNorte = (await entrar("asesor", [norte])).c;
  asesorSur = (await entrar("asesor", [sur])).c;
  recepcion = (await entrar("recepcion", [norte])).c;
  maestro = (await entrar("maestro")).c;
  motivos = {};
  for (const [codigo, nombre, orden] of [["precio", "Precio", 1], ["horario", "Horario", 2], ["otro", "Otro", 9]] as const) {
    motivos[codigo] = (await prisma.motivo_perdida.create({ data: { organizacion_id: org.organizacionId, codigo, nombre, orden } })).id;
  }
  motivos["inactivo"] = (await prisma.motivo_perdida.create({ data: { organizacion_id: org.organizacionId, codigo: "inactivo", nombre: "Ya no se usa", orden: 99, activo: false } })).id;
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

const lead = (etapa: TipoDeEtapa = "nuevo", sucursalId = norte) => sembrarFamilia(prisma, org, { sucursalId, etapaId: etapas[etapa] });
const mover = (c: ClienteApi, id: string, cuerpo: unknown) => c.patch<Movido & Errores>(`/api/leads/${id}/etapa`, cuerpo);
const historial = (c: ClienteApi, id: string) => c.get<Historial & Errores>(`/api/leads/${id}/historial`);
const filasDe = (leadId: string) => db().lead_etapa_historial.findMany({ where: { lead_id: leadId }, orderBy: [{ secuencia: "asc" }] });

test("D7: mover de etapa — el lead cambia, queda el historial (quién, de dónde a dónde, cuándo), la interacción y el registro de cambios; mover a la misma etapa no hace nada", async () => {
  const f = await lead("nuevo");
  const r = await mover(asesorNorte, f.leadId, { etapa_id: etapas.negociacion });
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  assert.deepEqual([r.cuerpo.cambio, r.cuerpo.movimiento, r.cuerpo.lead.etapa_id], [true, "avance", etapas.negociacion]);
  const l = await db().lead.findFirstOrThrow({ where: { id: f.leadId } });
  assert.equal(l.etapa_id, etapas.negociacion);
  assert.equal(l.ultima_interaccion_en?.toISOString(), AHORA.toISOString(), "mover es movimiento: reinicia el conteo de días sin movimiento");
  const filas = await filasDe(f.leadId);
  assert.equal(filas.length, 1);
  assert.deepEqual([filas[0]!.etapa_anterior_id, filas[0]!.etapa_nueva_id, filas[0]!.origen, filas[0]!.motivo, filas[0]!.es_recuperacion], [etapas.nuevo, etapas.negociacion, "usuario", "avance", false]);
  assert.notEqual(filas[0]!.usuario_id, null);
  assert.equal(filas[0]!.creado_en.toISOString(), AHORA.toISOString());
  assert.equal(await db().interaccion.count({ where: { lead_id: f.leadId, tipo: "cambio_etapa" } }), 1);
  const cambios = await db().registro_cambio.findMany({ where: { entidad_tipo: "lead", entidad_id: f.leadId } });
  assert.deepEqual([cambios.length, (cambios[0]!.antes as { etapa_id: string }).etapa_id, (cambios[0]!.despues as { etapa_id: string }).etapa_id], [1, etapas.nuevo, etapas.negociacion]);
  // A la misma etapa: 200 sin cambio y sin historial nuevo.
  const igual = await mover(asesorNorte, f.leadId, { etapa_id: etapas.negociacion });
  assert.deepEqual([igual.estado, igual.cuerpo.cambio], [200, false]);
  assert.equal((await filasDe(f.leadId)).length, 1);
  // Retroceder también vale (corregir un error) y queda marcado como retroceso.
  const atras = await mover(asesorNorte, f.leadId, { etapa_id: etapas.contactado, nota: "Se movió por error" });
  assert.equal(atras.cuerpo.movimiento, "retroceso");
  assert.equal((await filasDe(f.leadId)).at(-1)!.nota, "Se movió por error");
});

test("D7: permisos, alcance y entradas — recepción y maestro 403; otra sucursal y otra organización 404; etapa inexistente o ajena 400; campos desconocidos 400", async () => {
  const f = await lead("nuevo", norte);
  for (const c of [recepcion, maestro]) assert.equal((await mover(c, f.leadId, { etapa_id: etapas.contactado })).estado, 403);
  assert.equal((await mover(api.cliente(), f.leadId, { etapa_id: etapas.contactado })).estado, 401);
  assert.equal((await mover(asesorSur, f.leadId, { etapa_id: etapas.contactado })).estado, 404, "el asesor de otra sucursal");
  assert.equal((await historial(asesorSur, f.leadId)).estado, 404);
  assert.equal((await mover(admin, "00000000-0000-4000-8000-0000000000ee", { etapa_id: etapas.contactado })).estado, 404);
  const otraEtapa = await prisma.etapa_pipeline.create({ data: { organizacion_id: ajena.organizacionId, nombre: "Ajena", orden: 5 } });
  const ajeno = await mover(admin, f.leadId, { etapa_id: otraEtapa.id });
  assert.equal(ajeno.estado, 400);
  assert.ok(ajeno.cuerpo.error.detalles?.some((d) => d.campo === "etapa_id"));
  assert.equal((await mover(admin, f.leadId, { etapa_id: "no-es-uuid" })).estado, 400);
  assert.equal((await mover(admin, f.leadId, { etapa_id: etapas.contactado, campo_raro: 1 })).estado, 400);
  assert.equal((await mover(admin, f.leadId, {})).estado, 400);
  const lejano = await sembrarFamilia(prisma, org, { sucursalId: null, etapaId: etapas.nuevo });
  assert.equal((await mover(asesorNorte, lejano.leadId, { etapa_id: etapas.contactado })).estado, 404, "un lead sin sucursal solo lo ve el administrador");
  assert.equal((await mover(admin, lejano.leadId, { etapa_id: etapas.contactado })).estado, 200);
  assert.equal((await filasDe(f.leadId)).length, 0, "nada de lo rechazado quedó en el historial");
});

test("D7: pasar a perdido EXIGE el motivo de pérdida (activo y de la organización); el motivo sin perder es un error; queda en el lead y en el historial", async () => {
  const f = await lead("contactado");
  const sin = await mover(asesorNorte, f.leadId, { etapa_id: etapas.perdido });
  assert.equal(sin.estado, 400);
  assert.ok(sin.cuerpo.error.detalles?.some((d) => d.campo === "motivo_perdida_id"));
  const ajenoM = await prisma.motivo_perdida.create({ data: { organizacion_id: ajena.organizacionId, codigo: "ajeno", nombre: "Ajeno" } });
  for (const id of [motivos["inactivo"]!, ajenoM.id, "00000000-0000-4000-8000-0000000000ff"]) {
    const x = await mover(asesorNorte, f.leadId, { etapa_id: etapas.perdido, motivo_perdida_id: id });
    assert.equal(x.estado, 400, id);
  }
  assert.equal((await mover(asesorNorte, f.leadId, { etapa_id: etapas.negociacion, motivo_perdida_id: motivos["precio"] })).estado, 400, "el motivo solo va al perder");
  assert.equal((await db().lead.findFirstOrThrow({ where: { id: f.leadId } })).etapa_id, etapas.contactado, "ningún intento fallido movió al lead");
  const ok = await mover(asesorNorte, f.leadId, { etapa_id: etapas.perdido, motivo_perdida_id: motivos["precio"], nota: "Le pareció caro" });
  assert.equal(ok.estado, 200, JSON.stringify(ok.cuerpo));
  assert.deepEqual([ok.cuerpo.movimiento, ok.cuerpo.lead.motivo_perdida_id], ["perdida", motivos["precio"]]);
  const fila = (await filasDe(f.leadId)).at(-1)!;
  assert.deepEqual([fila.motivo_perdida_id, fila.nota, fila.motivo], [motivos["precio"], "Le pareció caro", "perdida"]);
  const h = (await historial(asesorNorte, f.leadId)).cuerpo;
  assert.equal(h.motivo_perdida?.codigo, "precio");
  assert.equal(h.cambios.at(-1)!.motivo_perdida?.codigo, "precio");
  // Ya está perdido: perder otra vez no.
  assert.equal((await mover(asesorNorte, f.leadId, { etapa_id: etapas.perdido, motivo_perdida_id: motivos["horario"] })).estado, 200, "la misma etapa no cambia nada");
  assert.equal((await db().lead.findFirstOrThrow({ where: { id: f.leadId } })).motivo_perdida_id, motivos["precio"]);
});

test("D7: recuperar un lead perdido — exige la nota, cuenta la recuperación, limpia el motivo (el historial lo conserva) y vuelve a contar si se pierde y recupera de nuevo", async () => {
  const f = await lead("contactado");
  await mover(asesorNorte, f.leadId, { etapa_id: etapas.perdido, motivo_perdida_id: motivos["horario"] });
  const sinNota = await mover(asesorNorte, f.leadId, { etapa_id: etapas.contactado });
  assert.equal(sinNota.estado, 400);
  assert.ok(sinNota.cuerpo.error.detalles?.some((d) => d.campo === "nota"));
  assert.equal((await mover(asesorNorte, f.leadId, { etapa_id: etapas.contactado, nota: "   " })).estado, 400, "una nota en blanco no cuenta");
  const rec = await mover(asesorNorte, f.leadId, { etapa_id: etapas.muestra_agendada, nota: "Llamó para pedir un horario nuevo" });
  assert.equal(rec.estado, 200, JSON.stringify(rec.cuerpo));
  assert.deepEqual([rec.cuerpo.movimiento, rec.cuerpo.lead.recuperaciones, rec.cuerpo.lead.motivo_perdida_id], ["recuperacion", 1, null]);
  const filas = await filasDe(f.leadId);
  assert.deepEqual(filas.map((x) => [x.es_recuperacion, x.motivo_perdida_id !== null]), [[false, true], [true, false]], "el motivo de la pérdida sigue en SU fila del historial");
  // Otra vuelta.
  await mover(asesorNorte, f.leadId, { etapa_id: etapas.perdido, motivo_perdida_id: motivos["otro"] });
  const dos = await mover(asesorNorte, f.leadId, { etapa_id: etapas.nuevo, nota: "Otra vez interesado" });
  assert.equal(dos.cuerpo.lead.recuperaciones, 2);
  const h = (await historial(admin, f.leadId)).cuerpo;
  assert.equal(h.recuperaciones, 2);
  assert.equal(h.cambios.filter((c) => c.es_recuperacion).length, 2);
  assert.equal(h.motivo_perdida, null);
});

test("D7: a una etapa de inscrito no se llega moviendo etapas; de una inscrita no se vuelve atrás salvo el administrador, y nunca a perdido", async () => {
  const quiere = await lead("negociacion");
  for (const c of [asesorNorte, admin]) {
    const r = await mover(c, quiere.leadId, { etapa_id: etapas.inscrito });
    assert.equal(r.estado, 409);
    assert.match(r.cuerpo.error.mensaje, /conversión/);
  }
  const inscrito = await lead("inscrito");
  const asesor = await mover(asesorNorte, inscrito.leadId, { etapa_id: etapas.negociacion });
  assert.equal(asesor.estado, 409);
  assert.match(asesor.cuerpo.error.mensaje, /administrador/);
  assert.equal((await mover(admin, inscrito.leadId, { etapa_id: etapas.perdido, motivo_perdida_id: motivos["precio"] })).estado, 409, "un inscrito no se marca perdido");
  assert.equal((await db().lead.findFirstOrThrow({ where: { id: inscrito.leadId } })).etapa_id, etapas.inscrito);
  const corrige = await mover(admin, inscrito.leadId, { etapa_id: etapas.negociacion });
  assert.equal(corrige.estado, 200);
  assert.equal(corrige.cuerpo.movimiento, "retroceso");
  assert.equal((await filasDe(inscrito.leadId)).length, 1);
});

test("D7: la matriz configurable — un par prohibido o solo para el administrador se respeta; una fila «permitida» no levanta las reglas fijas", async () => {
  const f = await lead("nuevo");
  const prohibida = await prisma.transicion_etapa.create({ data: { organizacion_id: org.organizacionId, desde_etapa_id: etapas.nuevo, hacia_etapa_id: etapas.muestra_asistida, regla: "prohibida" } });
  const soloAdmin = await prisma.transicion_etapa.create({ data: { organizacion_id: org.organizacionId, desde_etapa_id: etapas.nuevo, hacia_etapa_id: etapas.negociacion, regla: "solo_administrador" } });
  const levanta = await prisma.transicion_etapa.create({ data: { organizacion_id: org.organizacionId, desde_etapa_id: etapas.negociacion, hacia_etapa_id: etapas.inscrito, regla: "permitida" } });
  try {
    assert.equal((await mover(admin, f.leadId, { etapa_id: etapas.muestra_asistida })).estado, 409, "ni el administrador");
    assert.equal((await mover(asesorNorte, f.leadId, { etapa_id: etapas.negociacion })).estado, 409);
    assert.equal((await mover(asesorNorte, f.leadId, { etapa_id: etapas.contactado })).estado, 200, "los demás pares siguen libres");
    const g = await lead("nuevo");
    assert.equal((await mover(admin, g.leadId, { etapa_id: etapas.negociacion })).estado, 200, "el administrador sí en «solo administrador»");
    assert.equal((await mover(admin, g.leadId, { etapa_id: etapas.inscrito })).estado, 409, "permitida no levanta la regla fija");
  } finally {
    for (const t of [prohibida, soloAdmin, levanta]) await prisma.transicion_etapa.update({ where: { id: t.id }, data: { eliminado_en: new Date() } });
  }
  assert.equal((await mover(asesorNorte, (await lead("nuevo")).leadId, { etapa_id: etapas.muestra_asistida })).estado, 200, "borrada la regla, el par vuelve a valer");
  // Restricciones de la tabla.
  await assert.rejects(prisma.transicion_etapa.create({ data: { organizacion_id: org.organizacionId, desde_etapa_id: etapas.nuevo, hacia_etapa_id: etapas.nuevo, regla: "prohibida" } }), /check|constraint/i);
});

test("D7: las transiciones del sistema (clase agendada, asistió, recuperación por volver a agendar) también escriben el historial, con origen «sistema»", async () => {
  const programa = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "Programa", edadMin: 3, edadMax: 14, grupos: [{ nombre: "Grupo", cupoMaximo: 20, horarios: [[1, 960, 1020]] }] });
  const usuario = await prisma.usuario.create({ data: { organizacion_id: org.organizacionId, correo: `s-${Math.random()}@p.test`, nombre: "S", rol: "asesor", contrasena_hash: "x" } });
  const ahora = new Date("2026-11-02T18:00:00Z"); // lunes 12:00
  const clase = new Date("2026-11-09T22:00:00Z"); // lunes 16:00
  const ctx = { ahora, fuente: new OcupacionFija(), origen: { tipo: "usuario" as const, usuarioId: usuario.id } };
  const f = await lead("contactado");
  const r = await db().$transaction((tx) => agendarClaseMuestra(tx, ctx, { prospectoId: f.prospectoId, grupoId: programa.grupos[0]!.id, fechaHora: clase }));
  assert.ok(r.ok);
  const asistio = await db().$transaction((tx) => marcarAsistencia(tx, { claseId: r.clase.id, estatus: "asistio", usuarioId: usuario.id, ahora: new Date("2026-11-09T23:00:00Z") }));
  assert.ok(asistio.ok);
  const filas = await filasDe(f.leadId);
  assert.deepEqual(filas.map((x) => [x.etapa_anterior_id, x.etapa_nueva_id, x.origen, x.motivo, x.usuario_id]), [
    [etapas.contactado, etapas.muestra_agendada, "sistema", "clase_muestra_agendada", null],
    [etapas.muestra_agendada, etapas.muestra_asistida, "sistema", "clase_muestra_asistida", null],
  ]);
  assert.deepEqual(filas.map((x) => x.creado_en.toISOString()), [ahora.toISOString(), "2026-11-09T23:00:00.000Z"], "con el reloj de quien llama");
  const h = (await historial(asesorNorte, f.leadId)).cuerpo;
  assert.deepEqual(h.cambios.map((c) => [c.origen, c.usuario]), [["sistema", null], ["sistema", null]]);
  // Un lead perdido que agenda una clase se RECUPERA (por el sistema): cuenta, limpia el motivo y deja la nota.
  const p = await lead("contactado");
  await mover(asesorNorte, p.leadId, { etapa_id: etapas.perdido, motivo_perdida_id: motivos["precio"] });
  const otra = await db().$transaction((tx) => agendarClaseMuestra(tx, ctx, { prospectoId: p.prospectoId, grupoId: programa.grupos[0]!.id, fechaHora: clase }));
  assert.ok(otra.ok);
  const lp = await db().lead.findFirstOrThrow({ where: { id: p.leadId } });
  assert.deepEqual([lp.etapa_id, lp.recuperaciones, lp.motivo_perdida_id], [etapas.muestra_agendada, 1, null]);
  const ultima = (await filasDe(p.leadId)).at(-1)!;
  assert.deepEqual([ultima.es_recuperacion, ultima.origen, ultima.nota !== null], [true, "sistema", true]);
});

test("D7: el alta del lead por el bot es la primera fila del historial (sin etapa anterior)", async () => {
  const e = await escenarioBot(prisma, { embudo: true });
  const c = e.contacto();
  await c.escribe("Hola", new Date("2026-11-10T17:00:00Z"));
  const l = await e.db.lead.findFirstOrThrow({ where: { telefono: c.telefono } });
  const filas = await e.db.lead_etapa_historial.findMany({ where: { lead_id: l.id } });
  assert.equal(filas.length, 1);
  assert.deepEqual([filas[0]!.etapa_anterior_id, filas[0]!.etapa_nueva_id, filas[0]!.origen, filas[0]!.motivo], [null, l.etapa_id, "sistema", "alta"]);
  assert.equal(filas[0]!.creado_en.toISOString(), "2026-11-10T17:00:00.000Z");
  // Escribir otra vez no crea otra alta.
  await c.escribe("Mateo", new Date("2026-11-10T17:05:00Z"));
  assert.equal(await e.db.lead_etapa_historial.count({ where: { lead_id: l.id } }), 1);
});

test("D7: el historial y el tiempo en cada etapa (con reloj inyectado); es de SOLO ANEXAR en la base", async () => {
  const T0 = new Date("2026-11-10T08:00:00Z"); // hace 10 h
  const l = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, sucursal_interes_id: norte, etapa_id: etapas.contactado, telefono: "+525500009999", creado_en: T0 } });
  const fila = (anterior: string | null, nueva: string, horas: number, resto: Record<string, unknown> = {}) =>
    prisma.lead_etapa_historial.create({ data: { organizacion_id: org.organizacionId, lead_id: l.id, etapa_anterior_id: anterior, etapa_nueva_id: nueva, origen: "sistema", creado_en: new Date(T0.getTime() + horas * 3_600_000), ...resto } });
  await fila(null, etapas.nuevo, 0, { motivo: "alta" });
  await fila(etapas.nuevo, etapas.perdido, 2, { motivo: "perdida" });
  await fila(etapas.perdido, etapas.nuevo, 5, { motivo: "recuperacion", es_recuperacion: true, nota: "Volvió" });
  const ultima = await fila(etapas.nuevo, etapas.contactado, 6);
  const h = await historial(recepcion, l.id);
  assert.equal(h.estado, 200, JSON.stringify(h.cuerpo));
  assert.deepEqual(h.cuerpo.cambios.map((c) => [c.desde?.id ?? null, c.hacia.id, c.segundos_en_la_etapa]), [
    [null, etapas.nuevo, 7200],
    [etapas.nuevo, etapas.perdido, 10800],
    [etapas.perdido, etapas.nuevo, 3600],
    [etapas.nuevo, etapas.contactado, 4 * 3600], // hasta ahora (18:00Z)
  ]);
  const t = new Map(h.cuerpo.tiempo_por_etapa.map((x) => [x.etapa.id, x]));
  assert.deepEqual([t.get(etapas.nuevo)!.segundos, t.get(etapas.nuevo)!.veces], [7200 + 3600, 2]);
  assert.deepEqual([t.get(etapas.perdido)!.segundos, t.get(etapas.contactado)!.segundos], [10800, 4 * 3600]);
  // De solo anexar, por la base.
  await assert.rejects(prisma.lead_etapa_historial.update({ where: { id: ultima.id }, data: { nota: "reescrito" } }), /lead_etapa_historial es de solo anexar/);
  await assert.rejects(prisma.lead_etapa_historial.delete({ where: { id: ultima.id } }), /solo anexar/);
  await assert.rejects(prisma.lead_etapa_historial.update({ where: { id: ultima.id }, data: { eliminado_en: new Date() } }), /solo anexar/);
  const ensayo = (sql: string) =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(sql);
      throw new Error("EL TRUNCATE SE EJECUTÓ");
    });
  await assert.rejects(ensayo(`TRUNCATE TABLE "lead_etapa_historial"`), /solo anexar/);
  await assert.rejects(ensayo(`TRUNCATE TABLE "lead" CASCADE`), /solo anexar/);
  // Restricciones: una persona deja su usuario, el sistema no; recuperar exige nota.
  await assert.rejects(prisma.lead_etapa_historial.create({ data: { organizacion_id: org.organizacionId, lead_id: l.id, etapa_nueva_id: etapas.nuevo, origen: "usuario" } }), /check|constraint/i);
  await assert.rejects(prisma.lead_etapa_historial.create({ data: { organizacion_id: org.organizacionId, lead_id: l.id, etapa_nueva_id: etapas.nuevo, origen: "sistema", usuario_id: adminId } }), /check|constraint/i);
  await assert.rejects(prisma.lead_etapa_historial.create({ data: { organizacion_id: org.organizacionId, lead_id: l.id, etapa_nueva_id: etapas.nuevo, origen: "sistema", es_recuperacion: true } }), /check|constraint/i);
});

test("D7: lead estancado — una consulta por el umbral de la etapa (días completos), sin etapas de cierre ni sin umbral, con alcance por sucursal y sin enviar nada", async () => {
  const eOrg = await sembrarOrganizacion(prisma, "Estancados");
  const ee = await sembrarEmbudo(prisma, eOrg);
  const u = await sembrarUsuario(prisma, eOrg.organizacionId, { rol: "administrador" });
  const us = await sembrarUsuario(prisma, eOrg.organizacionId, { rol: "asesor", sucursales: [eOrg.sucursales[1]!.id] });
  const c = api.cliente();
  const cs = api.cliente();
  await c.login(eOrg.slug, u.correo, u.contrasena);
  await cs.login(eOrg.slug, us.correo, us.contrasena);
  const e = (tipo: TipoDeEtapa, dias: number | null) => prisma.etapa_pipeline.update({ where: { id: ee[tipo] }, data: { dias_alerta_sin_movimiento: dias } });
  await e("nuevo", 2);
  await e("contactado", 3);
  await e("negociacion", null);
  await e("inscrito", 1);
  await e("perdido", 1);
  const hace = (dias: number, horas = 0) => new Date(AHORA.getTime() - dias * DIA - horas * 3_600_000);
  const crear = async (etapa: TipoDeEtapa, ultima: Date | null, o: { creado?: Date; sucursal?: number; nombre?: string } = {}) =>
    (await prisma.lead.create({ data: { organizacion_id: eOrg.organizacionId, vertical_interes_id: eOrg.verticalId, sucursal_interes_id: eOrg.sucursales[o.sucursal ?? 0]!.id, etapa_id: ee[etapa], nombre_contacto: o.nombre ?? etapa, ultima_interaccion_en: ultima, creado_en: o.creado ?? hace(100) } })).id;
  const estancado3 = await crear("contactado", hace(3), { nombre: "e3" });
  const estancado9 = await crear("contactado", hace(9), { nombre: "e9" });
  const casi = await crear("contactado", hace(2, 23), { nombre: "casi" });
  const nunca = await crear("nuevo", null, { creado: hace(4), nombre: "nunca" });
  const sinUmbral = await crear("negociacion", hace(60), { nombre: "sinumbral" });
  const inscrito = await crear("inscrito", hace(60), { nombre: "inscrito" });
  const perdido = await crear("perdido", hace(60), { nombre: "perdido" });
  const sur = await crear("contactado", hace(5), { sucursal: 1, nombre: "sur" });
  const r = await c.get<{ datos: { id: string; dias_sin_movimiento: number; etapa: { dias_alerta: number } }[]; paginacion: { total: number } }>("/api/leads/estancados");
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  assert.deepEqual(r.cuerpo.datos.map((x) => x.id), [nunca, estancado9, sur, estancado3], "los más viejos primero (sin interacción alguna, antes)");
  assert.equal(r.cuerpo.paginacion.total, 4);
  assert.deepEqual(r.cuerpo.datos.map((x) => x.dias_sin_movimiento), [4, 9, 5, 3]);
  assert.ok(![casi, sinUmbral, inscrito, perdido].some((id) => r.cuerpo.datos.some((x) => x.id === id)), "ni los que aún no cumplen, ni sin umbral, ni los de cierre");
  // Por etapa, por sucursal, paginado, y el alcance del asesor.
  const soloContactado = await c.get<{ datos: { id: string }[] }>(`/api/leads/estancados?etapa_id=${ee.contactado}`);
  assert.deepEqual(soloContactado.cuerpo.datos.map((x) => x.id), [estancado9, sur, estancado3]);
  assert.deepEqual((await c.get<{ datos: { id: string }[] }>(`/api/leads/estancados?sucursal_id=${eOrg.sucursales[1]!.id}`)).cuerpo.datos.map((x) => x.id), [sur]);
  const pag = await c.get<{ datos: { id: string }[]; paginacion: { total: number; limite: number } }>("/api/leads/estancados?limite=2&pagina=2");
  assert.deepEqual([pag.cuerpo.datos.length, pag.cuerpo.paginacion.total, pag.cuerpo.paginacion.limite], [2, 4, 2]);
  assert.deepEqual((await cs.get<{ datos: { id: string }[] }>("/api/leads/estancados")).cuerpo.datos.map((x) => x.id), [sur], "el asesor de la sucursal sur ve solo los suyos");
  const ajenaSucursal = await cs.get<{ datos: unknown[] }>(`/api/leads/estancados?sucursal_id=${eOrg.sucursales[0]!.id}`);
  assert.equal(ajenaSucursal.cuerpo.datos.length, 0, "pedir una sucursal ajena da una lista vacía");
  assert.equal((await maestro.get("/api/leads/estancados")).estado, 403);
  assert.equal((await api.cliente().get("/api/leads/estancados")).estado, 401);
  assert.equal((await c.get("/api/leads/estancados?etapa_id=no-es-uuid")).estado, 400);
  // Es una consulta: no escribe nada (ni historial, ni mensajes, ni tareas).
  assert.equal(await prisma.lead_etapa_historial.count({ where: { organizacion_id: eOrg.organizacionId } }), 0);
  assert.equal(await prisma.tarea_asesor.count({ where: { organizacion_id: eOrg.organizacionId } }), 0);
  assert.equal(await prisma.mensaje.count({ where: { organizacion_id: eOrg.organizacionId } }), 0);
  // El índice que usa: lead(etapa_id, ultima_interaccion_en).
  const indice = (await prisma.$queryRaw<{ indexdef: string }[]>`SELECT indexdef FROM pg_indexes WHERE tablename = 'lead' AND indexdef LIKE '%etapa_id, ultima_interaccion_en%'`).length;
  assert.equal(indice, 1);
});

test("D7: concurrencia — con la etapa que vio quien lo pide, dos movimientos simultáneos del mismo lead: gana uno y el otro recibe 409; sin ella se serializan en cadena sin perder ninguno", async () => {
  const f = await lead("nuevo");
  const [a, b] = await Promise.all([
    mover(asesorNorte, f.leadId, { etapa_id: etapas.contactado, desde_etapa_id: etapas.nuevo }),
    mover(admin, f.leadId, { etapa_id: etapas.negociacion, desde_etapa_id: etapas.nuevo }),
  ]);
  assert.deepEqual([a.estado, b.estado].sort(), [200, 409], JSON.stringify([a.cuerpo, b.cuerpo]));
  const perdedor = a.estado === 409 ? a : b;
  assert.equal(perdedor.cuerpo.error.codigo, "conflicto");
  assert.ok(perdedor.cuerpo.error.detalles?.some((d) => d.campo === "desde_etapa_id"));
  assert.equal((await filasDe(f.leadId)).length, 1, "un solo movimiento quedó en el historial");

  // Sin `desde_etapa_id`: seis movimientos a la vez se serializan; la cadena del historial no se rompe (cada «desde» es el «hacia» de la anterior).
  const g = await lead("nuevo");
  const destinos = [etapas.contactado, etapas.muestra_agendada, etapas.muestra_asistida, etapas.negociacion, etapas.nuevo, etapas.contactado];
  const rs = await Promise.all(destinos.map((d, i) => mover(i % 2 === 0 ? asesorNorte : admin, g.leadId, { etapa_id: d })));
  assert.ok(rs.every((r) => r.estado === 200), JSON.stringify(rs.map((r) => [r.estado, r.cuerpo.error?.mensaje])));
  const filas = await filasDe(g.leadId);
  const cambiaron = rs.filter((r) => r.cuerpo.cambio).length;
  assert.equal(filas.length, cambiaron);
  filas.forEach((x, i) => assert.equal(x.etapa_anterior_id, i === 0 ? etapas.nuevo : filas[i - 1]!.etapa_nueva_id, `la fila ${i} parte de donde terminó la anterior`));
  assert.equal((await db().lead.findFirstOrThrow({ where: { id: g.leadId } })).etapa_id, filas.at(-1)!.etapa_nueva_id);
});

test("D7: motivos de pérdida — catálogo por organización, editable: crear (código derivado o propio), no repetir, cambiar, dar de baja; solo el administrador escribe", async () => {
  const lista = await asesorNorte.get<{ datos: { codigo: string; activo: boolean }[] }>("/api/motivos-perdida");
  assert.equal(lista.estado, 200);
  assert.deepEqual(lista.cuerpo.datos.map((m) => m.codigo), ["precio", "horario", "otro", "inactivo"], "por orden");
  assert.deepEqual((await asesorNorte.get<{ datos: { codigo: string }[] }>("/api/motivos-perdida?activo=true")).cuerpo.datos.map((m) => m.codigo), ["precio", "horario", "otro"]);
  const nuevo = await admin.post<{ id: string; codigo: string; nombre: string; activo: boolean } & Errores>("/api/motivos-perdida", { nombre: "Eligió otra escuela", orden: 5 });
  assert.equal(nuevo.estado, 201, JSON.stringify(nuevo.cuerpo));
  assert.equal(nuevo.cuerpo.codigo, "eligio_otra_escuela");
  assert.equal((await admin.post("/api/motivos-perdida", { nombre: "Otra vez", codigo: "eligio_otra_escuela" })).estado, 409);
  assert.equal((await admin.post("/api/motivos-perdida", { nombre: "Código malo", codigo: "Con Mayúsculas" })).estado, 400);
  assert.equal((await admin.post("/api/motivos-perdida", { nombre: "Distancia", codigo: "distancia" })).estado, 201);
  for (const c of [asesorNorte, recepcion, maestro]) assert.equal((await c.post("/api/motivos-perdida", { nombre: "No" })).estado, 403);
  const cambio = await admin.patch<{ nombre: string; activo: boolean }>(`/api/motivos-perdida/${nuevo.cuerpo.id}`, { nombre: "Eligió otra escuela (competencia)", activo: false });
  assert.deepEqual([cambio.cuerpo.nombre, cambio.cuerpo.activo], ["Eligió otra escuela (competencia)", false]);
  assert.equal((await mover(asesorNorte, (await lead("contactado")).leadId, { etapa_id: etapas.perdido, motivo_perdida_id: nuevo.cuerpo.id })).estado, 400, "un motivo dado de baja ya no se usa");
  assert.equal((await admin.patch(`/api/motivos-perdida/${nuevo.cuerpo.id}`, {})).estado, 400);
  assert.equal((await admin.delete(`/api/motivos-perdida/${nuevo.cuerpo.id}`)).estado, 204);
  assert.equal((await admin.delete(`/api/motivos-perdida/${nuevo.cuerpo.id}`)).estado, 404);
  // Se puede volver a crear un motivo con el código de uno dado de baja.
  assert.equal((await admin.post("/api/motivos-perdida", { nombre: "Eligió otra escuela", codigo: "eligio_otra_escuela" })).estado, 201);
  // Aislamiento entre organizaciones.
  const ajenaAdmin = await sembrarUsuario(prisma, ajena.organizacionId, { rol: "administrador" });
  const ca = api.cliente();
  await ca.login(ajena.slug, ajenaAdmin.correo, ajenaAdmin.contrasena);
  assert.ok(!(await ca.get<{ datos: { codigo: string }[] }>("/api/motivos-perdida")).cuerpo.datos.some((m) => m.codigo === "precio" || m.codigo === "distancia"), "los motivos de otra organización no se ven");
  assert.equal((await ca.patch(`/api/motivos-perdida/${motivos["precio"]}`, { nombre: "x" })).estado, 404);
  // El registro de cambios del catálogo.
  assert.ok((await db().registro_cambio.count({ where: { entidad_tipo: "motivo_perdida" } })) >= 4);
});
