// C1 de punta a punta: salones, instructores y grupos por la API (permisos, alcance, validaciones,
// registro de cambios) y los CHOQUES de salón e instructor, tanto en la API (409 con detalle, también
// con dos peticiones simultáneas) como en la base (disparadores). Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi, type UsuarioDePrueba } from "../testutil/api.ts";
import { Barrera } from "../testutil/carrera.ts";
import { cargarCatalogo, choquesDeInstructor, choquesDeSalon } from "./verificacion.ts";
import { conAlcance } from "../datos/alcance.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let ajena: OrganizacionDePrueba;
let admin: ClienteApi;
let asesorNorte: ClienteApi;
let maestro: ClienteApi;
let recepcion: ClienteApi;
let maestroUsuario: UsuarioDePrueba;
let norte: string;
let sur: string;
let pNorte1: string;
let pNorte2: string;
let pSur: string;

const SEMANA = 2; // martes
const H = (dia: number, ini: number, fin: number) => ({ dia_semana: dia, hora_inicio_min: ini, hora_fin_min: fin });

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  org = await sembrarOrganizacion(prisma, "Ocupacion");
  ajena = await sembrarOrganizacion(prisma, "OcupacionAjena");
  norte = org.sucursales[0]!.id;
  sur = org.sucursales[1]!.id;
  const entrar = async (rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return { c, u };
  };
  admin = (await entrar("administrador")).c;
  asesorNorte = (await entrar("asesor", [norte])).c;
  recepcion = (await entrar("recepcion", [norte, sur])).c;
  const m = await entrar("maestro");
  maestro = m.c;
  maestroUsuario = m.u;
  const programa = (sucursal: string, nombre: string) =>
    prisma.programa.create({ data: { organizacion_id: org.organizacionId, vertical_id: org.verticalId, sucursal_id: sucursal, nombre, edad_min: 3, edad_max: 12 } });
  pNorte1 = (await programa(norte, "P norte 1")).id;
  pNorte2 = (await programa(norte, "P norte 2")).id;
  pSur = (await programa(sur, "P sur")).id;
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

interface Sal { id: string; sucursal_id: string; nombre: string; capacidad: number | null; activo: boolean }
interface Inst { id: string; nombre: string; telefono: string | null; correo: string | null; activo: boolean; usuario_id: string | null; sucursales: string[] }
interface Grp { id: string; nombre: string; salon_id: string | null; salon: { id: string; nombre: string } | null; instructor_id: string | null; activo: boolean; cupo_maximo: number; horarios: { dia_semana: number; hora_inicio_min: number; hora_fin_min: number }[] }
interface ErrorBody { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }

const crearSalon = async (sucursal: string, nombre: string, extra: object = {}): Promise<Sal> => {
  const r = await admin.post<Sal>("/api/salones", { sucursal_id: sucursal, nombre, ...extra });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  return r.cuerpo;
};
const crearInstructor = async (nombre: string, extra: object = {}): Promise<Inst> => {
  const r = await admin.post<Inst>("/api/instructores", { nombre, ...extra });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  return r.cuerpo;
};
const crearGrupo = (programa: string, nombre: string, extra: object = {}) => admin.post<Grp & ErrorBody>("/api/grupos", { programa_id: programa, nombre, cupo_maximo: 10, ...extra });
const grupoOk = async (programa: string, nombre: string, extra: object = {}): Promise<Grp> => {
  const r = await crearGrupo(programa, nombre, extra);
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  return r.cuerpo;
};
const registros = (entidadId: string) => prisma.registro_cambio.findMany({ where: { entidad_id: entidadId }, orderBy: [{ creado_en: "asc" }, { id: "asc" }] });

// ── Salones ────────────────────────────────────────────────────────────────────────────

test("salones: alta, lectura, cambio y baja lógica con registro; el nombre es único por sucursal viva", async () => {
  const s = await crearSalon(norte, "Salón A", { capacidad: 20 });
  assert.deepEqual([s.nombre, s.capacidad, s.activo, s.sucursal_id], ["Salón A", 20, true, norte]);
  assert.equal((await admin.post<ErrorBody>("/api/salones", { sucursal_id: norte, nombre: "Salón A" })).estado, 409, "mismo nombre en la sucursal");
  const otraSucursal = await crearSalon(sur, "Salón A");
  assert.notEqual(otraSucursal.id, s.id, "el mismo nombre en otra sucursal sí");
  assert.equal((await admin.post("/api/salones", { sucursal_id: randomUUID(), nombre: "X" })).estado, 400, "sucursal inexistente");
  assert.equal((await admin.post("/api/salones", { sucursal_id: ajena.sucursales[0]!.id, nombre: "X" })).estado, 400, "sucursal de otra organización");
  assert.equal((await admin.post("/api/salones", { sucursal_id: norte, nombre: "Y", capacidad: 0 })).estado, 400);
  assert.equal((await admin.post("/api/salones", { sucursal_id: norte, nombre: "Y", extra: 1 })).estado, 400, "campos desconocidos");

  const cambiado = await admin.patch<Sal>(`/api/salones/${s.id}`, { nombre: "Salón A2", capacidad: null });
  assert.equal(cambiado.estado, 200);
  assert.deepEqual([cambiado.cuerpo.nombre, cambiado.cuerpo.capacidad], ["Salón A2", null]);
  assert.equal((await admin.patch(`/api/salones/${s.id}`, {})).estado, 400);
  assert.equal((await admin.patch(`/api/salones/${randomUUID()}`, { nombre: "Z" })).estado, 404);

  assert.equal((await admin.delete(`/api/salones/${s.id}`)).estado, 204);
  assert.equal((await admin.get(`/api/salones/${s.id}`)).estado, 404);
  assert.ok((await prisma.salon.findFirstOrThrow({ where: { id: s.id } })).eliminado_en, "baja lógica: la fila sigue");
  assert.equal((await crearSalon(norte, "Salón A2")).nombre, "Salón A2", "el nombre de un salón dado de baja se puede volver a usar");

  const reg = await registros(s.id);
  assert.deepEqual(reg.map((x) => x.accion), ["crear", "actualizar", "eliminar"]);
  assert.deepEqual(reg[1]!.antes, { nombre: "Salón A", capacidad: 20 });
  assert.deepEqual(reg[1]!.despues, { nombre: "Salón A2", capacidad: null });
});

test("salones: un salón con grupos vivos no se da de baja (409) hasta que se le quita", async () => {
  const s = await crearSalon(norte, "Con grupo");
  const g = await grupoOk(pNorte1, "G con salón", { salon_id: s.id });
  const r = await admin.delete<ErrorBody>(`/api/salones/${s.id}`);
  assert.equal(r.estado, 409);
  assert.match(r.cuerpo.error.mensaje, /1 grupo/);
  assert.equal((await admin.patch(`/api/grupos/${g.id}`, { salon_id: null })).estado, 200);
  assert.equal((await admin.delete(`/api/salones/${s.id}`)).estado, 204);
});

test("lectura del catálogo: cualquier rol autenticado ve lo de su alcance; escribir es solo del administrador (403)", async () => {
  const sN = await crearSalon(norte, "Visible norte");
  const sS = await crearSalon(sur, "Visible sur");
  const ids = async (c: ClienteApi) => (await c.get<{ datos: Sal[] }>("/api/salones?limite=100")).cuerpo.datos.map((x) => x.id);
  const deAdmin = await ids(admin);
  assert.ok(deAdmin.includes(sN.id) && deAdmin.includes(sS.id));
  const deAsesor = await ids(asesorNorte);
  assert.ok(deAsesor.includes(sN.id) && !deAsesor.includes(sS.id), "el asesor ve solo su sucursal");
  assert.equal((await asesorNorte.get(`/api/salones/${sS.id}`)).estado, 404, "lo ajeno es 404, no 403");
  const deRecepcion = await ids(recepcion);
  assert.ok(deRecepcion.includes(sN.id) && deRecepcion.includes(sS.id));
  assert.deepEqual(await ids(maestro), [], "un maestro sin grupos no ve salones");
  for (const c of [asesorNorte, recepcion, maestro]) {
    assert.equal((await c.post("/api/salones", { sucursal_id: norte, nombre: "No" })).estado, 403);
    assert.equal((await c.patch(`/api/salones/${sN.id}`, { nombre: "No" })).estado, 403);
    assert.equal((await c.delete(`/api/salones/${sN.id}`)).estado, 403);
    assert.equal((await c.post("/api/instructores", { nombre: "No" })).estado, 403);
    assert.equal((await c.post("/api/grupos", { programa_id: pNorte1, nombre: "No", cupo_maximo: 5 })).estado, 403);
  }
  // Un maestro ve el catálogo de donde da clases.
  const inst = await crearInstructor("El maestro", { usuario_id: maestroUsuario.id, sucursales: [norte] });
  await grupoOk(pNorte2, "Grupo del maestro", { instructor_id: inst.id });
  assert.ok((await ids(maestro)).includes(sN.id), "ahora sí, por su grupo");
  assert.ok(!(await ids(maestro)).includes(sS.id));
  assert.deepEqual((await maestro.get<{ datos: Inst[] }>("/api/instructores")).cuerpo.datos.map((i) => i.id), [inst.id], "y solo se ve a sí mismo");
  assert.equal((await maestro.get(`/api/instructores/${inst.id}`)).estado, 200);
});

test("salones: no-fuga entre organizaciones (ni adivinando ids)", async () => {
  const mio = await crearSalon(norte, "Solo mío");
  const rb = await prisma.salon.create({ data: { organizacion_id: ajena.organizacionId, sucursal_id: ajena.sucursales[0]!.id, nombre: "De la otra" } });
  const lista = (await admin.get<{ datos: Sal[] }>("/api/salones?limite=100")).cuerpo.datos;
  assert.ok(lista.some((x) => x.id === mio.id) && !lista.some((x) => x.id === rb.id));
  assert.equal((await admin.get(`/api/salones/${rb.id}`)).estado, 404);
  assert.equal((await admin.patch(`/api/salones/${rb.id}`, { nombre: "Robo" })).estado, 404);
  assert.equal((await admin.delete(`/api/salones/${rb.id}`)).estado, 404);
  assert.equal((await prisma.salon.findFirstOrThrow({ where: { id: rb.id } })).nombre, "De la otra");
  // Un grupo no puede apuntar al salón de otra organización (400 por la API y rechazo de la base: el disparador o la FK compuesta).
  assert.equal((await crearGrupo(pNorte1, "Con salón ajeno", { salon_id: rb.id })).estado, 400);
  await assert.rejects(prisma.grupo.create({ data: { organizacion_id: org.organizacionId, programa_id: pNorte1, nombre: "FK", cupo_maximo: 5, salon_id: rb.id } }), /grupo_salon_otra_sucursal|salon_id_organizacion_id_fkey|Foreign key/i);
});

// ── Instructores ───────────────────────────────────────────────────────────────────────

test("instructores: teléfono normalizado, sucursales, usuario ligado único, cambios y baja lógica con registro", async () => {
  const i = await crearInstructor("Ana Instructora", { telefono: "+5215512345678", correo: "ANA@Ejemplo.TEST", sucursales: [norte, sur] });
  assert.equal(i.telefono, "+525512345678", "+521 se colapsa a +52 (invariante 7)");
  assert.equal(i.correo, "ana@ejemplo.test");
  assert.deepEqual([...i.sucursales].sort(), [norte, sur].sort());
  assert.equal((await admin.post("/api/instructores", { nombre: "Mala", telefono: "abc" })).estado, 400);
  assert.equal((await admin.post("/api/instructores", { nombre: "Mala", sucursales: [randomUUID()] })).estado, 400);
  assert.equal((await admin.post("/api/instructores", { nombre: "Mala", sucursales: [ajena.sucursales[0]!.id] })).estado, 400, "sucursal de otra organización");
  assert.equal((await admin.post("/api/instructores", { nombre: "Mala", usuario_id: randomUUID() })).estado, 400);
  const asesorUsuario = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor" });
  assert.equal((await admin.post("/api/instructores", { nombre: "Mala", usuario_id: asesorUsuario.id })).estado, 400, "solo se liga a un maestro");

  const m = await sembrarUsuario(prisma, org.organizacionId, { rol: "maestro" });
  const ligado = await crearInstructor("Ligado", { usuario_id: m.id });
  assert.equal((await admin.post("/api/instructores", { nombre: "Otro", usuario_id: m.id })).estado, 409, "un usuario, un instructor");
  assert.equal((await admin.patch(`/api/instructores/${ligado.id}`, { usuario_id: null })).estado, 200);

  const c = await admin.patch<Inst>(`/api/instructores/${i.id}`, { telefono: null, sucursales: [norte], activo: true, nombre: "Ana I." });
  assert.equal(c.estado, 200);
  assert.deepEqual([c.cuerpo.telefono, c.cuerpo.sucursales, c.cuerpo.nombre], [null, [norte], "Ana I."]);
  assert.equal((await prisma.instructor_sucursal.count({ where: { instructor_id: i.id, eliminado_en: null } })), 1);
  assert.equal((await prisma.instructor_sucursal.count({ where: { instructor_id: i.id } })), 2, "la que sobró quedó con baja lógica");

  assert.equal((await admin.delete(`/api/instructores/${i.id}`)).estado, 204);
  assert.equal((await admin.get(`/api/instructores/${i.id}`)).estado, 404);
  const reg = await registros(i.id);
  assert.deepEqual(reg.map((x) => x.accion), ["crear", "actualizar", "eliminar"]);
  assert.deepEqual(reg[1]!.despues, { nombre: "Ana I.", telefono: null, sucursales: [norte] });
});

test("instructores: no se da de baja, no se desactiva ni se le quita la sucursal mientras da grupos (409)", async () => {
  const i = await crearInstructor("Con grupo", { sucursales: [norte, sur] });
  const g = await grupoOk(pNorte1, "G de instructor", { instructor_id: i.id });
  assert.equal((await admin.delete(`/api/instructores/${i.id}`)).estado, 409);
  assert.equal((await admin.patch(`/api/instructores/${i.id}`, { activo: false })).estado, 409);
  const sinNorte = await admin.patch<ErrorBody>(`/api/instructores/${i.id}`, { sucursales: [sur] });
  assert.equal(sinNorte.estado, 409);
  assert.equal(sinNorte.cuerpo.error.detalles?.[0]?.campo, "sucursales");
  assert.equal((await admin.patch(`/api/instructores/${i.id}`, { sucursales: [norte] })).estado, 200);
  assert.equal((await admin.patch(`/api/grupos/${g.id}`, { instructor_id: null })).estado, 200);
  assert.equal((await admin.patch(`/api/instructores/${i.id}`, { activo: false })).estado, 200);
  assert.equal((await admin.delete(`/api/instructores/${i.id}`)).estado, 204);
});

test("instructores: alcance de lectura por sucursal (asesor ve los de su sucursal y los sin restricción) y no-fuga", async () => {
  const soloSur = await crearInstructor("Solo sur", { sucursales: [sur] });
  const soloNorte = await crearInstructor("Solo norte", { sucursales: [norte] });
  const libre = await crearInstructor("Sin restricción");
  const ids = async (c: ClienteApi) => (await c.get<{ datos: Inst[] }>("/api/instructores?limite=100")).cuerpo.datos.map((x) => x.id);
  const a = await ids(asesorNorte);
  assert.ok(a.includes(soloNorte.id) && a.includes(libre.id) && !a.includes(soloSur.id));
  assert.equal((await asesorNorte.get(`/api/instructores/${soloSur.id}`)).estado, 404);
  const ajeno = await prisma.instructor.create({ data: { organizacion_id: ajena.organizacionId, nombre: "De la otra" } });
  assert.ok(!(await ids(admin)).includes(ajeno.id));
  assert.equal((await admin.get(`/api/instructores/${ajeno.id}`)).estado, 404);
  const filtrado = (await admin.get<{ datos: Inst[] }>(`/api/instructores?sucursal_id=${sur}&limite=100`)).cuerpo.datos.map((x) => x.id);
  assert.ok(filtrado.includes(soloSur.id) && !filtrado.includes(soloNorte.id));
});

// ── Grupos: asignación, validación y choques ───────────────────────────────────────────

test("grupos: el salón tiene que ser de la sucursal del programa y el instructor tiene que dar clases ahí", async () => {
  const salonSur = await crearSalon(sur, "Salón del sur");
  const instSur = await crearInstructor("Del sur", { sucursales: [sur] });
  const r = await crearGrupo(pNorte1, "Mal armado", { salon_id: salonSur.id, instructor_id: instSur.id });
  assert.equal(r.estado, 400);
  assert.deepEqual(r.cuerpo.error.detalles?.map((d) => d.campo).sort(), ["instructor_id", "salon_id"]);
  assert.equal((await crearGrupo(pSur, "Bien armado", { salon_id: salonSur.id, instructor_id: instSur.id })).estado, 201);
  assert.equal((await crearGrupo(randomUUID(), "Sin programa")).estado, 400);
  // La base también lo garantiza (disparador), aunque se escriba sin la API.
  await assert.rejects(prisma.grupo.create({ data: { organizacion_id: org.organizacionId, programa_id: pNorte1, nombre: "Directo", cupo_maximo: 5, salon_id: salonSur.id } }), /grupo_salon_otra_sucursal/);
});

test("grupos: horarios inválidos o que se pisan dentro del mismo grupo → 400; nombre repetido en el programa → 409", async () => {
  assert.equal((await crearGrupo(pNorte1, "H mal", { horarios: [H(SEMANA, 700, 600)] })).estado, 400);
  assert.equal((await crearGrupo(pNorte1, "H mal", { horarios: [H(7, 600, 700)] })).estado, 400);
  assert.equal((await crearGrupo(pNorte1, "H mal", { horarios: [H(SEMANA, 600, 1500)] })).estado, 400);
  const pisados = await crearGrupo(pNorte1, "H pisados", { horarios: [H(SEMANA, 600, 700), H(SEMANA, 650, 750)] });
  assert.equal(pisados.estado, 400);
  assert.equal((await crearGrupo(pNorte1, "H contiguos", { horarios: [H(SEMANA, 600, 700), H(SEMANA, 700, 800)] })).estado, 201);
  assert.equal((await crearGrupo(pNorte1, "H contiguos")).estado, 409);
});

test("choque de SALÓN: 409 con el detalle de qué se pisa; terminar cuando la otra empieza, otro día, otro salón o grupo inactivo NO chocan", async () => {
  const salon = await crearSalon(norte, "Choque salón");
  const base = await grupoOk(pNorte1, "Base salón", { salon_id: salon.id, horarios: [H(SEMANA, 1020, 1080)] }); // martes 17:00-18:00
  const pisa = await crearGrupo(pNorte2, "Pisa salón", { salon_id: salon.id, horarios: [H(SEMANA, 1050, 1110)] });
  assert.equal(pisa.estado, 409);
  assert.equal(pisa.cuerpo.error.codigo, "conflicto");
  assert.equal(pisa.cuerpo.error.detalles?.length, 1);
  assert.equal(pisa.cuerpo.error.detalles?.[0]?.campo, "salon_id");
  assert.match(pisa.cuerpo.error.detalles?.[0]?.mensaje ?? "", /Base salón.*martes de 17:00 a 18:00.*17:30 a 18:30/);
  assert.equal(await prisma.grupo.count({ where: { organizacion_id: org.organizacionId, nombre: "Pisa salón" } }), 0, "no se creó nada");

  assert.equal((await crearGrupo(pNorte2, "Contiguo", { salon_id: salon.id, horarios: [H(SEMANA, 1080, 1140)] })).estado, 201, "empieza cuando la otra termina");
  assert.equal((await crearGrupo(pNorte2, "Otro día", { salon_id: salon.id, horarios: [H(3, 1020, 1080)] })).estado, 201);
  const otroSalon = await crearSalon(norte, "Otro salón");
  assert.equal((await crearGrupo(pNorte2, "Otro salón g", { salon_id: otroSalon.id, horarios: [H(SEMANA, 1020, 1080)] })).estado, 201);
  assert.equal((await crearGrupo(pNorte2, "Inactivo", { salon_id: salon.id, activo: false, horarios: [H(SEMANA, 1020, 1080)] })).estado, 201, "un grupo inactivo no ocupa");

  // Mover el horario del base para que choque con el contiguo → 409; el base queda como estaba.
  const mover = await admin.patch<ErrorBody>(`/api/grupos/${base.id}`, { horarios: [H(SEMANA, 1060, 1100)] });
  assert.equal(mover.estado, 409);
  const intacto = (await admin.get<{ datos: Grp[] }>("/api/grupos?limite=100")).cuerpo.datos.find((g) => g.id === base.id)!;
  assert.deepEqual(intacto.horarios, [H(SEMANA, 1020, 1080)]);
  // Reactivar el grupo inactivo que se pisa → 409; es la regla de siempre.
  const inactivo = (await prisma.grupo.findFirstOrThrow({ where: { organizacion_id: org.organizacionId, nombre: "Inactivo" } })).id;
  assert.equal((await admin.patch(`/api/grupos/${inactivo}`, { activo: true })).estado, 409);
});

test("choque de INSTRUCTOR: aunque sean sucursales distintas; el detalle señala al instructor", async () => {
  const inst = await crearInstructor("Itinerante");
  await grupoOk(pNorte1, "Itinerante norte", { instructor_id: inst.id, horarios: [H(4, 600, 660)] });
  const r = await crearGrupo(pSur, "Itinerante sur", { instructor_id: inst.id, horarios: [H(4, 630, 690)] });
  assert.equal(r.estado, 409);
  assert.equal(r.cuerpo.error.detalles?.[0]?.campo, "instructor_id");
  assert.match(r.cuerpo.error.detalles?.[0]?.mensaje ?? "", /instructor.*Itinerante norte.*jueves/);
  assert.equal((await crearGrupo(pSur, "Itinerante sur 2", { instructor_id: inst.id, horarios: [H(4, 660, 720)] })).estado, 201, "contiguo");
  // Asignar el instructor a un grupo YA existente con horario que choca.
  const otro = await grupoOk(pSur, "Existente sur", { horarios: [H(4, 600, 640)] });
  assert.equal((await admin.patch(`/api/grupos/${otro.id}`, { instructor_id: inst.id })).estado, 409);
  assert.equal((await admin.patch(`/api/grupos/${otro.id}`, { instructor_id: inst.id, horarios: [H(4, 900, 960)] })).estado, 200, "cambiando también el horario sí");
});

test("grupos: horarios REEMPLAZAN el conjunto (lo que sobra tiene baja lógica) y todo cambio deja registro", async () => {
  const salon = await crearSalon(norte, "Reemplazo");
  const g = await grupoOk(pNorte1, "Reemplazable", { salon_id: salon.id, horarios: [H(1, 600, 660), H(3, 600, 660)] });
  const r = await admin.patch<Grp>(`/api/grupos/${g.id}`, { horarios: [H(3, 600, 700), H(5, 600, 660)], cupo_maximo: 14, permite_lista_espera: true });
  assert.equal(r.estado, 200);
  assert.deepEqual(r.cuerpo.horarios, [H(3, 600, 700), H(5, 600, 660)]);
  assert.equal(r.cuerpo.cupo_maximo, 14);
  assert.equal(await prisma.grupo_horario.count({ where: { grupo_id: g.id } }), 4, "el del lunes y el del miércoles que cambió de hora quedaron con baja lógica");
  assert.equal(await prisma.grupo_horario.count({ where: { grupo_id: g.id, eliminado_en: null } }), 2);
  const reg = await registros(g.id);
  assert.deepEqual(reg.map((x) => x.accion), ["crear", "actualizar"]);
  assert.deepEqual(reg[1]!.despues, { cupo_maximo: 14, permite_lista_espera: true, horarios: ["3|600-700", "5|600-660"] });
  assert.equal((await admin.delete(`/api/grupos/${g.id}`)).estado, 204);
  assert.equal(await prisma.grupo_horario.count({ where: { grupo_id: g.id, eliminado_en: null } }), 0);
  assert.equal((await admin.get<{ datos: Grp[] }>("/api/grupos?limite=100")).cuerpo.datos.some((x) => x.id === g.id), false);
  assert.equal((await admin.patch(`/api/grupos/${g.id}`, { cupo_maximo: 3 })).estado, 404);
});

test("las verificaciones del catálogo (con la tabla salon) leen lo que armó la API: 0 choques de salón y de instructor", async () => {
  const c = await cargarCatalogo(conAlcance(prisma, org.organizacionId));
  assert.deepEqual(choquesDeSalon(c), []);
  assert.deepEqual(choquesDeInstructor(c), []);
});

// ── Concurrencia ───────────────────────────────────────────────────────────────────────

test("CARRERA: dos asignaciones simultáneas del mismo salón a la misma hora → una gana (200) y la otra recibe 409 CON detalle", async () => {
  const salon = await crearSalon(norte, "Carrera salón");
  const a = await grupoOk(pNorte1, "Carrera A", { horarios: [H(SEMANA, 900, 960)] });
  const b = await grupoOk(pNorte2, "Carrera B", { horarios: [H(SEMANA, 930, 990)] });
  const c1 = api.cliente();
  const c2 = api.cliente();
  const cuenta = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  await c1.login(org.slug, cuenta.correo, cuenta.contrasena);
  await c2.login(org.slug, cuenta.correo, cuenta.contrasena);
  const [r1, r2] = await Promise.all([c1.patch<Grp & ErrorBody>(`/api/grupos/${a.id}`, { salon_id: salon.id }), c2.patch<Grp & ErrorBody>(`/api/grupos/${b.id}`, { salon_id: salon.id })]);
  const estados = [r1.estado, r2.estado].sort();
  assert.deepEqual(estados, [200, 409], `ganó uno: ${JSON.stringify([r1.cuerpo, r2.cuerpo])}`);
  const perdedor = r1.estado === 409 ? r1 : r2;
  assert.equal(perdedor.cuerpo.error.codigo, "conflicto");
  assert.match(perdedor.cuerpo.error.detalles?.[0]?.mensaje ?? "", /ya está ocupado por el grupo «Carrera [AB]»/, "el perdedor ve a quién se pisa, no un error genérico de la base");
  assert.equal(await prisma.grupo.count({ where: { salon_id: salon.id } }), 1);
  const c = await cargarCatalogo(conAlcance(prisma, org.organizacionId));
  assert.deepEqual(choquesDeSalon(c), []);
});

test("CARRERA con 8 peticiones: del mismo instructor a la misma hora entra UN solo grupo", async () => {
  const inst = await crearInstructor("Carrera instructor");
  const grupos: Grp[] = [];
  for (let i = 0; i < 8; i++) grupos.push(await grupoOk(i % 2 === 0 ? pNorte1 : pNorte2, `Carrera I${i}`, { horarios: [H(5, 1000, 1060)] }));
  const clientes: ClienteApi[] = [];
  const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  for (let i = 0; i < 8; i++) {
    const c = api.cliente();
    await c.login(org.slug, u.correo, u.contrasena);
    clientes.push(c);
  }
  const rs = await Promise.all(grupos.map((g, i) => clientes[i]!.patch<ErrorBody>(`/api/grupos/${g.id}`, { instructor_id: inst.id })));
  assert.equal(rs.filter((r) => r.estado === 200).length, 1);
  assert.equal(rs.filter((r) => r.estado === 409).length, 7);
  assert.equal(await prisma.grupo.count({ where: { instructor_id: inst.id } }), 1);
});

test("la BASE por sí sola (disparador) impide el choque aun sin la API, y dos transacciones que compiten por el mismo salón: una gana", async () => {
  const salon = await prisma.salon.create({ data: { organizacion_id: org.organizacionId, sucursal_id: norte, nombre: "Directo" } });
  const mk = (programa: string, nombre: string) => prisma.grupo.create({ data: { organizacion_id: org.organizacionId, programa_id: programa, nombre, cupo_maximo: 5, salon_id: salon.id } });
  const g1 = await mk(pNorte1, "Directo 1");
  const g2 = await mk(pNorte2, "Directo 2");
  const horario = (grupoId: string, ini: number, fin: number) => ({ data: { organizacion_id: org.organizacionId, grupo_id: grupoId, dia_semana: 6, hora_inicio_min: ini, hora_fin_min: fin } });
  await prisma.grupo_horario.create(horario(g1.id, 600, 660));
  await assert.rejects(prisma.grupo_horario.create(horario(g2.id, 630, 700)), /choque_de_ocupacion/);
  await prisma.grupo_horario.create(horario(g2.id, 660, 700)); // contiguo: entra

  // Dos transacciones que miran «no hay nadie a esa hora» y compiten: el candado de la base las serializa.
  const g3 = await mk(pNorte1, "Directo 3");
  const g4 = await mk(pNorte2, "Directo 4");
  const barrera = new Barrera(2);
  const intento = (grupoId: string) =>
    prisma.$transaction(async (tx) => {
      await tx.grupo_horario.create(horario(grupoId, 800, 860)); // el disparador toma el candado aquí
      await barrera.esperar(400); // el otro queda esperando el candado hasta que este confirme
    });
  const resultados = await Promise.allSettled([intento(g3.id), intento(g4.id)]);
  assert.deepEqual(resultados.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
  const rechazada = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
  assert.match(String(rechazada.reason), /choque_de_ocupacion/);
  assert.equal(await prisma.grupo_horario.count({ where: { grupo_id: { in: [g3.id, g4.id] }, eliminado_en: null } }), 1);
});

test("EC-05: un salón con el nombre de otro cambiando mayúsculas, acentos o espacios es el MISMO salón: 409 al crear y al renombrar, y el nombre se guarda limpio", async () => {
  const base = await crearSalon(norte, "Sala Ñandú");
  for (const variante of ["sala ñandú", "SALA ÑANDÚ", "Sala  Ñandú", "Sala Nandu", " Sala\tÑandú \n"]) {
    const r = await admin.post<ErrorBody>("/api/salones", { sucursal_id: norte, nombre: variante });
    assert.equal(r.estado, 409, JSON.stringify(variante));
    assert.equal(r.cuerpo.error.detalles?.[0]?.campo, "nombre");
  }
  // Otra sucursal y otro nombre sí; y se guarda sin espacios de más.
  const otra = await crearSalon(sur, "Sala Ñandú");
  assert.notEqual(otra.id, base.id);
  const limpio = await crearSalon(norte, "  Sala   Dos  ");
  assert.equal(limpio.nombre, "Sala Dos");
  // Renombrar a la forma de otro salón vivo también se rechaza; cambiar la forma de sí mismo, no.
  assert.equal((await admin.patch<ErrorBody>(`/api/salones/${limpio.id}`, { nombre: "sala ñandu" })).estado, 409);
  assert.equal((await admin.patch<Sal>(`/api/salones/${limpio.id}`, { nombre: "SALA DOS" })).estado, 200, "su propia forma sí cambia");
  assert.equal((await admin.patch<Sal>(`/api/salones/${base.id}`, { nombre: "sala ñandú" })).estado, 200);
  // Dar de baja libera el nombre.
  assert.equal((await admin.delete(`/api/salones/${limpio.id}`)).estado, 204);
  assert.equal((await admin.post("/api/salones", { sucursal_id: norte, nombre: "Sala dos" })).estado, 201);
});

test("EC-05: altas simultáneas del mismo salón con nombres equivalentes dejan UNA sola fila (seis rondas de dieciséis)", async () => {
  // Dieciséis formas distintas del mismo nombre (cada letra de «sala» en mayúscula o minúscula): ninguna choca con otra en el índice único.
  for (let ronda = 0; ronda < 6; ronda++) {
    const nombres = Array.from({ length: 16 }, (_, i) => [..."sala"].map((c, j) => ((i >> j) & 1 ? c.toUpperCase() : c)).join("") + ` carrera ${ronda}`);
    const rs = await Promise.all(nombres.map((n) => admin.post<ErrorBody>("/api/salones", { sucursal_id: sur, nombre: n })));
    assert.equal(rs.filter((r) => r.estado === 201).length, 1, `ronda ${ronda}: ${JSON.stringify(rs.map((r) => r.estado))}`);
    assert.ok(rs.every((r) => r.estado === 201 || r.estado === 409));
    const filas = await prisma.salon.findMany({ where: { organizacion_id: org.organizacionId, sucursal_id: sur, eliminado_en: null, nombre: { in: nombres } } });
    assert.equal(filas.length, 1, `ronda ${ronda}`);
  }
});

// ── Los disparadores de la base, una propiedad por prueba (huecos de mutación S3 a S6 de la auditoría de C) ──────────

const horarioDirecto = (grupoId: string, dia: number, ini: number, fin: number) => ({ data: { organizacion_id: org.organizacionId, grupo_id: grupoId, dia_semana: dia, hora_inicio_min: ini, hora_fin_min: fin } });
const grupoDirecto = (programa: string, nombre: string, extra: Record<string, unknown> = {}) => prisma.grupo.create({ data: { organizacion_id: org.organizacionId, programa_id: programa, nombre, cupo_maximo: 5, ...extra } });

test("EC-09 (S3): la BASE serializa también al INSTRUCTOR: dos transacciones que le dan clase a la misma hora en salones distintos → una gana", async () => {
  const instructor = await prisma.instructor.create({ data: { organizacion_id: org.organizacionId, nombre: "Instructor directo" } });
  const s1 = await prisma.salon.create({ data: { organizacion_id: org.organizacionId, sucursal_id: norte, nombre: `Dir A ${randomUUID().slice(0, 4)}` } });
  const s2 = await prisma.salon.create({ data: { organizacion_id: org.organizacionId, sucursal_id: norte, nombre: `Dir B ${randomUUID().slice(0, 4)}` } });
  const g1 = await grupoDirecto(pNorte1, `Inst 1 ${randomUUID().slice(0, 4)}`, { salon_id: s1.id, instructor_id: instructor.id });
  const g2 = await grupoDirecto(pNorte2, `Inst 2 ${randomUUID().slice(0, 4)}`, { salon_id: s2.id, instructor_id: instructor.id });
  const barrera = new Barrera(2);
  const intento = (grupoId: string) =>
    prisma.$transaction(async (tx) => {
      await tx.grupo_horario.create(horarioDirecto(grupoId, 5, 1000, 1060)); // el disparador toma el candado del instructor aquí
      await barrera.esperar(400);
    });
  const resultados = await Promise.allSettled([intento(g1.id), intento(g2.id)]);
  assert.deepEqual(resultados.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
  assert.match(String((resultados.find((r) => r.status === "rejected") as PromiseRejectedResult).reason), /choque_de_ocupacion: el instructor/);
  assert.equal(await prisma.grupo_horario.count({ where: { grupo_id: { in: [g1.id, g2.id] }, eliminado_en: null } }), 1);
});

test("EC-09 (S4, S5, S6): en la base un grupo INACTIVO o un horario dado de baja no ocupan el salón; reactivarlos o restaurarlos vuelve a revisar el choque", async () => {
  const salon = await prisma.salon.create({ data: { organizacion_id: org.organizacionId, sucursal_id: norte, nombre: `Dir C ${randomUUID().slice(0, 4)}` } });
  const dia = 4;
  // S4: un grupo inactivo con horario no ocupa el salón.
  const inactivo = await grupoDirecto(pNorte1, `Inactivo ${randomUUID().slice(0, 4)}`, { salon_id: salon.id, activo: false });
  await prisma.grupo_horario.create(horarioDirecto(inactivo.id, dia, 600, 660));
  const activo = await grupoDirecto(pNorte2, `Activo ${randomUUID().slice(0, 4)}`, { salon_id: salon.id });
  await prisma.grupo_horario.create(horarioDirecto(activo.id, dia, 620, 680)); // se pisa con el inactivo y entra
  // ...pero reactivar al inactivo ahora sí choca.
  await assert.rejects(prisma.grupo.update({ where: { id: inactivo.id }, data: { activo: true } }), /choque_de_ocupacion/);

  // S5: un horario dado de baja de otro grupo no ocupa.
  const otro = await grupoDirecto(pNorte1, `Con baja ${randomUUID().slice(0, 4)}`, { salon_id: salon.id });
  const baja = await prisma.grupo_horario.create(horarioDirecto(otro.id, dia, 900, 960));
  await prisma.grupo_horario.update({ where: { id: baja.id }, data: { eliminado_en: new Date() } });
  const nuevo = await grupoDirecto(pNorte2, `Nuevo ${randomUUID().slice(0, 4)}`, { salon_id: salon.id });
  await prisma.grupo_horario.create(horarioDirecto(nuevo.id, dia, 920, 980)); // se pisa con el horario dado de baja y entra

  // S6: restaurar (quitar la baja) un horario que ahora choca se rechaza.
  await assert.rejects(prisma.grupo_horario.update({ where: { id: baja.id }, data: { eliminado_en: null } }), /choque_de_ocupacion/);
});
