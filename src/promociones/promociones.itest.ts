// C3 contra Postgres real y la app real: API de promociones y beneficios (permisos, alcance, validaciones,
// registro de cambios, no-fuga), carga + resolutor sobre datos reales, consumo de cupo bajo concurrencia y las
// restricciones de la base.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { Barrera, conGanchos } from "../testutil/carrera.ts";
import { aTexto, deTexto } from "../lib/dinero.ts";
import { cargarPromociones, promocionesAplicables } from "./cargar.ts";
import { consumirCupo, liberarCupo } from "./cupo.ts";
import type { ContextoPromocion } from "./resolver.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let ajena: OrganizacionDePrueba;
let admin: ClienteApi;
let asesorNorte: ClienteApi;
let recepcionSur: ClienteApi;
let maestro: ClienteApi;
let norte: string;
let sur: string;
let pNorte: string;
let pSur: string;
let verticalB: string;

interface Beneficio { id: string; tipo: string; modo: string; valor: string | null; producto_id: string | null; descripcion: string | null; momento_disparo: string }
interface Promo {
  id: string; nombre: string; codigo: string; vigencia_desde: string; vigencia_hasta: string | null; condicion_tipo: string; condicion_valor: unknown;
  cupo_maximo: number | null; cupo_usado: number; acumulable: boolean; prioridad: number; activo: boolean;
  verticales: string[]; sucursales: string[]; programas: string[]; beneficios: Beneficio[];
}
interface ErrorBody { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  org = await sembrarOrganizacion(prisma, "Promociones");
  ajena = await sembrarOrganizacion(prisma, "PromocionesAjena");
  norte = org.sucursales[0]!.id;
  sur = org.sucursales[1]!.id;
  verticalB = (await prisma.vertical.create({ data: { organizacion_id: org.organizacionId, nombre: "Otra vertical", slug: "otra-vertical" } })).id;
  const entrar = async (rol: "administrador" | "asesor" | "maestro" | "recepcion", sucursales: string[] = []) => {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol, sucursales });
    const c = api.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  admin = await entrar("administrador");
  asesorNorte = await entrar("asesor", [norte]);
  recepcionSur = await entrar("recepcion", [sur]);
  maestro = await entrar("maestro");
  const programa = (sucursal: string, nombre: string) =>
    prisma.programa.create({ data: { organizacion_id: org.organizacionId, vertical_id: org.verticalId, sucursal_id: sucursal, nombre, edad_min: 3, edad_max: 12 } });
  pNorte = (await programa(norte, "Programa norte")).id;
  pSur = (await programa(sur, "Programa sur")).id;
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

let n = 0;
const codigoNuevo = (): string => `PROMO-${Date.now().toString(36)}-${++n}`.toUpperCase();
const crear = (extra: object = {}) => admin.post<Promo & ErrorBody>("/api/promociones", { nombre: "Promo de prueba", codigo: codigoNuevo(), vigencia_desde: "2026-01-01", ...extra });
const crearOk = async (extra: object = {}): Promise<Promo> => {
  const r = await crear(extra);
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  return r.cuerpo;
};
const db = () => conAlcance(prisma, org.organizacionId);
/** Una inscripción de verdad (desde F3 `promocion_aplicacion.inscripcion_id` es llave foránea). */
async function inscripcionReal(): Promise<string> {
  const o = org.organizacionId;
  const alumno = await prisma.alumno.create({ data: { organizacion_id: o, nombre: "Alumno", apellidos: "Prueba", fecha_nacimiento: new Date("2018-01-01") } });
  const grupo = await prisma.grupo.create({ data: { organizacion_id: o, programa_id: pNorte, nombre: `Grupo ${++n}`, cupo_maximo: 5 } });
  const i = await prisma.inscripcion.create({
    data: { organizacion_id: o, alumno_id: alumno.id, grupo_id: grupo.id, programa_id: pNorte, fecha_inscripcion: new Date("2026-10-20"), fecha_inicio: new Date("2026-10-20"), precio_inscripcion_aplicado: "100.00", precio_mensualidad_aplicado: "200.00", dia_corte_pago: 20 },
  });
  return i.id;
}
/** El contexto de una inscripción en el programa del norte, hoy (2026-10-20). */
const ctx = (extra: Partial<ContextoPromocion> = {}): ContextoPromocion => ({ fecha: "2026-10-20", verticalId: org.verticalId, sucursalId: norte, programaId: pNorte, hermanosInscritos: 0, mesesPagadosPorAdelantado: 0, costoInscripcion: 50000n, costoMensualidad: 80000n, ...extra });
const registros = (id: string) => prisma.registro_cambio.findMany({ where: { entidad_id: id }, orderBy: [{ creado_en: "asc" }, { id: "asc" }] });

// ── API ────────────────────────────────────────────────────────────────────────────────

test("alta completa: alcance, condición, cupo y varios beneficios en una transacción; el código se guarda en MAYÚSCULAS; registro de cambios", async () => {
  const p = await crearOk({
    nombre: "Inscripción gratis y uniforme",
    codigo: "gratis-uniforme",
    vigencia_desde: "2026-10-01",
    vigencia_hasta: "2026-12-31",
    condicion_tipo: "al_pagar_primera_mensualidad",
    cupo_maximo: 50,
    prioridad: 7,
    acumulable: false,
    verticales: [org.verticalId],
    sucursales: [norte, sur],
    programas: [pNorte],
    beneficios: [
      { tipo: "descuento_inscripcion", modo: "total" },
      { tipo: "producto_gratis", modo: "total", descripcion: "Uniforme", momento_disparo: "al_cumplir_condicion" },
      { tipo: "descuento_mensualidad", modo: "porcentaje", valor: "12.5" },
    ],
  });
  assert.equal(p.codigo, "GRATIS-UNIFORME");
  assert.deepEqual([p.condicion_tipo, p.condicion_valor, p.cupo_maximo, p.cupo_usado, p.prioridad, p.acumulable, p.activo], ["al_pagar_primera_mensualidad", null, 50, 0, 7, false, true]);
  assert.deepEqual([p.verticales, [...p.sucursales].sort(), p.programas], [[org.verticalId], [norte, sur].sort(), [pNorte]]);
  assert.equal(p.beneficios.length, 3);
  assert.deepEqual(p.beneficios.map((b) => [b.tipo, b.modo, b.valor, b.momento_disparo]).sort(), [
    ["descuento_inscripcion", "total", null, "inmediato"],
    ["descuento_mensualidad", "porcentaje", "12.50", "inmediato"],
    ["producto_gratis", "total", null, "al_cumplir_condicion"],
  ]);
  const leida = (await admin.get<Promo>(`/api/promociones/${p.id}`)).cuerpo;
  assert.deepEqual(leida, p);
  const reg = await registros(p.id);
  assert.deepEqual(reg.map((x) => x.accion), ["crear"]);
  assert.equal((reg[0]!.despues as Record<string, unknown>)["codigo"], "GRATIS-UNIFORME");
  assert.equal(await prisma.registro_cambio.count({ where: { entidad_tipo: "promocion_beneficio", entidad_id: { in: p.beneficios.map((b) => b.id) } } }), 3);
});

test("alta: condiciones con valor, entradas inválidas (400) y código repetido (409, sin distinguir mayúsculas)", async () => {
  const h = await crearOk({ condicion_tipo: "min_hermanos", condicion_valor: { hermanos: 2 } });
  assert.deepEqual(h.condicion_valor, { hermanos: 2 });
  const m = await crearOk({ condicion_tipo: "pago_anticipado", condicion_valor: { meses: 3 } });
  assert.deepEqual(m.condicion_valor, { meses: 3 });
  for (const mal of [
    { condicion_tipo: "min_hermanos" }, // sin valor
    { condicion_tipo: "min_hermanos", condicion_valor: { hermanos: 1 } },
    { condicion_tipo: "pago_anticipado", condicion_valor: { hermanos: 2 } },
    { condicion_tipo: "sin_condicion", condicion_valor: { hermanos: 2 } },
    { condicion_tipo: "inventada" },
    { vigencia_hasta: "2025-12-31" }, // antes del inicio
    { vigencia_desde: "2026-02-30" },
    { cupo_maximo: 0 },
    { prioridad: 5000 },
    { codigo: "con espacio" },
    { codigo: "x" },
    { verticales: [randomUUID()] },
    { sucursales: [ajena.sucursales[0]!.id] },
    { programas: [randomUUID()] },
    { beneficios: [{ tipo: "descuento_inscripcion", modo: "porcentaje" }] },
    { beneficios: [{ tipo: "descuento_inscripcion", modo: "porcentaje", valor: "150" }] },
    { beneficios: [{ tipo: "descuento_inscripcion", modo: "monto_fijo", valor: 100 }] },
    { beneficios: [{ tipo: "producto_gratis", modo: "porcentaje", valor: "10" }] },
    { beneficios: [{ tipo: "meses_gratis", modo: "total" }] },
    { beneficios: [{ tipo: "descuento_mensualidad", modo: "total", producto_id: randomUUID() }] },
    { cupo_usado: 3 },
    { extra: 1 },
  ]) {
    const r = await crear(mal);
    assert.equal(r.estado, 400, JSON.stringify(mal));
  }
  const codigo = codigoNuevo();
  assert.equal((await crear({ codigo })).estado, 201);
  const repetido = await crear({ codigo: codigo.toLowerCase() });
  assert.equal(repetido.estado, 409, "el código se normaliza a mayúsculas y choca");
  assert.equal(repetido.cuerpo.error.detalles?.[0]?.campo, "codigo");
});

test("cambios: nombre, vigencia, condición (con su valor), cupo y alcance que REEMPLAZA; cupo por debajo de lo usado → 409; todo con registro", async () => {
  const p = await crearOk({ sucursales: [norte], cupo_maximo: 10 });
  const r1 = await admin.patch<Promo>(`/api/promociones/${p.id}`, { nombre: "Otro nombre", prioridad: 3, vigencia_hasta: "2026-12-31", sucursales: [sur], verticales: [org.verticalId] });
  assert.equal(r1.estado, 200);
  assert.deepEqual([r1.cuerpo.nombre, r1.cuerpo.prioridad, r1.cuerpo.vigencia_hasta, r1.cuerpo.sucursales, r1.cuerpo.verticales], ["Otro nombre", 3, "2026-12-31", [sur], [org.verticalId]]);
  assert.equal(await prisma.promocion_sucursal.count({ where: { promocion_id: p.id } }), 2, "la sucursal que sobró quedó con baja lógica");
  const r2 = await admin.patch<Promo>(`/api/promociones/${p.id}`, { sucursales: [], vigencia_hasta: null });
  assert.deepEqual([r2.cuerpo.sucursales, r2.cuerpo.vigencia_hasta], [[], null], "lista vacía = todas");
  const r3 = await admin.patch<Promo>(`/api/promociones/${p.id}`, { condicion_tipo: "min_hermanos", condicion_valor: { hermanos: 3 } });
  assert.deepEqual([r3.cuerpo.condicion_tipo, r3.cuerpo.condicion_valor], ["min_hermanos", { hermanos: 3 }]);
  assert.equal((await admin.patch(`/api/promociones/${p.id}`, { condicion_tipo: "pago_anticipado" })).estado, 400, "cambiar de tipo exige un valor coherente");
  const r4 = await admin.patch<Promo>(`/api/promociones/${p.id}`, { condicion_tipo: "sin_condicion", condicion_valor: null });
  assert.deepEqual([r4.estado, r4.cuerpo.condicion_valor], [200, null]);
  await prisma.promocion.update({ where: { id: p.id }, data: { cupo_usado: 6 } });
  const bajo = await admin.patch<ErrorBody>(`/api/promociones/${p.id}`, { cupo_maximo: 5 });
  assert.equal(bajo.estado, 409);
  assert.equal(bajo.cuerpo.error.detalles?.[0]?.campo, "cupo_maximo");
  assert.equal((await admin.patch(`/api/promociones/${p.id}`, { cupo_maximo: 6 })).estado, 200);
  assert.equal((await admin.patch(`/api/promociones/${p.id}`, { cupo_usado: 0 })).estado, 400, "cupo_usado no se edita");
  assert.equal((await admin.patch(`/api/promociones/${p.id}`, {})).estado, 400);
  assert.equal((await admin.patch(`/api/promociones/${randomUUID()}`, { nombre: "X" })).estado, 404);
  assert.equal((await admin.patch(`/api/promociones/${p.id}`, { vigencia_hasta: "2020-01-01" })).estado, 400);
  const otra = await crearOk();
  assert.equal((await admin.patch(`/api/promociones/${p.id}`, { codigo: otra.codigo })).estado, 409);
  const reg = await registros(p.id);
  assert.ok(reg.length >= 5 && reg.every((x) => x.accion === "crear" || x.accion === "actualizar"));
  assert.deepEqual(reg[1]!.antes, { nombre: "Promo de prueba", prioridad: 0, vigencia_hasta: null, sucursales: [norte], verticales: [] }, "solo lo que cambió");
  assert.deepEqual(reg[1]!.despues, { nombre: "Otro nombre", prioridad: 3, vigencia_hasta: "2026-12-31", sucursales: [sur], verticales: [org.verticalId] });
});

test("baja lógica de una promoción: sale de las listas, libera el código y arrastra su alcance y beneficios; con entregas pendientes → 409", async () => {
  const p = await crearOk({ codigo: "BAJA-1", sucursales: [norte], beneficios: [{ tipo: "descuento_inscripcion", modo: "total" }] });
  assert.equal((await admin.delete(`/api/promociones/${p.id}`)).estado, 204);
  assert.equal((await admin.get(`/api/promociones/${p.id}`)).estado, 404);
  assert.ok((await prisma.promocion.findFirstOrThrow({ where: { id: p.id } })).eliminado_en);
  assert.equal(await prisma.promocion_beneficio.count({ where: { promocion_id: p.id, eliminado_en: null } }), 0);
  assert.equal(await prisma.promocion_sucursal.count({ where: { promocion_id: p.id, eliminado_en: null } }), 0);
  assert.equal((await crear({ codigo: "BAJA-1" })).estado, 201, "el código se puede reutilizar");
  assert.equal((await admin.delete(`/api/promociones/${randomUUID()}`)).estado, 404);

  const q = await crearOk({ beneficios: [{ tipo: "producto_gratis", modo: "total", descripcion: "Uniforme", momento_disparo: "al_cumplir_condicion" }] });
  const aplicacion = await prisma.promocion_aplicacion.create({ data: { organizacion_id: org.organizacionId, inscripcion_id: await inscripcionReal(), promocion_id: q.id, beneficio_id: q.beneficios[0]!.id } });
  assert.equal((await admin.delete(`/api/promociones/${q.id}`)).estado, 409, "un uniforme por entregar");
  assert.equal((await admin.delete(`/api/promociones/${q.id}/beneficios/${q.beneficios[0]!.id}`)).estado, 409);
  await prisma.promocion_aplicacion.update({ where: { id: aplicacion.id }, data: { estatus: "entregado", fecha_entrega: new Date() } });
  assert.equal((await admin.delete(`/api/promociones/${q.id}`)).estado, 204, "entregado: ya se puede");
});

test("beneficios: alta, cambio (la combinación final se revalida) y baja, con registro", async () => {
  const p = await crearOk();
  const alta = await admin.post<Beneficio & ErrorBody>(`/api/promociones/${p.id}/beneficios`, { tipo: "descuento_mensualidad", modo: "monto_fijo", valor: "150" });
  assert.equal(alta.estado, 201);
  assert.equal(alta.cuerpo.valor, "150.00");
  const id = alta.cuerpo.id;
  assert.equal((await admin.post(`/api/promociones/${randomUUID()}/beneficios`, { tipo: "descuento_mensualidad", modo: "total" })).estado, 404);
  assert.equal((await admin.post(`/api/promociones/${p.id}/beneficios`, { tipo: "meses_gratis", modo: "total", valor: "30" })).estado, 400);
  const sube = await admin.patch<Beneficio>(`/api/promociones/${p.id}/beneficios/${id}`, { valor: "175.5", descripcion: "Descuento recurrente" });
  assert.equal(sube.estado, 200);
  assert.deepEqual([sube.cuerpo.valor, sube.cuerpo.descripcion], ["175.50", "Descuento recurrente"]);
  assert.equal((await admin.patch(`/api/promociones/${p.id}/beneficios/${id}`, { modo: "porcentaje" })).estado, 400, "al cambiar de modo el valor anterior ya no vale: hay que mandar uno");
  const cambia = await admin.patch<Beneficio>(`/api/promociones/${p.id}/beneficios/${id}`, { modo: "porcentaje", valor: "10" });
  assert.deepEqual([cambia.estado, cambia.cuerpo.modo, cambia.cuerpo.valor], [200, "porcentaje", "10.00"]);
  const total = await admin.patch<Beneficio>(`/api/promociones/${p.id}/beneficios/${id}`, { modo: "total", valor: null });
  assert.deepEqual([total.estado, total.cuerpo.valor], [200, null]);
  assert.equal((await admin.patch(`/api/promociones/${p.id}/beneficios/${id}`, {})).estado, 400);
  assert.equal((await admin.patch(`/api/promociones/${p.id}/beneficios/${randomUUID()}`, { valor: "1" })).estado, 404);
  const otraPromo = await crearOk();
  assert.equal((await admin.patch(`/api/promociones/${otraPromo.id}/beneficios/${id}`, { descripcion: "x" })).estado, 404, "el beneficio es de otra promoción");
  assert.equal((await admin.delete(`/api/promociones/${p.id}/beneficios/${id}`)).estado, 204);
  assert.equal((await admin.get<Promo>(`/api/promociones/${p.id}`)).cuerpo.beneficios.length, 0);
  assert.deepEqual((await registros(id)).map((x) => x.accion), ["crear", "actualizar", "actualizar", "actualizar", "eliminar"]);
});

test("lista y filtros: activo, vigente_en (bordes), vertical/sucursal/programa con «vacío = todos»; orden por prioridad", async () => {
  const solo = await crearOk({ codigo: codigoNuevo(), nombre: "Filtro", vigencia_desde: "2027-03-01", vigencia_hasta: "2027-03-31", prioridad: 900, verticales: [verticalB], sucursales: [sur] });
  const todas = await crearOk({ nombre: "Filtro todas", vigencia_desde: "2027-03-15", prioridad: 800 });
  const inactiva = await crearOk({ nombre: "Filtro inactiva", activo: false, vigencia_desde: "2027-03-01", prioridad: 700 });
  const ids = async (q: string) => (await admin.get<{ datos: Promo[] }>(`/api/promociones?limite=100&${q}`)).cuerpo.datos.map((x) => x.id);
  const f = (xs: string[]) => xs.filter((x) => [solo.id, todas.id, inactiva.id].includes(x));
  assert.deepEqual(f(await ids("")), [solo.id, todas.id, inactiva.id], "mayor prioridad primero");
  assert.deepEqual(f(await ids("activo=false")), [inactiva.id]);
  assert.deepEqual(f(await ids("activo=true")), [solo.id, todas.id]);
  assert.deepEqual(f(await ids("vigente_en=2027-02-28")), []);
  assert.deepEqual(f(await ids("vigente_en=2027-03-01")), [solo.id, inactiva.id], "el primer día");
  assert.deepEqual(f(await ids("vigente_en=2027-03-31")), [solo.id, todas.id, inactiva.id], "el último día");
  assert.deepEqual(f(await ids("vigente_en=2027-04-01")), [todas.id, inactiva.id]);
  assert.deepEqual(f(await ids(`vertical_id=${verticalB}`)), [solo.id, todas.id, inactiva.id], "la que tiene alcance de esa vertical y las de todas");
  assert.deepEqual(f(await ids(`vertical_id=${org.verticalId}`)), [todas.id, inactiva.id]);
  assert.deepEqual(f(await ids(`sucursal_id=${norte}`)), [todas.id, inactiva.id]);
  assert.deepEqual(f(await ids(`sucursal_id=${sur}`)), [solo.id, todas.id, inactiva.id]);
  assert.equal((await admin.get("/api/promociones?vigente_en=2027-02-31")).estado, 400);
});

test("permisos y alcance: todos leen lo que vale en SU sucursal; solo el administrador escribe; lo ajeno es 404; no-fuga entre organizaciones", async () => {
  const deNorte = await crearOk({ nombre: "Solo norte", sucursales: [norte] });
  const deSur = await crearOk({ nombre: "Solo sur", sucursales: [sur] });
  const deProgramaSur = await crearOk({ nombre: "Programa sur", programas: [pSur] });
  const paraTodos = await crearOk({ nombre: "Para todos" });
  const ids = async (c: ClienteApi) => (await c.get<{ datos: Promo[] }>("/api/promociones?limite=100")).cuerpo.datos.map((x) => x.id);
  const a = await ids(asesorNorte);
  assert.ok(a.includes(deNorte.id) && a.includes(paraTodos.id) && !a.includes(deSur.id) && !a.includes(deProgramaSur.id));
  const r = await ids(recepcionSur);
  assert.ok(r.includes(deSur.id) && r.includes(deProgramaSur.id) && r.includes(paraTodos.id) && !r.includes(deNorte.id));
  assert.equal((await asesorNorte.get(`/api/promociones/${deSur.id}`)).estado, 404);
  assert.equal((await asesorNorte.get(`/api/promociones/${deNorte.id}`)).estado, 200);
  assert.ok((await ids(admin)).includes(deSur.id));
  for (const c of [asesorNorte, recepcionSur, maestro]) {
    assert.equal((await c.post("/api/promociones", { nombre: "No", codigo: "NO-NO", vigencia_desde: "2026-01-01" })).estado, 403);
    assert.equal((await c.patch(`/api/promociones/${deNorte.id}`, { nombre: "No" })).estado, 403);
    assert.equal((await c.delete(`/api/promociones/${deNorte.id}`)).estado, 403);
    assert.equal((await c.post(`/api/promociones/${deNorte.id}/beneficios`, { tipo: "descuento_inscripcion", modo: "total" })).estado, 403);
  }
  const ajeno = await prisma.promocion.create({ data: { organizacion_id: ajena.organizacionId, nombre: "De la otra", codigo: "AJENA", vigencia_desde: new Date("2026-01-01T00:00:00Z") } });
  assert.ok(!(await ids(admin)).includes(ajeno.id));
  for (const [metodo, ruta, cuerpo] of [["get", `/api/promociones/${ajeno.id}`, undefined], ["patch", `/api/promociones/${ajeno.id}`, { nombre: "Robo" }], ["delete", `/api/promociones/${ajeno.id}`, undefined], ["post", `/api/promociones/${ajeno.id}/beneficios`, { tipo: "descuento_inscripcion", modo: "total" }]] as const) {
    assert.equal((await admin.pedir(metodo.toUpperCase(), ruta, cuerpo)).estado, 404, `${metodo} ${ruta}`);
  }
  assert.equal((await prisma.promocion.findFirstOrThrow({ where: { id: ajeno.id } })).nombre, "De la otra");
  // Las tablas puente y los beneficios tampoco cruzan organizaciones (llave foránea compuesta).
  await assert.rejects(prisma.promocion_sucursal.create({ data: { organizacion_id: org.organizacionId, promocion_id: deNorte.id, sucursal_id: ajena.sucursales[0]!.id } }), /Foreign key|foreign key/);
  await assert.rejects(prisma.promocion_beneficio.create({ data: { organizacion_id: ajena.organizacionId, promocion_id: deNorte.id, tipo: "descuento_inscripcion", modo: "total" } }), /Foreign key|foreign key/);
});

// ── Carga + resolutor sobre datos reales ───────────────────────────────────────────────

test("lo guardado por la API llega al resolutor con montos exactos: «inscripción gratis + uniforme al pagar + 15 % por hermanos»", async () => {
  const unica = `U${Date.now().toString(36)}`.toUpperCase();
  const base = await crearOk({
    nombre: `Base ${unica}`,
    condicion_tipo: "al_pagar_primera_mensualidad",
    acumulable: true, // V2: una no acumulable no se combina con la de hermanos; esta prueba es de montos exactos con las dos juntas
    prioridad: 10,
    verticales: [org.verticalId],
    beneficios: [
      { tipo: "descuento_inscripcion", modo: "total" },
      { tipo: "producto_gratis", modo: "total", descripcion: "Uniforme", momento_disparo: "al_cumplir_condicion" },
    ],
  });
  const hermanos = await crearOk({
    nombre: `Hermanos ${unica}`,
    condicion_tipo: "min_hermanos",
    condicion_valor: { hermanos: 2 },
    acumulable: true,
    prioridad: 5,
    beneficios: [{ tipo: "descuento_mensualidad", modo: "porcentaje", valor: "15" }],
  });
  const ctx = { fecha: "2026-10-15", verticalId: org.verticalId, sucursalId: norte, programaId: pNorte, hermanosInscritos: 1, mesesPagadosPorAdelantado: 0, costoInscripcion: deTexto("1234.50"), costoMensualidad: deTexto("1234.50") };
  const r = await promocionesAplicables(db(), ctx);
  const nuestras = (xs: { promocionId: string }[]) => xs.filter((x) => [base.id, hermanos.id].includes(x.promocionId)).map((x) => x.promocionId);
  assert.deepEqual(nuestras(r.aplicadas).sort(), [base.id, hermanos.id].sort());
  const mias = r.lineas.filter((l) => [base.id, hermanos.id].includes(l.promocionId));
  assert.equal(mias.length, 3);
  assert.equal(aTexto(mias.find((l) => l.tipo === "descuento_mensualidad")!.descuento), "185.18", "15 % de $1,234.50");
  assert.equal(mias.find((l) => l.tipo === "producto_gratis")!.estado, "pendiente");
  assert.equal(mias.find((l) => l.tipo === "producto_gratis")!.descripcion, "Uniforme");
  // Sin hermano ya inscrito, la de hermanos no cuenta; en otra vertical, la base tampoco.
  const sinHermano = await promocionesAplicables(db(), { ...ctx, hermanosInscritos: 0 });
  assert.equal(nuestras(sinHermano.aplicadas).includes(hermanos.id), false);
  assert.equal(sinHermano.descartadas.find((d) => d.promocionId === hermanos.id)?.motivo, "condicion_no_cumplida");
  const otraVertical = await promocionesAplicables(db(), { ...ctx, verticalId: verticalB });
  assert.equal(otraVertical.descartadas.find((d) => d.promocionId === base.id)?.motivo, "fuera_de_alcance");
  // cargarPromociones: el formato que consume el resolutor.
  const cargada = (await cargarPromociones(db())).find((x) => x.id === base.id)!;
  assert.deepEqual([cargada.codigo, cargada.condicion, cargada.alcance.verticales, cargada.vigenciaDesde, cargada.vigenciaHasta], [base.codigo, { tipo: "al_pagar_primera_mensualidad" }, [org.verticalId], "2026-01-01", null]);
  assert.deepEqual(cargada.beneficios.map((b) => b.valor), [null, null]);
  // Otra organización no ve estas promociones.
  assert.equal((await cargarPromociones(conAlcance(prisma, ajena.organizacionId))).some((x) => x.id === base.id), false);
});

// ── Cupo bajo concurrencia ─────────────────────────────────────────────────────────────

test("CARRERA: cupo 1 y dos consumos simultáneos (los dos llegan al UPDATE a la vez) → gana UNO", async () => {
  const p = await crearOk({ cupo_maximo: 1 });
  const barrera = new Barrera(2);
  const raiz = conGanchos(prisma, { modelo: "promocion", operacion: "updateMany", cuando: (a) => JSON.stringify(a["where"]).includes(p.id), antes: () => barrera.esperar(2000) });
  const [a, b] = await Promise.all([consumirCupo(conAlcance(raiz, org.organizacionId), p.id, ctx()), consumirCupo(conAlcance(raiz, org.organizacionId), p.id, ctx())]);
  assert.ok(barrera.completa, "las dos se solaparon de verdad: llegaron las dos al UPDATE antes de que cualquiera escribiera");
  assert.deepEqual([a, b].sort(), [false, true]);
  assert.equal((await prisma.promocion.findFirstOrThrow({ where: { id: p.id } })).cupo_usado, 1);
});

test("CARRERA: cupo 3 y 12 consumos simultáneos → exactamente 3 ganan y cupo_usado queda en 3; liberar devuelve un lugar y nunca baja de cero", async () => {
  const p = await crearOk({ cupo_maximo: 3 });
  const resultados = await Promise.all(Array.from({ length: 12 }, () => consumirCupo(db(), p.id, ctx())));
  assert.equal(resultados.filter(Boolean).length, 3);
  assert.equal((await prisma.promocion.findFirstOrThrow({ where: { id: p.id } })).cupo_usado, 3);
  assert.equal(await consumirCupo(db(), p.id, ctx()), false);
  assert.equal(await liberarCupo(db(), p.id), true);
  assert.equal(await consumirCupo(db(), p.id, ctx()), true, "el lugar liberado se puede volver a tomar");
  for (let i = 0; i < 3; i++) await liberarCupo(db(), p.id);
  assert.equal(await liberarCupo(db(), p.id), false, "no baja de cero");
  assert.equal((await prisma.promocion.findFirstOrThrow({ where: { id: p.id } })).cupo_usado, 0);
});

test("F-pre EC-16: consumirCupo comprueba vigencia, alcance y condición del contexto, no solo `activo`; lo que no aplica NO gasta cupo", async () => {
  const p = await crearOk({ cupo_maximo: 5, vigencia_desde: "2026-10-01", vigencia_hasta: "2026-10-31", verticales: [org.verticalId], programas: [pNorte], condicion_tipo: "min_hermanos", condicion_valor: { hermanos: 2 } });
  const usado = async () => (await prisma.promocion.findFirstOrThrow({ where: { id: p.id } })).cupo_usado;
  assert.equal(await consumirCupo(db(), p.id, ctx()), false, "condición: con 0 hermanos inscritos no llega a 2 (cuenta al que se inscribe)");
  assert.equal(await consumirCupo(db(), p.id, ctx({ hermanosInscritos: 1 })), true, "1 hermano + el que se inscribe = 2");
  assert.equal(await consumirCupo(db(), p.id, ctx({ hermanosInscritos: 1, fecha: "2026-09-30" })), false, "antes de la vigencia");
  assert.equal(await consumirCupo(db(), p.id, ctx({ hermanosInscritos: 1, fecha: "2026-11-01" })), false, "después de la vigencia");
  assert.equal(await consumirCupo(db(), p.id, ctx({ hermanosInscritos: 1, fecha: "2026-10-31" })), true, "el último día de la vigencia vale");
  assert.equal(await consumirCupo(db(), p.id, ctx({ hermanosInscritos: 1, programaId: pSur, sucursalId: sur })), false, "fuera del alcance (otro programa)");
  assert.equal(await consumirCupo(db(), p.id, ctx({ hermanosInscritos: 1, verticalId: verticalB })), false, "fuera del alcance (otra vertical)");
  assert.equal(await usado(), 2, "solo los dos consumos válidos gastaron cupo");
  const anticipado = await crearOk({ cupo_maximo: 5, condicion_tipo: "pago_anticipado", condicion_valor: { meses: 3 } });
  assert.equal(await consumirCupo(db(), anticipado.id, ctx({ mesesPagadosPorAdelantado: 2 })), false);
  assert.equal(await consumirCupo(db(), anticipado.id, ctx({ mesesPagadosPorAdelantado: 3 })), true);
});

test("F-pre EC-14: el consumo es UN UPDATE atómico: aunque el tope baje justo antes, no lanza, devuelve false y la transacción de Postgres sigue viva", async () => {
  const p = await crearOk({ cupo_maximo: 3 });
  for (let i = 0; i < 2; i++) assert.equal(await consumirCupo(db(), p.id, ctx()), true);
  // Cuando el consumo está por escribir, otra conexión baja el tope a 2 (válido: ya hay 2 usados). Con leer-y-luego-escribir el UPDATE subiría
  // a 3 > 2 y el CHECK abortaría la transacción; con la condición en la propia sentencia simplemente no hay lugar.
  const raiz = conGanchos(prisma, {
    modelo: "promocion",
    operacion: "updateMany",
    cuando: (a) => JSON.stringify(a["where"]).includes(p.id) && JSON.stringify(a["data"]).includes("increment"),
    antes: async () => {
      await prisma.promocion.update({ where: { id: p.id }, data: { cupo_maximo: 2 } });
    },
  });
  const dentro = await conAlcance(raiz, org.organizacionId).$transaction(async (tx) => {
    const tomado = await consumirCupo(tx, p.id, ctx());
    // Si Postgres hubiera abortado la transacción, esta consulta lanzaría «current transaction is aborted».
    const sigueViva = await tx.promocion.count({ where: { id: p.id } });
    return { tomado, sigueViva };
  });
  assert.deepEqual(dentro, { tomado: false, sigueViva: 1 });
  const fila = await prisma.promocion.findFirstOrThrow({ where: { id: p.id } });
  assert.deepEqual([fila.cupo_usado, fila.cupo_maximo], [2, 2]);
});

test("F-pre: el consumo dentro de una transacción que se revierte no deja cupo gastado", async () => {
  const p = await crearOk({ cupo_maximo: 2 });
  await assert.rejects(() => db().$transaction(async (tx) => {
    assert.equal(await consumirCupo(tx, p.id, ctx()), true);
    throw new Error("falla después de consumir");
  }), /falla después/);
  assert.equal((await prisma.promocion.findFirstOrThrow({ where: { id: p.id } })).cupo_usado, 0);
});

test("consumirCupo: sin tope cuenta los usos; una promoción inactiva, dada de baja, de otra organización o inexistente no da lugar", async () => {
  const libre = await crearOk();
  for (let i = 0; i < 4; i++) assert.equal(await consumirCupo(db(), libre.id, ctx()), true);
  assert.equal((await prisma.promocion.findFirstOrThrow({ where: { id: libre.id } })).cupo_usado, 4);
  const inactiva = await crearOk({ activo: false, cupo_maximo: 5 });
  assert.equal(await consumirCupo(db(), inactiva.id, ctx()), false);
  assert.equal(await consumirCupo(db(), randomUUID(), ctx()), false);
  assert.equal(await consumirCupo(conAlcance(prisma, ajena.organizacionId), libre.id, ctx()), false, "otra organización");
  const baja = await crearOk({ cupo_maximo: 5 });
  await admin.delete(`/api/promociones/${baja.id}`);
  assert.equal(await consumirCupo(db(), baja.id, ctx()), false);
});

test("la BASE impide pasarse del cupo aunque el código lo olvide, y el tope no baja de lo usado", async () => {
  const p = await crearOk({ cupo_maximo: 2 });
  await prisma.promocion.update({ where: { id: p.id }, data: { cupo_usado: 2 } });
  await assert.rejects(prisma.promocion.update({ where: { id: p.id }, data: { cupo_usado: { increment: 1 } } }), /promocion_cupo_check/);
  await assert.rejects(prisma.promocion.update({ where: { id: p.id }, data: { cupo_maximo: 1 } }), /promocion_cupo_check/);
  await assert.rejects(prisma.promocion.update({ where: { id: p.id }, data: { cupo_usado: -1 } }), /promocion_cupo_check/);
});

// ── Restricciones de la base ───────────────────────────────────────────────────────────

test("la BASE valida las combinaciones de beneficio, el valor de la condición, el código único y la aplicación (única y entrega coherente)", async () => {
  const p = await crearOk();
  const b = (datos: object) => prisma.promocion_beneficio.create({ data: { organizacion_id: org.organizacionId, promocion_id: p.id, ...(datos as { tipo: "producto_gratis"; modo: "total" }) } });
  await assert.rejects(b({ tipo: "descuento_inscripcion", modo: "porcentaje", valor: "150.00" }), /promocion_beneficio_combinacion_check/);
  await assert.rejects(b({ tipo: "descuento_inscripcion", modo: "porcentaje" }), /promocion_beneficio_combinacion_check/);
  await assert.rejects(b({ tipo: "descuento_inscripcion", modo: "total", valor: "10.00" }), /promocion_beneficio_combinacion_check/);
  await assert.rejects(b({ tipo: "descuento_mensualidad", modo: "monto_fijo", valor: "0.00" }), /promocion_beneficio_combinacion_check/);
  await assert.rejects(b({ tipo: "producto_gratis", modo: "porcentaje", valor: "10.00" }), /promocion_beneficio_combinacion_check/);
  await assert.rejects(b({ tipo: "meses_gratis", modo: "total", valor: "1.50" }), /promocion_beneficio_combinacion_check/);
  await assert.rejects(b({ tipo: "meses_gratis", modo: "total", valor: "25.00" }), /promocion_beneficio_combinacion_check/);
  const bueno = await b({ tipo: "meses_gratis", modo: "total", valor: "3.00" });
  await assert.rejects(prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre: "x", codigo: "CHECK-COND", vigencia_desde: new Date("2026-01-01T00:00:00Z"), condicion_tipo: "min_hermanos" } }), /promocion_condicion_check/);
  await assert.rejects(prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre: "x", codigo: "CHECK-COND2", vigencia_desde: new Date("2026-01-01T00:00:00Z"), condicion_tipo: "sin_condicion", condicion_valor: { hermanos: 2 } } }), /promocion_condicion_check/);
  await assert.rejects(prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre: "x", codigo: "CHECK-VIG", vigencia_desde: new Date("2026-02-01T00:00:00Z"), vigencia_hasta: new Date("2026-01-01T00:00:00Z") } }), /promocion_vigencia_check/);
  await assert.rejects(prisma.promocion.create({ data: { organizacion_id: org.organizacionId, nombre: "x", codigo: p.codigo, vigencia_desde: new Date("2026-01-01T00:00:00Z") } }), /Unique|unique/);
  // Aplicación: una viva por (inscripción, beneficio) y «entregado» ⇔ fecha de entrega.
  const inscripcion = await inscripcionReal();
  const aplicar = () => prisma.promocion_aplicacion.create({ data: { organizacion_id: org.organizacionId, inscripcion_id: inscripcion, promocion_id: p.id, beneficio_id: bueno.id } });
  const a = await aplicar();
  await assert.rejects(aplicar(), /Unique|unique/, "un reintento no duplica (invariante 8)");
  await assert.rejects(prisma.promocion_aplicacion.update({ where: { id: a.id }, data: { estatus: "entregado" } }), /promocion_aplicacion_entrega_check/);
  await assert.rejects(prisma.promocion_aplicacion.update({ where: { id: a.id }, data: { fecha_entrega: new Date() } }), /promocion_aplicacion_entrega_check/);
  const jefe = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
  await prisma.promocion_aplicacion.update({ where: { id: a.id }, data: { estatus: "entregado", fecha_entrega: new Date(), autorizado_por_id: jefe.id } });
  const otraOrg = await sembrarUsuario(prisma, ajena.organizacionId, { rol: "administrador" });
  await assert.rejects(prisma.promocion_aplicacion.update({ where: { id: a.id }, data: { autorizado_por_id: otraOrg.id } }), /Foreign key|foreign key/, "quien autoriza es de la misma organización");
});

test("EC-14: si un consumo gana la carrera justo antes de que se guarde el cambio de tope, el cambio se rechaza (409) en vez de reventar con el CHECK (500) y cupo_usado nunca pasa del tope", async () => {
  // Un cliente cuyo UPDATE de promociones deja que, justo antes de escribir, otro consumo suba el contador (lo que en producción pasa por casualidad).
  const gancho = { promocionId: "", pendiente: false };
  const alcanzaElConsumo = async (): Promise<void> => {
    if (!gancho.pendiente) return;
    gancho.pendiente = false;
    await prisma.promocion.update({ where: { id: gancho.promocionId }, data: { cupo_usado: { increment: 1 } } });
  };
  const conGancho = prisma.$extends({
    name: "consumo-gana-la-carrera",
    query: {
      promocion: {
        // El cambio de la promoción puede escribirse con update o con updateMany: el gancho cubre las dos formas.
        async updateMany({ args, query }) {
          await alcanzaElConsumo();
          return query(args);
        },
        async update({ args, query }) {
          await alcanzaElConsumo();
          return query(args);
        },
      },
    },
  });
  const apiGancho = levantarApi(conGancho as unknown as PrismaPruebas);
  try {
    const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
    const c = apiGancho.cliente();
    assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
    const p = await c.post<Promo & ErrorBody>("/api/promociones", { nombre: "Carrera de cupo", codigo: `CC-${randomUUID().slice(0, 8)}`.toUpperCase(), vigencia_desde: "2026-01-01", cupo_maximo: 5, beneficios: [{ tipo: "descuento_inscripcion", modo: "total" }] });
    assert.equal(p.estado, 201, JSON.stringify(p.cuerpo));
    for (let i = 0; i < 4; i++) assert.equal(await consumirCupo(conAlcance(prisma, org.organizacionId), p.cuerpo.id, ctx()), true);
    // Cuatro de cinco usados: bajar el tope a 4 es válido al leerlo, pero el consumo sube a 5 antes de que se escriba.
    gancho.promocionId = p.cuerpo.id;
    gancho.pendiente = true;
    const r = await c.patch<ErrorBody>(`/api/promociones/${p.cuerpo.id}`, { cupo_maximo: 4, nombre: "Otro nombre" });
    assert.equal(gancho.pendiente, false, "el gancho corrió");
    assert.equal(r.estado, 409, JSON.stringify(r.cuerpo));
    assert.equal(r.cuerpo.error.codigo, "conflicto");
    assert.equal(r.cuerpo.error.detalles?.[0]?.campo, "cupo_maximo");
    const fila = await conAlcance(prisma, org.organizacionId).promocion.findFirstOrThrow({ where: { id: p.cuerpo.id }, select: { nombre: true, cupo_maximo: true, cupo_usado: true } });
    assert.deepEqual([fila.cupo_maximo, fila.cupo_usado], [5, 5], "nada cambió salvo el consumo");
    assert.notEqual(fila.nombre, "Otro nombre", "ni los demás campos del mismo PATCH");
    // Sin carrera, el mismo cambio sí procede cuando el tope no es menor que lo usado.
    assert.equal((await c.patch<Promo>(`/api/promociones/${p.cuerpo.id}`, { cupo_maximo: 5, nombre: "Otro nombre" })).estado, 200);
  } finally {
    await apiGancho.cerrar();
  }
});
