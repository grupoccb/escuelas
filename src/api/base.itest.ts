// API base (B3): registro de quién cambió qué, paginación estándar y errores sin filtrar internos.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi, type UsuarioDePrueba } from "../testutil/api.ts";
import { conGanchos } from "../testutil/carrera.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let admin: UsuarioDePrueba;
let asesor: UsuarioDePrueba;
let cAdmin: ClienteApi;

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  org = await sembrarOrganizacion(prisma, "Base");
  admin = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  asesor = await sembrarUsuario(prisma, org.organizacionId, { rol: "asesor", sucursales: [org.sucursales[0]!.id] });
  cAdmin = api.cliente();
  await cAdmin.login(org.slug, admin.correo, admin.contrasena);
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

interface Registro {
  id: string;
  usuario_id: string;
  entidad_tipo: string;
  entidad_id: string;
  accion: string;
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
}
const registrosDe = async (entidadId: string): Promise<Registro[]> =>
  (await cAdmin.get<{ datos: Registro[] }>(`/api/registro-cambios?entidad_id=${entidadId}&limite=100`)).cuerpo.datos;

// ── Registro de cambios ────────────────────────────────────────────────────────────────

test("registro: crear un usuario deja quién y qué, sin contraseña; modificarlo guarda solo lo que cambió", async () => {
  const alta = await cAdmin.post<{ id: string }>("/api/usuarios", {
    correo: `reg-${randomUUID().slice(0, 8)}@prueba.test`,
    nombre: "Registrada",
    rol: "recepcion",
    contrasena: "contrasena-secreta-123",
    sucursales: [org.sucursales[0]!.id],
  });
  const id = alta.cuerpo.id;
  await cAdmin.patch(`/api/usuarios/${id}`, { rol: "asesor", nombre: "Registrada" });
  await cAdmin.patch(`/api/usuarios/${id}`, { contrasena: "otra-contrasena-secreta-9" });
  const filas = (await registrosDe(id)).reverse(); // del más viejo al más nuevo
  assert.deepEqual(filas.map((f) => f.accion), ["crear", "actualizar", "restablecer_contrasena"]);
  assert.ok(filas.every((f) => f.usuario_id === admin.id && f.entidad_tipo === "usuario"));
  assert.deepEqual(filas[0]!.despues, { nombre: "Registrada", rol: "recepcion", activo: true, sucursales: [org.sucursales[0]!.id] });
  assert.equal(filas[0]!.antes, null);
  assert.deepEqual(filas[1]!.antes, { rol: "recepcion" });
  assert.deepEqual(filas[1]!.despues, { rol: "asesor" });
  assert.equal(filas[2]!.antes, null);
  assert.equal(filas[2]!.despues, null);
  const todo = JSON.stringify(filas);
  assert.ok(!/contrasena|secreta|scrypt/i.test(todo.replace(/restablecer_contrasena/g, "")), "ni la contraseña ni su hash en el registro");
});

test("registro: resolver una tarea y cambiar la contraseña propia también quedan registrados", async () => {
  const lead = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, sucursal_interes_id: org.sucursales[0]!.id, etapa_id: org.etapaInicialId, telefono: `+5255${randomInt(10_000_000, 99_999_999)}` } });
  const t = await prisma.tarea_asesor.create({ data: { organizacion_id: org.organizacionId, lead_id: lead.id, tipo: "sin_plantilla_apta", descripcion: "x" } });
  const cAsesor = api.cliente();
  await cAsesor.login(org.slug, asesor.correo, asesor.contrasena);
  await cAsesor.patch(`/api/tareas/${t.id}`, { estado: "descartada" });
  const filas = await registrosDe(t.id);
  assert.equal(filas.length, 1);
  assert.equal(filas[0]!.accion, "descartar");
  assert.equal(filas[0]!.usuario_id, asesor.id);
  assert.equal(filas[0]!.entidad_tipo, "tarea_asesor");
  assert.equal(filas[0]!.antes?.["estado"], "pendiente");
  assert.equal(filas[0]!.despues?.["estado"], "descartada");

  assert.equal((await cAsesor.post("/api/yo/contrasena", { actual: asesor.contrasena, nueva: "nueva-contrasena-larga-1" })).estado, 204);
  const propios = await registrosDe(asesor.id);
  assert.deepEqual(propios.map((f) => f.accion), ["cambiar_contrasena"]);
});

test("registro: un cambio que se rechaza (409/404/400) no deja registro", async () => {
  const antes = (await cAdmin.get<{ paginacion: { total: number } }>("/api/registro-cambios")).cuerpo.paginacion.total;
  assert.equal((await cAdmin.patch(`/api/usuarios/${admin.id}`, { activo: false })).estado, 409);
  assert.equal((await cAdmin.patch(`/api/usuarios/${randomUUID()}`, { nombre: "x" })).estado, 404);
  assert.equal((await cAdmin.patch(`/api/usuarios/${asesor.id}`, { rol: "no-existe" })).estado, 400);
  const despues = (await cAdmin.get<{ paginacion: { total: number } }>("/api/registro-cambios")).cuerpo.paginacion.total;
  assert.equal(despues, antes);
});

test("registro: va en la MISMA transacción que el cambio — si registrar falla, el cambio se revierte", async () => {
  const falla = conGanchos(prisma, {
    modelo: "registro_cambio",
    operacion: "create",
    antes: async () => {
      throw new Error("falla simulada del registro");
    },
  });
  const otra = levantarApi(falla);
  try {
    const lead = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, sucursal_interes_id: org.sucursales[0]!.id, etapa_id: org.etapaInicialId } });
    const t = await prisma.tarea_asesor.create({ data: { organizacion_id: org.organizacionId, lead_id: lead.id, tipo: "sin_plantilla_apta", descripcion: "x" } });
    const c = otra.cliente();
    await c.login(org.slug, admin.correo, admin.contrasena);
    const r = await c.patch<{ error: { codigo: string; mensaje: string } }>(`/api/tareas/${t.id}`, { estado: "hecha" });
    assert.equal(r.estado, 500);
    assert.equal(r.cuerpo.error.codigo, "interno");
    assert.ok(!JSON.stringify(r.cuerpo).includes("simulada"), "el error interno no se filtra");
    const sigue = await prisma.tarea_asesor.findFirstOrThrow({ where: { id: t.id } });
    assert.equal(sigue.estado, "pendiente");
  } finally {
    await otra.cerrar();
  }
});

test("registro: solo el administrador lo consulta; filtra por entidad y usuario; solo ve su organización", async () => {
  const cAsesor = api.cliente();
  await cAsesor.login(org.slug, asesor.correo, "nueva-contrasena-larga-1"); // la cambió el test anterior
  assert.equal((await cAsesor.get("/api/registro-cambios")).estado, 403);
  const otra = await sembrarOrganizacion(prisma, "BaseOtra");
  const adminOtra = await sembrarUsuario(prisma, otra.organizacionId, { rol: "administrador" });
  const cOtra = api.cliente();
  await cOtra.login(otra.slug, adminOtra.correo, adminOtra.contrasena);
  const creado = await cOtra.post<{ id: string }>("/api/usuarios", { correo: `o-${randomUUID().slice(0, 6)}@prueba.test`, nombre: "De otra", rol: "asesor", contrasena: "contrasena-larga-1234" });
  assert.equal(creado.estado, 201);
  const mias = await cAdmin.get<{ datos: Registro[] }>("/api/registro-cambios?limite=100");
  assert.ok(!mias.cuerpo.datos.some((r) => r.entidad_id === creado.cuerpo.id), "no ve registros de otra organización");
  assert.equal((await cOtra.get<{ paginacion: { total: number } }>("/api/registro-cambios")).cuerpo.paginacion.total, 1);
  const porUsuario = await cAdmin.get<{ datos: Registro[] }>(`/api/registro-cambios?usuario_id=${asesor.id}&limite=100`);
  assert.ok(porUsuario.cuerpo.datos.every((r) => r.usuario_id === asesor.id));
  assert.equal((await cAdmin.get("/api/registro-cambios?entidad_tipo=lo-que-sea")).estado, 400);
});

test("registro: es de solo anexar — ni UPDATE ni DELETE, ni por Prisma", async () => {
  const [fila] = (await cAdmin.get<{ datos: Registro[] }>("/api/registro-cambios?limite=1")).cuerpo.datos;
  assert.ok(fila);
  await assert.rejects(prisma.registro_cambio.update({ where: { id: fila.id }, data: { accion: "otra" } }), /solo anexar/);
  await assert.rejects(prisma.registro_cambio.delete({ where: { id: fila.id } }), /solo anexar/);
  await assert.rejects(prisma.registro_cambio.update({ where: { id: fila.id }, data: { eliminado_en: new Date() } }), /solo anexar/);
});

// ── Paginación ─────────────────────────────────────────────────────────────────────────

test("paginación: orden estable aun con filas que comparten fecha; páginas sin huecos ni repetidos; total correcto", async () => {
  const o = await sembrarOrganizacion(prisma, "Paginacion");
  const a = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
  const c = api.cliente();
  await c.login(o.slug, a.correo, a.contrasena);
  const mismaFecha = new Date("2026-10-01T10:00:00Z");
  const creados: string[] = [];
  for (let i = 0; i < 7; i++) {
    const l = await prisma.lead.create({ data: { organizacion_id: o.organizacionId, vertical_interes_id: o.verticalId, etapa_id: o.etapaInicialId, creado_en: mismaFecha, nombre_contacto: `Lead ${i}` } });
    creados.push(l.id);
  }
  const vistos: string[] = [];
  for (const pagina of [1, 2, 3]) {
    const r = await c.get<{ datos: { id: string }[]; paginacion: { pagina: number; limite: number; total: number } }>(`/api/leads?limite=3&pagina=${pagina}`);
    assert.deepEqual(r.cuerpo.paginacion, { pagina, limite: 3, total: 7 });
    vistos.push(...r.cuerpo.datos.map((d) => d.id));
  }
  assert.equal(vistos.length, 7);
  assert.deepEqual([...vistos].sort(), [...creados].sort());
  assert.deepEqual((await c.get<{ datos: unknown[] }>("/api/leads?limite=3&pagina=4")).cuerpo.datos, []);
  // Mismo orden en dos lecturas seguidas.
  const otraVez = (await c.get<{ datos: { id: string }[] }>("/api/leads?limite=7")).cuerpo.datos.map((d) => d.id);
  assert.deepEqual(otraVez, (await c.get<{ datos: { id: string }[] }>("/api/leads?limite=7")).cuerpo.datos.map((d) => d.id));
});

test("paginación: tope duro de 100, valor por defecto 25 y entradas inválidas rechazadas", async () => {
  const exceso = await cAdmin.get<{ paginacion: { limite: number } }>("/api/usuarios?limite=1000");
  assert.equal(exceso.estado, 200);
  assert.equal(exceso.cuerpo.paginacion.limite, 100);
  assert.equal((await cAdmin.get<{ paginacion: { limite: number; pagina: number } }>("/api/usuarios")).cuerpo.paginacion.limite, 25);
  for (const mala of ["limite=0", "limite=-1", "limite=abc", "limite=1.5", "pagina=0", "pagina=10001", "limite=1&limite=2", "ordenar=nombre", "pagina[]=1"]) {
    const r = await cAdmin.get<{ error: { codigo: string } }>(`/api/usuarios?${mala}`);
    assert.equal(r.estado, 400, mala);
    assert.equal(r.cuerpo.error.codigo, "validacion", mala);
  }
});

// ── Errores ────────────────────────────────────────────────────────────────────────────

test("un fallo interno (p. ej. de la base) da 500 `interno` sin mensaje, traza ni textos internos", async () => {
  const roto = conGanchos(prisma, {
    modelo: "lead",
    operacion: "findMany",
    antes: async () => {
      throw new Error("password authentication failed for user inscripciones en /srv/app/secreto.ts");
    },
  });
  const otra = levantarApi(roto);
  try {
    const c = otra.cliente();
    await c.login(org.slug, admin.correo, admin.contrasena);
    const r = await c.get<{ error: { codigo: string; mensaje: string } }>("/api/leads");
    assert.equal(r.estado, 500);
    assert.deepEqual(Object.keys(r.cuerpo.error).sort(), ["codigo", "mensaje"]);
    assert.equal(r.cuerpo.error.codigo, "interno");
    const texto = JSON.stringify(r.cuerpo);
    assert.ok(!/password|srv|secreto|inscripciones|stack| at /i.test(texto), texto);
  } finally {
    await otra.cerrar();
  }
});

test("los errores de cada código tienen la forma {error:{codigo,mensaje,detalles?}}", async () => {
  const c401 = await api.cliente().get<{ error: Record<string, unknown> }>("/api/yo");
  const c403 = await (async () => {
    const c = api.cliente();
    await c.login(org.slug, asesor.correo, "nueva-contrasena-larga-1");
    return c.get<{ error: Record<string, unknown> }>("/api/usuarios");
  })();
  const c404 = await cAdmin.get<{ error: Record<string, unknown> }>(`/api/leads/${randomUUID()}`);
  const c400 = await cAdmin.get<{ error: Record<string, unknown> }>("/api/leads?limite=x");
  assert.deepEqual([c401.cuerpo.error["codigo"], c403.cuerpo.error["codigo"], c404.cuerpo.error["codigo"], c400.cuerpo.error["codigo"]], ["no_autenticado", "prohibido", "no_encontrado", "validacion"]);
  for (const r of [c401, c403, c404, c400]) {
    assert.equal(typeof r.cuerpo.error["mensaje"], "string");
    assert.ok(Object.keys(r.cuerpo.error).every((k) => ["codigo", "mensaje", "detalles"].includes(k)));
  }
  assert.ok(Array.isArray(c400.cuerpo.error["detalles"]));
});
