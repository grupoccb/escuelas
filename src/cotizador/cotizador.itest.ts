// C5 de punta a punta: el endpoint del cotizador (permisos, alcance, validaciones, no-fuga), la carga desde la
// base (precio vigente con cambio a mitad, lugares reales por la fuente de ocupación, promoción vencida) y la
// fecha de corte de edad. Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { conAlcance } from "../datos/alcance.ts";
import { precioVigente } from "../catalogo/precios.ts";
import { aTexto } from "../lib/dinero.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { OcupacionFija, sembrarOrganizacion, sembrarPrograma, type OrganizacionDePrueba, type ProgramaSembrado } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { cargarCatalogoCotizable } from "./cargar.ts";
import type { CotizacionJson } from "./json.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let ajena: OrganizacionDePrueba;
let norte: string;
let sur: string;
let admin: ClienteApi;
let asesorNorte: ClienteApi;
let maestro: ClienteApi;
let recepcion: ClienteApi;
let chicos: ProgramaSembrado;
let medianos: ProgramaSembrado;
let delSur: ProgramaSembrado;
const ocupacion = new OcupacionFija();
// 14:00 del 8 de octubre en Ciudad de México. El reloj de la API principal no se mueve (las sesiones caducan por
// inactividad); la prueba de la zona horaria levanta su propia API con otro reloj.
const AHORA = new Date("2026-10-08T20:00:00Z");

const H = (dia: number, ini = 960, fin = 1020): [number, number, number] => [dia, ini, fin];
interface Errores { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma, { fuenteOcupacion: ocupacion, reloj: () => AHORA });
  org = await sembrarOrganizacion(prisma, "Cotizador");
  ajena = await sembrarOrganizacion(prisma, "CotizadorAjena");
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
  maestro = await entrar(org, "maestro");
  recepcion = await entrar(org, "recepcion", [norte]);

  chicos = await sembrarPrograma(prisma, org, {
    sucursalId: norte,
    nombre: "Programa chicos",
    edadMin: 3,
    edadMax: 5,
    descripcionPublica: "Para los más chicos",
    grupos: [
      { nombre: "Chicos tarde", cupoMaximo: 8, permiteListaEspera: true, horarios: [H(1), H(3)] },
      { nombre: "Chicos sábado", cupoMaximo: 8, horarios: [H(6, 600, 660)] },
    ],
    precio: { inscripcion: "500.00", mensualidad: "800.00" },
  });
  medianos = await sembrarPrograma(prisma, org, {
    sucursalId: norte,
    nombre: "Programa medianos",
    edadMin: 6,
    edadMax: 13,
    grupos: [{ nombre: "Medianos", cupoMaximo: 12, horarios: [H(2)] }],
    precio: { inscripcion: "600.00", mensualidad: "900.00" },
  });
  delSur = await sembrarPrograma(prisma, org, {
    sucursalId: sur,
    nombre: "Programa sur",
    edadMin: 3,
    edadMax: 13,
    grupos: [{ nombre: "Sur", horarios: [H(4)] }],
    precio: { inscripcion: "700.00", mensualidad: "1000.00" },
  });
  // Una organización ajena con su propio programa, para comprobar que no se mezcla.
  await sembrarPrograma(prisma, ajena, { sucursalId: ajena.sucursales[0]!.id, nombre: "Ajeno", edadMin: 3, edadMax: 13, grupos: [{ nombre: "Ajeno", horarios: [H(1)] }], precio: { inscripcion: "1.00", mensualidad: "1.00" } });
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

const consultar = (c: ClienteApi, q: Record<string, string | number>) =>
  c.get<CotizacionJson & Errores>(`/api/cotizador?${new URLSearchParams({ vertical_id: org.verticalId, sucursal_id: norte, ...Object.fromEntries(Object.entries(q).map(([k, v]) => [k, String(v)])) }).toString()}`);
const db = () => conAlcance(prisma, org.organizacionId);

test("devuelve el programa de la edad con sus grupos, horarios en español, lugares reales y precio", async () => {
  const r = await consultar(admin, { edad: 4, fecha: "2026-10-08" });
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  assert.equal(r.cuerpo.alternativas, false);
  assert.equal(r.cuerpo.programas.length, 1);
  const p = r.cuerpo.programas[0]!;
  assert.deepEqual([p.programa_id, p.nombre, p.descripcion_publica, p.edad, p.fuente_edad], [chicos.id, "Programa chicos", "Para los más chicos", 4, "declarada"]);
  assert.deepEqual(p.precio, { precio_id: chicos.precioId, costo_inscripcion: "500.00", costo_mensualidad: "800.00", moneda: "MXN", vigente_desde: "2020-01-01", vigente_hasta: null });
  assert.equal(p.sin_precio, false);
  assert.deepEqual(p.grupos.map((g) => [g.nombre, g.horario_texto, g.lugares_disponibles, g.oferta]), [
    ["Chicos sábado", "sábado de 10:00 a 11:00", 8, "lugar"],
    ["Chicos tarde", "lunes y miércoles de 16:00 a 17:00", 8, "lugar"],
  ]);
  assert.deepEqual(p.grupos[1]!.horarios, [
    { dia_semana: 1, hora_inicio_min: 960, hora_fin_min: 1020 },
    { dia_semana: 3, hora_inicio_min: 960, hora_fin_min: 1020 },
  ]);
  assert.deepEqual(p.promociones!.aplicadas, []);
});

test("bordes de edad por el endpoint: 5 es de chicos, 6 de medianos, 13 de medianos y 14 no tiene programa", async () => {
  const nombres = async (edad: number) => (await consultar(admin, { edad, fecha: "2026-10-08" })).cuerpo.programas.map((p) => p.nombre);
  assert.deepEqual(await nombres(2), []);
  assert.deepEqual(await nombres(5), ["Programa chicos"]);
  assert.deepEqual(await nombres(6), ["Programa medianos"]);
  assert.deepEqual(await nombres(13), ["Programa medianos"]);
  assert.deepEqual(await nombres(14), []);
});

test("los lugares salen de la fuente de ocupación inyectada; lleno ofrece lista de espera solo si el grupo la permite", async () => {
  const [tarde, sabado] = [chicos.grupos[0]!.id, chicos.grupos[1]!.id];
  ocupacion.fijar(tarde, 8);
  ocupacion.fijar(sabado, 8);
  try {
    const g = (await consultar(admin, { edad: 4, fecha: "2026-10-08" })).cuerpo.programas[0]!.grupos;
    const por = Object.fromEntries(g.map((x) => [x.nombre, [x.lugares_disponibles, x.lleno, x.oferta]]));
    assert.deepEqual(por, { "Chicos tarde": [0, true, "lista_de_espera"], "Chicos sábado": [0, true, "sin_lugar"] });
    ocupacion.fijar(tarde, 7);
    const g2 = (await consultar(admin, { edad: 4, fecha: "2026-10-08" })).cuerpo.programas[0]!.grupos;
    assert.deepEqual(g2.map((x) => [x.nombre, x.lugares_disponibles]), [["Chicos tarde", 1], ["Chicos sábado", 0]], "el que tiene lugar va primero");
  } finally {
    ocupacion.fijar(tarde, 0);
    ocupacion.fijar(sabado, 0);
  }
});

test("el precio cambia de vigencia a mitad: el último día del anterior y el primero del nuevo", async () => {
  const p = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "Programa con cambio", edadMin: 20, edadMax: 25, grupos: [{ nombre: "G", horarios: [H(5)] }], precio: { inscripcion: "100.00", mensualidad: "200.00", desde: "2026-01-01" } });
  // El precio nuevo rige desde el 15 de octubre; la alta cierra el anterior el día 14.
  assert.equal((await admin.post("/api/precios", { programa_id: p.id, costo_inscripcion: "150.00", costo_mensualidad: "250.00", vigencia_desde: "2026-10-15" })).estado, 201);
  const en = async (fecha: string) => (await consultar(admin, { edad: 22, fecha })).cuerpo.programas[0]!.precio;
  assert.deepEqual([(await en("2026-10-14"))!.costo_mensualidad, (await en("2026-10-14"))!.vigente_hasta], ["200.00", "2026-10-14"]);
  assert.deepEqual([(await en("2026-10-15"))!.costo_mensualidad, (await en("2026-10-15"))!.vigente_hasta], ["250.00", null]);
  assert.equal(await en("2025-12-31"), null, "antes de la primera vigencia no hay precio: se dice sin precio");
  assert.equal((await consultar(admin, { edad: 22, fecha: "2025-12-31" })).cuerpo.programas[0]!.sin_precio, true);
  // Coincide con la función que ya existía.
  for (const f of ["2026-10-14", "2026-10-15", "2026-06-01"]) {
    const directo = await precioVigente(db(), p.id, f);
    assert.equal(aTexto(directo!.costoMensualidad), (await en(f))!.costo_mensualidad, f);
  }
});

test("una promoción vigente se aplica con su desglose y una vencida no", async () => {
  const crear = (extra: object) =>
    admin.post("/api/promociones", { nombre: "Promo", codigo: `P-${randomUUID().slice(0, 8)}`.toUpperCase(), vigencia_desde: "2026-10-01", programas: [medianos.id], beneficios: [{ tipo: "descuento_inscripcion", modo: "porcentaje", valor: "15.00" }], ...extra });
  const vigente = (await crear({ vigencia_hasta: "2026-10-31", nombre: "Vigente" })).cuerpo as { id: string };
  const vencida = (await crear({ vigencia_desde: "2026-01-01", vigencia_hasta: "2026-09-30", nombre: "Vencida", prioridad: 9 })).cuerpo as { id: string };
  const p = (await consultar(admin, { edad: 8, fecha: "2026-10-08" })).cuerpo.programas[0]!;
  assert.deepEqual(p.promociones!.aplicadas.map((a) => a.nombre), ["Vigente"]);
  assert.deepEqual(p.promociones!.descartadas.map((d) => [d.nombre, d.motivo]), [["Vencida", "fuera_de_vigencia"]]);
  assert.equal(p.promociones!.inscripcion.descuento_ahora, "90.00", "15 % de 600.00");
  assert.equal(p.promociones!.inscripcion.final_ahora, "510.00");
  const despues = (await consultar(admin, { edad: 8, fecha: "2026-11-01" })).cuerpo.programas[0]!;
  assert.deepEqual(despues.promociones!.aplicadas, [], "al día siguiente de su fin ya no aplica");
  assert.deepEqual(despues.promociones!.inscripcion.descuento_ahora, "0.00");
  // La promoción de otro programa no aplica a este.
  const chico = (await consultar(admin, { edad: 4, fecha: "2026-10-08" })).cuerpo.programas[0]!;
  assert.deepEqual(chico.promociones!.aplicadas, []);
  for (const id of [vigente.id, vencida.id]) await admin.delete(`/api/promociones/${id}`);
});

test("fecha de corte de edad: con fecha de nacimiento se mide a la fecha de corte del programa, no a hoy", async () => {
  const corte = await sembrarPrograma(prisma, org, {
    sucursalId: norte,
    nombre: "Programa con corte",
    edadMin: 7,
    edadMax: 7,
    fechaCorteEdad: "2026-09-01",
    grupos: [{ nombre: "G corte", horarios: [H(2, 1020, 1080)] }],
    precio: { inscripcion: "100.00", mensualidad: "200.00" },
  });
  // Nació el 2019-09-15: el 1 de septiembre de 2026 tiene 6 (no entra); hoy (8 de octubre) tiene 7.
  const tarde = (await consultar(admin, { fecha_nacimiento: "2019-09-15", fecha: "2026-10-08" })).cuerpo;
  assert.ok(!tarde.programas.some((p) => p.programa_id === corte.id), "al corte tenía 6 años: no entra, aunque hoy ya tenga 7");
  // Nació el 2019-08-31: al corte ya tenía 7.
  const a = (await consultar(admin, { fecha_nacimiento: "2019-08-31", fecha: "2026-10-08" })).cuerpo.programas.find((p) => p.programa_id === corte.id)!;
  assert.deepEqual([a.edad, a.fuente_edad, a.fecha_corte_edad], [7, "nacimiento_a_corte", "2026-09-01"]);
  // El borde: nace el día del corte.
  assert.ok((await consultar(admin, { fecha_nacimiento: "2019-09-01", fecha: "2026-10-08" })).cuerpo.programas.some((p) => p.programa_id === corte.id));
  assert.ok(!(await consultar(admin, { fecha_nacimiento: "2019-09-02", fecha: "2026-10-08" })).cuerpo.programas.some((p) => p.programa_id === corte.id));
  // Con solo la edad declarada se usa tal cual.
  const d = (await consultar(admin, { edad: 7, fecha: "2026-10-08" })).cuerpo.programas.find((p) => p.programa_id === corte.id)!;
  assert.deepEqual([d.edad, d.fuente_edad], [7, "declarada"]);
});

test("sin fecha, cotiza «hoy» en la zona horaria de la sucursal", async () => {
  const p = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "Programa de zona", edadMin: 30, edadMax: 31, grupos: [{ nombre: "Z", horarios: [H(2, 1100, 1160)] }], precio: { inscripcion: "10.00", mensualidad: "20.00", desde: "2026-10-09" } });
  const sinPrecioA = async (instante: string): Promise<boolean> => {
    const otra = levantarApi(prisma, { reloj: () => new Date(instante) });
    try {
      const u = await sembrarUsuario(prisma, org.organizacionId, { rol: "administrador" });
      const c = otra.cliente();
      assert.equal((await c.login(org.slug, u.correo, u.contrasena)).estado, 201);
      return (await consultar(c, { edad: 30 })).cuerpo.programas.find((x) => x.programa_id === p.id)!.sin_precio;
    } finally {
      await otra.cerrar();
    }
  };
  assert.equal(await sinPrecioA("2026-10-09T03:30:00Z"), true, "21:30 del 8 de octubre en Ciudad de México: todavía no rige el precio del 9");
  assert.equal(await sinPrecioA("2026-10-09T06:30:00Z"), false, "00:30 del 9 de octubre allá: ya rige");
});

test("permisos: administrador y asesor sí; maestro y recepción, 403; sin sesión, 401", async () => {
  assert.equal((await consultar(admin, { edad: 4 })).estado, 200);
  assert.equal((await consultar(asesorNorte, { edad: 4 })).estado, 200);
  assert.equal((await consultar(maestro, { edad: 4 })).estado, 403);
  assert.equal((await consultar(recepcion, { edad: 4 })).estado, 403);
  assert.equal((await consultar(api.cliente(), { edad: 4 })).estado, 401);
});

test("alcance: el asesor de una sucursal no cotiza la otra (404); el administrador sí", async () => {
  const q = new URLSearchParams({ vertical_id: org.verticalId, sucursal_id: sur, edad: "8", fecha: "2026-10-08" }).toString();
  assert.equal((await asesorNorte.get(`/api/cotizador?${q}`)).estado, 404);
  const r = await admin.get<CotizacionJson>(`/api/cotizador?${q}`);
  assert.equal(r.estado, 200);
  assert.deepEqual(r.cuerpo.programas.map((p) => p.programa_id), [delSur.id]);
});

test("no-fuga: lo de otra organización no se ve, ni por sucursal ni por vertical", async () => {
  const q = (o: Record<string, string>) => new URLSearchParams({ edad: "8", fecha: "2026-10-08", ...o }).toString();
  assert.equal((await admin.get(`/api/cotizador?${q({ vertical_id: org.verticalId, sucursal_id: ajena.sucursales[0]!.id })}`)).estado, 404);
  const v = await admin.get<Errores>(`/api/cotizador?${q({ vertical_id: ajena.verticalId, sucursal_id: norte })}`);
  assert.equal(v.estado, 400);
  assert.equal(v.cuerpo.error.detalles![0]!.campo, "vertical_id");
  const todos = (await consultar(admin, { edad: 8, fecha: "2026-10-08" })).cuerpo.programas;
  assert.ok(todos.every((p) => p.nombre !== "Ajeno"));
});

test("validaciones: falta la edad, valores inválidos, parámetros repetidos y fechas imposibles", async () => {
  const base = { vertical_id: org.verticalId, sucursal_id: norte };
  const pedir = (q: string) => admin.get<Errores>(`/api/cotizador?${new URLSearchParams(base).toString()}&${q}`);
  assert.equal((await pedir("")).estado, 400);
  assert.equal((await pedir("edad=abc")).estado, 400);
  assert.equal((await pedir("edad=-1")).estado, 400);
  assert.equal((await pedir("edad=121")).estado, 400);
  assert.equal((await pedir("edad=4&edad=5")).estado, 400);
  assert.equal((await pedir("fecha_nacimiento=2018-02-30")).estado, 400);
  assert.equal((await pedir("edad=4&fecha=2026-13-01")).estado, 400);
  assert.equal((await pedir("fecha_nacimiento=2027-01-01&fecha=2026-10-08")).estado, 400, "nace después de la fecha de la consulta");
  assert.equal((await pedir("edad=4&desconocido=1")).estado, 400);
  assert.equal((await admin.get(`/api/cotizador?edad=4`)).estado, 400);
  assert.equal((await admin.get(`/api/cotizador?vertical_id=${randomUUID()}&sucursal_id=${norte}&edad=4`)).estado, 400);
  assert.equal((await admin.get(`/api/cotizador?vertical_id=${org.verticalId}&sucursal_id=${randomUUID()}&edad=4`)).estado, 404);
});

test("el catálogo cargado ignora programas inactivos, borrados, grupos inactivos y sucursales que no ofrecen la vertical", async () => {
  const inactivo = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "Inactivo", edadMin: 40, edadMax: 41, activo: false, grupos: [{ nombre: "x", horarios: [H(1)] }], precio: { inscripcion: "1.00", mensualidad: "1.00" } });
  const borrado = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "Borrado", edadMin: 40, edadMax: 41, grupos: [{ nombre: "x", horarios: [H(1)] }], precio: { inscripcion: "1.00", mensualidad: "1.00" } });
  await prisma.programa.update({ where: { id: borrado.id }, data: { eliminado_en: new Date() } });
  const conGrupoInactivo = await sembrarPrograma(prisma, org, { sucursalId: norte, nombre: "Grupo inactivo", edadMin: 40, edadMax: 41, grupos: [{ nombre: "off", activo: false, horarios: [H(1)] }, { nombre: "on", horarios: [H(2)] }], precio: { inscripcion: "1.00", mensualidad: "1.00" } });
  const cat = await cargarCatalogoCotizable(db(), { verticalId: org.verticalId, fecha: "2026-10-08" });
  const ids = cat.programas.map((p) => p.id);
  assert.ok(!ids.includes(inactivo.id) && !ids.includes(borrado.id));
  assert.deepEqual(cat.programas.find((p) => p.id === conGrupoInactivo.id)!.grupos.map((g) => g.nombre), ["on"]);
  // Una sucursal que deja de ofrecer la vertical sale del catálogo.
  await prisma.sucursal_vertical.updateMany({ where: { organizacion_id: org.organizacionId, sucursal_id: sur }, data: { activo: false } });
  try {
    const sinSur = await cargarCatalogoCotizable(db(), { verticalId: org.verticalId, fecha: "2026-10-08" });
    assert.ok(!sinSur.programas.some((p) => p.sucursalId === sur));
  } finally {
    await prisma.sucursal_vertical.updateMany({ where: { organizacion_id: org.organizacionId, sucursal_id: sur }, data: { activo: true } });
  }
});

test("EC-09 (X39): una promoción con el cupo agotado NO se cotiza (el cupo usado se lee de la base), con su motivo en las descartadas", async () => {
  const o = await sembrarOrganizacion(prisma, "CotizadorCupo");
  const apiLocal = levantarApi(prisma, { reloj: () => AHORA });
  try {
    const u = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
    const c = apiLocal.cliente();
    assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
    const p = await sembrarPrograma(prisma, o, { sucursalId: o.sucursales[0]!.id, nombre: "P", edadMin: 3, edadMax: 12, grupos: [{ nombre: "G", horarios: [H(1)] }], precio: { inscripcion: "100.00", mensualidad: "200.00" } });
    const creada = await c.post<{ id: string }>("/api/promociones", { nombre: "Con cupo", codigo: `K-${randomUUID().slice(0, 6)}`.toUpperCase(), vigencia_desde: "2026-01-01", cupo_maximo: 1, beneficios: [{ tipo: "descuento_inscripcion", modo: "total" }] });
    assert.equal(creada.estado, 201, JSON.stringify(creada.cuerpo));
    const consulta = () => c.get<CotizacionJson>(`/api/cotizador?vertical_id=${o.verticalId}&sucursal_id=${o.sucursales[0]!.id}&edad=8`);
    const antes = (await consulta()).cuerpo.programas[0]!;
    assert.equal(antes.promociones!.inscripcion.final_ahora, "0.00", "con cupo disponible aplica");
    await prisma.promocion.update({ where: { id: creada.cuerpo.id }, data: { cupo_usado: 1 } });
    const despues = (await consulta()).cuerpo.programas[0]!;
    assert.equal(despues.programa_id, p.id);
    assert.deepEqual(despues.promociones!.aplicadas, []);
    assert.equal(despues.promociones!.inscripcion.final_ahora, "100.00");
    assert.deepEqual(despues.promociones!.descartadas.map((d) => d.motivo), ["sin_cupo"]);
  } finally {
    await apiLocal.cerrar();
  }
});

test("EC-09 (X40): la moneda del precio vigente llega tal cual al cotizador (no se supone MXN)", async () => {
  const o = await sembrarOrganizacion(prisma, "CotizadorMoneda");
  const apiLocal = levantarApi(prisma, { reloj: () => AHORA });
  try {
    const u = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
    const c = apiLocal.cliente();
    assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
    const p = await sembrarPrograma(prisma, o, { sucursalId: o.sucursales[0]!.id, nombre: "P", edadMin: 3, edadMax: 12, grupos: [{ nombre: "G", horarios: [H(1)] }] });
    const alta = await c.post("/api/precios", { programa_id: p.id, costo_inscripcion: "10.00", costo_mensualidad: "20.00", moneda: "usd", vigencia_desde: "2026-01-01" });
    assert.equal(alta.estado, 201, JSON.stringify(alta.cuerpo));
    const r = await c.get<CotizacionJson>(`/api/cotizador?vertical_id=${o.verticalId}&sucursal_id=${o.sucursales[0]!.id}&edad=8`);
    assert.equal(r.cuerpo.programas[0]!.precio!.moneda, "USD");
    assert.equal((await precioVigente(conAlcance(prisma, o.organizacionId), p.id, "2026-10-08"))?.moneda, "USD");
  } finally {
    await apiLocal.cerrar();
  }
});
