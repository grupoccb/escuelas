// Autorización de la API (B2): permiso × rol, alcance por sucursal, «un maestro solo ve sus grupos»,
// reglas de usuarios y no-fuga entre organizaciones. Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { randomInt, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { PARAMETROS_PRUEBA } from "../auth/contrasena.ts";
import { ROLES, type Rol } from "../auth/roles.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { ClienteApi, levantarApi, sembrarUsuario, type ApiLevantada, type UsuarioDePrueba } from "../testutil/api.ts";
import { autenticar } from "./autenticar.ts";
import { requierePermiso } from "./autorizar.ts";
import { resolverDepsApi } from "./index.ts";
import { manejadorDeErroresApi } from "./errores-http.ts";
import { PERMISOS_ACORDADOS } from "../testutil/permisos-acordados.ts";
import { MATRIZ_DE_PERMISOS, PERMISOS } from "./permisos.ts";
import { soloSesion } from "./autorizar.ts";
import { contextoDe } from "./contexto.ts";
import { escucharSinReuso } from "../testutil/servidor.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let A: OrganizacionDePrueba; // la organización principal
let B: OrganizacionDePrueba; // otra, para la no-fuga

interface Gente {
  admin: UsuarioDePrueba;
  asesorNorte: UsuarioDePrueba;
  asesorSur: UsuarioDePrueba;
  recepcion: UsuarioDePrueba; // las dos sucursales
  maestro: UsuarioDePrueba;
  maestroSinGrupos: UsuarioDePrueba;
}
let gente: Gente;
const sesiones = new Map<string, ClienteApi>();

async function entrar(org: OrganizacionDePrueba, u: UsuarioDePrueba): Promise<ClienteApi> {
  const c = api.cliente();
  const r = await c.login(org.slug, u.correo, u.contrasena);
  assert.equal(r.estado, 201, `login de ${u.rol}`);
  return c;
}

async function sembrarLead(org: OrganizacionDePrueba, sucursalId: string | null, telefono?: string) {
  return prisma.lead.create({
    data: {
      organizacion_id: org.organizacionId,
      vertical_interes_id: org.verticalId,
      sucursal_interes_id: sucursalId,
      etapa_id: org.etapaInicialId,
      telefono: telefono ?? `+5255${randomInt(10_000_000, 99_999_999)}`,
      nombre_contacto: "Contacto",
    },
  });
}

async function sembrarTarea(org: OrganizacionDePrueba, leadId: string) {
  return prisma.tarea_asesor.create({ data: { organizacion_id: org.organizacionId, lead_id: leadId, tipo: "sin_plantilla_apta", descripcion: "Tarea de prueba" } });
}

interface Mundo {
  leadNorte: string;
  leadSur: string;
  leadSinSucursal: string;
  tareaNorte: string;
  tareaSur: string;
  grupoDelMaestro: string;
  grupoNorteSinMaestro: string;
  grupoSur: string;
}
let m: Mundo;
let mB: { leadId: string; tareaId: string; usuarioId: string };

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  A = await sembrarOrganizacion(prisma, "Autorizacion A");
  B = await sembrarOrganizacion(prisma, "Autorizacion B");
  const norte = A.sucursales[0]!.id;
  const sur = A.sucursales[1]!.id;
  gente = {
    admin: await sembrarUsuario(prisma, A.organizacionId, { rol: "administrador" }),
    asesorNorte: await sembrarUsuario(prisma, A.organizacionId, { rol: "asesor", sucursales: [norte] }),
    asesorSur: await sembrarUsuario(prisma, A.organizacionId, { rol: "asesor", sucursales: [sur] }),
    recepcion: await sembrarUsuario(prisma, A.organizacionId, { rol: "recepcion", sucursales: [norte, sur] }),
    maestro: await sembrarUsuario(prisma, A.organizacionId, { rol: "maestro" }),
    maestroSinGrupos: await sembrarUsuario(prisma, A.organizacionId, { rol: "maestro" }),
  };
  sesiones.set("administrador", await entrar(A, gente.admin));
  sesiones.set("asesor", await entrar(A, gente.asesorNorte));
  sesiones.set("recepcion", await entrar(A, gente.recepcion));
  sesiones.set("maestro", await entrar(A, gente.maestro));

  // Oferta: un grupo del maestro y dos que no son suyos, en las dos sucursales.
  const instructorMaestro = await prisma.instructor.create({ data: { organizacion_id: A.organizacionId, usuario_id: gente.maestro.id, nombre: "Maestro uno" } });
  await prisma.instructor.create({ data: { organizacion_id: A.organizacionId, usuario_id: gente.maestroSinGrupos.id, nombre: "Maestro dos" } });
  const programa = async (sucursalId: string, nombre: string) =>
    prisma.programa.create({ data: { organizacion_id: A.organizacionId, vertical_id: A.verticalId, sucursal_id: sucursalId, nombre, edad_min: 3, edad_max: 12 } });
  const pNorte = await programa(norte, "Programa norte");
  const pSur = await programa(sur, "Programa sur");
  const grupo = (programaId: string, nombre: string, instructorId?: string) =>
    prisma.grupo.create({ data: { organizacion_id: A.organizacionId, programa_id: programaId, nombre, cupo_maximo: 10, ...(instructorId ? { instructor_id: instructorId } : {}) } });
  const g1 = await grupo(pNorte.id, "Grupo del maestro", instructorMaestro.id);
  const g2 = await grupo(pNorte.id, "Grupo norte sin maestro");
  const g3 = await grupo(pSur.id, "Grupo sur");
  await prisma.grupo_horario.create({ data: { organizacion_id: A.organizacionId, grupo_id: g1.id, dia_semana: 2, hora_inicio_min: 960, hora_fin_min: 1020 } });

  const ln = await sembrarLead(A, norte);
  const ls = await sembrarLead(A, sur);
  const lx = await sembrarLead(A, null);
  m = {
    leadNorte: ln.id,
    leadSur: ls.id,
    leadSinSucursal: lx.id,
    tareaNorte: (await sembrarTarea(A, ln.id)).id,
    tareaSur: (await sembrarTarea(A, ls.id)).id,
    grupoDelMaestro: g1.id,
    grupoNorteSinMaestro: g2.id,
    grupoSur: g3.id,
  };
  // La otra organización: un lead, una tarea y un usuario, para adivinar sus ids.
  const lb = await sembrarLead(B, B.sucursales[0]!.id);
  mB = {
    leadId: lb.id,
    tareaId: (await sembrarTarea(B, lb.id)).id,
    usuarioId: (await sembrarUsuario(prisma, B.organizacionId, { rol: "administrador" })).id,
  };
});

after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

const como = (rol: Rol): ClienteApi => sesiones.get(rol)!;
const ids = (r: { cuerpo: unknown }): string[] => ((r.cuerpo as { datos: { id: string }[] }).datos).map((d) => d.id);

// ── Permiso × rol, generado de la matriz ───────────────────────────────────────────────

/** Lo que DEBE pasar según la lista acordada escrita a mano (NO según `tienePermiso`, que es lo que se prueba). */
const loTiene = (rol: Rol, permiso: keyof typeof MATRIZ_DE_PERMISOS): boolean => (PERMISOS_ACORDADOS[permiso] as readonly string[]).includes(rol);

test("cada permiso de la matriz × cada rol → 200 si lo tiene y 403 si no, contra la lista acordada a mano (ruta de prueba con requierePermiso)", async () => {
  const deps = resolverDepsApi({ prisma, parametrosHash: PARAMETROS_PRUEBA, cookieSegura: false, origenesPermitidos: [] });
  const app = express();
  const router = express.Router();
  router.get("/sonda/:permiso", autenticar(deps), (req, res, next) => {
    const permiso = req.params["permiso"] as keyof typeof MATRIZ_DE_PERMISOS;
    requierePermiso(permiso)(req, res, next);
  }, (_req, res) => {
    res.json({ ok: true });
  });
  router.use(manejadorDeErroresApi);
  app.use("/api", router);
  const server = escucharSinReuso(app);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    let comprobaciones = 0;
    for (const rol of ROLES) {
      const c = como(rol);
      // Las cookies del servidor principal sirven en la sonda (misma base de datos y mismo esquema de sesión).
      const cookie = c.cookieDeSesion!;
      for (const permiso of PERMISOS) {
        const r = await fetch(`${base}/api/sonda/${permiso}`, { headers: { cookie: `sesion=${cookie}` } });
        await r.arrayBuffer();
        assert.equal(r.status, loTiene(rol, permiso) ? 200 : 403, `${rol} · ${permiso}`);
        comprobaciones++;
      }
    }
    assert.equal(comprobaciones, ROLES.length * PERMISOS.length);
    // Sin sesión: 401 antes de preguntar por el permiso.
    const sinSesion = await fetch(`${base}/api/sonda/leads:leer`);
    assert.equal(sinSesion.status, 401);
  } finally {
    server.close();
  }
});

// ── Denegar por omisión (EB-09): una ruta que no declara su acceso no puede operar ───────

test("una ruta con sesión pero SIN declarar su acceso responde 500 y no toca la base; con soloSesion() responde 200", async () => {
  const deps = resolverDepsApi({ prisma, parametrosHash: PARAMETROS_PRUEBA, cookieSegura: false, origenesPermitidos: [] });
  const app = express();
  const router = express.Router();
  router.use(autenticar(deps));
  router.get("/sin-declarar", (_req, res) => {
    res.json({ db: contextoDe(res).db ? "tocada" : "no" });
  });
  router.get("/declarada", soloSesion(), (_req, res) => {
    res.json({ organizacion: contextoDe(res).organizacionId });
  });
  router.use(manejadorDeErroresApi);
  app.use("/api", router);
  const server = escucharSinReuso(app);
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const cookie = `sesion=${como("asesor").cookieDeSesion!}`;
    const sin = await fetch(`${base}/api/sin-declarar`, { headers: { cookie } });
    assert.equal(sin.status, 500);
    assert.deepEqual(await sin.json(), { error: { codigo: "interno", mensaje: "Ocurrió un error. Inténtalo de nuevo." } });
    const con = await fetch(`${base}/api/declarada`, { headers: { cookie } });
    assert.equal(con.status, 200);
    assert.equal(((await con.json()) as { organizacion: string }).organizacion, A.organizacionId);
    assert.equal((await fetch(`${base}/api/declarada`)).status, 401);
  } finally {
    server.close();
  }
});

// ── Las rutas reales declaran el permiso de la matriz ──────────────────────────────────

interface RutaReal {
  metodo: "GET" | "PATCH" | "POST";
  ruta: string;
  cuerpo?: unknown;
  permiso: keyof typeof MATRIZ_DE_PERMISOS;
  /** Qué da quien SÍ tiene el permiso con esa petición de prueba. */
  siPermitido: number;
}

test("cada ruta real da 403 a los roles sin su permiso y no-403 a los que lo tienen", async () => {
  const idInexistente = randomUUID();
  const rutas: RutaReal[] = [
    { metodo: "GET", ruta: "/api/usuarios", permiso: "usuarios:administrar", siPermitido: 200 },
    { metodo: "POST", ruta: "/api/usuarios", cuerpo: {}, permiso: "usuarios:administrar", siPermitido: 400 },
    { metodo: "PATCH", ruta: `/api/usuarios/${idInexistente}`, cuerpo: { nombre: "x" }, permiso: "usuarios:administrar", siPermitido: 404 },
    { metodo: "GET", ruta: "/api/leads", permiso: "leads:leer", siPermitido: 200 },
    { metodo: "GET", ruta: `/api/leads/${idInexistente}`, permiso: "leads:leer", siPermitido: 404 },
    { metodo: "GET", ruta: "/api/tareas", permiso: "tareas:leer", siPermitido: 200 },
    { metodo: "PATCH", ruta: `/api/tareas/${idInexistente}`, cuerpo: { estado: "hecha" }, permiso: "tareas:resolver", siPermitido: 404 },
    { metodo: "GET", ruta: "/api/grupos", permiso: "grupos:leer", siPermitido: 200 },
  ];
  for (const rol of ROLES) {
    for (const r of rutas) {
      const c = como(rol);
      const res = await c.pedir(r.metodo, r.ruta, r.cuerpo);
      const esperado = loTiene(rol, r.permiso) ? r.siPermitido : 403;
      assert.equal(res.estado, esperado, `${rol} ${r.metodo} ${r.ruta}`);
    }
  }
});

test("/api/yo dice quién eres, tus sucursales y tus permisos", async () => {
  const yo = await como("asesor").get<{ usuario: { rol: string }; sucursales: { id: string }[]; permisos: string[] }>("/api/yo");
  assert.equal(yo.cuerpo.usuario.rol, "asesor");
  assert.deepEqual(yo.cuerpo.sucursales.map((s) => s.id), [A.sucursales[0]!.id]);
  assert.ok(yo.cuerpo.permisos.includes("leads:leer"));
  assert.ok(!yo.cuerpo.permisos.includes("usuarios:administrar"));
  const admin = await como("administrador").get<{ sucursales: unknown[] }>("/api/yo");
  assert.equal(admin.cuerpo.sucursales.length, 2, "el administrador ve todas");
});

// ── Alcance por sucursal ───────────────────────────────────────────────────────────────

test("leads: el asesor ve solo su sucursal; recepción las dos; el administrador todo, incluido el lead sin sucursal", async () => {
  const asesor = ids(await como("asesor").get("/api/leads?limite=100"));
  assert.ok(asesor.includes(m.leadNorte));
  assert.ok(!asesor.includes(m.leadSur));
  assert.ok(!asesor.includes(m.leadSinSucursal), "sin sucursal solo lo ve el administrador");
  const recep = ids(await como("recepcion").get("/api/leads?limite=100"));
  assert.ok(recep.includes(m.leadNorte) && recep.includes(m.leadSur));
  assert.ok(!recep.includes(m.leadSinSucursal));
  const admin = ids(await como("administrador").get("/api/leads?limite=100"));
  assert.ok([m.leadNorte, m.leadSur, m.leadSinSucursal].every((id) => admin.includes(id)));
  // Pedir explícitamente otra sucursal no abre nada.
  const otra = ids(await como("asesor").get(`/api/leads?sucursal_id=${A.sucursales[1]!.id}`));
  assert.deepEqual(otra, []);
});

test("lead por id: el de otra sucursal da 404 (no 403) al asesor; el administrador lo ve con sus prospectos", async () => {
  assert.equal((await como("asesor").get(`/api/leads/${m.leadSur}`)).estado, 404);
  assert.equal((await como("asesor").get(`/api/leads/${m.leadNorte}`)).estado, 200);
  assert.equal((await como("asesor").get(`/api/leads/${m.leadSinSucursal}`)).estado, 404);
  const r = await como("administrador").get<{ id: string; prospectos: unknown[] }>(`/api/leads/${m.leadSur}`);
  assert.equal(r.estado, 200);
  assert.ok(Array.isArray(r.cuerpo.prospectos));
});

test("leads: buscar por teléfono pasa por normalizarTelefono (+521 y +52 son el mismo)", async () => {
  const lead = await sembrarLead(A, A.sucursales[0]!.id, "+525599887766");
  const r = await como("administrador").get(`/api/leads?telefono=${encodeURIComponent("+5215599887766")}`);
  assert.deepEqual(ids(r), [lead.id]);
  assert.equal((await como("administrador").get("/api/leads?telefono=abc")).estado, 400);
});

test("tareas: alcance por la sucursal del lead; resolver una de otra sucursal da 404", async () => {
  const asesor = ids(await como("asesor").get("/api/tareas?limite=100"));
  assert.ok(asesor.includes(m.tareaNorte) && !asesor.includes(m.tareaSur));
  assert.equal((await como("asesor").patch(`/api/tareas/${m.tareaSur}`, { estado: "hecha" })).estado, 404);
  const sigue = await prisma.tarea_asesor.findFirstOrThrow({ where: { id: m.tareaSur } });
  assert.equal(sigue.estado, "pendiente");
});

test("tareas: resolver cambia el estado y la hora; ya resuelta → 409; estado inválido → 400", async () => {
  const lead = await sembrarLead(A, A.sucursales[0]!.id);
  const t = await sembrarTarea(A, lead.id);
  assert.equal((await como("asesor").patch(`/api/tareas/${t.id}`, { estado: "pendiente" })).estado, 400);
  const ok = await como("asesor").patch<{ estado: string; resuelta_en: string | null }>(`/api/tareas/${t.id}`, { estado: "descartada" });
  assert.equal(ok.estado, 200);
  assert.equal(ok.cuerpo.estado, "descartada");
  assert.ok(ok.cuerpo.resuelta_en);
  assert.equal((await como("asesor").patch(`/api/tareas/${t.id}`, { estado: "hecha" })).estado, 409);
});

test("tareas: seis personas resuelven la misma tarea a la vez → una gana (200) y cinco reciben 409", async () => {
  const lead = await sembrarLead(A, A.sucursales[0]!.id);
  const t = await sembrarTarea(A, lead.id);
  const clientes = await Promise.all(Array.from({ length: 6 }, () => entrar(A, gente.asesorNorte)));
  const estados = (await Promise.all(clientes.map((c) => c.patch(`/api/tareas/${t.id}`, { estado: "hecha" })))).map((r) => r.estado).sort();
  assert.deepEqual(estados, [200, 409, 409, 409, 409, 409]);
});

test("grupos: el maestro ve SOLO sus grupos; un maestro sin grupos ve la lista vacía; el asesor ve los de su sucursal; recepción las dos", async () => {
  const maestro = ids(await como("maestro").get("/api/grupos?limite=100"));
  assert.deepEqual(maestro, [m.grupoDelMaestro]);
  const sin = await entrar(A, gente.maestroSinGrupos);
  assert.deepEqual(ids(await sin.get("/api/grupos")), []);
  const asesor = ids(await como("asesor").get("/api/grupos?limite=100"));
  assert.ok(asesor.includes(m.grupoDelMaestro) && asesor.includes(m.grupoNorteSinMaestro) && !asesor.includes(m.grupoSur));
  const recep = ids(await como("recepcion").get("/api/grupos?limite=100"));
  assert.ok([m.grupoDelMaestro, m.grupoNorteSinMaestro, m.grupoSur].every((id) => recep.includes(id)));
  const admin = ids(await como("administrador").get("/api/grupos?limite=100"));
  assert.ok([m.grupoDelMaestro, m.grupoNorteSinMaestro, m.grupoSur].every((id) => admin.includes(id)));
  // El maestro no se salta su límite pidiendo un programa o sucursal ajenos.
  assert.deepEqual(ids(await como("maestro").get(`/api/grupos?sucursal_id=${A.sucursales[1]!.id}`)), []);
});

test("grupos: el detalle trae horarios y programa", async () => {
  const r = await como("maestro").get<{ datos: { horarios: { dia_semana: number }[]; programa: { nombre: string } }[] }>("/api/grupos");
  assert.equal(r.cuerpo.datos[0]?.horarios[0]?.dia_semana, 2);
  assert.equal(r.cuerpo.datos[0]?.programa.nombre, "Programa norte");
});

// ── Usuarios (administrador) ────────────────────────────────────────────────────────────

test("usuarios: el administrador da de alta (con sucursales), lista, y nunca se devuelve ni se guarda la contraseña en claro", async () => {
  const admin = como("administrador");
  const correo = `nuevo-${randomUUID().slice(0, 8)}@prueba.test`;
  const r = await admin.post<{ id: string; rol: string; sucursales: string[]; contrasena?: unknown; contrasena_hash?: unknown }>("/api/usuarios", {
    correo: correo.toUpperCase(),
    nombre: "Nueva Persona",
    rol: "asesor",
    contrasena: "una-contrasena-larga-1",
    sucursales: [A.sucursales[0]!.id],
  });
  assert.equal(r.estado, 201);
  assert.deepEqual(r.cuerpo.sucursales, [A.sucursales[0]!.id]);
  assert.equal(r.cuerpo.contrasena, undefined);
  assert.equal(r.cuerpo.contrasena_hash, undefined);
  const fila = await prisma.usuario.findFirstOrThrow({ where: { id: r.cuerpo.id } });
  assert.equal(fila.correo, correo, "el correo se normaliza a minúsculas");
  assert.ok(!fila.contrasena_hash.includes("larga"));
  // Puede entrar con ella.
  assert.equal((await api.cliente().login(A.slug, correo, "una-contrasena-larga-1")).estado, 201);
  const lista = await admin.get<{ datos: Record<string, unknown>[] }>("/api/usuarios?limite=100");
  assert.ok(lista.cuerpo.datos.some((u) => u["id"] === r.cuerpo.id));
  assert.ok(lista.cuerpo.datos.every((u) => !("contrasena_hash" in u)));
  assert.equal((await admin.get("/api/usuarios?rol=maestro")).estado, 200);
});

test("usuarios: correo repetido → 409 (también dos altas simultáneas con el mismo correo → una sola entra); política de contraseña → 400", async () => {
  const admin = como("administrador");
  const correo = `repetido-${randomUUID().slice(0, 8)}@prueba.test`;
  const cuerpo = { correo, nombre: "Repetido", rol: "recepcion", contrasena: "una-contrasena-larga-1" };
  const resultados = await Promise.all([admin.post("/api/usuarios", cuerpo), admin.post("/api/usuarios", cuerpo), admin.post("/api/usuarios", cuerpo)]);
  assert.deepEqual(resultados.map((r) => r.estado).sort(), [201, 409, 409]);
  assert.equal(await prisma.usuario.count({ where: { organizacion_id: A.organizacionId, correo } }), 1);
  const debil = await admin.post<{ error: { detalles: { campo: string }[] } }>("/api/usuarios", { ...cuerpo, correo: `otro-${randomUUID().slice(0, 8)}@prueba.test`, contrasena: "corta" });
  assert.equal(debil.estado, 400);
  assert.equal(debil.cuerpo.error.detalles[0]?.campo, "contrasena");
  const desconocido = await admin.post<{ error: { detalles: { campo: string }[] } }>("/api/usuarios", { ...cuerpo, correo: "x@y.co", es_admin: true });
  assert.equal(desconocido.estado, 400);
  assert.equal(desconocido.cuerpo.error.detalles[0]?.campo, "es_admin");
});

test("usuarios: una sucursal de OTRA organización no se puede asignar (400) y el correo no se cambia", async () => {
  const admin = como("administrador");
  const r = await admin.post("/api/usuarios", {
    correo: `ajena-${randomUUID().slice(0, 8)}@prueba.test`,
    nombre: "Con sucursal ajena",
    rol: "asesor",
    contrasena: "una-contrasena-larga-1",
    sucursales: [B.sucursales[0]!.id],
  });
  assert.equal(r.estado, 400);
  const u = await sembrarUsuario(prisma, A.organizacionId, { rol: "asesor" });
  assert.equal((await admin.patch(`/api/usuarios/${u.id}`, { correo: "otro@prueba.test" })).estado, 400);
  assert.equal((await admin.patch(`/api/usuarios/${u.id}`, {})).estado, 400);
});

test("usuarios: crear un maestro le crea su instructor; cambiar el rol a maestro también", async () => {
  const admin = como("administrador");
  const r = await admin.post<{ id: string }>("/api/usuarios", { correo: `m-${randomUUID().slice(0, 8)}@prueba.test`, nombre: "Prof Nuevo", rol: "maestro", contrasena: "una-contrasena-larga-1" });
  assert.equal(await prisma.instructor.count({ where: { usuario_id: r.cuerpo.id, eliminado_en: null } }), 1);
  const otro = await sembrarUsuario(prisma, A.organizacionId, { rol: "asesor" });
  await admin.patch(`/api/usuarios/${otro.id}`, { rol: "maestro" });
  assert.equal(await prisma.instructor.count({ where: { usuario_id: otro.id, eliminado_en: null } }), 1);
  await admin.patch(`/api/usuarios/${otro.id}`, { nombre: "Otro nombre" });
  assert.equal(await prisma.instructor.count({ where: { usuario_id: otro.id, eliminado_en: null } }), 1, "no se duplica");
});

test("usuarios: desactivar, cambiar el rol o restablecer la contraseña cierran sus sesiones en el acto", async () => {
  const admin = como("administrador");
  for (const cambio of [{ activo: false }, { rol: "recepcion" as const }, { contrasena: "contrasena-restablecida-1" }]) {
    const u = await sembrarUsuario(prisma, A.organizacionId, { rol: "asesor" });
    const c = await entrar(A, u);
    assert.equal((await c.get("/api/yo")).estado, 200);
    assert.equal((await admin.patch(`/api/usuarios/${u.id}`, cambio)).estado, 200);
    assert.equal((await c.get("/api/yo")).estado, 401, JSON.stringify(cambio));
  }
  // Un cambio de nombre no cierra nada.
  const u = await sembrarUsuario(prisma, A.organizacionId, { rol: "asesor" });
  const c = await entrar(A, u);
  await admin.patch(`/api/usuarios/${u.id}`, { nombre: "Solo el nombre" });
  assert.equal((await c.get("/api/yo")).estado, 200);
});

test("usuarios (EB-02): cambiar la PROPIA contraseña por PATCH se rechaza (hay que usar /api/yo/contrasena, que pide la actual); restablecer la de OTRO sí, sin la actual", async () => {
  const jefa = await sembrarUsuario(prisma, A.organizacionId, { rol: "administrador" });
  const otroAdmin = await entrar(A, jefa);
  const segunda = await entrar(A, jefa); // otra sesión de la misma persona (la «robada»)
  const r = await otroAdmin.patch<{ error: { codigo: string; detalles: { campo: string }[] } }>(`/api/usuarios/${jefa.id}`, { contrasena: "contrasena-del-intruso-1" });
  assert.equal(r.estado, 400);
  assert.equal(r.cuerpo.error.codigo, "validacion");
  assert.deepEqual(r.cuerpo.error.detalles.map((d) => d.campo), ["contrasena"]);
  assert.equal((await segunda.get("/api/yo")).estado, 200, "no cerró nada: no pasó nada");
  assert.equal((await api.cliente().login(A.slug, jefa.correo, jefa.contrasena)).estado, 201, "sigue la contraseña de siempre");
  // Con otros cambios sobre sí misma sí puede (nombre).
  assert.equal((await otroAdmin.patch(`/api/usuarios/${jefa.id}`, { nombre: "Nombre nuevo" })).estado, 200);
  // La vía correcta exige la actual y pasa por el bloqueo de intentos (la misma 5 y 6.ª → 429).
  const bloqueable = await sembrarUsuario(prisma, A.organizacionId, { rol: "asesor" });
  const c = await entrar(A, bloqueable);
  for (let i = 0; i < 5; i++) assert.equal((await c.post("/api/yo/contrasena", { actual: "no-es-esta-123", nueva: "otra-contrasena-1" })).estado, 400);
  assert.equal((await c.post("/api/yo/contrasena", { actual: bloqueable.contrasena, nueva: "una-contrasena-nueva-1" })).estado, 429, "ni la actual correcta pasa tras el bloqueo");
  // Un administrador restablece la de OTRA persona sin conocer la actual.
  const otra = await sembrarUsuario(prisma, A.organizacionId, { rol: "recepcion" });
  assert.equal((await como("administrador").patch(`/api/usuarios/${otra.id}`, { contrasena: "restablecida-por-el-admin-1" })).estado, 200);
  assert.equal((await api.cliente().login(A.slug, otra.correo, "restablecida-por-el-admin-1")).estado, 201);
});

test("usuarios: cambiar sucursales reemplaza el conjunto (las que sobran se marcan eliminadas, sin borrar)", async () => {
  const admin = como("administrador");
  const u = await sembrarUsuario(prisma, A.organizacionId, { rol: "asesor", sucursales: [A.sucursales[0]!.id] });
  const r = await admin.patch<{ sucursales: string[] }>(`/api/usuarios/${u.id}`, { sucursales: [A.sucursales[1]!.id] });
  assert.deepEqual(r.cuerpo.sucursales, [A.sucursales[1]!.id]);
  assert.equal(await prisma.usuario_sucursal.count({ where: { usuario_id: u.id } }), 2, "la fila vieja sigue, eliminada");
  const vuelve = await admin.patch<{ sucursales: string[] }>(`/api/usuarios/${u.id}`, { sucursales: [A.sucursales[0]!.id, A.sucursales[1]!.id] });
  assert.deepEqual([...vuelve.cuerpo.sucursales].sort(), [A.sucursales[0]!.id, A.sucursales[1]!.id].sort());
});

test("usuarios: no puedes desactivarte ni quitarte el rol de administrador", async () => {
  const admin = como("administrador");
  assert.equal((await admin.patch(`/api/usuarios/${gente.admin.id}`, { activo: false })).estado, 409);
  assert.equal((await admin.patch(`/api/usuarios/${gente.admin.id}`, { rol: "asesor" })).estado, 409);
});

test("usuarios: nunca queda la organización sin administrador activo; dos que se quitan el rol a la vez → uno solo lo logra", async () => {
  const org = await sembrarOrganizacion(prisma, "UltimoAdmin");
  const a1 = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  const a2 = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  const c1 = api.cliente();
  const c2 = api.cliente();
  await c1.login(org.slug, a1.correo, a1.contrasena);
  await c2.login(org.slug, a2.correo, a2.contrasena);
  const [r1, r2] = await Promise.all([c1.patch(`/api/usuarios/${a2.id}`, { rol: "asesor" }), c2.patch(`/api/usuarios/${a1.id}`, { rol: "asesor" })]);
  const estados = [r1.estado, r2.estado].sort();
  // Uno se lleva 200; el otro, o ya no es administrador (sesión cerrada → 401 / sin permiso → 403) o choca con la regla (409).
  assert.equal(estados.filter((e) => e === 200).length, 1, estados.join(","));
  assert.equal(await prisma.usuario.count({ where: { organizacion_id: org.organizacionId, rol: "administrador", activo: true } }), 1);
});

// ── No-fuga entre organizaciones ───────────────────────────────────────────────────────

test("no-fuga: un administrador de la organización A no ve ni toca nada de la B, ni adivinando ids", async () => {
  const admin = como("administrador");
  assert.equal((await admin.get(`/api/leads/${mB.leadId}`)).estado, 404);
  assert.equal((await admin.patch(`/api/tareas/${mB.tareaId}`, { estado: "hecha" })).estado, 404);
  assert.equal((await admin.patch(`/api/usuarios/${mB.usuarioId}`, { activo: false, nombre: "Hackeado" })).estado, 404);
  const tareaB = await prisma.tarea_asesor.findFirstOrThrow({ where: { id: mB.tareaId } });
  assert.equal(tareaB.estado, "pendiente");
  const usuarioB = await prisma.usuario.findFirstOrThrow({ where: { id: mB.usuarioId } });
  assert.equal(usuarioB.activo, true);
  assert.notEqual(usuarioB.nombre, "Hackeado");
  // Las listas no los incluyen.
  assert.ok(!ids(await admin.get("/api/leads?limite=100")).includes(mB.leadId));
  assert.ok(!ids(await admin.get("/api/tareas?limite=100")).includes(mB.tareaId));
  assert.ok(!ids(await admin.get("/api/usuarios?limite=100")).includes(mB.usuarioId));
  // Filtrar por ids de la otra organización no trae nada.
  assert.deepEqual(ids(await admin.get(`/api/leads?sucursal_id=${B.sucursales[0]!.id}`)), []);
  assert.deepEqual(ids(await admin.get(`/api/grupos?sucursal_id=${B.sucursales[0]!.id}`)), []);
  // Y la misma sesión no sirve para actuar como la otra: /api/yo siempre dice la propia.
  assert.equal((await admin.get<{ organizacion: { id: string } }>("/api/yo")).cuerpo.organizacion.id, A.organizacionId);
});

test("no-fuga: ni siquiera con la cookie de un usuario de B se ve nada de A", async () => {
  const adminB = await sembrarUsuario(prisma, B.organizacionId, { rol: "administrador" });
  const c = api.cliente();
  await c.login(B.slug, adminB.correo, adminB.contrasena);
  assert.ok(!ids(await c.get("/api/leads?limite=100")).includes(m.leadNorte));
  assert.equal((await c.get(`/api/leads/${m.leadNorte}`)).estado, 404);
  assert.equal((await c.patch(`/api/tareas/${m.tareaNorte}`, { estado: "hecha" })).estado, 404);
  assert.equal((await c.patch(`/api/usuarios/${gente.asesorNorte.id}`, { activo: false })).estado, 404);
  assert.ok(!ids(await c.get("/api/grupos?limite=100")).includes(m.grupoSur));
});

test("un id mal formado da 400 (validación), no un error de la base", async () => {
  const r = await como("administrador").get<{ error: { codigo: string } }>("/api/leads/no-es-un-uuid");
  assert.equal(r.estado, 400);
  assert.equal(r.cuerpo.error.codigo, "validacion");
});
