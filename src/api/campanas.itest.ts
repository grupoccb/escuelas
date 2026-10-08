// E2: la API de campañas y de sus códigos de rastreo — permisos (solo el administrador escribe; los códigos solo los ve el administrador), validaciones, códigos
// generados o propios, topes y vigencias, baja que libera el código, aislamiento entre organizaciones y registro de cambios.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { conAlcance } from "../datos/alcance.ts";
import { esCodigoValido } from "../captacion/codigos.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let ajena: OrganizacionDePrueba;
let admin: ClienteApi;
let asesor: ClienteApi;
let recepcion: ClienteApi;
let maestro: ClienteApi;
let adminAjeno: ClienteApi;
const db = () => conAlcance(prisma, org.organizacionId);

interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
interface Campana { id: string; nombre: string; origen: string; sucursal_id: string | null; vertical_id: string | null; activo: boolean; fecha_inicio: string | null }
interface Codigo { id: string; codigo: string; codigo_formateado: string; tipo: string; campana_id: string; sucursal_id: string | null; vertical_id: string | null; usos: number; max_usos: number | null; activo: boolean; vigente_hasta: string | null }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  org = await sembrarOrganizacion(prisma, "Campañas");
  ajena = await sembrarOrganizacion(prisma, "Campañas ajena");
  const entrar = async (o: OrganizacionDePrueba, rol: "administrador" | "asesor" | "maestro" | "recepcion") => {
    const u = await sembrarUsuario(prisma, o.organizacionId, { rol, sucursales: rol === "asesor" || rol === "recepcion" ? [o.sucursales[0]!.id] : [] });
    const c = api.cliente();
    assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  admin = await entrar(org, "administrador");
  asesor = await entrar(org, "asesor");
  recepcion = await entrar(org, "recepcion");
  maestro = await entrar(org, "maestro");
  adminAjeno = await entrar(ajena, "administrador");
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

const crearCampana = (c: ClienteApi, cuerpo: Record<string, unknown> = {}) => c.post<Campana & Errores>("/api/campanas", { nombre: "QR en sucursal", origen: "presencial", ...cuerpo });
const crearCodigo = (c: ClienteApi, cuerpo: Record<string, unknown>) => c.post<Codigo & Errores>("/api/codigos-rastreo", cuerpo);

test("E2 campañas: alta, lectura, cambio y baja; solo el administrador escribe; todos los roles con catálogo leen; fecha fin no anterior al inicio", async () => {
  const r = await crearCampana(admin, { sucursal_id: org.sucursales[0]!.id, vertical_id: org.verticalId, fecha_inicio: "2026-11-01", fecha_fin: "2026-11-30" });
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  assert.deepEqual([r.cuerpo.origen, r.cuerpo.activo, r.cuerpo.sucursal_id, r.cuerpo.fecha_inicio], ["presencial", true, org.sucursales[0]!.id, "2026-11-01"]);
  for (const c of [asesor, recepcion, maestro]) {
    assert.equal((await crearCampana(c)).estado, 403);
    assert.equal((await c.get(`/api/campanas/${r.cuerpo.id}`)).estado, 200, "leer sí");
  }
  assert.equal((await api.cliente().get("/api/campanas")).estado, 401);
  const lista = await asesor.get<{ datos: Campana[]; paginacion: { total: number } }>("/api/campanas?origen=presencial");
  assert.ok(lista.cuerpo.datos.some((c) => c.id === r.cuerpo.id));
  assert.equal((await crearCampana(admin, { origen: "paloma" })).estado, 400);
  assert.equal((await crearCampana(admin, { fecha_inicio: "2026-11-10", fecha_fin: "2026-11-01" })).estado, 400);
  assert.equal((await crearCampana(admin, { sucursal_id: ajena.sucursales[0]!.id })).estado, 400, "una sucursal de otra organización");
  assert.equal((await crearCampana(admin, { vertical_id: ajena.verticalId })).estado, 400);
  const cambio = await admin.patch<Campana>(`/api/campanas/${r.cuerpo.id}`, { nombre: "QR renombrado", activo: false, sucursal_id: null, fecha_fin: null });
  assert.deepEqual([cambio.cuerpo.nombre, cambio.cuerpo.activo, cambio.cuerpo.sucursal_id], ["QR renombrado", false, null]);
  assert.equal((await admin.patch(`/api/campanas/${r.cuerpo.id}`, {})).estado, 400);
  assert.equal((await admin.patch(`/api/campanas/${r.cuerpo.id}`, { fecha_fin: "2026-10-01" })).estado, 400, "antes del inicio que ya tiene");
  assert.equal((await adminAjeno.get(`/api/campanas/${r.cuerpo.id}`)).estado, 404);
  assert.equal((await adminAjeno.patch(`/api/campanas/${r.cuerpo.id}`, { nombre: "x" })).estado, 404);
  assert.equal((await admin.delete(`/api/campanas/${r.cuerpo.id}`)).estado, 204);
  assert.equal((await admin.get(`/api/campanas/${r.cuerpo.id}`)).estado, 404);
  assert.ok((await db().registro_cambio.count({ where: { entidad_tipo: "campana", entidad_id: r.cuerpo.id } })) >= 3);
});

test("E2 códigos: se genera uno con la forma correcta o se acepta el propio (normalizado); hereda sucursal y vertical de la campaña; no se repite entre los vivos", async () => {
  const c = (await crearCampana(admin, { nombre: "Anuncio", origen: "facebook", sucursal_id: org.sucursales[1]!.id, vertical_id: org.verticalId })).cuerpo;
  const generado = await crearCodigo(admin, { campana_id: c.id });
  assert.equal(generado.estado, 201, JSON.stringify(generado.cuerpo));
  assert.ok(esCodigoValido(generado.cuerpo.codigo));
  assert.equal(generado.cuerpo.codigo_formateado, `${generado.cuerpo.codigo.slice(0, 4)}-${generado.cuerpo.codigo.slice(4)}`);
  assert.deepEqual([generado.cuerpo.tipo, generado.cuerpo.usos, generado.cuerpo.max_usos, generado.cuerpo.activo, generado.cuerpo.sucursal_id, generado.cuerpo.vertical_id], ["campana", 0, null, true, org.sucursales[1]!.id, org.verticalId]);
  // Uno propio, escrito como se imprime o con minúsculas.
  const propio = await crearCodigo(admin, { campana_id: c.id, codigo: "qr7m-2kxa", sucursal_id: org.sucursales[0]!.id, max_usos: 50, vigente_hasta: "2099-01-01T00:00:00Z" });
  assert.equal(propio.estado, 201, JSON.stringify(propio.cuerpo));
  assert.deepEqual([propio.cuerpo.codigo, propio.cuerpo.max_usos, propio.cuerpo.sucursal_id], ["QR7M2KXA", 50, org.sucursales[0]!.id], "la sucursal explícita manda sobre la de la campaña");
  const repetido = await crearCodigo(admin, { campana_id: c.id, codigo: "QR7M 2KXA" });
  assert.equal(repetido.estado, 409);
  assert.ok(repetido.cuerpo.error.detalles?.some((d) => d.campo === "codigo"));
  for (const mal of ["ABC", "ABCD-EFGH", "ABCD-EFG0", "ABCD-EFGI2", "no es un código", "x".repeat(21)]) {
    const x = await crearCodigo(admin, { campana_id: c.id, codigo: mal });
    assert.equal(x.estado, 400, mal);
  }
  // Referencias y vigencias.
  assert.equal((await crearCodigo(admin, { campana_id: "00000000-0000-4000-8000-0000000000ab" })).estado, 400);
  const deAjena = (await adminAjeno.post<Campana>("/api/campanas", { nombre: "Ajena", origen: "otro" })).cuerpo;
  assert.equal((await crearCodigo(admin, { campana_id: deAjena.id })).estado, 400, "una campaña de otra organización");
  assert.equal((await crearCodigo(admin, { campana_id: c.id, sucursal_id: ajena.sucursales[0]!.id })).estado, 400);
  assert.equal((await crearCodigo(admin, { campana_id: c.id, vigente_desde: "2026-12-01T00:00:00Z", vigente_hasta: "2026-11-01T00:00:00Z" })).estado, 400);
  assert.equal((await crearCodigo(admin, { campana_id: c.id, max_usos: 0 })).estado, 400);
  assert.equal((await crearCodigo(admin, { campana_id: c.id, tipo: "lead" })).estado, 400, "los de lead los crea el sistema");
  // Dos altas simultáneas del mismo código: una gana.
  const [a, b] = await Promise.all([crearCodigo(admin, { campana_id: c.id, codigo: "SJMUQ2K3" }), crearCodigo(admin, { campana_id: c.id, codigo: "SJMUQ2K3" })]);
  assert.deepEqual([a.estado, b.estado].sort(), [201, 409]);
  assert.equal(await db().codigo_rastreo.count({ where: { codigo: "SJMUQ2K3" } }), 1);
});

test("E2 códigos: solo el administrador los ve y escribe; listar con filtros; cambiar activo, tope y vigencia (el tope no baja de los usos); la baja libera el código", async () => {
  const c = (await crearCampana(admin, { nombre: "Otra", origen: "instagram" })).cuerpo;
  const k1 = (await crearCodigo(admin, { campana_id: c.id, codigo: "FKTRQ2K3" })).cuerpo;
  const k2 = (await crearCodigo(admin, { campana_id: c.id, codigo: "FKTRQ2K4", sucursal_id: org.sucursales[1]!.id })).cuerpo;
  for (const x of [asesor, recepcion, maestro]) {
    assert.equal((await x.get("/api/codigos-rastreo")).estado, 403);
    assert.equal((await crearCodigo(x, { campana_id: c.id })).estado, 403);
    assert.equal((await x.patch(`/api/codigos-rastreo/${k1.id}`, { activo: false })).estado, 403);
    assert.equal((await x.delete(`/api/codigos-rastreo/${k1.id}`)).estado, 403);
  }
  const lista = (f: string) => admin.get<{ datos: Codigo[]; paginacion: { total: number } }>(`/api/codigos-rastreo?campana_id=${c.id}${f}`);
  assert.deepEqual((await lista("")).cuerpo.datos.map((x) => x.codigo).sort(), ["FKTRQ2K3", "FKTRQ2K4"]);
  assert.deepEqual((await lista(`&sucursal_id=${org.sucursales[1]!.id}`)).cuerpo.datos.map((x) => x.codigo), ["FKTRQ2K4"]);
  assert.equal((await lista("&tipo=lead")).cuerpo.paginacion.total, 0);
  assert.equal((await lista("&limite=1&pagina=2")).cuerpo.datos.length, 1);
  assert.equal((await admin.get("/api/codigos-rastreo?campana_id=no-es-uuid")).estado, 400);
  // Cambios.
  await prisma.codigo_rastreo.update({ where: { id: k1.id }, data: { usos: 5 } });
  assert.equal((await admin.patch(`/api/codigos-rastreo/${k1.id}`, { max_usos: 4 })).estado, 409, "el tope no baja de los usos");
  const ok = await admin.patch<Codigo>(`/api/codigos-rastreo/${k1.id}`, { max_usos: 10, vigente_hasta: "2099-06-01T00:00:00Z", activo: false });
  assert.deepEqual([ok.cuerpo.max_usos, ok.cuerpo.activo, ok.cuerpo.vigente_hasta], [10, false, "2099-06-01T00:00:00.000Z"]);
  assert.equal((await admin.patch<Codigo>(`/api/codigos-rastreo/${k1.id}`, { max_usos: null, vigente_hasta: null })).cuerpo.max_usos, null);
  assert.equal((await admin.patch(`/api/codigos-rastreo/${k1.id}`, {})).estado, 400);
  assert.equal((await admin.patch(`/api/codigos-rastreo/${k1.id}`, { codigo: "OTRO2222" })).estado, 400, "el código no se edita");
  assert.equal((await admin.patch(`/api/codigos-rastreo/${k1.id}`, { vigente_hasta: "2099-06-01T00:00:00Z" })).estado, 200);
  assert.equal((await admin.patch(`/api/codigos-rastreo/${k1.id}`, { vigente_desde: "2099-12-01T00:00:00Z" })).estado, 400, "inicio posterior al fin que tiene");
  assert.equal((await admin.patch(`/api/codigos-rastreo/${k1.id}`, { vigente_hasta: null })).estado, 200);
  assert.equal((await adminAjeno.patch(`/api/codigos-rastreo/${k1.id}`, { activo: true })).estado, 404);
  assert.equal((await adminAjeno.get<{ datos: Codigo[] }>("/api/codigos-rastreo")).cuerpo.datos.some((x) => x.id === k1.id), false);
  // La baja libera el código: se puede volver a crear; la campaña con códigos vivos no se borra.
  assert.equal((await admin.delete(`/api/campanas/${c.id}`)).estado, 409);
  assert.equal((await admin.delete(`/api/codigos-rastreo/${k2.id}`)).estado, 204);
  assert.equal((await admin.delete(`/api/codigos-rastreo/${k2.id}`)).estado, 404);
  assert.equal((await crearCodigo(admin, { campana_id: c.id, codigo: "FKTRQ2K4" })).estado, 201);
  const cambios = await db().registro_cambio.findMany({ where: { entidad_tipo: "codigo_rastreo", entidad_id: k1.id } });
  assert.ok(cambios.length >= 2 && cambios.every((x) => !JSON.stringify(x).includes("password")));
  // Una campaña con leads no se borra: se apaga.
  const conLeads = (await crearCampana(admin, { nombre: "Con leads" })).cuerpo;
  await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, etapa_id: org.etapaInicialId, campana_id: conLeads.id, telefono: "+525500098765" } });
  assert.equal((await admin.delete(`/api/campanas/${conLeads.id}`)).estado, 409);
});

test("EE-09 (C02): el código de un lead se usa una sola vez: cambiarle el tope es un 409 (no un 500 de la base); apagarlo sí se puede", async () => {
  const c = (await crearCampana(admin, { nombre: "Tope del lead", origen: "instagram" })).cuerpo;
  const familia = await prisma.lead.create({ data: { organizacion_id: org.organizacionId, vertical_interes_id: org.verticalId, etapa_id: org.etapaInicialId, telefono: "+525580000099" } });
  const codigo = await prisma.codigo_rastreo.create({ data: { organizacion_id: org.organizacionId, codigo: "XDTPQ2K3", tipo: "lead", lead_id: familia.id, campana_id: c.id, max_usos: 1 } });
  const cambio = await admin.patch<{ error: { codigo: string } }>(`/api/codigos-rastreo/${codigo.id}`, { max_usos: 5 });
  assert.equal(cambio.estado, 409);
  assert.equal((await prisma.codigo_rastreo.findFirstOrThrow({ where: { id: codigo.id } })).max_usos, 1);
  assert.equal((await admin.patch(`/api/codigos-rastreo/${codigo.id}`, { activo: false })).estado, 200);
});
