// F1: tutor, alumno y su relación M:N (invariante 13). Postgres real, la app real: un tutor por teléfono normalizado (también bajo
// concurrencia), +521 = +52, segundo tutor, alcance por sucursal y por rol, aislamiento entre organizaciones y registro de cambios sin
// datos identificables.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { crearCifrador } from "../sensibles/cifrado.ts";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarFamilia, sembrarOrganizacion, sembrarDocumentosLegales, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let ajena: OrganizacionDePrueba;
let admin: ClienteApi;
let asesorNorte: ClienteApi;
let asesorSur: ClienteApi;
let recepcion: ClienteApi;
let maestro: ClienteApi;
let adminAjeno: ClienteApi;
let norte: string;
let sur: string;
const db = () => conAlcance(prisma, org.organizacionId);

interface Tutor { id: string; nombre: string; telefono: string; sucursal_id: string | null; alumnos: { alumno_id: string; nombre: string; parentesco: string; es_responsable_pago: boolean }[] }
interface Alumno { id: string; nombre: string; apellidos: string; edad: number | null; estatus: string; autoriza_uso_imagen?: boolean; tutores: { tutor_id: string; nombre: string; telefono?: string; correo?: string | null; parentesco: string; es_responsable_pago: boolean; puede_recoger: boolean }[] }
interface Lista<T> { datos: T[]; paginacion: { total: number } }
interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }

let n = 0;
const telefono = (): string => `+52551${String(100_000 + ++n * 7 + randomInt(0, 6)).padStart(7, "0")}`;
const alumnoBase = (extra: Record<string, unknown> = {}) => ({ nombre: `Alumno${++n}`, apellidos: "Prueba", fecha_nacimiento: "2018-05-04", ...extra });
const tutorNuevo = (tel = telefono(), extra: Record<string, unknown> = {}) => ({ nombre: "Rosa", apellidos: "Mena", telefono: tel, ...extra });

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => new Date("2026-10-20T18:00:00Z"), sensibles: { cifrador: crearCifrador(randomBytes(32)) } });
  org = await sembrarOrganizacion(prisma, "Familias");
  ajena = await sembrarOrganizacion(prisma, "Familias ajena");
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
  recepcion = await entrar(org, "recepcion", [norte]);
  maestro = await entrar(org, "maestro");
  adminAjeno = await entrar(ajena, "administrador");
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

test("alta de un alumno con su tutor: tutor y vínculo creados, el único tutor es el responsable de pago, y la edad sale de la fecha del acta", async () => {
  const tel = "+5215512340001"; // con el «1» de móvil: se guarda colapsado
  const r = await admin.post<Alumno>("/api/alumnos", alumnoBase({ nombre: "Mateo", sucursal_id: norte, tutores: [{ tutor: tutorNuevo(tel, { correo: "Rosa@Correo.test" }), parentesco: "madre" }] }));
  assert.equal(r.estado, 201);
  assert.equal(r.cuerpo.tutores.length, 1);
  assert.equal(r.cuerpo.tutores[0]!.telefono, "+525512340001");
  assert.equal(r.cuerpo.tutores[0]!.correo, "rosa@correo.test");
  assert.equal(r.cuerpo.tutores[0]!.es_responsable_pago, true, "sin otra marca, el único tutor es el responsable de pago");
  assert.equal(r.cuerpo.edad, 8, "nació el 2018-05-04; hoy es 2026-10-20");
  assert.equal(r.cuerpo.estatus, "activo");
  assert.equal(r.cuerpo.autoriza_uso_imagen, false, "sin respuesta registrada");
  const guardado = await prisma.tutor.findFirstOrThrow({ where: { organizacion_id: org.organizacionId, telefono: "+525512340001" } });
  assert.equal(guardado.sucursal_id, norte);
});

test("+521 y +52 son el mismo tutor: buscar con cualquier formato lo encuentra y crear otro con el mismo teléfono es un 409", async () => {
  const tel = telefono();
  const alta = await admin.post<Tutor>("/api/tutores", tutorNuevo(tel));
  assert.equal(alta.estado, 201);
  const con1 = `+521${tel.slice(3)}`;
  const diez = tel.slice(3);
  for (const forma of [tel, con1, diez, `+52 ${diez.slice(0, 2)} ${diez.slice(2, 6)} ${diez.slice(6)}`, `whatsapp:${con1}`]) {
    const r = await admin.get<Lista<Tutor>>(`/api/tutores?telefono=${encodeURIComponent(forma)}`);
    assert.equal(r.estado, 200, forma);
    assert.deepEqual(r.cuerpo.datos.map((t) => t.id), [alta.cuerpo.id], forma);
  }
  const duplicado = await admin.post<Errores>("/api/tutores", tutorNuevo(con1, { nombre: "Otra persona" }));
  assert.equal(duplicado.estado, 409);
  assert.match(duplicado.cuerpo.error.detalles?.[0]?.mensaje ?? "", new RegExp(alta.cuerpo.id), "le dice cuál es el tutor que ya existe");
  assert.equal(await prisma.tutor.count({ where: { organizacion_id: org.organizacionId, telefono: tel } }), 1);
  assert.equal((await admin.post("/api/tutores", tutorNuevo("12"))).estado, 400, "teléfono inválido");
  assert.equal((await prisma.tutor.findFirstOrThrow({ where: { id: alta.cuerpo.id } })).nombre, "Rosa", "el segundo intento no le pisó los datos");
});

test("la base rechaza un teléfono sin normalizar, aunque alguien se salte el código", async () => {
  await assert.rejects(() => prisma.tutor.create({ data: { organizacion_id: org.organizacionId, nombre: "X", telefono: "+5215599990000" } }), /tutor_telefono_check/);
  await assert.rejects(() => prisma.tutor.create({ data: { organizacion_id: org.organizacionId, nombre: "X", telefono: "5599990000" } }), /tutor_telefono_check/);
  const tel = telefono();
  await prisma.tutor.create({ data: { organizacion_id: org.organizacionId, nombre: "X", telefono: tel } });
  await assert.rejects(() => prisma.tutor.create({ data: { organizacion_id: org.organizacionId, nombre: "Y", telefono: tel } }), /Unique constraint/);
  // Dado de baja libera el teléfono (el índice es parcial).
  await prisma.tutor.updateMany({ where: { organizacion_id: org.organizacionId, telefono: tel }, data: { eliminado_en: new Date() } });
  await prisma.tutor.create({ data: { organizacion_id: org.organizacionId, nombre: "Z", telefono: tel } });
});

test("detección de familia: el segundo hijo con el mismo teléfono se liga al MISMO tutor, y el tutor lista a sus dos hijos", async () => {
  const tel = telefono();
  const a1 = await admin.post<Alumno>("/api/alumnos", alumnoBase({ nombre: "Uno", sucursal_id: norte, tutores: [{ tutor: tutorNuevo(tel), parentesco: "madre" }] }));
  const a2 = await admin.post<Alumno>("/api/alumnos", alumnoBase({ nombre: "Dos", sucursal_id: norte, tutores: [{ tutor: tutorNuevo(`+521${tel.slice(3)}`, { nombre: "Otro nombre" }), parentesco: "madre" }] }));
  assert.equal(a1.estado, 201);
  assert.equal(a2.estado, 201);
  assert.equal(a1.cuerpo.tutores[0]!.tutor_id, a2.cuerpo.tutores[0]!.tutor_id);
  assert.equal(a2.cuerpo.tutores[0]!.nombre, "Rosa", "el tutor que ya existía no se sobrescribe");
  const t = await admin.get<Tutor>(`/api/tutores/${a1.cuerpo.tutores[0]!.tutor_id}`);
  assert.deepEqual(t.cuerpo.alumnos.map((a) => a.nombre), ["Uno", "Dos"]);
  assert.equal(await prisma.tutor.count({ where: { organizacion_id: org.organizacionId, telefono: tel } }), 1);
  // Buscar al alumno por el teléfono de su familia (en cualquier formato) y por nombre.
  const porTel = await admin.get<Lista<Alumno>>(`/api/alumnos?telefono=${encodeURIComponent(tel.slice(3))}`);
  assert.deepEqual(porTel.cuerpo.datos.map((a) => a.nombre).sort(), ["Dos", "Uno"]);
  assert.deepEqual((await admin.get<Lista<Alumno>>("/api/alumnos?nombre=dos prueba")).cuerpo.datos.map((a) => a.id), [a2.cuerpo.id]);
  assert.deepEqual((await admin.get<Lista<Alumno>>(`/api/alumnos?tutor_id=${a1.cuerpo.tutores[0]!.tutor_id}&estatus=activo`)).cuerpo.paginacion.total, 2);
});

test("segundo tutor y abuela: se liga por teléfono (nuevo o existente), solo hay un responsable de pago y no se queda sin tutor", async () => {
  const a = await admin.post<Alumno>("/api/alumnos", alumnoBase({ sucursal_id: norte, tutores: [{ tutor: tutorNuevo(), parentesco: "madre", puede_recoger: true }] }));
  const id = a.cuerpo.id;
  const mama = a.cuerpo.tutores[0]!.tutor_id;
  // La abuela, con un tutor nuevo.
  const abuela = await recepcion.post<Alumno>(`/api/alumnos/${id}/tutores`, { tutor: { nombre: "Lupe", telefono: telefono() }, parentesco: "abuela", puede_recoger: true, es_contacto_urgencia: true });
  assert.equal(abuela.estado, 201);
  assert.deepEqual(abuela.cuerpo.tutores.map((t) => t.parentesco), ["madre", "abuela"]);
  const papa = await asesorNorte.post<Alumno>(`/api/alumnos/${id}/tutores`, { tutor: { nombre: "Raúl", telefono: telefono() }, parentesco: "padre", es_responsable_pago: true });
  assert.equal(papa.estado, 409, "ya hay un responsable de pago");
  // Pero se puede pasar la bandera: primero se la quita a la madre.
  assert.equal((await admin.patch(`/api/alumnos/${id}/tutores/${mama}`, { es_responsable_pago: false })).estado, 200);
  const papaOtraVez = await asesorNorte.post<Alumno>(`/api/alumnos/${id}/tutores`, { tutor: { nombre: "Raúl", telefono: telefono() }, parentesco: "padre", es_responsable_pago: true });
  assert.equal(papaOtraVez.estado, 201);
  // El mismo tutor dos veces → 409; un tutor_id y un tutor a la vez → 400.
  assert.equal((await admin.post(`/api/alumnos/${id}/tutores`, { tutor_id: mama, parentesco: "madre" })).estado, 409);
  assert.equal((await admin.post(`/api/alumnos/${id}/tutores`, { tutor_id: mama, tutor: tutorNuevo(), parentesco: "madre" })).estado, 400);
  // Quitar vínculos: se puede hasta el último.
  const tutores = papaOtraVez.cuerpo.tutores.map((t) => t.tutor_id);
  assert.equal((await admin.delete(`/api/alumnos/${id}/tutores/${tutores[0]!}`)).estado, 204);
  assert.equal((await admin.delete(`/api/alumnos/${id}/tutores/${tutores[1]!}`)).estado, 204);
  const ultimo = await admin.delete<Errores>(`/api/alumnos/${id}/tutores/${tutores[2]!}`);
  assert.equal(ultimo.estado, 409);
  assert.equal(await prisma.tutor_alumno.count({ where: { alumno_id: id, eliminado_en: null } }), 1);
  // El tutor con alumnos no se da de baja.
  assert.equal((await admin.delete(`/api/tutores/${tutores[2]!}`)).estado, 409);
});

test("no hay atajos tipo alumno.telefono_mama: ninguna columna de alumno guarda un teléfono ni un correo", async () => {
  const columnas = await prisma.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'alumno'`;
  const nombres = columnas.map((c) => c.column_name);
  assert.deepEqual(nombres.filter((c) => /telefono|correo|mama|papa|tutor|alergia|medicament|condicion|emergencia/.test(c)), []);
});

test("validación: fecha de nacimiento futura o absurda, antecedentes incoherentes, campos desconocidos, sin tutores, dos responsables de pago", async () => {
  const base = (extra: Record<string, unknown>) => alumnoBase({ sucursal_id: norte, tutores: [{ tutor: tutorNuevo(), parentesco: "madre" }], ...extra });
  const campos = async (cuerpo: unknown) => {
    const r = await admin.post<Errores>("/api/alumnos", cuerpo);
    assert.equal(r.estado, 400, JSON.stringify(cuerpo));
    return (r.cuerpo.error.detalles ?? []).map((d) => d.campo);
  };
  assert.deepEqual(await campos(base({ fecha_nacimiento: "2027-01-01" })), ["fecha_nacimiento"]);
  assert.deepEqual(await campos(base({ fecha_nacimiento: "1850-01-01" })), ["fecha_nacimiento"]);
  assert.deepEqual(await campos(base({ fecha_nacimiento: "2018-02-31" })), ["fecha_nacimiento"]);
  assert.deepEqual(await campos(base({ practico_antes: false, practico_donde: "Otra escuela" })), ["practico_antes"]);
  assert.deepEqual(await campos(base({ telefono_mama: "+525500000000" })), ["telefono_mama"]);
  assert.deepEqual(await campos(base({ alergias: "polen" })), ["alergias"], "la salud no entra por aquí");
  assert.deepEqual(await campos(base({ tutores: [] })), ["tutores"]);
  assert.deepEqual(await campos(base({ tutores: [{ tutor: tutorNuevo(), parentesco: "madre", es_responsable_pago: true }, { tutor: tutorNuevo(), parentesco: "padre", es_responsable_pago: true }] })), ["tutores"]);
  assert.deepEqual(await campos(base({ sucursal_id: "no-es-uuid" })), ["sucursal_id"]);
  // Una sucursal de otra organización no existe para esta.
  assert.deepEqual(await campos(base({ sucursal_id: ajena.sucursales[0]!.id })), ["sucursal_id"]);
  // Nada quedó a medias: ninguno de esos intentos dejó tutores ni alumnos.
  assert.equal(await prisma.alumno.count({ where: { organizacion_id: org.organizacionId, nombre: { startsWith: "Alumno" }, apellidos: "Prueba", fecha_nacimiento: { gte: new Date("2018-02-01"), lt: new Date("2018-03-01") } } }), 0);
});

test("CONCURRENCIA: 8 altas simultáneas del mismo tutor (formatos distintos) dejan UN tutor: una gana (201) y las demás reciben 409, nunca un 500", async () => {
  const barrera = new Barrera(8);
  const prismaConCarrera = conGanchos(prisma, { modelo: "tutor", operacion: "createMany", antes: () => barrera.esperar(1500) });
  const apiCarrera = levantarApi(prismaConCarrera, { reloj: () => new Date("2026-10-20T18:00:00Z") });
  try {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "recepcion", sucursales: [norte] });
    const tel = telefono();
    const clientes = await Promise.all(Array.from({ length: 8 }, async () => {
      const c = apiCarrera.cliente();
      assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
      return c;
    }));
    const formas = [tel, `+521${tel.slice(3)}`, tel.slice(3), `+52 ${tel.slice(3)}`];
    const respuestas = await Promise.all(clientes.map((c, i) => c.post("/api/tutores", tutorNuevo(formas[i % formas.length]!, { nombre: `Persona ${i}` }))));
    const estados = respuestas.map((r) => r.estado).sort();
    assert.deepEqual(estados, [201, 409, 409, 409, 409, 409, 409, 409]);
    assert.equal(await prisma.tutor.count({ where: { organizacion_id: org.organizacionId, telefono: tel } }), 1);
    assert.ok(barrera.completa, "las 8 llegaron al INSERT a la vez (la carrera fue real)");
  } finally {
    await apiCarrera.cerrar();
  }
});

test("CONCURRENCIA: 6 altas simultáneas de hermanos con el mismo tutor nuevo dejan UN tutor y seis alumnos ligados a él", async () => {
  const barrera = new Barrera(6);
  const prismaConCarrera = conGanchos(prisma, { modelo: "tutor", operacion: "createMany", antes: () => barrera.esperar(1500) });
  const apiCarrera = levantarApi(prismaConCarrera, { reloj: () => new Date("2026-10-20T18:00:00Z") });
  try {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "recepcion", sucursales: [norte] });
    const tel = telefono();
    const clientes = await Promise.all(Array.from({ length: 6 }, async () => {
      const c = apiCarrera.cliente();
      await c.login(org.slug, u.correo, u.contrasena);
      return c;
    }));
    const respuestas = await Promise.all(clientes.map((c, i) => c.post("/api/alumnos", alumnoBase({ nombre: `Hermano${i}`, tutores: [{ tutor: tutorNuevo(tel), parentesco: "madre" }] }))));
    assert.deepEqual(respuestas.map((r) => r.estado), [201, 201, 201, 201, 201, 201]);
    const tutores = await prisma.tutor.findMany({ where: { organizacion_id: org.organizacionId, telefono: tel } });
    assert.equal(tutores.length, 1);
    assert.equal(await prisma.tutor_alumno.count({ where: { tutor_id: tutores[0]!.id, eliminado_en: null } }), 6);
    assert.ok(barrera.completa);
  } finally {
    await apiCarrera.cerrar();
  }
});

test("alcance por sucursal: el asesor y recepción ven lo de sus sucursales (no lo del sur), el administrador todo, y lo ajeno es 404", async () => {
  const enNorte = await admin.post<Alumno>("/api/alumnos", alumnoBase({ nombre: "AlcanceNorte", sucursal_id: norte, tutores: [{ tutor: tutorNuevo(), parentesco: "madre" }] }));
  const enSur = await admin.post<Alumno>("/api/alumnos", alumnoBase({ nombre: "AlcanceSur", sucursal_id: sur, tutores: [{ tutor: tutorNuevo(), parentesco: "madre" }] }));
  const sinSucursal = await admin.post<Alumno>("/api/alumnos", alumnoBase({ nombre: "AlcanceNinguna", tutores: [{ tutor: tutorNuevo(), parentesco: "madre" }] }));
  assert.equal(enNorte.estado, 201);
  assert.equal(sinSucursal.estado, 201);
  const nombres = async (c: ClienteApi) => (await c.get<Lista<Alumno>>("/api/alumnos?nombre=Alcance&limite=100")).cuerpo.datos.map((a) => a.nombre).sort();
  assert.deepEqual(await nombres(admin), ["AlcanceNinguna", "AlcanceNorte", "AlcanceSur"]);
  assert.deepEqual(await nombres(asesorNorte), ["AlcanceNorte"]);
  assert.deepEqual(await nombres(recepcion), ["AlcanceNorte"]);
  assert.deepEqual(await nombres(asesorSur), ["AlcanceSur"]);
  assert.equal((await asesorNorte.get(`/api/alumnos/${enSur.cuerpo.id}`)).estado, 404);
  assert.equal((await asesorNorte.get(`/api/alumnos/${sinSucursal.cuerpo.id}`)).estado, 404, "sin sucursal solo lo ve el administrador");
  assert.equal((await asesorNorte.patch(`/api/alumnos/${enSur.cuerpo.id}`, { talla_uniforme: "M" })).estado, 404);
  assert.equal((await asesorNorte.post(`/api/alumnos/${enSur.cuerpo.id}/tutores`, { tutor: tutorNuevo(), parentesco: "tía" })).estado, 404);
  const tutorSur = enSur.cuerpo.tutores[0]!.tutor_id;
  assert.equal((await asesorNorte.get(`/api/tutores/${tutorSur}`)).estado, 404);
  assert.equal((await asesorNorte.patch(`/api/tutores/${tutorSur}`, { nombre: "Intruso" })).estado, 404);
  assert.equal((await asesorNorte.delete(`/api/tutores/${tutorSur}`)).estado, 404);
  assert.equal((await asesorNorte.get<Lista<Tutor>>(`/api/tutores?telefono=${encodeURIComponent(enSur.cuerpo.tutores[0]!.telefono!)}`)).cuerpo.datos.length, 0, "tampoco por teléfono");
  // Una sucursal fuera de su alcance no se puede usar para dar de alta.
  assert.equal((await asesorNorte.post("/api/alumnos", alumnoBase({ sucursal_id: sur, tutores: [{ tutor: tutorNuevo(), parentesco: "madre" }] }))).estado, 400);
  // El asesor de una sola sucursal da de alta en ella sin decirlo.
  const sinDecir = await asesorNorte.post<Alumno>("/api/alumnos", alumnoBase({ nombre: "AlcanceSinDecir", tutores: [{ tutor: tutorNuevo(), parentesco: "madre" }] }));
  assert.equal(sinDecir.estado, 201);
  assert.equal((await prisma.alumno.findFirstOrThrow({ where: { id: sinDecir.cuerpo.id } })).sucursal_id, norte);
  // Sus tutores existentes solo se pueden ligar si los ve.
  assert.equal((await asesorNorte.post("/api/alumnos", alumnoBase({ tutores: [{ tutor_id: tutorSur, parentesco: "madre" }] }))).estado, 404);
});

test("permisos por rol: el maestro no ve tutores ni escribe, y por ahora (sin inscripciones) no ve alumnos; sin sesión, 401", async () => {
  assert.equal((await maestro.get("/api/tutores")).estado, 403);
  assert.equal((await maestro.post("/api/tutores", tutorNuevo())).estado, 403);
  assert.equal((await maestro.post("/api/alumnos", alumnoBase({ tutores: [{ tutor: tutorNuevo(), parentesco: "madre" }] }))).estado, 403);
  assert.equal((await maestro.get<Lista<Alumno>>("/api/alumnos")).cuerpo.paginacion.total, 0, "falla cerrado: sin inscripción ningún alumno es suyo");
  assert.equal((await maestro.get("/api/alumnos?telefono=5512340001")).estado, 400, "el maestro no busca por teléfono");
  assert.equal((await api.cliente().get("/api/alumnos")).estado, 401);
});

test("aislamiento entre organizaciones: el mismo teléfono es un tutor distinto en cada una, y ninguna ve (ni adivinando ids) lo de la otra", async () => {
  const tel = telefono();
  const mio = await admin.post<Alumno>("/api/alumnos", alumnoBase({ nombre: "Propio", tutores: [{ tutor: tutorNuevo(tel), parentesco: "madre" }] }));
  const suyo = await adminAjeno.post<Alumno>("/api/alumnos", alumnoBase({ nombre: "Ajeno", tutores: [{ tutor: tutorNuevo(tel), parentesco: "madre" }] }));
  assert.equal(mio.estado, 201);
  assert.equal(suyo.estado, 201);
  assert.notEqual(mio.cuerpo.tutores[0]!.tutor_id, suyo.cuerpo.tutores[0]!.tutor_id);
  assert.equal((await admin.get(`/api/alumnos/${suyo.cuerpo.id}`)).estado, 404);
  assert.equal((await admin.get(`/api/tutores/${suyo.cuerpo.tutores[0]!.tutor_id}`)).estado, 404);
  assert.equal((await admin.post(`/api/alumnos/${mio.cuerpo.id}/tutores`, { tutor_id: suyo.cuerpo.tutores[0]!.tutor_id, parentesco: "tía" })).estado, 404);
  assert.deepEqual((await admin.get<Lista<Alumno>>(`/api/alumnos?telefono=${encodeURIComponent(tel)}`)).cuerpo.datos.map((a) => a.nombre), ["Propio"]);
  // La base: un vínculo entre un tutor de una organización y un alumno de otra es imposible (FK compuesta).
  await assert.rejects(() => prisma.tutor_alumno.create({ data: { organizacion_id: org.organizacionId, tutor_id: suyo.cuerpo.tutores[0]!.tutor_id, alumno_id: mio.cuerpo.id, parentesco: "x" } }), /Foreign key constraint/);
});

test("cambios: PATCH de tutor y alumno, teléfono repetido = 409 sin cambios, y el registro de cambios guarda QUÉ campos se tocaron pero ningún valor identificable", async () => {
  const a = await admin.post<Alumno>("/api/alumnos", alumnoBase({ nombre: "Cambiante", apellidos: "Valdivia", sucursal_id: norte, tutores: [{ tutor: tutorNuevo(), parentesco: "madre" }] }));
  const tutorId = a.cuerpo.tutores[0]!.tutor_id;
  const otro = await admin.post<Tutor>("/api/tutores", tutorNuevo(telefono(), { nombre: "Existente" }));
  const nuevoTel = telefono();
  const p = await recepcion.patch<Tutor>(`/api/tutores/${tutorId}`, { telefono: `+521${nuevoTel.slice(3)}`, correo: "nuevo@correo.test", direccion: "Calle Secreta 123" });
  assert.equal(p.estado, 200);
  assert.equal(p.cuerpo.telefono, nuevoTel);
  const choque = await recepcion.patch<Errores>(`/api/tutores/${tutorId}`, { telefono: otro.cuerpo.telefono, nombre: "No debe cambiar" });
  assert.equal(choque.estado, 409);
  assert.equal((await prisma.tutor.findFirstOrThrow({ where: { id: tutorId } })).nombre, "Rosa", "un 409 no cambia nada");
  assert.equal((await recepcion.patch(`/api/tutores/${tutorId}`, {})).estado, 400, "vacío");
  const pa = await asesorNorte.patch<Alumno>(`/api/alumnos/${a.cuerpo.id}`, { talla_uniforme: "10", escuela_nombre: "Escuela Reservada", practico_antes: true, practico_donde: "Otro lugar" });
  assert.equal(pa.estado, 200);
  assert.equal((await asesorNorte.patch(`/api/alumnos/${a.cuerpo.id}`, { estatus: "baja" })).estado, 400, "el estatus no se edita a mano: lo mueven la inscripción y la baja");
  assert.equal((await asesorNorte.patch(`/api/alumnos/${a.cuerpo.id}`, { practico_antes: false })).estado, 400, "quien no practicó no tiene dónde (lo que ya había cuenta)");
  const cambios = await db().registro_cambio.findMany({ where: { entidad_id: { in: [tutorId, a.cuerpo.id] } }, orderBy: { creado_en: "asc" } });
  assert.ok(cambios.length >= 4);
  const texto = JSON.stringify(cambios.map((c) => [c.antes, c.despues]));
  for (const secreto of ["Valdivia", "Cambiante", "Rosa", nuevoTel, "nuevo@correo.test", "Calle Secreta", "Escuela Reservada", "Otro lugar"]) assert.ok(!texto.includes(secreto), `el registro de cambios no guarda «${secreto}»`);
  assert.ok(texto.includes("direccion") && texto.includes("telefono") && texto.includes("talla_uniforme"), "sí guarda cuáles campos se tocaron");
});

test("baja de un tutor sin alumnos: libera su teléfono para otro alta", async () => {
  const tel = telefono();
  const t = await admin.post<Tutor>("/api/tutores", tutorNuevo(tel));
  assert.equal((await admin.delete(`/api/tutores/${t.cuerpo.id}`)).estado, 204);
  assert.equal((await admin.get(`/api/tutores/${t.cuerpo.id}`)).estado, 404);
  assert.equal((await admin.post("/api/tutores", tutorNuevo(tel))).estado, 201);
  assert.equal(await prisma.tutor.count({ where: { id: t.cuerpo.id } }), 1, "nunca se borra físicamente");
});

test("el alumno guarda su salud solo en la ficha cifrada (sujeto alumno): la API de la familia nunca la devuelve, la ruta de salud sí con permiso y constancia", async () => {
  const a = await admin.post<Alumno>("/api/alumnos", alumnoBase({ sucursal_id: norte, tutores: [{ tutor: tutorNuevo(), parentesco: "madre" }] }));
  const put = await admin.pedir("PUT", `/api/salud/alumno/${a.cuerpo.id}`, { motivo: "alta", alergias: "CENTINELA-F1-ALERGIA", medicamentos: "CENTINELA-F1-MEDICAMENTO" });
  assert.ok([200, 204].includes(put.estado));
  for (const url of [`/api/alumnos/${a.cuerpo.id}`, `/api/tutores/${a.cuerpo.tutores[0]!.tutor_id}`, "/api/alumnos?limite=100", "/api/tutores?limite=100"]) {
    const r = await admin.get(url);
    assert.ok(!JSON.stringify(r.cuerpo).includes("CENTINELA-F1"), url);
  }
  const leida = await admin.get<{ campos: { alergias: string } }>(`/api/salud/alumno/${a.cuerpo.id}?motivo=prueba`);
  assert.equal(leida.cuerpo.campos.alergias, "CENTINELA-F1-ALERGIA");
  assert.equal((await asesorNorte.get(`/api/salud/alumno/${a.cuerpo.id}?motivo=prueba`)).estado, 403, "el asesor nunca lee salud");
  assert.equal((await maestro.get(`/api/salud/alumno/${a.cuerpo.id}?motivo=prueba`)).estado, 404, "el maestro solo la de SUS alumnos (sin inscripción, ninguno)");
  const filas = await prisma.$queryRaw<{ alergias: string | null }[]>`SELECT alergias FROM ficha_salud WHERE sujeto_id = ${a.cuerpo.id}::uuid`;
  assert.ok(filas[0]!.alergias && !filas[0]!.alergias.includes("CENTINELA"), "cifrada en la base");
  assert.ok((await db().acceso_dato_sensible.count({ where: { sujeto_id: a.cuerpo.id, sujeto_tipo: "alumno" } })) >= 3);
});

test("autoriza_uso_imagen se DERIVA de la última respuesta de la familia (aceptada → sí; revocada → no), nunca se edita", async () => {
  const docs = await sembrarDocumentosLegales(prisma, org);
  const fam = await sembrarFamilia(prisma, org, { sucursalId: norte });
  const a = await admin.post<Alumno>("/api/alumnos", alumnoBase({ sucursal_id: norte, tutores: [{ tutor: tutorNuevo(), parentesco: "madre" }] }));
  assert.equal((await admin.get<Alumno>(`/api/alumnos/${a.cuerpo.id}`)).cuerpo.autoriza_uso_imagen, false);
  await prisma.prospecto.update({ where: { id: fam.prospectoId }, data: { alumno_id: a.cuerpo.id } });
  const respuesta = (resultado: "aceptada" | "revocada") => prisma.aceptacion_legal.create({
    data: { organizacion_id: org.organizacionId, documento_id: docs.usoImagen, tipo: "uso_imagen", version_aceptada: 1, resultado, lead_id: fam.leadId, prospecto_id: fam.prospectoId, aceptante_nombre: "Rosa Mena", canal: "presencial", aceptado_en: new Date(), texto_hash: createHash("sha256").update("Texto de prueba de uso_imagen, versión 1.", "utf8").digest("hex") },
  });
  await respuesta("aceptada");
  assert.equal((await admin.get<Alumno>(`/api/alumnos/${a.cuerpo.id}`)).cuerpo.autoriza_uso_imagen, true);
  await respuesta("revocada");
  assert.equal((await admin.get<Alumno>(`/api/alumnos/${a.cuerpo.id}`)).cuerpo.autoriza_uso_imagen, false);
  assert.equal((await admin.patch(`/api/alumnos/${a.cuerpo.id}`, { autoriza_uso_imagen: true })).estado, 400);
});
