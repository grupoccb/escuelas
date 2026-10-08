// D2: la parte «en la aplicación» del aviso al maestro (la lista de avisos y el «visto», las clases del día y próximas de SUS grupos) y
// el instructor que responde por WhatsApp (no es un lead). Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { escenarioBot } from "../testutil/bot.ts";
import { OcupacionFija, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { correrCiclo } from "../ciclo.ts";
import { MessagingProvider, TransporteFalso } from "../mensajeria/index.ts";
import { soloOrganizaciones } from "../testutil/carrera.ts";
import { agendarClaseMuestra } from "./agenda.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";

// Lunes 2 de noviembre de 2026, 12:00 en la Ciudad de México.
const AHORA = new Date("2026-11-02T18:00:00Z");
const DIA = 24 * 3_600_000;

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let admin: ClienteApi;
let asesorNorte: ClienteApi;
let asesorSur: ClienteApi;
let recepcion: ClienteApi;
let maestroA: ClienteApi;
let maestroB: ClienteApi;
let norte: string;
let sur: string;
let grupoA: string;
let grupoB: string;
let grupoSur: string;
const db = () => conAlcance(prisma, org.organizacionId);

interface Aviso { id: string; tipo: string; entrega: string; motivo_entrega: string | null; leido_en: string | null; clase: { id: string; estatus: string; fecha_hora: string }; datos: Record<string, string> }
interface Lista<T> { datos: T[]; paginacion: { total: number } }
interface Clase { id: string; grupo_id: string; estatus: string; fecha_hora: string; telefono?: string | null; sesion: { fecha: string; hora: string } }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA });
  org = await sembrarOrganizacion(prisma, "App del maestro");
  await sembrarEmbudo(prisma, org);
  norte = org.sucursales[0]!.id;
  sur = org.sucursales[1]!.id;
  const entrar = async (rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return { c, id: u.id };
  };
  admin = (await entrar("administrador")).c;
  asesorNorte = (await entrar("asesor", [norte])).c;
  asesorSur = (await entrar("asesor", [sur])).c;
  recepcion = (await entrar("recepcion", [norte])).c;
  const a = await entrar("maestro");
  const b = await entrar("maestro");
  maestroA = a.c;
  maestroB = b.c;
  const iA = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: a.id, nombre: "Maestro A", telefono: "+525500000011" } });
  const iB = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: b.id, nombre: "Maestro B", telefono: "+525500000022" } });
  const pn = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "Programa norte", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Norte A", cupoMaximo: 20, horarios: [[3, 1080, 1140]] }, { nombre: "Norte B", cupoMaximo: 20, horarios: [[4, 1080, 1140]] }] });
  const ps = await sembrarPrograma(prisma, org, { sucursalId: sur, nombre: "Programa sur", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Sur A", cupoMaximo: 20, horarios: [[3, 1080, 1140]] }] });
  grupoA = pn.grupos[0]!.id;
  grupoB = pn.grupos[1]!.id;
  grupoSur = ps.grupos[0]!.id;
  await prisma.grupo.update({ where: { id: grupoA }, data: { instructor_id: iA.id } });
  await prisma.grupo.update({ where: { id: grupoB }, data: { instructor_id: iB.id } });
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

// miércoles 4 de noviembre 18:00 locales = jueves 5 00:00Z; jueves 5, 18:00 locales = viernes 6 00:00Z
const MIE = (semanas = 0): string => new Date(Date.UTC(2026, 10, 5, 0, 0) + semanas * 7 * DIA).toISOString();
const JUE = (semanas = 0): string => new Date(Date.UTC(2026, 10, 6, 0, 0) + semanas * 7 * DIA).toISOString();

async function agenda(grupoId: string, fecha: string, sucursalId = norte): Promise<Clase> {
  const f = await sembrarFamilia(prisma, org, { sucursalId });
  const r = await admin.post<Clase>("/api/clases-muestra", { prospecto_id: f.prospectoId, grupo_id: grupoId, fecha_hora: fecha });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  return r.cuerpo;
}

test("D2 app: el maestro ve SUS avisos (y solo los suyos), sin datos de salud, y puede marcarlos como vistos", async () => {
  const c1 = await agenda(grupoA, MIE(0));
  await agenda(grupoB, JUE(0));
  const mios = await maestroA.get<Lista<Aviso>>("/api/maestro/avisos");
  assert.equal(mios.estado, 200);
  const suyo = mios.cuerpo.datos.find((a) => a.clase.id === c1.id)!;
  assert.deepEqual([suyo.tipo, suyo.entrega, suyo.leido_en], ["agendada", "pendiente", null]);
  assert.deepEqual([suyo.datos["nombre_grupo"], suyo.datos["fecha_clase"], suyo.datos["hora_clase"]], ["Norte A", "miércoles 4 de noviembre", "18:00"]);
  assert.ok(mios.cuerpo.datos.every((a) => a.datos["nombre_grupo"] === "Norte A"), "solo los de su grupo");
  assert.equal(JSON.stringify(mios.cuerpo).match(/alergia|medicamento|condiciones|emergencia/i), null);
  // El otro maestro no ve los del primero.
  assert.ok((await maestroB.get<Lista<Aviso>>("/api/maestro/avisos")).cuerpo.datos.every((a) => a.datos["nombre_grupo"] === "Norte B"));

  // Marcar visto: idempotente, queda en el registro de cambios una sola vez.
  const visto = await maestroA.patch<Aviso>(`/api/maestro/avisos/${suyo.id}`, { visto: true });
  assert.equal(visto.estado, 200);
  assert.ok(visto.cuerpo.leido_en);
  const antes = visto.cuerpo.leido_en;
  const otra = await maestroA.patch<Aviso>(`/api/maestro/avisos/${suyo.id}`, { visto: true });
  assert.equal(otra.cuerpo.leido_en, antes, "no cambia la hora de la primera vez");
  assert.equal(await db().registro_cambio.count({ where: { entidad_tipo: "aviso_maestro", entidad_id: suyo.id } }), 1);
  // Filtros por visto / no visto.
  assert.ok((await maestroA.get<Lista<Aviso>>("/api/maestro/avisos?leidos=true")).cuerpo.datos.every((a) => a.leido_en !== null));
  assert.ok((await maestroA.get<Lista<Aviso>>("/api/maestro/avisos?leidos=false")).cuerpo.datos.every((a) => a.leido_en === null));
  assert.equal((await maestroA.get<Lista<Aviso>>("/api/maestro/avisos?leidos=true")).cuerpo.datos.some((a) => a.id === suyo.id), true);
  // Se puede desmarcar.
  const sin = await maestroA.patch<Aviso>(`/api/maestro/avisos/${suyo.id}`, { visto: false });
  assert.equal(sin.cuerpo.leido_en, null);
  assert.equal(await db().registro_cambio.count({ where: { entidad_tipo: "aviso_maestro", entidad_id: suyo.id } }), 2);
});

test("D2 app: lo ajeno responde 404, la validación 400 y los demás roles no entran", async () => {
  const c = await agenda(grupoA, MIE(1));
  const aviso = (await maestroA.get<Lista<Aviso>>("/api/maestro/avisos?limite=100")).cuerpo.datos.find((a) => a.clase.id === c.id)!;
  assert.equal((await maestroB.patch(`/api/maestro/avisos/${aviso.id}`, { visto: true })).estado, 404, "el aviso de otro maestro");
  assert.equal((await maestroA.patch("/api/maestro/avisos/00000000-0000-4000-8000-0000000000aa", { visto: true })).estado, 404);
  assert.equal((await maestroA.patch(`/api/maestro/avisos/${aviso.id}`, { visto: "si" })).estado, 400);
  assert.equal((await maestroA.patch(`/api/maestro/avisos/${aviso.id}`, {})).estado, 400);
  assert.equal((await maestroA.patch(`/api/maestro/avisos/${aviso.id}`, { visto: true, tipo: "x" })).estado, 400);
  assert.equal((await maestroA.get("/api/maestro/avisos?leidos=quizá")).estado, 400);
  for (const c2 of [asesorNorte, recepcion]) {
    assert.equal((await c2.get("/api/maestro/avisos")).estado, 403);
    assert.equal((await c2.patch(`/api/maestro/avisos/${aviso.id}`, { visto: true })).estado, 403);
  }
  assert.equal((await api.cliente().get("/api/maestro/avisos")).estado, 401);
  // El administrador no es un instructor: su lista está vacía y no puede marcar los de otro.
  assert.equal((await admin.get<Lista<Aviso>>("/api/maestro/avisos")).cuerpo.paginacion.total, 0);
  assert.equal((await admin.patch(`/api/maestro/avisos/${aviso.id}`, { visto: true })).estado, 404);
});

test("D2 app: reprogramar y cancelar avisan al maestro en su lista (con la fecha anterior)", async () => {
  const c = await agenda(grupoA, MIE(2));
  const rep = await admin.post<Clase>(`/api/clases-muestra/${c.id}/reprogramar`, { fecha_hora: MIE(3) });
  assert.equal(rep.estado, 201);
  await admin.post(`/api/clases-muestra/${rep.cuerpo.id}/cancelar`, { motivo: "ya no puede" });
  const lista = (await maestroA.get<Lista<Aviso>>("/api/maestro/avisos?limite=100")).cuerpo.datos;
  const deEsta = lista.filter((a) => a.clase.id === c.id || a.clase.id === rep.cuerpo.id);
  assert.deepEqual(deEsta.map((a) => a.tipo).sort(), ["agendada", "cancelada", "reprogramada"]);
  assert.equal(deEsta.find((a) => a.tipo === "reprogramada")!.datos["fecha_anterior"], "miércoles 18 de noviembre a las 18:00");
  assert.equal(deEsta.find((a) => a.tipo === "reprogramada")!.clase.estatus, "cancelada", "la clase de cada aviso se ve con su estatus de hoy");
});

test("D2 app: GET /maestro/clases-muestra — las de SUS grupos, del día y próximas (de hace 24 h a 14 días), sin teléfono", async () => {
  const dentro = await agenda(grupoA, MIE(0));
  const lejos = await agenda(grupoA, MIE(3)); // a 3 semanas: fuera de los 14 días
  const deB = await agenda(grupoB, JUE(0));
  const m = await maestroA.get<Lista<Clase>>("/api/maestro/clases-muestra?limite=100");
  assert.equal(m.estado, 200);
  const ids = m.cuerpo.datos.map((c) => c.id);
  assert.ok(ids.includes(dentro.id));
  assert.ok(!ids.includes(lejos.id), "fuera de la ventana por omisión");
  assert.ok(!ids.includes(deB.id), "de otro maestro");
  assert.ok(m.cuerpo.datos.every((c) => c.grupo_id === grupoA && c.telefono === undefined));
  assert.deepEqual(m.cuerpo.datos.map((c) => c.fecha_hora), [...m.cuerpo.datos.map((c) => c.fecha_hora)].sort(), "por fecha");
  // Con rango explícito aparece la lejana.
  const rango = await maestroA.get<Lista<Clase>>(`/api/maestro/clases-muestra?desde=${MIE(3)}&hasta=${MIE(3)}`);
  assert.deepEqual(rango.cuerpo.datos.map((c) => c.id), [lejos.id]);
  // Las canceladas no estorban por omisión, pero se pueden pedir.
  await admin.post(`/api/clases-muestra/${dentro.id}/cancelar`, {});
  assert.ok(!(await maestroA.get<Lista<Clase>>("/api/maestro/clases-muestra?limite=100")).cuerpo.datos.some((c) => c.id === dentro.id));
  assert.ok((await maestroA.get<Lista<Clase>>("/api/maestro/clases-muestra?estatus=cancelada&limite=100")).cuerpo.datos.some((c) => c.id === dentro.id));
  // El administrador ve las de todos; un asesor, las de su sucursal; recepción nada.
  const todas = await admin.get<Lista<Clase>>("/api/maestro/clases-muestra?limite=100");
  assert.ok(todas.cuerpo.datos.some((c) => c.id === deB.id));
  const cs = await agenda(grupoSur, MIE(0), sur);
  assert.ok(!(await asesorNorte.get<Lista<Clase>>("/api/maestro/clases-muestra?limite=100")).cuerpo.datos.some((c) => c.id === cs.id));
  assert.ok((await asesorSur.get<Lista<Clase>>("/api/maestro/clases-muestra?limite=100")).cuerpo.datos.some((c) => c.id === cs.id));
  assert.equal((await recepcion.get("/api/maestro/clases-muestra")).estado, 403);
  // Una clase de hace 25 h ya no está en «del día»; una de hace 23 h sí.
  assert.equal((await maestroA.get("/api/maestro/clases-muestra?desde=ayer")).estado, 400);
});

// ── El instructor que responde por WhatsApp ─────────────────────────────────────────────────────────────

test("D2 WhatsApp: lo que responde un instructor a su conversación NO crea un lead ni activa el bot: solo abre su ventana de 24 h", async () => {
  const e = await escenarioBot(prisma, { cotizador: false });
  const c = e.contacto("Maestra");
  const instructor = await prisma.instructor.create({ data: { organizacion_id: e.org.organizacionId, nombre: "Instructora", telefono: c.telefono } });
  // La escuela ya le abrió una conversación (por un aviso).
  await prisma.conversacion_instructor.create({ data: { organizacion_id: e.org.organizacionId, instructor_id: instructor.id, bandeja_chatwoot_id: e.org.bandejaId, chatwoot_conversacion_id: c.chatwootConversacionId } });
  const cuando = new Date("2026-11-02T18:00:00Z");
  const r = await c.escribe("Gracias, enterada", cuando);
  assert.equal(r.resultado, "instructor");
  assert.equal(await e.db.lead.count(), 0);
  assert.equal(await e.db.conversacion.count(), 0);
  assert.equal(c.envios().length, 0, "el bot no le contesta");
  const ci = await e.db.conversacion_instructor.findFirstOrThrow({ where: { instructor_id: instructor.id } });
  assert.equal(ci.ventana_servicio_hasta?.toISOString(), "2026-11-03T18:00:00.000Z");
  // Un mensaje tardío (de antes) nunca acorta la ventana.
  await c.escribe("otro", new Date("2026-11-02T10:00:00Z"));
  assert.equal((await e.db.conversacion_instructor.findFirstOrThrow({ where: { id: ci.id } })).ventana_servicio_hasta?.toISOString(), "2026-11-03T18:00:00.000Z");
});

test("D2 WhatsApp: si el instructor escribe primero (conversación nueva con su teléfono) tampoco es un lead", async () => {
  const e = await escenarioBot(prisma, { cotizador: false });
  const c = e.contacto("Maestro");
  const instructor = await prisma.instructor.create({ data: { organizacion_id: e.org.organizacionId, nombre: "Instructor", telefono: c.telefono } });
  const r = await c.escribe("Hola, ¿a qué hora es la clase?", new Date("2026-11-02T18:00:00Z"));
  assert.equal(r.resultado, "instructor");
  assert.equal(await e.db.lead.count(), 0);
  assert.equal(await e.db.conversacion_instructor.count({ where: { instructor_id: instructor.id } }), 1);
  assert.equal(c.envios().length, 0);
});

test("D2 WhatsApp: quien tiene el teléfono de un instructor INACTIVO, o ya es un contacto de esa vertical, sigue siendo un lead", async () => {
  const e = await escenarioBot(prisma, { cotizador: false });
  const inactivo = e.contacto("Ex maestra");
  await prisma.instructor.create({ data: { organizacion_id: e.org.organizacionId, nombre: "Ex", telefono: inactivo.telefono, activo: false } });
  assert.equal((await inactivo.escribe("Hola", new Date("2026-11-02T18:00:00Z"))).resultado, "procesado");
  assert.equal(await e.db.lead.count(), 1);

  // Un contacto que ya existía como lead y después se vuelve instructor: su conversación sigue siendo la del lead.
  const lead = e.contacto("Mamá maestra");
  await lead.escribe("Hola", new Date("2026-11-02T18:00:00Z"));
  await prisma.instructor.create({ data: { organizacion_id: e.org.organizacionId, nombre: "Mamá", telefono: lead.telefono } });
  assert.equal((await lead.escribe("Luis", new Date("2026-11-02T18:05:00Z"))).resultado, "procesado");
  assert.equal(await e.db.conversacion_instructor.count(), 0);
});

test("D2 WhatsApp: el ciclo del minuto también manda los avisos pendientes", async () => {
  const org2 = await sembrarOrganizacion(prisma, "Ciclo avisos");
  const sucursalId = org2.sucursales[0]!.id;
  const instructor = await prisma.instructor.create({ data: { organizacion_id: org2.organizacionId, nombre: "Maestra Z", telefono: "+525500000077" } });
  const p = await sembrarPrograma(prisma, org2, { sucursalId, nombre: "P", edadMin: 3, edadMax: 12, grupos: [{ nombre: "G", horarios: [[3, 1080, 1140]] }] });
  await prisma.grupo.update({ where: { id: p.grupos[0]!.id }, data: { instructor_id: instructor.id } });
  await prisma.plantilla_mensaje.create({ data: { organizacion_id: org2.organizacionId, codigo: "aviso_maestro_agendada", content_sid: "HX0", categoria: "utility", clase_mensaje: "servicio", variables: [{ pos: 1, nombre: "nombre_alumno" }], cuerpo_referencia: "Nueva clase: {{1}}", estado_aprobacion: "aprobada" } });
  const u = await prisma.usuario.create({ data: { organizacion_id: org2.organizacionId, correo: `c-${Math.random()}@p.test`, nombre: "A", rol: "asesor", contrasena_hash: "x" } });
  const f = await sembrarFamilia(prisma, org2, { sucursalId });
  const db2 = conAlcance(prisma, org2.organizacionId);
  const r = await db2.$transaction((tx) => agendarClaseMuestra(tx, { ahora: AHORA, fuente: new OcupacionFija(), origen: { tipo: "usuario", usuarioId: u.id } }, { prospectoId: f.prospectoId, grupoId: p.grupos[0]!.id, fechaHora: new Date(MIE(0)) }));
  assert.ok(r.ok);
  const transporte = new TransporteFalso();
  const resumen = await correrCiclo({ prisma: soloOrganizaciones(prisma, [org2.organizacionId]), mensajeria: new MessagingProvider({ transporte, reloj: () => AHORA }), reloj: () => AHORA });
  assert.equal(resumen.avisosMaestro?.enviados, 1);
  assert.equal(transporte.envios.filter((x) => x.tipo === "plantilla").length, 1);
  assert.equal(resumen.errores, 0);
});
