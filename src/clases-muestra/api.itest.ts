// D1: la API de la clase muestra (agendar, reprogramar, cancelar, sesiones con lugar): permisos por rol, alcance por
// sucursal y por grupo del maestro, validación, registro de cambios, no-fuga y concurrencia. Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { OcupacionFija, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba, type TipoDeEtapa } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";

const AHORA = new Date("2026-11-02T18:00:00Z"); // lunes 2 de noviembre, 12:00 en la Ciudad de México (un futuro cercano: las cookies de sesión vencen con este reloj)
const LUNES_12 = "2026-11-09T16:00:00-06:00";
const LUNES_19 = "2026-11-16T16:00:00-06:00";
const LUNES_26 = "2026-11-23T16:00:00-06:00";
const MIERCOLES_14 = "2026-11-11T18:00:00-06:00";

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
let maestroB: ClienteApi;
let adminId: string;
let norte: string;
let sur: string;
let grupoNorte: string;
let grupoNorteB: string;
const fuente = new OcupacionFija();
const db = () => conAlcance(prisma, org.organizacionId);

interface Clase {
  id: string; lead_id: string; prospecto_id: string; prospecto: string | null; grupo_id: string; grupo: string; sucursal_id: string; zona_horaria: string;
  fecha_hora: string; sesion: { fecha: string; hora: string }; estatus: string; agendada_por: string; reprogramada_de_id: string | null; motivo_cancelacion: string | null;
  contacto?: string | null; telefono?: string | null;
}
interface Lista { datos: Clase[]; paginacion: { total: number } }
interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA, fuenteOcupacion: fuente });
  org = await sembrarOrganizacion(prisma, "API clase muestra");
  ajena = await sembrarOrganizacion(prisma, "API clase muestra ajena");
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
  const m = await entrar("maestro");
  maestro = m.c;
  const mb = await entrar("maestro");
  maestroB = mb.c;
  const pn = await sembrarPrograma(prisma, org, {
    sucursalId: norte,
    nombre: "Programa norte",
    edadMin: 3,
    edadMax: 12,
    grupos: [
      { nombre: "Norte A", cupoMaximo: 2, horarios: [[1, 960, 1020]] }, // lunes 16:00
      { nombre: "Norte B", cupoMaximo: 2, horarios: [[3, 1080, 1140]] }, // miércoles 18:00
    ],
  });
  await sembrarPrograma(prisma, org, { sucursalId: sur, nombre: "Programa sur", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Sur A", cupoMaximo: 2, horarios: [[1, 960, 1020]] }] });
  grupoNorte = pn.grupos[0]!.id;
  grupoNorteB = pn.grupos[1]!.id;
  // El maestro A imparte el grupo norte A; el maestro B, el norte B.
  const iA = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: m.id, nombre: "Maestro A" } });
  const iB = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, usuario_id: mb.id, nombre: "Maestro B" } });
  await prisma.grupo.update({ where: { id: grupoNorte }, data: { instructor_id: iA.id } });
  await prisma.grupo.update({ where: { id: grupoNorteB }, data: { instructor_id: iB.id } });
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

const familia = (sucursalId = norte, o: o = {}) => sembrarFamilia(prisma, org, { sucursalId, ...o });
type o = Parameters<typeof sembrarFamilia>[2];
const crear = (c: ClienteApi, prospectoId: string, grupoId: string, fecha: string, extra: object = {}) => c.post<Clase & Errores>("/api/clases-muestra", { prospecto_id: prospectoId, grupo_id: grupoId, fecha_hora: fecha, ...extra });
/** Un grupo nuevo con un cupo dado, para que cada prueba cuente sus lugares desde cero. */
async function grupoNuevo(cupo: number, sucursalId = norte, horarios: [number, number, number][] = [[1, 960, 1020]]): Promise<string> {
  const p = await sembrarPrograma(prisma, org, { sucursalId, nombre: `Programa ${Math.random()}`, edadMin: 3, edadMax: 12, grupos: [{ nombre: `Grupo ${Math.random()}`, cupoMaximo: cupo, horarios }] });
  return p.grupos[0]!.id;
}

test("D1 API: el asesor agenda; la respuesta trae la sesión en la hora de la sucursal y queda en el registro de cambios", async () => {
  const f = await familia();
  const r = await crear(asesorNorte, f.prospectoId, grupoNorte, LUNES_12, { notas: "Prefiere el fondo" });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.estatus, "agendada");
  assert.equal(r.cuerpo.fecha_hora, "2026-11-09T22:00:00.000Z");
  assert.deepEqual(r.cuerpo.sesion, { fecha: "lunes 9 de noviembre", hora: "16:00" });
  assert.equal(r.cuerpo.zona_horaria, "America/Mexico_City");
  assert.equal(r.cuerpo.agendada_por, "usuario");
  assert.equal(r.cuerpo.telefono, f.telefono);
  const cambios = await db().registro_cambio.findMany({ where: { entidad_tipo: "clase_muestra", entidad_id: r.cuerpo.id } });
  assert.equal(cambios.length, 1);
  assert.equal(cambios[0]!.accion, "crear");
  assert.equal(JSON.stringify(cambios[0]).includes("Prefiere el fondo"), false, "las notas (texto libre) no van al registro de cambios");
  // La etapa del lead se movió.
  assert.equal((await db().lead.findFirstOrThrow({ where: { id: f.leadId } })).etapa_id, etapas.muestra_agendada);
  // El mismo desfase en UTC, dicho de otra forma, es la misma sesión.
  const g = await familia();
  const z = await crear(asesorNorte, g.prospectoId, grupoNorte, "2026-11-09T22:00:00Z");
  assert.equal(z.estado, 201);
});

test("D1 API: permisos por rol — administrador y asesor escriben; el maestro solo lee; recepción nada", async () => {
  const f = await familia();
  const g = await grupoNuevo(5);
  assert.equal((await crear(maestro, f.prospectoId, g, LUNES_12)).estado, 403);
  assert.equal((await crear(recepcion, f.prospectoId, g, LUNES_12)).estado, 403);
  assert.equal((await recepcion.get("/api/clases-muestra")).estado, 403);
  assert.equal((await maestro.get("/api/clases-muestra")).estado, 200);
  assert.equal((await maestro.post("/api/clases-muestra/00000000-0000-4000-8000-0000000000aa/cancelar", {})).estado, 403);
  assert.equal((await maestro.post("/api/clases-muestra/00000000-0000-4000-8000-0000000000aa/reprogramar", { fecha_hora: LUNES_19 })).estado, 403);
  assert.equal((await crear(admin, f.prospectoId, g, LUNES_12)).estado, 201);
  const sinSesion = api.cliente();
  assert.equal((await sinSesion.get("/api/clases-muestra")).estado, 401);
});

test("D1 API: alcance — el asesor de otra sucursal no ve ni agenda (404); el administrador ve todo; lo de otra organización no existe", async () => {
  const f = await familia(norte);
  const g = await grupoNuevo(5);
  const r = await crear(asesorNorte, f.prospectoId, g, LUNES_12);
  assert.equal(r.estado, 201);
  const id = r.cuerpo.id;
  assert.equal((await asesorSur.get(`/api/clases-muestra/${id}`)).estado, 404);
  assert.equal((await asesorSur.post(`/api/clases-muestra/${id}/cancelar`, {})).estado, 404);
  assert.equal((await asesorSur.post(`/api/clases-muestra/${id}/reprogramar`, { fecha_hora: LUNES_19 })).estado, 404);
  assert.equal((await crear(asesorSur, f.prospectoId, g, LUNES_19)).estado, 404, "el lead y el grupo son del norte");
  const lista = await asesorSur.get<Lista>("/api/clases-muestra");
  assert.equal(lista.cuerpo.datos.some((c) => c.id === id), false);
  assert.equal((await asesorSur.get<Lista>(`/api/clases-muestra?sucursal_id=${norte}`)).cuerpo.datos.length, 0, "pedir una sucursal ajena no la deja ver");
  assert.equal((await admin.get(`/api/clases-muestra/${id}`)).estado, 200);
  assert.equal((await admin.get<Lista>(`/api/clases-muestra?sucursal_id=${norte}&prospecto_id=${f.prospectoId}`)).cuerpo.datos.length, 1);
  // Otra organización.
  const fa = await sembrarFamilia(prisma, ajena);
  assert.equal((await crear(admin, fa.prospectoId, g, LUNES_19)).estado, 404);
  assert.equal((await crear(admin, f.prospectoId, (await sembrarPrograma(prisma, ajena, { sucursalId: ajena.sucursales[0]!.id, nombre: "X", edadMin: 1, edadMax: 9, grupos: [{ nombre: "Y", horarios: [[1, 960, 1020]] }] })).grupos[0]!.id, LUNES_19)).estado, 404);
});

test("D1 API: el maestro solo ve las clases de SUS grupos y no ve cómo contactar a la familia", async () => {
  const f = await familia();
  const h = await familia();
  const enA = await crear(admin, f.prospectoId, grupoNorte, "2026-11-16T16:00:00-06:00");
  const enB = await crear(admin, h.prospectoId, grupoNorteB, MIERCOLES_14);
  assert.equal(enA.estado, 201, JSON.stringify(enA.cuerpo));
  assert.equal(enB.estado, 201, JSON.stringify(enB.cuerpo));
  const delA = await maestro.get<Lista>("/api/clases-muestra?limite=100");
  assert.ok(delA.cuerpo.datos.length >= 1);
  assert.ok(delA.cuerpo.datos.every((c) => c.grupo_id === grupoNorte), "solo su grupo");
  assert.ok(delA.cuerpo.datos.some((c) => c.id === enA.cuerpo.id));
  assert.ok(delA.cuerpo.datos.every((c) => c.telefono === undefined && c.contacto === undefined), "sin teléfono ni contacto");
  assert.equal((await maestro.get(`/api/clases-muestra/${enA.cuerpo.id}`)).estado, 200);
  assert.equal((await maestro.get(`/api/clases-muestra/${enB.cuerpo.id}`)).estado, 404);
  assert.equal((await maestroB.get(`/api/clases-muestra/${enB.cuerpo.id}`)).estado, 200);
  assert.equal((await maestro.get<Lista>(`/api/clases-muestra?grupo_id=${grupoNorteB}`)).cuerpo.datos.length, 0);
});

test("D1 API: validación — fecha sin zona, campos desconocidos, no es sesión, sin anticipación, fuera de horizonte, vertical ajena", async () => {
  const f = await familia();
  const g = await grupoNuevo(5);
  const mal = async (cuerpo: object, campo: string) => {
    const r = await asesorNorte.post<Errores>("/api/clases-muestra", cuerpo);
    assert.equal(r.estado, 400, JSON.stringify(cuerpo));
    assert.equal(r.cuerpo.error.codigo, "validacion");
    assert.ok(r.cuerpo.error.detalles?.some((d) => d.campo === campo), `${campo}: ${JSON.stringify(r.cuerpo)}`);
  };
  await mal({ prospecto_id: f.prospectoId, grupo_id: g, fecha_hora: "2026-11-09T16:00:00" }, "fecha_hora"); // sin zona
  await mal({ prospecto_id: f.prospectoId, grupo_id: g, fecha_hora: "12 de octubre" }, "fecha_hora");
  await mal({ prospecto_id: f.prospectoId, grupo_id: g, fecha_hora: LUNES_12, estatus: "asistio" }, "estatus");
  await mal({ grupo_id: g, fecha_hora: LUNES_12 }, "prospecto_id");
  await mal({ prospecto_id: "no-es-uuid", grupo_id: g, fecha_hora: LUNES_12 }, "prospecto_id");
  await mal({ prospecto_id: f.prospectoId, grupo_id: g, fecha_hora: LUNES_12, notas: "" }, "notas");
  await mal({ prospecto_id: f.prospectoId, grupo_id: g, fecha_hora: "2026-11-10T16:00:00-06:00" }, "fecha_hora"); // martes
  await mal({ prospecto_id: f.prospectoId, grupo_id: g, fecha_hora: "2026-11-09T17:00:00-06:00" }, "fecha_hora"); // hora que no es de inicio
  // Faltan 60 min para una sesión de las 13:00 (la anticipación mínima por omisión es de 120).
  const pronto = await grupoNuevo(5, norte, [[1, 780, 840]]);
  await mal({ prospecto_id: f.prospectoId, grupo_id: pronto, fecha_hora: "2026-11-02T13:00:00-06:00" }, "fecha_hora");
  // Un grupo de otra vertical que la del prospecto.
  const v2 = await prisma.vertical.create({ data: { organizacion_id: org.organizacionId, nombre: "Vertical dos", slug: `v-${Math.random()}` } });
  const p2 = await prisma.programa.create({ data: { organizacion_id: org.organizacionId, vertical_id: v2.id, sucursal_id: norte, nombre: "Programa dos", edad_min: 3, edad_max: 12 } });
  const g2 = await prisma.grupo.create({ data: { organizacion_id: org.organizacionId, programa_id: p2.id, nombre: "Grupo dos", cupo_maximo: 5 } });
  await prisma.grupo_horario.create({ data: { organizacion_id: org.organizacionId, grupo_id: g2.id, dia_semana: 1, hora_inicio_min: 960, hora_fin_min: 1020 } });
  await mal({ prospecto_id: f.prospectoId, grupo_id: g2.id, fecha_hora: LUNES_12 }, "grupo_id");
});

test("D1 API: la anticipación y el horizonte salen de la configuración de la organización", async () => {
  const f = await familia();
  const g = await grupoNuevo(5);
  // «Ahora» es el lunes 2 a las 12:00 local; la sesión de las 16:00 de ese día alcanza con 2 h de anticipación (faltan 4 h).
  const hoy = await crear(asesorNorte, f.prospectoId, g, "2026-11-02T16:00:00-06:00");
  assert.equal(hoy.estado, 201, JSON.stringify(hoy.cuerpo));
  const f2 = await familia();
  const lejos = await crear(asesorNorte, f2.prospectoId, g, "2027-02-01T16:00:00-06:00"); // 91 días
  assert.equal(lejos.estado, 400);
  assert.ok(lejos.cuerpo.error.detalles?.some((d) => d.campo === "fecha_hora"));
});

test("D1 API: sin lugar → 409; ya tiene una vigente en el grupo → 409; con lugar en otra sesión, sí", async () => {
  const g = await grupoNuevo(1);
  const [a, b] = [await familia(), await familia()];
  assert.equal((await crear(asesorNorte, a.prospectoId, g, LUNES_12)).estado, 201);
  const lleno = await crear(asesorNorte, b.prospectoId, g, LUNES_12);
  assert.equal(lleno.estado, 409);
  assert.equal(lleno.cuerpo.error.codigo, "conflicto");
  assert.equal((await crear(asesorNorte, a.prospectoId, g, LUNES_19)).estado, 409, "ya tiene una vigente en el grupo");
  assert.equal((await crear(asesorNorte, b.prospectoId, g, LUNES_19)).estado, 201);
});

test("D1 API: reprogramar y cancelar — transiciones, registro de cambios y el lugar que se libera", async () => {
  const g = await grupoNuevo(1);
  const [a, b] = [await familia(), await familia()];
  const r = await crear(asesorNorte, a.prospectoId, g, LUNES_12);
  assert.equal(r.estado, 201);
  const p = await asesorNorte.post<Clase & Errores>(`/api/clases-muestra/${r.cuerpo.id}/reprogramar`, { fecha_hora: LUNES_19 });
  assert.equal(p.estado, 201, JSON.stringify(p.cuerpo));
  assert.equal(p.cuerpo.reprogramada_de_id, r.cuerpo.id);
  assert.equal((await asesorNorte.get<Clase>(`/api/clases-muestra/${r.cuerpo.id}`)).cuerpo.estatus, "reagendada");
  // El lugar del 12 quedó libre para otra familia.
  assert.equal((await crear(asesorNorte, b.prospectoId, g, LUNES_12)).estado, 201);
  // La reagendada ya no se cancela ni se reprograma: 409.
  assert.equal((await asesorNorte.post(`/api/clases-muestra/${r.cuerpo.id}/cancelar`, {})).estado, 409);
  assert.equal((await asesorNorte.post(`/api/clases-muestra/${r.cuerpo.id}/reprogramar`, { fecha_hora: LUNES_26 })).estado, 409);
  // Reprogramar a una sesión llena: 409 y la clase sigue intacta.
  const c = await asesorNorte.post<Errores>(`/api/clases-muestra/${p.cuerpo.id}/reprogramar`, { fecha_hora: LUNES_12 });
  assert.equal(c.estado, 409);
  assert.equal((await asesorNorte.get<Clase>(`/api/clases-muestra/${p.cuerpo.id}`)).cuerpo.estatus, "agendada");
  // Cancelar.
  const x = await asesorNorte.post<Clase>(`/api/clases-muestra/${p.cuerpo.id}/cancelar`, { motivo: "Se mudó" });
  assert.equal(x.estado, 200);
  assert.deepEqual([x.cuerpo.estatus, x.cuerpo.motivo_cancelacion], ["cancelada", "Se mudó"]);
  assert.equal((await asesorNorte.post(`/api/clases-muestra/${p.cuerpo.id}/cancelar`, {})).estado, 409, "cancelar dos veces");
  const cambios = await db().registro_cambio.findMany({ where: { entidad_tipo: "clase_muestra", entidad_id: { in: [r.cuerpo.id, p.cuerpo.id] } }, orderBy: { creado_en: "asc" } });
  assert.deepEqual(cambios.map((c) => c.accion).sort(), ["actualizar", "actualizar", "crear", "crear"]);
  assert.ok(cambios.every((c) => c.usuario_id !== adminId), "registra a quien lo hizo");
  // Sin cuerpo en cancelar también sirve.
  const d = await crear(asesorNorte, a.prospectoId, g, LUNES_26);
  assert.equal((await asesorNorte.pedir("POST", `/api/clases-muestra/${d.cuerpo.id}/cancelar`, undefined, { "x-requested-with": "prueba" })).estado, 200);
});

test("D1 API: GET /sesiones lista las próximas sesiones con sus lugares (con o sin las llenas)", async () => {
  const g = await grupoNuevo(1);
  const a = await familia();
  assert.equal((await crear(asesorNorte, a.prospectoId, g, LUNES_12)).estado, 201);
  interface Sesiones { datos: { fecha_hora: string; lugares: number; fecha: string; hora: string }[]; zona_horaria: string }
  const s = await asesorNorte.get<Sesiones>(`/api/clases-muestra/sesiones?grupo_id=${g}&maximo=3`);
  assert.equal(s.estado, 200);
  assert.deepEqual(s.cuerpo.datos.map((x) => [x.fecha_hora, x.lugares, x.hora]), [["2026-11-02T22:00:00.000Z", 1, "16:00"], ["2026-11-16T22:00:00.000Z", 1, "16:00"], ["2026-11-23T22:00:00.000Z", 1, "16:00"]]);
  const todas = await asesorNorte.get<Sesiones>(`/api/clases-muestra/sesiones?grupo_id=${g}&maximo=2&incluir_llenas=true`);
  assert.deepEqual(todas.cuerpo.datos.map((x) => [x.fecha_hora, x.lugares]), [["2026-11-02T22:00:00.000Z", 1], ["2026-11-09T22:00:00.000Z", 0]]);
  assert.equal((await asesorSur.get(`/api/clases-muestra/sesiones?grupo_id=${g}`)).estado, 404, "grupo de otra sucursal");
  assert.equal((await maestro.get(`/api/clases-muestra/sesiones?grupo_id=${grupoNorteB}`)).estado, 404, "el maestro solo ve las de sus grupos");
  assert.equal((await maestro.get(`/api/clases-muestra/sesiones?grupo_id=${grupoNorte}`)).estado, 200);
  assert.equal((await asesorNorte.get(`/api/clases-muestra/sesiones`)).estado, 400);
  assert.equal((await asesorNorte.get(`/api/clases-muestra/sesiones?grupo_id=${g}&maximo=99`)).estado, 400);
});

test("D1 API: listado con filtros y paginación", async () => {
  const g = await grupoNuevo(10);
  const fs = [await familia(), await familia(), await familia()];
  for (const [i, f] of fs.entries()) assert.equal((await crear(asesorNorte, f.prospectoId, g, [LUNES_12, LUNES_19, LUNES_26][i]!)).estado, 201);
  const todas = await asesorNorte.get<Lista>(`/api/clases-muestra?grupo_id=${g}&limite=2&pagina=1`);
  assert.equal(todas.cuerpo.paginacion.total, 3);
  assert.deepEqual(todas.cuerpo.datos.map((c) => c.fecha_hora), ["2026-11-09T22:00:00.000Z", "2026-11-16T22:00:00.000Z"], "por fecha");
  const rango = await asesorNorte.get<Lista>(`/api/clases-muestra?grupo_id=${g}&desde=2026-11-16T00:00:00Z&hasta=2026-11-17T00:00:00Z`);
  assert.equal(rango.cuerpo.datos.length, 1);
  assert.equal((await asesorNorte.get<Lista>(`/api/clases-muestra?grupo_id=${g}&estatus=cancelada`)).cuerpo.datos.length, 0);
  assert.equal((await asesorNorte.get(`/api/clases-muestra?estatus=otra`)).estado, 400);
  assert.equal((await asesorNorte.get(`/api/clases-muestra?desde=ayer`)).estado, 400);
});

test("D1 API (concurrencia): seis asesores piden la última plaza de una sesión a la vez → un 201 y cinco 409", async () => {
  const g = await grupoNuevo(1);
  const familias = await Promise.all(Array.from({ length: 6 }, () => familia()));
  const clientes = [admin, asesorNorte, admin, asesorNorte, admin, asesorNorte];
  const res = await Promise.all(familias.map((f, i) => crear(clientes[i]!, f.prospectoId, g, LUNES_12)));
  assert.equal(res.filter((r) => r.estado === 201).length, 1, JSON.stringify(res.map((r) => r.estado)));
  assert.equal(res.filter((r) => r.estado === 409).length, 5);
  assert.equal(await db().clase_muestra.count({ where: { grupo_id: g, estatus: "agendada" } }), 1);
});

test("D1 API: ocupación inyectada — los inscritos también ocupan lugares de la sesión", async () => {
  const g = await grupoNuevo(2);
  fuente.fijar(g, 2);
  const f = await familia();
  assert.equal((await crear(asesorNorte, f.prospectoId, g, LUNES_12)).estado, 409);
  fuente.fijar(g, 1);
  assert.equal((await crear(asesorNorte, f.prospectoId, g, LUNES_12)).estado, 201);
});
