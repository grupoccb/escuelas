// V2, decisión 5: un lead SIN sucursal lo ven y atienden todos los asesores de la organización hasta que tenga sucursal; en cuanto la tiene, solo los asesores de esa sucursal.
// Recepción y maestro conservan su alcance. La regla vive en un solo lugar (`condicionDeLead`, src/api/alcance.ts) y esta prueba recorre todo lo que cuelga del lead: listado,
// ficha, historial, estancados, mover de etapa, cotizaciones, tareas, conversaciones, conversión y exportación; más la transición (agendar le pone sucursal) y la no-fuga entre
// organizaciones. Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba, type TipoDeEtapa } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let ajena: OrganizacionDePrueba;
let etapas: Record<TipoDeEtapa, string>;
let norte: string;
let sur: string;
let admin: ClienteApi;
let asesorNorte: ClienteApi;
let asesorSur: ClienteApi;
let asesorSinSucursales: ClienteApi;
let recepcion: ClienteApi;
let maestro: ClienteApi;
let asesorAjeno: ClienteApi;
let grupoNorte: string;
let grupoSur: string;

// Lunes 12 de octubre de 2026, 10:00 en Ciudad de México.
const AHORA = new Date("2026-10-12T16:00:00Z");

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA });
  org = await sembrarOrganizacion(prisma, "LeadsSinSucursal");
  ajena = await sembrarOrganizacion(prisma, "LeadsSinSucursalAjena");
  etapas = await sembrarEmbudo(prisma, org);
  await sembrarEmbudo(prisma, ajena);
  norte = org.sucursales[0]!.id;
  sur = org.sucursales[1]!.id;
  const entrar = async (o: OrganizacionDePrueba, rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, o.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  admin = await entrar(org, "administrador");
  asesorNorte = await entrar(org, "asesor", [norte]);
  asesorSur = await entrar(org, "asesor", [sur]);
  asesorSinSucursales = await entrar(org, "asesor", []);
  recepcion = await entrar(org, "recepcion", [norte, sur]);
  maestro = await entrar(org, "maestro");
  asesorAjeno = await entrar(ajena, "asesor", [ajena.sucursales[0]!.id]);
  const H: [number, number, number] = [3, 960, 1020]; // miércoles 16:00
  grupoNorte = (await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "Programa Norte", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Grupo Norte", cupoMaximo: 10, horarios: [H] }], precio: { inscripcion: "500.00", mensualidad: "800.00" } })).grupos[0]!.id;
  grupoSur = (await sembrarPrograma(prisma, org, { sucursalId: sur, nombre: "Programa Sur", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Grupo Sur", cupoMaximo: 10, horarios: [H] }], precio: { inscripcion: "500.00", mensualidad: "800.00" } })).grupos[0]!.id;
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

/** Un lead con su prospecto, una tarea, una conversación y (a pedido) un movimiento viejo para que cuente como estancado. */
async function lead(o: OrganizacionDePrueba, sucursalId: string | null, nombre: string) {
  const f = await sembrarFamilia(prisma, o, { sucursalId, nombre, edad: 8 });
  const conv = await prisma.conversacion.create({ data: { organizacion_id: o.organizacionId, bandeja_chatwoot_id: o.bandejaId, lead_id: f.leadId, chatwoot_conversacion_id: randomInt(1, 2_000_000_000) } });
  const tarea = await prisma.tarea_asesor.create({ data: { organizacion_id: o.organizacionId, lead_id: f.leadId, conversacion_id: conv.id, tipo: "revision_manual", descripcion: `Revisar a ${nombre}` } });
  return { ...f, conversacionId: conv.id, tareaId: tarea.id };
}

interface Pagina { datos: { id: string; lead_id?: string }[]; paginacion: { total: number } }
const ids = (r: { cuerpo: unknown }): string[] => (r.cuerpo as Pagina).datos.map((d) => d.id);

test("la regla pura: el asesor ve sus sucursales y los sin sucursal; recepción y maestro solo las suyas; el administrador todo", async () => {
  const { condicionDeLead, veLeadDeSucursal } = await import("./alcance.ts");
  assert.equal(condicionDeLead({ todas: true }), undefined);
  assert.deepEqual(condicionDeLead({ todas: false, sucursalIds: ["a", "b"], leadsSinSucursal: true }), { OR: [{ sucursal_interes_id: null }, { sucursal_interes_id: { in: ["a", "b"] } }] });
  assert.deepEqual(condicionDeLead({ todas: false, sucursalIds: ["a"] }), { sucursal_interes_id: { in: ["a"] } });
  assert.deepEqual(condicionDeLead({ todas: false, sucursalIds: [], leadsSinSucursal: true }), { OR: [{ sucursal_interes_id: null }, { sucursal_interes_id: { in: [] } }] });
  const asesor = { todas: false as const, sucursalIds: ["a"], leadsSinSucursal: true };
  const recepcionAlcance = { todas: false as const, sucursalIds: ["a"] };
  assert.deepEqual([veLeadDeSucursal(asesor, null), veLeadDeSucursal(asesor, "a"), veLeadDeSucursal(asesor, "b")], [true, true, false]);
  assert.deepEqual([veLeadDeSucursal(recepcionAlcance, null), veLeadDeSucursal(recepcionAlcance, "a"), veLeadDeSucursal(recepcionAlcance, "b")], [false, true, false]);
  assert.deepEqual([veLeadDeSucursal({ todas: true }, null), veLeadDeSucursal({ todas: true }, "z")], [true, true]);
});

test("el listado: todos los asesores ven al lead sin sucursal (también el que no tiene ninguna sucursal asignada); recepción y el maestro no; el administrador sí", async () => {
  const sin = await lead(org, null, "Sin sucursal A");
  const delNorte = await lead(org, norte, "De Norte A");
  const delSur = await lead(org, sur, "De Sur A");
  const lista = async (c: ClienteApi, q = "") => ids(await c.get(`/api/leads?limite=100${q}`));
  for (const [nombre, c] of [["asesor Norte", asesorNorte], ["asesor Sur", asesorSur], ["asesor sin sucursales", asesorSinSucursales]] as const) {
    assert.ok((await lista(c)).includes(sin.leadId), `${nombre} ve al lead sin sucursal`);
  }
  assert.ok((await lista(asesorNorte)).includes(delNorte.leadId) && !(await lista(asesorNorte)).includes(delSur.leadId));
  assert.ok((await lista(asesorSur)).includes(delSur.leadId) && !(await lista(asesorSur)).includes(delNorte.leadId));
  assert.ok(!(await lista(asesorSinSucursales)).includes(delNorte.leadId), "sin sucursales asignadas solo ve lo que no tiene sucursal");
  assert.ok(!(await lista(recepcion)).includes(sin.leadId), "recepción conserva su alcance: un lead sin sucursal no es de ninguna");
  assert.ok((await lista(recepcion)).includes(delNorte.leadId) && (await lista(recepcion)).includes(delSur.leadId));
  assert.equal((await maestro.get("/api/leads")).estado, 403, "el maestro no ve leads");
  const todo = await lista(admin);
  assert.ok([sin.leadId, delNorte.leadId, delSur.leadId].every((id) => todo.includes(id)));
  // Pedir una sucursal concreta no mezcla a los que no tienen: sin sucursal no es de Norte.
  assert.ok(!(await lista(asesorNorte, `&sucursal_id=${norte}`)).includes(sin.leadId));
  assert.ok((await lista(asesorNorte, `&sucursal_id=${norte}`)).includes(delNorte.leadId));
  assert.deepEqual(await lista(asesorNorte, `&sucursal_id=${sur}`), [], "pedir la sucursal ajena no abre nada");
});

test("la ficha, el historial y mover de etapa: cualquier asesor puede ver Y atender al lead sin sucursal; recepción y maestro no", async () => {
  const sin = await lead(org, null, "Sin sucursal B");
  for (const c of [asesorNorte, asesorSur, asesorSinSucursales, admin]) {
    assert.equal((await c.get(`/api/leads/${sin.leadId}`)).estado, 200);
    assert.equal((await c.get(`/api/leads/${sin.leadId}/historial`)).estado, 200);
  }
  assert.equal((await recepcion.get(`/api/leads/${sin.leadId}`)).estado, 404);
  assert.equal((await recepcion.get(`/api/leads/${sin.leadId}/historial`)).estado, 404);
  assert.equal((await maestro.get(`/api/leads/${sin.leadId}`)).estado, 403);
  // Escritura: un asesor de OTRA sucursal puede atenderlo (la decisión conservadora: todos los asesores).
  const mover = await asesorSur.patch<{ cambio: boolean }>(`/api/leads/${sin.leadId}/etapa`, { etapa_id: etapas.contactado });
  assert.equal(mover.estado, 200);
  assert.equal(mover.cuerpo.cambio, true);
  assert.equal((await prisma.lead.findFirstOrThrow({ where: { id: sin.leadId } })).etapa_id, etapas.contactado);
  assert.equal((await recepcion.patch(`/api/leads/${sin.leadId}/etapa`, { etapa_id: etapas.nuevo })).estado, 403, "recepción no escribe leads");
});

test("estancados: el lead sin sucursal que lleva días sin movimiento sale a todos los asesores; el de otra sucursal, no", async () => {
  await prisma.etapa_pipeline.update({ where: { id: etapas.nuevo }, data: { dias_alerta_sin_movimiento: 2 } });
  const sin = await lead(org, null, "Sin sucursal C");
  const delSur = await lead(org, sur, "De Sur C");
  const viejo = new Date(AHORA.getTime() - 30 * 86_400_000);
  await prisma.lead.updateMany({ where: { id: { in: [sin.leadId, delSur.leadId] } }, data: { creado_en: viejo, ultima_interaccion_en: viejo } });
  const norteVe = ids(await asesorNorte.get("/api/leads/estancados?limite=100"));
  assert.ok(norteVe.includes(sin.leadId), "el asesor de Norte ve al estancado sin sucursal");
  assert.ok(!norteVe.includes(delSur.leadId));
  assert.ok(ids(await asesorSur.get("/api/leads/estancados?limite=100")).includes(sin.leadId));
  assert.ok(!ids(await recepcion.get("/api/leads/estancados?limite=100")).includes(sin.leadId), "recepción: no");
  assert.ok(ids(await admin.get("/api/leads/estancados?limite=100")).includes(sin.leadId));
});

test("cotizaciones: cualquier asesor lista y guarda la cotización de un lead sin sucursal (con un programa de SU sucursal); la cotización no le pone sucursal al lead", async () => {
  const sin = await lead(org, null, "Sin sucursal D");
  const deNorte = await prisma.programa.findFirstOrThrow({ where: { sucursal_id: norte, nombre: "Programa Norte" } });
  const deSur = await prisma.programa.findFirstOrThrow({ where: { sucursal_id: sur, nombre: "Programa Sur" } });
  assert.equal((await asesorNorte.get(`/api/leads/${sin.leadId}/cotizaciones`)).estado, 200);
  assert.equal((await asesorSur.get(`/api/leads/${sin.leadId}/cotizaciones`)).estado, 200);
  const alta = await asesorNorte.post<{ id: string; lead_id: string }>(`/api/leads/${sin.leadId}/cotizaciones`, { prospecto_id: sin.prospectoId, programa_id: deNorte.id });
  assert.equal(alta.estado, 201, JSON.stringify(alta.cuerpo));
  assert.equal(alta.cuerpo.lead_id, sin.leadId);
  const altaSur = await asesorSur.post(`/api/leads/${sin.leadId}/cotizaciones`, { prospecto_id: sin.prospectoId, programa_id: deSur.id });
  assert.equal(altaSur.estado, 201, JSON.stringify(altaSur.cuerpo));
  assert.equal((await prisma.lead.findFirstOrThrow({ where: { id: sin.leadId } })).sucursal_interes_id, null, "cotizar no elige sucursal: el lead sigue a la vista de todos los asesores");
  for (const c of [asesorNorte, asesorSur]) assert.equal(((await c.get<{ paginacion: { total: number } }>(`/api/leads/${sin.leadId}/cotizaciones`)).cuerpo).paginacion.total, 2);
});

test("las cotizaciones de un programa de OTRA sucursal siguen vetadas aunque el lead sea visible (el alcance del catálogo no cambia)", async () => {
  const sin = await lead(org, null, "Sin sucursal E");
  const programaSur = await prisma.programa.findFirstOrThrow({ where: { sucursal_id: sur, nombre: "Programa Sur" } });
  const r = await asesorNorte.post(`/api/leads/${sin.leadId}/cotizaciones`, { prospecto_id: sin.prospectoId, programa_id: programaSur.id });
  // `asesorNorte` NO ve la sucursal Sur: rechazo de validación (400) con el mensaje de siempre.
  assert.equal(r.estado, 400);
});

test("tareas y conversaciones del lead sin sucursal: las ven y resuelven todos los asesores; recepción no las ve; las del lead de otra sucursal siguen ocultas", async () => {
  const sin = await lead(org, null, "Sin sucursal F");
  const delSur = await lead(org, sur, "De Sur F");
  for (const c of [asesorNorte, asesorSur, asesorSinSucursales]) {
    assert.ok(ids(await c.get("/api/tareas?limite=100")).includes(sin.tareaId));
    assert.ok(ids(await c.get("/api/conversaciones?limite=100")).includes(sin.conversacionId));
  }
  assert.ok(!ids(await asesorNorte.get("/api/tareas?limite=100")).includes(delSur.tareaId));
  assert.ok(!ids(await asesorNorte.get("/api/conversaciones?limite=100")).includes(delSur.conversacionId));
  assert.ok(ids(await asesorSur.get("/api/tareas?limite=100")).includes(delSur.tareaId));
  assert.equal((await asesorNorte.patch(`/api/tareas/${delSur.tareaId}`, { estado: "hecha" })).estado, 404);
  assert.equal((await recepcion.patch(`/api/tareas/${sin.tareaId}`, { estado: "hecha" })).estado, 403);
  const resolver = await asesorSinSucursales.patch<{ estado: string }>(`/api/tareas/${sin.tareaId}`, { estado: "hecha" });
  assert.equal(resolver.estado, 200);
  assert.equal(resolver.cuerpo.estado, "hecha");
  // Filtrando por el lead (parámetro `lead_id`) tampoco se ve la tarea de uno ajeno.
  assert.deepEqual(ids(await asesorNorte.get(`/api/tareas?lead_id=${delSur.leadId}`)), []);
});

test("la conversión y la exportación de leads respetan lo mismo", async () => {
  const sin = await lead(org, null, "Sin sucursal G");
  const delSur = await lead(org, sur, "De Sur G");
  assert.equal((await asesorNorte.get(`/api/leads/${sin.leadId}/conversion`)).estado, 200);
  assert.equal((await asesorNorte.get(`/api/leads/${delSur.leadId}/conversion`)).estado, 404);
  const csv = async (c: ClienteApi) => Buffer.from((await c.descargar("/api/exportaciones/leads")).bytes).toString("utf8");
  const deAsesor = await csv(asesorNorte);
  assert.ok(deAsesor.includes(sin.telefono!), "el CSV del asesor trae al lead sin sucursal");
  assert.ok(!deAsesor.includes(delSur.telefono!), "…y no al de otra sucursal");
  assert.ok(!(await csv(recepcion)).includes(sin.telefono!), "recepción: no");
  const deAdmin = await csv(admin);
  assert.ok(deAdmin.includes(sin.telefono!) && deAdmin.includes(delSur.telefono!));
});

test("en cuanto el lead tiene sucursal, solo la ven los asesores de esa sucursal: agendar una clase en Norte se la pone", async () => {
  const sin = await lead(org, null, "Sin sucursal H");
  assert.equal((await asesorSur.get(`/api/leads/${sin.leadId}`)).estado, 200, "antes de agendar, el asesor de Sur lo ve");
  const sesiones = await asesorNorte.get<{ datos: { fecha_hora: string }[] }>(`/api/clases-muestra/sesiones?grupo_id=${grupoNorte}`);
  assert.equal(sesiones.estado, 200, JSON.stringify(sesiones.cuerpo));
  const agendada = await asesorNorte.post(`/api/clases-muestra`, { prospecto_id: sin.prospectoId, grupo_id: grupoNorte, fecha_hora: sesiones.cuerpo.datos[0]!.fecha_hora });
  assert.equal(agendada.estado, 201, JSON.stringify(agendada.cuerpo));
  assert.equal((await prisma.lead.findFirstOrThrow({ where: { id: sin.leadId } })).sucursal_interes_id, norte, "la clase le puso la sucursal del grupo");
  assert.equal((await asesorSur.get(`/api/leads/${sin.leadId}`)).estado, 404, "ya tiene sucursal: el asesor de Sur deja de verlo");
  assert.ok(!ids(await asesorSur.get("/api/leads?limite=100")).includes(sin.leadId));
  assert.ok(!ids(await asesorSur.get("/api/tareas?limite=100")).includes(sin.tareaId));
  assert.ok(!ids(await asesorSur.get("/api/conversaciones?limite=100")).includes(sin.conversacionId));
  assert.equal((await asesorSur.patch(`/api/leads/${sin.leadId}/etapa`, { etapa_id: etapas.negociacion })).estado, 404);
  assert.equal((await asesorNorte.get(`/api/leads/${sin.leadId}`)).estado, 200);
  assert.ok(ids(await recepcion.get("/api/leads?limite=100")).includes(sin.leadId), "recepción de Norte y Sur ya lo ve: tiene sucursal");
  // Y agendar en un grupo que el asesor no ve sigue siendo 404 (el alcance del catálogo no cambia).
  const otro = await lead(org, null, "Sin sucursal I");
  const s2 = await asesorSur.get<{ datos: { fecha_hora: string }[] }>(`/api/clases-muestra/sesiones?grupo_id=${grupoSur}`);
  assert.equal((await asesorNorte.post(`/api/clases-muestra`, { prospecto_id: otro.prospectoId, grupo_id: grupoSur, fecha_hora: s2.cuerpo.datos[0]!.fecha_hora })).estado, 404);
});

test("no-fuga entre organizaciones: el lead sin sucursal de una escuela no lo ve ningún asesor de otra, y al revés", async () => {
  const mio = await lead(org, null, "Sin sucursal J");
  const suyo = await lead(ajena, null, "Sin sucursal ajena");
  for (const ruta of [`/api/leads/${suyo.leadId}`, `/api/leads/${suyo.leadId}/historial`, `/api/leads/${suyo.leadId}/cotizaciones`, `/api/leads/${suyo.leadId}/conversion`]) {
    assert.equal((await asesorNorte.get(ruta)).estado, 404, `${ruta} desde otra escuela`);
    assert.equal((await admin.get(ruta)).estado, 404, `${ruta} (ni el administrador de otra escuela)`);
  }
  assert.equal((await asesorNorte.patch(`/api/leads/${suyo.leadId}/etapa`, { etapa_id: etapas.contactado })).estado, 404);
  assert.ok(!ids(await asesorNorte.get("/api/leads?limite=100")).includes(suyo.leadId));
  assert.ok(!ids(await asesorNorte.get("/api/tareas?limite=100")).includes(suyo.tareaId));
  assert.ok(!ids(await asesorNorte.get("/api/conversaciones?limite=100")).includes(suyo.conversacionId));
  assert.ok(!(await Buffer.from((await asesorNorte.descargar("/api/exportaciones/leads")).bytes).toString("utf8")).includes(suyo.telefono!));
  // Y al revés.
  assert.equal((await asesorAjeno.get(`/api/leads/${mio.leadId}`)).estado, 404);
  assert.ok(!ids(await asesorAjeno.get("/api/leads?limite=100")).includes(mio.leadId));
  assert.ok(ids(await asesorAjeno.get("/api/leads?limite=100")).includes(suyo.leadId), "el asesor de la otra escuela sí ve el suyo sin sucursal");
});
