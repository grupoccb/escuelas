// C9: la API de la lista de espera para el asesor: listar por grupo, quitar y mover (permisos, alcance, registro de
// cambios, no-fuga y concurrencia). Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { altaConCandado, ofrecerLugarLiberado } from "./lista-espera.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let ajena: OrganizacionDePrueba;
let admin: ClienteApi;
let asesorNorte: ClienteApi;
let asesorSur: ClienteApi;
let recepcion: ClienteApi;
let maestro: ClienteApi;
let adminId: string;
let norte: string;
let sur: string;
let grupoNorte: string;
let grupoSur: string;
const db = () => conAlcance(prisma, org.organizacionId);

interface Item { id: string; grupo_id: string; grupo: string; prospecto: string | null; edad_declarada: number | null; lead_id: string; contacto: string | null; telefono: string | null; estatus: string; posicion: number; ofrecido_en: string | null; vence_en: string | null }
interface Lista { datos: Item[]; paginacion: { total: number } }
interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  org = await sembrarOrganizacion(prisma, "API lista de espera");
  ajena = await sembrarOrganizacion(prisma, "API lista de espera ajena");
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
  const pn = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "Programa norte", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Lleno norte", cupoMaximo: 1, permiteListaEspera: true, horarios: [[1, 960, 1020]] }] });
  const ps = await sembrarPrograma(prisma, org, { sucursalId: sur, nombre: "Programa sur", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Lleno sur", cupoMaximo: 1, permiteListaEspera: true, horarios: [[2, 960, 1020]] }] });
  grupoNorte = pn.grupos[0]!.id;
  grupoSur = ps.grupos[0]!.id;
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

let n = 0;
async function familia(o: OrganizacionDePrueba, sucursalId: string, nombre = `Niño ${++n}`) {
  const lead = await prisma.lead.create({ data: { organizacion_id: o.organizacionId, vertical_interes_id: o.verticalId, sucursal_interes_id: sucursalId, etapa_id: o.etapaInicialId, nombre_contacto: "Mamá", telefono: `+5255${String(20_000_000 + n)}` } });
  const prospecto = await prisma.prospecto.create({ data: { organizacion_id: o.organizacionId, lead_id: lead.id, vertical_interes_id: o.verticalId, nombre, edad_declarada: 7, origen: "asesor" } });
  return { leadId: lead.id, prospectoId: prospecto.id };
}
/** Un grupo lleno nuevo, para que cada prueba cuente sus posiciones desde 1. */
async function grupoNuevo(sucursalId: string): Promise<string> {
  const p = await sembrarPrograma(prisma, org, { sucursalId, nombre: `Programa ${++n}`, edadMin: 3, edadMax: 12, grupos: [{ nombre: `Lleno ${n}`, cupoMaximo: 1, permiteListaEspera: true, horarios: [[3, 960, 1020]] }] });
  return p.grupos[0]!.id;
}
async function fila(grupoId: string, cuantas: number, sucursal = grupoId === grupoSur ? sur : norte): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < cuantas; i++) {
    const r = await altaConCandado(db(), { grupoId, ...(await familia(org, sucursal)) });
    ids.push(r.ok ? r.entrada.id : "");
  }
  return ids;
}
const listar = (c: ClienteApi, q = "") => c.get<Lista & Errores>(`/api/lista-espera${q}`);
const orden = async (grupoId: string) => (await db().lista_espera.findMany({ where: { grupo_id: grupoId, estatus: { in: ["esperando", "ofrecido"] } }, orderBy: { posicion: "asc" }, select: { id: true, posicion: true } }));

test("listar: por grupo, en el orden de la fila, con prospecto, contacto y teléfono; sin filtro trae solo las vivas", async () => {
  const gn = (await fila(grupoNorte, 3));
  await ofrecerLugarLiberado(db(), grupoNorte);
  const r = await listar(admin, `?grupo_id=${grupoNorte}`);
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  assert.deepEqual(r.cuerpo.datos.map((x) => [x.id, x.posicion, x.estatus]), [[gn[0], 1, "ofrecido"], [gn[1], 2, "esperando"], [gn[2], 3, "esperando"]]);
  const primera = r.cuerpo.datos[0]!;
  assert.deepEqual([primera.grupo, primera.edad_declarada, primera.contacto], ["Lleno norte", 7, "Mamá"]);
  assert.match(primera.telefono!, /^\+5255\d{8}$/);
  assert.notEqual(primera.vence_en, null);
  // Pagina.
  const p = await listar(admin, `?grupo_id=${grupoNorte}&limite=2&pagina=2`);
  assert.deepEqual([p.cuerpo.datos.length, p.cuerpo.paginacion.total], [1, 3]);
  // Filtra por estatus y por prospecto.
  assert.equal((await listar(admin, `?grupo_id=${grupoNorte}&estatus=ofrecido`)).cuerpo.datos.length, 1);
  assert.equal((await listar(admin, `?grupo_id=${grupoNorte}&estatus=cancelado`)).cuerpo.datos.length, 0);
  assert.equal((await listar(admin, `?prospecto_id=${primera.id}`)).cuerpo.datos.length, 0, "es un id de prospecto, no de entrada");
  assert.equal((await listar(admin, "?estatus=otro")).estado, 400);
  assert.equal((await listar(admin, "?grupo_id=no-es-uuid")).estado, 400);
});

test("permisos: administrador, asesor y recepción leen; el maestro no; solo administrador y asesor quitan y mueven", async () => {
  const [id] = await fila(grupoNorte, 1);
  for (const [c, esperado] of [[admin, 200], [asesorNorte, 200], [recepcion, 200], [maestro, 403], [api.cliente(), 401]] as const) {
    assert.equal((await listar(c, `?grupo_id=${grupoNorte}`)).estado, esperado);
  }
  for (const c of [recepcion, maestro]) {
    assert.equal((await c.patch(`/api/lista-espera/${id}`, { posicion: 1 })).estado, 403);
    assert.equal((await c.delete(`/api/lista-espera/${id}`)).estado, 403);
  }
  assert.equal((await api.cliente().delete(`/api/lista-espera/${id}`)).estado, 401);
  assert.equal((await db().lista_espera.findFirstOrThrow({ where: { id } })).estatus, "esperando", "nada cambió");
});

test("alcance: el asesor ve y toca solo la lista de los grupos de sus sucursales; lo ajeno responde 404", async () => {
  const [enNorte] = await fila(grupoNorte, 1);
  const [enSur] = await fila(grupoSur, 1);
  const vistoPorNorte = (await listar(asesorNorte)).cuerpo.datos.map((x) => x.grupo_id);
  assert.ok(vistoPorNorte.includes(grupoNorte) && !vistoPorNorte.includes(grupoSur));
  const vistoPorSur = (await listar(asesorSur)).cuerpo.datos.map((x) => x.grupo_id);
  assert.ok(vistoPorSur.includes(grupoSur) && !vistoPorSur.includes(grupoNorte));
  assert.equal((await listar(asesorNorte, `?grupo_id=${grupoSur}`)).cuerpo.datos.length, 0);
  assert.equal((await asesorNorte.patch(`/api/lista-espera/${enSur}`, { posicion: 1 })).estado, 404);
  assert.equal((await asesorNorte.delete(`/api/lista-espera/${enSur}`)).estado, 404);
  assert.equal((await asesorSur.delete(`/api/lista-espera/${enNorte}`)).estado, 404);
  assert.equal((await db().lista_espera.findFirstOrThrow({ where: { id: enSur } })).estatus, "esperando");
  const todos = (await listar(admin, "?limite=100")).cuerpo.datos.map((x) => x.grupo_id);
  assert.ok(todos.includes(grupoNorte) && todos.includes(grupoSur));
});

test("mover: cambia la posición, recorre a los demás y deja el registro de cambios; rechaza lo inválido", async () => {
  const grupoSur = await grupoNuevo(sur);
  const ids = await fila(grupoSur, 4, sur);
  const r = await asesorSur.patch<Item & Errores>(`/api/lista-espera/${ids[3]}`, { posicion: 1 });
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  assert.deepEqual([r.cuerpo.id, r.cuerpo.posicion], [ids[3], 1]);
  assert.deepEqual((await orden(grupoSur)).map((x) => x.id).filter((id) => ids.includes(id)), [ids[3], ids[0], ids[1], ids[2]], "las demás se recorrieron");
  const cambio = await db().registro_cambio.findFirstOrThrow({ where: { entidad_tipo: "lista_espera", entidad_id: ids[3]!, accion: "actualizar" } });
  assert.deepEqual([cambio.antes, cambio.despues], [{ posicion: 4 }, { posicion: 1 }]);
  assert.notEqual(cambio.usuario_id, null);
  // Inválidos.
  assert.equal((await asesorSur.patch(`/api/lista-espera/${ids[0]}`, { posicion: 99 })).estado, 400);
  assert.equal((await asesorSur.patch(`/api/lista-espera/${ids[0]}`, { posicion: 0 })).estado, 400);
  assert.equal((await asesorSur.patch(`/api/lista-espera/${ids[0]}`, { posicion: "2" })).estado, 400);
  assert.equal((await asesorSur.patch(`/api/lista-espera/${ids[0]}`, { posicion: 2, estatus: "inscrito" })).estado, 400);
  assert.equal((await asesorSur.patch(`/api/lista-espera/${ids[0]}`, {})).estado, 400);
  assert.equal((await asesorSur.patch(`/api/lista-espera/${randomUUID()}`, { posicion: 1 })).estado, 404);
  // Una familia con lugar ofrecido no se mueve.
  await ofrecerLugarLiberado(db(), grupoSur);
  const ofrecida = (await db().lista_espera.findFirstOrThrow({ where: { grupo_id: grupoSur, estatus: "ofrecido" } })).id;
  assert.equal((await asesorSur.patch<Errores>(`/api/lista-espera/${ofrecida}`, { posicion: 3 })).estado, 409);
});

test("quitar: pasa a cancelado sin borrar, recorre a los demás y deja el registro; quitarla otra vez da 409", async () => {
  const ids = await fila(grupoNorte, 3);
  const antes = (await orden(grupoNorte)).length;
  const r = await asesorNorte.delete(`/api/lista-espera/${ids[1]}`);
  assert.equal(r.estado, 204);
  const fila1 = await db().lista_espera.findFirstOrThrow({ where: { id: ids[1] } });
  assert.equal(fila1.estatus, "cancelado");
  assert.equal(fila1.eliminado_en, null, "se cancela, no se borra");
  const vivas = await orden(grupoNorte);
  assert.equal(vivas.length, antes - 1);
  assert.deepEqual(vivas.map((x) => x.posicion), vivas.map((_, i) => i + 1), "sin huecos");
  const cambio = await db().registro_cambio.findFirstOrThrow({ where: { entidad_tipo: "lista_espera", entidad_id: ids[1]! } });
  assert.deepEqual([cambio.accion, cambio.antes, cambio.despues], ["actualizar", { estatus: "esperando" }, { estatus: "cancelado" }]);
  assert.equal((await asesorNorte.delete<Errores>(`/api/lista-espera/${ids[1]}`)).estado, 409);
  assert.equal((await listar(admin, `?grupo_id=${grupoNorte}&estatus=cancelado`)).cuerpo.datos.some((x) => x.id === ids[1]), true);
  assert.equal((await asesorNorte.delete(`/api/lista-espera/${randomUUID()}`)).estado, 404);
  assert.equal((await asesorNorte.delete("/api/lista-espera/no-es-uuid")).estado, 400);
});

test("CONCURRENCIA: cuatro asesores quitando a la vez a cuatro familias distintas dejan la fila sin huecos ni repetidos", async () => {
  const grupoSur = await grupoNuevo(sur);
  const ids = await fila(grupoSur, 7, sur);
  const aQuitar = [ids[0]!, ids[2]!, ids[3]!, ids[5]!];
  const rs = await Promise.all(aQuitar.map((id) => admin.delete(`/api/lista-espera/${id}`)));
  assert.deepEqual(rs.map((r) => r.estado), [204, 204, 204, 204]);
  const vivas = await orden(grupoSur);
  assert.deepEqual(vivas.map((x) => x.posicion), vivas.map((_, i) => i + 1));
  for (const id of aQuitar) assert.ok(!vivas.some((v) => v.id === id));
  // La misma quitada dos veces a la vez: una gana (204) y la otra 409.
  const [x, y] = await Promise.all([admin.delete(`/api/lista-espera/${ids[1]}`), admin.delete(`/api/lista-espera/${ids[1]}`)]);
  assert.deepEqual([x.estado, y.estado].sort(), [204, 409]);
  // Mover y quitar a la vez: la fila queda coherente.
  const restantes = (await orden(grupoSur)).map((v) => v.id);
  await Promise.all([admin.patch(`/api/lista-espera/${restantes[0]}`, { posicion: 2 }), admin.delete(`/api/lista-espera/${restantes[1]}`)]);
  const fin = await orden(grupoSur);
  assert.deepEqual(fin.map((v) => v.posicion), fin.map((_, i) => i + 1));
});

test("no-fuga: una entrada de otra organización no se ve, no se mueve ni se quita (404)", async () => {
  const f = await familia(ajena, ajena.sucursales[0]!.id);
  const p = await sembrarPrograma(prisma, ajena, { sucursalId: ajena.sucursales[0]!.id, nombre: "Ajeno", edadMin: 3, edadMax: 12, grupos: [{ nombre: "Ajeno lleno", cupoMaximo: 1, permiteListaEspera: true, horarios: [[1, 960, 1020]] }] });
  const r = await altaConCandado(conAlcance(prisma, ajena.organizacionId), { grupoId: p.grupos[0]!.id, ...f });
  const ajenoId = r.ok ? r.entrada.id : "";
  assert.equal((await admin.patch(`/api/lista-espera/${ajenoId}`, { posicion: 1 })).estado, 404);
  assert.equal((await admin.delete(`/api/lista-espera/${ajenoId}`)).estado, 404);
  assert.ok(!(await listar(admin, "?limite=100")).cuerpo.datos.some((x) => x.id === ajenoId));
  assert.equal((await listar(admin, `?grupo_id=${p.grupos[0]!.id}`)).cuerpo.datos.length, 0);
  assert.equal((await prisma.lista_espera.findFirstOrThrow({ where: { id: ajenoId } })).estatus, "esperando");
  void adminId;
});
