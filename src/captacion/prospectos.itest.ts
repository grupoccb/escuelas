// V3: los niños de un lead por la API (agregar, corregir, quitar). Postgres real, la app real.
//   · validación (nombre, fecha de nacimiento o edad coherentes), aviso de edad contra el catálogo y disciplina de interés;
//   · idempotencia: la misma clave, el mismo nombre con la misma fecha, y bajo carrera (8 altas iguales a la vez dejan UN niño);
//   · el tope de 10 niños, también bajo carrera;
//   · corregir y quitar con sus reglas (un alumno no se toca; una clase muestra agendada o una lista de espera lo impiden);
//   · alcance (el asesor del sur no ve el lead del norte; el lead sin sucursal lo ven todos los asesores) y no-fuga entre organizaciones;
//   · registro de cambios sin datos identificables, y salud: la API no la recibe y no aparece en logs, notas ni registro.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { colectarLogs } from "../testutil/logs.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { fijarConfiguracion, sembrarEmbudo, sembrarFamilia, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { MAXIMO_DE_NINOS_POR_LEAD } from "./prospectos.ts";

const AHORA = new Date("2026-11-10T18:00:00Z"); // 12:00 en la Ciudad de México; hoy = 2026-11-10
let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let otraOrg: OrganizacionDePrueba;
let admin: ClienteApi;
let adminOtra: ClienteApi;
let asesorNorte: ClienteApi;
let asesorSur: ClienteApi;
let recepcion: ClienteApi;
let maestro: ClienteApi;
let norte: string;
let sur: string;
let verticalB: string;
let programaId: string;
const db = () => conAlcance(prisma, org.organizacionId);

interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
interface Nino { id: string; lead_id: string; nombre: string; apellidos: string | null; fecha_nacimiento: string | null; edad: number | null; edad_declarada: number | null; origen: string; alumno_id: string | null; vertical: { id: string; nombre: string }; programa_sugerido?: { id: string; nombre: string } | null; repetido?: boolean; avisos?: string[] }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { reloj: () => AHORA });
  org = await sembrarOrganizacion(prisma, "Niños");
  otraOrg = await sembrarOrganizacion(prisma, "Niños ajena");
  await sembrarEmbudo(prisma, org);
  await sembrarEmbudo(prisma, otraOrg);
  norte = org.sucursales[0]!.id;
  sur = org.sucursales[1]!.id;
  // Una segunda disciplina que solo se ofrece en el norte.
  verticalB = (await prisma.vertical.create({ data: { organizacion_id: org.organizacionId, nombre: "Disciplina B", slug: "disciplina-b" } })).id;
  await prisma.sucursal_vertical.create({ data: { organizacion_id: org.organizacionId, sucursal_id: norte, vertical_id: verticalB } });
  // Un programa de 4 a 6 años en el norte (la regla de edad del catálogo).
  programaId = (await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "Programa chico", edadMin: 4, edadMax: 6, grupos: [{ nombre: "Grupo chico", cupoMaximo: 10, horarios: [[1, 600, 660]] }], precio: { inscripcion: "500.00", mensualidad: "800.00" } })).id;
  const entrar = async (o: OrganizacionDePrueba, rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, o.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  admin = await entrar(org, "administrador");
  adminOtra = await entrar(otraOrg, "administrador");
  asesorNorte = await entrar(org, "asesor", [norte]);
  asesorSur = await entrar(org, "asesor", [sur]);
  recepcion = await entrar(org, "recepcion", [norte]);
  maestro = await entrar(org, "maestro");
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

const leadNorte = () => sembrarFamilia(prisma, org, { sucursalId: norte, nombre: "Primero" });
const ruta = (leadId: string, resto = "") => `/api/leads/${leadId}/prospectos${resto}`;
const alta = (c: ClienteApi, leadId: string, cuerpo: Record<string, unknown>) => c.post<Nino & Errores>(ruta(leadId), cuerpo);
let n = 0;
const nombre = () => `Niño ${++n}-${randomUUID().slice(0, 6)}`;

test("el asesor agrega otro niño con nombre y fecha de nacimiento: queda como prospecto del asesor, con su edad cumplida, y la ficha lo lista", async () => {
  const L = await leadNorte();
  const r = await alta(asesorNorte, L.leadId, { nombre: "Sofía", apellidos: "Mena Ruiz", fecha_nacimiento: "2020-03-15" });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  assert.deepEqual([r.cuerpo.nombre, r.cuerpo.apellidos, r.cuerpo.fecha_nacimiento, r.cuerpo.edad, r.cuerpo.origen, r.cuerpo.alumno_id], ["Sofía", "Mena Ruiz", "2020-03-15", 6, "asesor", null]);
  assert.equal(r.cuerpo.vertical.id, org.verticalId, "sin disciplina, la del lead");
  assert.deepEqual(r.cuerpo.avisos, [], "6 años cae en el programa de 4 a 6");
  const fila = await db().prospecto.findFirstOrThrow({ where: { id: r.cuerpo.id } });
  assert.equal(fila.lead_id, L.leadId);
  assert.equal(fila.edad_declarada, 6);
  assert.equal(fila.fecha_nacimiento?.toISOString().slice(0, 10), "2020-03-15");
  const lista = await asesorNorte.get<{ datos: Nino[] }>(ruta(L.leadId));
  assert.deepEqual(lista.cuerpo.datos.map((x) => x.nombre), ["Primero", "Sofía"], "en orden de captura: el que ya estaba y luego el nuevo");
  // La ficha del lead trae a los dos niños con los datos que necesita la pantalla.
  const ficha = await asesorNorte.get<{ prospectos: Nino[] }>(`/api/leads/${L.leadId}`);
  assert.deepEqual(ficha.cuerpo.prospectos.map((x) => [x.nombre, x.apellidos, x.fecha_nacimiento]), [["Primero", null, null], ["Sofía", "Mena Ruiz", "2020-03-15"]]);
});

test("también se puede agregar solo con la edad que dice la familia, y el administrador puede agregar a cualquier lead", async () => {
  const L = await leadNorte();
  const r = await alta(admin, L.leadId, { nombre: "Leo", edad: 5 });
  assert.equal(r.estado, 201);
  assert.deepEqual([r.cuerpo.edad, r.cuerpo.fecha_nacimiento, r.cuerpo.edad_declarada], [5, null, 5]);
});

test("VALIDACIÓN: sin nombre, sin fecha ni edad, edad que no coincide con la fecha, fecha futura o absurda, edad fuera de rango y campos de más: 400 y no se guarda nada", async () => {
  const L = await leadNorte();
  const antes = await db().prospecto.count({ where: { lead_id: L.leadId } });
  const casos: [Record<string, unknown>, string][] = [
    [{ edad: 5 }, "nombre"],
    [{ nombre: "   ", edad: 5 }, "nombre"],
    [{ nombre: "X" }, "fecha_nacimiento"],
    [{ nombre: "X", fecha_nacimiento: "2020-03-15", edad: 9 }, "edad"],
    [{ nombre: "X", fecha_nacimiento: "2027-01-01" }, "fecha_nacimiento"],
    [{ nombre: "X", fecha_nacimiento: "1900-01-01" }, "fecha_nacimiento"],
    [{ nombre: "X", fecha_nacimiento: "2020-02-31" }, "fecha_nacimiento"],
    [{ nombre: "X", fecha_nacimiento: "15/03/2020" }, "fecha_nacimiento"],
    [{ nombre: "X", edad: 0 }, "edad"],
    [{ nombre: "X", edad: 120 }, "edad"],
    [{ nombre: "X", edad: 5.5 }, "edad"],
    [{ nombre: "X", edad: "cinco" }, "edad"],
    [{ nombre: "X", edad: 5, clave_idempotencia: "corta" }, "clave_idempotencia"],
    [{ nombre: "X", edad: 5, telefono_mama: "+525511112222" }, "telefono_mama"],
  ];
  for (const [cuerpo, campo] of casos) {
    const r = await alta(asesorNorte, L.leadId, cuerpo);
    assert.equal(r.estado, 400, JSON.stringify(cuerpo));
    assert.equal(r.cuerpo.error.codigo, "validacion");
    assert.ok(r.cuerpo.error.detalles?.some((d) => d.campo === campo), `${JSON.stringify(cuerpo)} → ${JSON.stringify(r.cuerpo.error.detalles)}`);
  }
  assert.equal(await db().prospecto.count({ where: { lead_id: L.leadId } }), antes);
});

test("AVISO de edad contra el catálogo: por su edad no hay programa en esa disciplina y sucursal → se guarda igual (201) con el aviso; si hay programa, sin aviso", async () => {
  const L = await leadNorte();
  const sin = await alta(asesorNorte, L.leadId, { nombre: nombre(), edad: 2 });
  assert.equal(sin.estado, 201);
  assert.equal(sin.cuerpo.avisos?.length, 1);
  assert.match(sin.cuerpo.avisos![0]!, /Por su edad \(2 años\) no hay un programa/);
  const con = await alta(asesorNorte, L.leadId, { nombre: nombre(), edad: 5 });
  assert.deepEqual(con.cuerpo.avisos, []);
});

test("DISCIPLINA de interés: la de otra vertical que la sucursal del lead ofrece se acepta; una que la sucursal no ofrece, una inexistente o de otra organización, no", async () => {
  const norteL = await leadNorte();
  const b = await alta(asesorNorte, norteL.leadId, { nombre: nombre(), edad: 5, vertical_id: verticalB });
  assert.equal(b.estado, 201, JSON.stringify(b.cuerpo));
  assert.equal(b.cuerpo.vertical.id, verticalB);
  const surL = await sembrarFamilia(prisma, org, { sucursalId: sur });
  const enSur = await alta(asesorSur, surL.leadId, { nombre: nombre(), edad: 5, vertical_id: verticalB });
  assert.equal(enSur.estado, 400);
  assert.match(enSur.cuerpo.error.detalles![0]!.mensaje, /no se ofrece en la sucursal/);
  assert.equal((await alta(asesorNorte, norteL.leadId, { nombre: nombre(), edad: 5, vertical_id: randomUUID() })).estado, 400);
  assert.equal((await alta(asesorNorte, norteL.leadId, { nombre: nombre(), edad: 5, vertical_id: otraOrg.verticalId })).estado, 400, "la disciplina de otra organización no existe aquí");
});

test("IDEMPOTENCIA: la misma clave devuelve el mismo niño (200, repetido) y no crea otro; la misma clave con otro niño es 409", async () => {
  const L = await leadNorte();
  const clave = `alta-${randomUUID()}`;
  const una = await alta(asesorNorte, L.leadId, { nombre: "Camila", fecha_nacimiento: "2019-08-01", clave_idempotencia: clave });
  assert.equal(una.estado, 201);
  const otra = await alta(asesorNorte, L.leadId, { nombre: "Camila", fecha_nacimiento: "2019-08-01", clave_idempotencia: clave });
  assert.equal(otra.estado, 200);
  assert.equal(otra.cuerpo.repetido, true);
  assert.equal(otra.cuerpo.id, una.cuerpo.id);
  const distinta = await alta(asesorNorte, L.leadId, { nombre: "Valeria", fecha_nacimiento: "2018-01-01", clave_idempotencia: clave });
  assert.equal(distinta.estado, 409);
  assert.equal(distinta.cuerpo.error.codigo, "conflicto");
  assert.equal(await db().prospecto.count({ where: { lead_id: L.leadId, clave_idempotencia: clave } }), 1);
  // La misma clave en OTRO lead es otro niño (la clave es por lead).
  const L2 = await leadNorte();
  assert.equal((await alta(asesorNorte, L2.leadId, { nombre: "Camila", fecha_nacimiento: "2019-08-01", clave_idempotencia: clave })).estado, 201);
});

test("IDEMPOTENCIA sin clave: el mismo nombre (aunque cambien mayúsculas, acentos o espacios) con la misma fecha de nacimiento en el mismo lead no se duplica; otra fecha o el mismo nombre en otro lead sí es otro niño", async () => {
  const L = await leadNorte();
  const a = await alta(asesorNorte, L.leadId, { nombre: "María José", fecha_nacimiento: "2019-08-01" });
  assert.equal(a.estado, 201);
  const b = await alta(asesorNorte, L.leadId, { nombre: "  maria   JOSE ", fecha_nacimiento: "2019-08-01" });
  assert.equal(b.estado, 200);
  assert.deepEqual([b.cuerpo.id, b.cuerpo.repetido], [a.cuerpo.id, true]);
  assert.equal((await alta(asesorNorte, L.leadId, { nombre: "María José", fecha_nacimiento: "2018-08-01" })).estado, 201, "otra fecha: otra niña (¿melliza no, pero sí otra hermana con el mismo nombre?: la regla solo junta lo idéntico)");
  assert.equal((await alta(asesorNorte, (await leadNorte()).leadId, { nombre: "María José", fecha_nacimiento: "2019-08-01" })).estado, 201);
  // Solo con edad: mismo nombre y misma edad = el mismo.
  const e1 = await alta(asesorNorte, L.leadId, { nombre: "Tomás", edad: 5 });
  const e2 = await alta(asesorNorte, L.leadId, { nombre: "tomas", edad: 5 });
  assert.deepEqual([e1.estado, e2.estado, e2.cuerpo.id === e1.cuerpo.id], [201, 200, true]);
});

test("CARRERA: 8 altas iguales a la vez (misma clave) dejan UN niño; 8 altas del mismo nombre y fecha sin clave dejan UN niño", async () => {
  const L = await leadNorte();
  const clave = `carrera-${randomUUID()}`;
  const con = await Promise.all(Array.from({ length: 8 }, () => alta(asesorNorte, L.leadId, { nombre: "Gemela", fecha_nacimiento: "2019-01-02", clave_idempotencia: clave })));
  assert.deepEqual([...new Set(con.map((r) => r.estado))].sort(), [200, 201]);
  assert.equal(con.filter((r) => r.estado === 201).length, 1);
  assert.equal(new Set(con.map((r) => r.cuerpo.id)).size, 1);
  const sin = await Promise.all(Array.from({ length: 8 }, () => alta(asesorNorte, L.leadId, { nombre: "Otro nombre", fecha_nacimiento: "2018-05-06" })));
  assert.equal(sin.filter((r) => r.estado === 201).length, 1);
  assert.equal(new Set(sin.map((r) => r.cuerpo.id)).size, 1);
  assert.equal(await db().prospecto.count({ where: { lead_id: L.leadId } }), 3, "Primero + Gemela + Otro nombre");
});

test("TOPE: una familia puede tener hasta 10 niños; el 11.º es 409 con un mensaje claro, y quitar a uno devuelve el lugar", async () => {
  const L = await leadNorte();
  for (let i = 2; i <= MAXIMO_DE_NINOS_POR_LEAD; i++) assert.equal((await alta(asesorNorte, L.leadId, { nombre: nombre(), edad: 5 })).estado, 201);
  const once = await alta(asesorNorte, L.leadId, { nombre: nombre(), edad: 5 });
  assert.equal(once.estado, 409);
  assert.equal(once.cuerpo.error.codigo, "conflicto");
  assert.match(once.cuerpo.error.mensaje, /hasta 10 niños/);
  const lista = await asesorNorte.get<{ datos: Nino[] }>(ruta(L.leadId));
  assert.equal(lista.cuerpo.datos.length, 10);
  assert.equal((await asesorNorte.delete(ruta(L.leadId, `/${lista.cuerpo.datos[9]!.id}`))).estado, 204);
  assert.equal((await alta(asesorNorte, L.leadId, { nombre: nombre(), edad: 5 })).estado, 201, "al quitar uno vuelve a caber");
});

test("TOPE bajo carrera: 15 altas distintas a la vez a un lead con 1 niño dejan exactamente 10", async () => {
  const L = await leadNorte();
  const rs = await Promise.all(Array.from({ length: 15 }, () => alta(asesorNorte, L.leadId, { nombre: nombre(), edad: 5 })));
  assert.equal(rs.filter((r) => r.estado === 201).length, MAXIMO_DE_NINOS_POR_LEAD - 1);
  assert.equal(rs.filter((r) => r.estado === 409).length, 15 - (MAXIMO_DE_NINOS_POR_LEAD - 1));
  assert.equal(await db().prospecto.count({ where: { lead_id: L.leadId } }), MAXIMO_DE_NINOS_POR_LEAD);
});

test("CORREGIR: nombre, apellidos, fecha y edad; la fecha nueva recalcula la edad; chocar con otro niño de la familia es 409; lo vacío no se manda", async () => {
  const L = await leadNorte();
  const a = (await alta(asesorNorte, L.leadId, { nombre: "Ana", fecha_nacimiento: "2020-03-15" })).cuerpo;
  const p = await asesorNorte.patch<Nino & Errores>(ruta(L.leadId, `/${a.id}`), { nombre: "Ana Lucía", apellidos: "Mena" });
  assert.equal(p.estado, 200, JSON.stringify(p.cuerpo));
  assert.deepEqual([p.cuerpo.nombre, p.cuerpo.apellidos, p.cuerpo.fecha_nacimiento, p.cuerpo.edad], ["Ana Lucía", "Mena", "2020-03-15", 6]);
  const f = await asesorNorte.patch<Nino & Errores>(ruta(L.leadId, `/${a.id}`), { fecha_nacimiento: "2017-03-15" });
  assert.deepEqual([f.cuerpo.fecha_nacimiento, f.cuerpo.edad, f.cuerpo.edad_declarada], ["2017-03-15", 9, 9]);
  assert.match((await asesorNorte.patch<Errores>(ruta(L.leadId, `/${a.id}`), { fecha_nacimiento: "2017-03-15", edad: 3 })).cuerpo.error.detalles![0]!.mensaje, /no coincide/);
  assert.equal((await asesorNorte.patch<Errores>(ruta(L.leadId, `/${a.id}`), {})).estado, 400, "sin cambios no es una corrección");
  assert.equal((await asesorNorte.patch<Errores>(ruta(L.leadId, `/${a.id}`), { nombre: "" })).estado, 400);
  // Quitar la fecha y dar la edad.
  const solo = await asesorNorte.patch<Nino>(ruta(L.leadId, `/${a.id}`), { fecha_nacimiento: null, edad: 8 });
  assert.deepEqual([solo.cuerpo.fecha_nacimiento, solo.cuerpo.edad], [null, 8]);
  // Chocar con otro niño: mismo nombre y fecha.
  const otro = (await alta(asesorNorte, L.leadId, { nombre: "Beto", fecha_nacimiento: "2019-01-01" })).cuerpo;
  const choque = await asesorNorte.patch<Errores>(ruta(L.leadId, `/${a.id}`), { nombre: "beto", fecha_nacimiento: "2019-01-01" });
  assert.equal(choque.estado, 409);
  assert.match(choque.cuerpo.error.mensaje, /Ya hay otro niño/);
  assert.equal((await db().prospecto.findFirstOrThrow({ where: { id: otro.id } })).nombre, "Beto");
  // Un niño de otro lead no se corrige por este lead.
  assert.equal((await asesorNorte.patch(ruta((await leadNorte()).leadId, `/${a.id}`), { nombre: "Z" })).estado, 404);
});

test("CORREGIR: un niño que ya es alumno no se toca (409); cambiar de disciplina solo si todavía no tiene cotizaciones, clase muestra ni lista de espera", async () => {
  const L = await leadNorte();
  const alumno = await prisma.alumno.create({ data: { organizacion_id: org.organizacionId, nombre: "Ya", apellidos: "Alumno", fecha_nacimiento: new Date("2018-01-01T00:00:00Z"), sucursal_id: norte } });
  await prisma.prospecto.update({ where: { id: L.prospectoId }, data: { alumno_id: alumno.id } });
  const ya = await asesorNorte.patch<Errores>(ruta(L.leadId, `/${L.prospectoId}`), { nombre: "Otro" });
  assert.equal(ya.estado, 409);
  assert.match(ya.cuerpo.error.mensaje, /ya es alumno/);

  const L2 = await leadNorte();
  const libre = (await alta(asesorNorte, L2.leadId, { nombre: nombre(), edad: 5 })).cuerpo;
  const cambia = await asesorNorte.patch<Nino & Errores>(ruta(L2.leadId, `/${libre.id}`), { vertical_id: verticalB });
  assert.equal(cambia.estado, 200);
  assert.equal(cambia.cuerpo.vertical.id, verticalB);
  const grupo = await prisma.grupo.findFirstOrThrow({ where: { programa_id: programaId } });
  await prisma.lista_espera.create({ data: { organizacion_id: org.organizacionId, grupo_id: grupo.id, prospecto_id: libre.id, lead_id: L2.leadId, posicion: 1000 + n } });
  const bloqueado = await asesorNorte.patch<Errores>(ruta(L2.leadId, `/${libre.id}`), { vertical_id: org.verticalId });
  assert.equal(bloqueado.estado, 409);
  assert.match(bloqueado.cuerpo.error.mensaje, /no se puede cambiar de disciplina/);
});

test("QUITAR: baja lógica (la fila sigue, con eliminado_en), ya no aparece, sus cotizaciones vigentes pasan a vencidas y queda registrado; un alumno, una clase agendada o una lista de espera lo impiden", async () => {
  const L = await leadNorte();
  const x = (await alta(asesorNorte, L.leadId, { nombre: "Quitar", edad: 5 })).cuerpo;
  const cot = await prisma.cotizacion.create({ data: { organizacion_id: org.organizacionId, lead_id: L.leadId, prospecto_id: x.id, programa_id: programaId, sucursal_id: norte, origen: "asesor", fecha: new Date("2026-11-10"), vigente_hasta: new Date("2026-11-17"), snapshot: {} } });
  assert.equal((await asesorNorte.delete(ruta(L.leadId, `/${x.id}`))).estado, 204);
  assert.deepEqual((await asesorNorte.get<{ datos: Nino[] }>(ruta(L.leadId))).cuerpo.datos.map((k) => k.nombre), ["Primero"]);
  const cruda = await prisma.prospecto.findFirstOrThrow({ where: { id: x.id } });
  assert.notEqual(cruda.eliminado_en, null, "baja lógica: nunca DELETE físico (invariante 3)");
  assert.equal((await prisma.cotizacion.findFirstOrThrow({ where: { id: cot.id } })).estatus, "vencida");
  const regs = await prisma.registro_cambio.findMany({ where: { organizacion_id: org.organizacionId, entidad_id: x.id }, orderBy: { creado_en: "asc" } });
  assert.deepEqual(regs.map((r) => r.accion), ["crear", "eliminar"]);
  assert.equal((await asesorNorte.delete(ruta(L.leadId, `/${x.id}`))).estado, 404, "ya no existe para el asesor");

  // Un niño que ya es alumno.
  const alumno = await prisma.alumno.create({ data: { organizacion_id: org.organizacionId, nombre: "Ya", apellidos: "Alumno", fecha_nacimiento: new Date("2018-01-01T00:00:00Z"), sucursal_id: norte } });
  await prisma.prospecto.update({ where: { id: L.prospectoId }, data: { alumno_id: alumno.id } });
  assert.equal((await asesorNorte.delete(ruta(L.leadId, `/${L.prospectoId}`))).estado, 409);
  // Una clase muestra agendada y una lista de espera.
  const L2 = await leadNorte();
  const y = (await alta(asesorNorte, L2.leadId, { nombre: "Con clase", edad: 5 })).cuerpo;
  const grupo = await prisma.grupo.findFirstOrThrow({ where: { programa_id: programaId } });
  const clase = await prisma.clase_muestra.create({ data: { organizacion_id: org.organizacionId, lead_id: L2.leadId, prospecto_id: y.id, grupo_id: grupo.id, fecha_hora: new Date("2026-11-16T16:00:00Z"), agendada_por: "usuario", agendada_por_usuario_id: (await prisma.usuario.findFirstOrThrow({ where: { organizacion_id: org.organizacionId, rol: "administrador" } })).id } });
  const conClase = await asesorNorte.delete<Errores>(ruta(L2.leadId, `/${y.id}`));
  assert.equal(conClase.estado, 409);
  assert.match(conClase.cuerpo.error.mensaje, /clase muestra agendada/);
  await prisma.clase_muestra.update({ where: { id: clase.id }, data: { estatus: "cancelada" } });
  await prisma.lista_espera.create({ data: { organizacion_id: org.organizacionId, grupo_id: grupo.id, prospecto_id: y.id, lead_id: L2.leadId, posicion: 2000 + n } });
  assert.match((await asesorNorte.delete<Errores>(ruta(L2.leadId, `/${y.id}`))).cuerpo.error.mensaje, /lista de espera/);
});

test("ALCANCE: el asesor del sur no ve ni toca los niños del lead del norte (404); el lead sin sucursal lo atienden todos los asesores; recepción solo lee; el maestro no entra", async () => {
  const L = await leadNorte();
  const x = (await alta(asesorNorte, L.leadId, { nombre: nombre(), edad: 5 })).cuerpo;
  assert.equal((await asesorSur.get(ruta(L.leadId))).estado, 404);
  assert.equal((await alta(asesorSur, L.leadId, { nombre: nombre(), edad: 5 })).estado, 404);
  assert.equal((await asesorSur.patch(ruta(L.leadId, `/${x.id}`), { nombre: "Z" })).estado, 404);
  assert.equal((await asesorSur.delete(ruta(L.leadId, `/${x.id}`))).estado, 404);
  // Sin sucursal (V2, decisión 5).
  const sinSucursal = await sembrarFamilia(prisma, org, { sucursalId: null });
  const deSur = await alta(asesorSur, sinSucursal.leadId, { nombre: nombre(), edad: 5 });
  assert.equal(deSur.estado, 201, "un lead sin sucursal lo atienden todos los asesores");
  assert.equal((await asesorNorte.get<{ datos: Nino[] }>(ruta(sinSucursal.leadId))).cuerpo.datos.length, 2);
  assert.equal((await alta(admin, sinSucursal.leadId, { nombre: nombre(), edad: 5 })).estado, 201);
  // Recepción: lee lo de su sucursal, no escribe.
  assert.equal((await recepcion.get(ruta(L.leadId))).estado, 200);
  assert.equal((await alta(recepcion, L.leadId, { nombre: nombre(), edad: 5 })).estado, 403);
  assert.equal((await recepcion.delete(ruta(L.leadId, `/${x.id}`))).estado, 403);
  assert.equal((await maestro.get(ruta(L.leadId))).estado, 403);
  // Sin sesión.
  assert.equal((await api.cliente().get(ruta(L.leadId))).estado, 401);
});

test("NO-FUGA entre organizaciones: el administrador de otra escuela no ve, agrega, corrige ni quita niños de este lead (404), y no puede apuntar a una disciplina o un niño de aquí", async () => {
  const L = await leadNorte();
  const x = (await alta(asesorNorte, L.leadId, { nombre: nombre(), edad: 5 })).cuerpo;
  assert.equal((await adminOtra.get(ruta(L.leadId))).estado, 404);
  assert.equal((await alta(adminOtra, L.leadId, { nombre: nombre(), edad: 5 })).estado, 404);
  assert.equal((await adminOtra.patch(ruta(L.leadId, `/${x.id}`), { nombre: "Z" })).estado, 404);
  assert.equal((await adminOtra.delete(ruta(L.leadId, `/${x.id}`))).estado, 404);
  // Un lead de SU organización con un niño de aquí: el id no se resuelve.
  const suya = await sembrarFamilia(prisma, otraOrg, { sucursalId: otraOrg.sucursales[0]!.id });
  assert.equal((await adminOtra.patch(ruta(suya.leadId, `/${x.id}`), { nombre: "Z" })).estado, 404);
  assert.equal((await adminOtra.delete(ruta(suya.leadId, `/${x.id}`))).estado, 404);
  assert.equal((await alta(adminOtra, suya.leadId, { nombre: nombre(), edad: 5, vertical_id: org.verticalId })).estado, 400);
  assert.equal((await db().prospecto.findFirstOrThrow({ where: { id: x.id } })).eliminado_en, null);
});

test("REGISTRO DE CAMBIOS sin datos identificables: ni nombre, ni apellidos, ni fecha de nacimiento; solo ids y qué campos se tocaron", async () => {
  const L = await leadNorte();
  const x = (await alta(asesorNorte, L.leadId, { nombre: "CENTINELA-NOMBRE", apellidos: "CENTINELA-APELLIDO", fecha_nacimiento: "2019-07-07" })).cuerpo;
  await asesorNorte.patch(ruta(L.leadId, `/${x.id}`), { nombre: "CENTINELA-NOMBRE-2", fecha_nacimiento: "2019-07-08" });
  await asesorNorte.delete(ruta(L.leadId, `/${x.id}`));
  const regs = await prisma.registro_cambio.findMany({ where: { organizacion_id: org.organizacionId, entidad_id: x.id }, orderBy: { creado_en: "asc" } });
  assert.deepEqual(regs.map((r) => r.accion), ["crear", "actualizar", "eliminar"]);
  const todo = JSON.stringify(regs.map((r) => [r.antes, r.despues]));
  for (const prohibido of ["CENTINELA", "2019-07", "Mena"]) assert.ok(!todo.includes(prohibido), `el registro de cambios no debe llevar «${prohibido}»: ${todo}`);
  assert.deepEqual(regs[1]!.despues, { lead_id: L.leadId, vertical_interes_id: org.verticalId, origen: "asesor", campos: ["nombre", "fecha_nacimiento"] }, "un cambio de dos campos");
});

test("SALUD: la API no recibe datos de salud (el esquema es cerrado, 400) y nada de lo mandado llega a la base, al registro de cambios ni a los logs", async () => {
  const L = await leadNorte();
  const centinela = `CENTINELA-SALUD-${randomUUID()}`;
  const logs = colectarLogs();
  let r;
  try {
    r = await alta(asesorNorte, L.leadId, { nombre: nombre(), edad: 5, alergias: centinela, medicamentos: centinela, contacto_emergencia: { nombre: centinela, telefono: "+525500000000" } });
    await asesorNorte.patch(ruta(L.leadId, `/${L.prospectoId}`), { condiciones_medicas: centinela });
  } finally {
    logs.detener();
  }
  assert.equal(r.estado, 400);
  assert.ok(r.cuerpo.error.detalles?.every((d) => d.mensaje === "Campo desconocido"));
  assert.ok(!logs.texto().includes(centinela), "el valor de salud no se loguea");
  assert.equal(await db().prospecto.count({ where: { lead_id: L.leadId } }), 1, "no se creó nada");
  assert.equal(await db().registro_cambio.count({ where: { entidad_tipo: "prospecto", entidad_id: L.prospectoId } }), 0, "ni el rechazo deja registro");
  assert.equal(await db().interaccion.count({ where: { lead_id: L.leadId } }), 0, "ninguna nota al lead");
});

test("MÓDULOS: captación siempre vive (con todo lo demás apagado las cuatro rutas responden); el programa sugerido solo aparece con el cotizador encendido", async () => {
  const o = await sembrarOrganizacion(prisma, "Solo captación");
  await sembrarEmbudo(prisma, o);
  await fijarConfiguracion(prisma, o.organizacionId, { modulo_finanzas: false, modulo_operacion: false, modulo_tableros: false, modulo_inscripcion: false, modulo_clase_muestra: false, modulo_cotizador: false });
  const u = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
  const c = api.cliente();
  assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
  const L = await sembrarFamilia(prisma, o, { sucursalId: o.sucursales[0]!.id });
  const programa = (await sembrarPrograma(prisma, o, { sucursalId: o.sucursales[0]!.id, nombre: "P", edadMin: 3, edadMax: 12, grupos: [] })).id;
  const nuevo = await alta(c, L.leadId, { nombre: "Solo captación", edad: 5 });
  assert.equal(nuevo.estado, 201);
  assert.ok(!("programa_sugerido" in nuevo.cuerpo), "con el cotizador apagado no hay nada de cotización");
  await prisma.prospecto.update({ where: { id: nuevo.cuerpo.id }, data: { programa_sugerido_id: programa } });
  const ficha = await c.get<{ prospectos: Nino[] }>(`/api/leads/${L.leadId}`);
  assert.ok(ficha.cuerpo.prospectos.every((p) => !("programa_sugerido" in p)));
  assert.equal((await c.patch(ruta(L.leadId, `/${nuevo.cuerpo.id}`), { nombre: "Corregido" })).estado, 200);
  assert.equal((await c.delete(ruta(L.leadId, `/${nuevo.cuerpo.id}`))).estado, 204);
  // Con el cotizador encendido sí.
  await fijarConfiguracion(prisma, o.organizacionId, { modulo_cotizador: true });
  const otro = (await alta(c, L.leadId, { nombre: "Con cotizador", edad: 5 })).cuerpo;
  await prisma.prospecto.update({ where: { id: otro.id }, data: { programa_sugerido_id: programa } });
  const lista = await c.get<{ datos: Nino[] }>(ruta(L.leadId));
  assert.equal(lista.cuerpo.datos.find((x) => x.id === otro.id)?.programa_sugerido?.nombre, "P");
});

test("el cotizador usa la fecha de nacimiento que capturó el asesor (los años a la fecha de corte del programa), y cotiza a cada niño por separado", async () => {
  const o = await sembrarOrganizacion(prisma, "Cotizar niños");
  await sembrarEmbudo(prisma, o);
  const suc = o.sucursales[0]!.id;
  // Programa de 7 a 9 años con corte el 31 de diciembre de 2026.
  const p = await sembrarPrograma(prisma, o, { sucursalId: suc, nombre: "Programa corte", edadMin: 7, edadMax: 9, fechaCorteEdad: "2026-12-31", grupos: [{ nombre: "G", cupoMaximo: 5, horarios: [[2, 600, 660]] }], precio: { inscripcion: "500.00", mensualidad: "800.00" } });
  const u = await sembrarUsuario(prisma, o.organizacionId, { rol: "asesor", sucursales: [suc] });
  const c = api.cliente();
  assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
  const L = await sembrarFamilia(prisma, o, { sucursalId: suc, nombre: "Hoy 6 sin corte" });
  // Cumple 7 en diciembre: hoy tiene 6 pero al corte tiene 7.
  const alCorte = (await c.post<Nino>(ruta(L.leadId), { nombre: "Al corte", fecha_nacimiento: "2019-12-05" })).cuerpo;
  assert.equal(alCorte.edad, 6);
  const cot = await c.post<{ estatus: string; snapshot: { programa: { programa_id?: string; programaId?: string } } } & Errores>(`/api/leads/${L.leadId}/cotizaciones`, { prospecto_id: alCorte.id, programa_id: p.id });
  assert.equal(cot.estado, 201, JSON.stringify(cot.cuerpo));
  // El que solo dice «6 años» no entra al programa de 7 a 9: no hay forma de recalcularle el corte.
  const solo6 = (await c.post<Nino>(ruta(L.leadId), { nombre: "Solo seis", edad: 6 })).cuerpo;
  const noCotiza = await c.post<Errores>(`/api/leads/${L.leadId}/cotizaciones`, { prospecto_id: solo6.id, programa_id: p.id });
  assert.equal(noCotiza.estado, 409);
});
