// J7: la administración del catálogo por la API — verticales, sucursales, qué vertical se imparte en cuál, programas, canales de WhatsApp, bandejas de Chatwoot y
// configuración de la organización. Postgres real, la app real. Lo que se prueba: solo el administrador escribe (todos los roles con catálogo leen), validaciones con
// su motivo en palabras, cero fuga entre organizaciones (IDOR), registro de cambios, baja lógica con sus dependientes, carreras reales y el recorrido completo de K1:
// una vertical y una sucursal nuevas dadas de alta SOLO por la API, hasta aparecer en el cotizador y en la landing.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { conAlcance } from "../datos/alcance.ts";
import { leerConfiguracion } from "../configuracion/index.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { sembrarMotivoBaja, sembrarOrganizacion, type OrganizacionDePrueba } from "../testutil/semilla.ts";
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

interface Err { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
interface Vertical { id: string; nombre: string; slug: string; usa_progresion: boolean; etiqueta_progresion: string | null; color_marca: string | null; activo: boolean }
interface Sucursal { id: string; nombre: string; zona_horaria: string; direccion: string | null; verticales: { vertical_id: string; activo: boolean }[] }
interface Programa { id: string; nombre: string; edad_min: number; edad_max: number; permite_traslape: boolean; fecha_corte_edad: string | null }
interface Canal { id: string; numero_whatsapp: string | null; bandeja: { id: string } | null }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  org = await sembrarOrganizacion(prisma, "Administración");
  ajena = await sembrarOrganizacion(prisma, "Administración ajena");
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

const motivo = (r: { cuerpo: unknown }): string => JSON.stringify((r.cuerpo as Err).error ?? r.cuerpo);

test("J7 verticales: alta con identificador del nombre; solo el administrador escribe y todos leen; el identificador no cambia; reglas entre campos", async () => {
  const r = await admin.post<Vertical & Err>("/api/verticales", { nombre: "Artes Escénicas", usa_progresion: true, etiqueta_progresion: "Nivel", etiqueta_evento: "Muestra", color_marca: "#1F5FBF", cotizador_whatsapp_activo: true });
  assert.equal(r.estado, 201, motivo(r));
  assert.deepEqual([r.cuerpo.slug, r.cuerpo.activo, r.cuerpo.color_marca], ["artes-escenicas", true, "#1F5FBF"]);
  for (const c of [asesor, recepcion, maestro]) {
    assert.equal((await c.post("/api/verticales", { nombre: "Otra" })).estado, 403);
    assert.equal((await c.patch(`/api/verticales/${r.cuerpo.id}`, { nombre: "x" })).estado, 403);
    assert.equal((await c.delete(`/api/verticales/${r.cuerpo.id}`)).estado, 403);
    assert.equal((await c.get(`/api/verticales/${r.cuerpo.id}`)).estado, 200, "leer sí");
  }
  assert.equal((await api.cliente().get("/api/verticales")).estado, 401);
  const lista = await maestro.get<{ datos: Vertical[] }>("/api/verticales?activo=true");
  assert.ok(lista.cuerpo.datos.some((v) => v.id === r.cuerpo.id));
  // El identificador no se edita (va en la landing y en los QR impresos).
  assert.equal((await admin.patch(`/api/verticales/${r.cuerpo.id}`, { slug: "otro" })).estado, 400);
  assert.equal((await admin.post("/api/verticales", { nombre: "Artes Escénicas" })).estado, 409, "mismo identificador");
  assert.equal((await admin.post("/api/verticales", { nombre: "Clon", slug: "artes-escenicas" })).estado, 409);
  assert.equal((await admin.post("/api/verticales", { nombre: "Mal slug", slug: "Con Espacios" })).estado, 400);
  assert.equal((await admin.post("/api/verticales", { nombre: "¡¡¡" })).estado, 400, "sin letras no hay identificador");
  // Reglas entre campos.
  assert.equal((await admin.post("/api/verticales", { nombre: "Sin etiqueta", usa_progresion: true })).estado, 400);
  assert.equal((await admin.post("/api/verticales", { nombre: "Muestra sola", clase_muestra_whatsapp_activo: true })).estado, 400);
  assert.equal((await admin.post("/api/verticales", { nombre: "Color malo", color_marca: "rojo" })).estado, 400);
  assert.equal((await admin.post("/api/verticales", { nombre: "Logo http", logo_url: "http://x.com/l.png" })).estado, 400);
  assert.equal((await admin.patch(`/api/verticales/${r.cuerpo.id}`, { etiqueta_progresion: null })).estado, 400, "quitar la etiqueta con progresión encendida");
  const cambio = await admin.patch<Vertical>(`/api/verticales/${r.cuerpo.id}`, { nombre: "Artes y Escena", usa_progresion: false, etiqueta_progresion: null, activo: false });
  assert.deepEqual([cambio.cuerpo.nombre, cambio.cuerpo.usa_progresion, cambio.cuerpo.activo, cambio.cuerpo.slug], ["Artes y Escena", false, false, "artes-escenicas"]);
  assert.equal((await admin.patch(`/api/verticales/${r.cuerpo.id}`, {})).estado, 400);
  // Otra organización: ni la ve ni la toca.
  assert.equal((await adminAjeno.get(`/api/verticales/${r.cuerpo.id}`)).estado, 404);
  assert.equal((await adminAjeno.patch(`/api/verticales/${r.cuerpo.id}`, { nombre: "x" })).estado, 404);
  assert.equal((await adminAjeno.delete(`/api/verticales/${r.cuerpo.id}`)).estado, 404);
  assert.ok(!(await adminAjeno.get<{ datos: Vertical[] }>("/api/verticales")).cuerpo.datos.some((v) => v.id === r.cuerpo.id));
  // Baja lógica: sin dependientes se puede, y el identificador queda libre.
  assert.equal((await admin.delete(`/api/verticales/${r.cuerpo.id}`)).estado, 204);
  assert.equal((await admin.get(`/api/verticales/${r.cuerpo.id}`)).estado, 404);
  const fila = await prisma.vertical.findUnique({ where: { id: r.cuerpo.id } });
  assert.ok(fila?.eliminado_en, "sigue en la base, con eliminado_en");
  assert.equal((await admin.post("/api/verticales", { nombre: "Artes Escénicas" })).estado, 201, "el identificador de una baja se puede reutilizar");
  assert.ok((await db().registro_cambio.count({ where: { entidad_tipo: "vertical", entidad_id: r.cuerpo.id } })) >= 3);
});

test("J7 verticales: una vertical en uso no se da de baja (se desactiva) y dice qué la usa", async () => {
  const r = await admin.delete<Err>(`/api/verticales/${org.verticalId}`);
  assert.equal(r.estado, 409);
  assert.match(r.cuerpo.error.mensaje, /sucursales que la ofrecen/);
  assert.match(r.cuerpo.error.mensaje, /Desactívala/);
});

test("J7 sucursales: zona horaria validada, nombre único, lista por alcance, relación con verticales idempotente y bajo carrera", async () => {
  const s = await admin.post<Sucursal & Err>("/api/sucursales", { nombre: "Sede Centro", direccion: "Calle 1", zona_horaria: "America/Monterrey" });
  assert.equal(s.estado, 201, motivo(s));
  assert.deepEqual([s.cuerpo.zona_horaria, s.cuerpo.verticales], ["America/Monterrey", []]);
  for (const mala of ["CST", "Mexico", "America/Nada_Xyz", ""]) assert.equal((await admin.post("/api/sucursales", { nombre: `Mala ${mala}`, zona_horaria: mala })).estado, 400, mala);
  assert.equal((await admin.post("/api/sucursales", { nombre: "Sede Centro", zona_horaria: "America/Monterrey" })).estado, 409);
  for (const c of [asesor, recepcion, maestro]) assert.equal((await c.post("/api/sucursales", { nombre: "No", zona_horaria: "UTC" })).estado, 403);
  // El asesor solo ve SUS sucursales; el administrador, todas.
  const delAsesor = (await asesor.get<{ datos: Sucursal[] }>("/api/sucursales")).cuerpo.datos.map((x) => x.id);
  assert.deepEqual(delAsesor, [org.sucursales[0]!.id]);
  assert.equal((await asesor.get(`/api/sucursales/${s.cuerpo.id}`)).estado, 404, "una sucursal ajena a su alcance no se confirma");
  assert.ok((await admin.get<{ datos: Sucursal[] }>("/api/sucursales")).cuerpo.datos.some((x) => x.id === s.cuerpo.id));
  assert.equal((await adminAjeno.get(`/api/sucursales/${s.cuerpo.id}`)).estado, 404);
  assert.equal((await adminAjeno.patch(`/api/sucursales/${s.cuerpo.id}`, { nombre: "x" })).estado, 404);
  assert.equal((await adminAjeno.put(`/api/sucursales/${s.cuerpo.id}/verticales/${ajena.verticalId}`, {})).estado, 404);
  const cambio = await admin.patch<Sucursal>(`/api/sucursales/${s.cuerpo.id}`, { direccion: null, zona_horaria: "America/Tijuana" });
  assert.deepEqual([cambio.cuerpo.direccion, cambio.cuerpo.zona_horaria], [null, "America/Tijuana"]);
  assert.equal((await admin.patch(`/api/sucursales/${s.cuerpo.id}`, { zona_horaria: "CST" })).estado, 400);

  // Qué vertical se imparte aquí: idempotente y con 12 PUT simultáneos queda UNA fila viva.
  const ruta = `/api/sucursales/${s.cuerpo.id}/verticales/${org.verticalId}`;
  const resultados = await Promise.all(Array.from({ length: 12 }, () => admin.put<{ activo: boolean }>(ruta, {})));
  assert.ok(resultados.every((x) => x.estado === 200), resultados.map((x) => x.estado).join());
  assert.equal(await db().sucursal_vertical.count({ where: { sucursal_id: s.cuerpo.id, vertical_id: org.verticalId } }), 1);
  assert.equal((await admin.put(ruta, { activo: false })).estado, 200);
  const leida = (await admin.get<Sucursal>(`/api/sucursales/${s.cuerpo.id}`)).cuerpo;
  assert.deepEqual(leida.verticales.map((v) => [v.vertical_id, v.activo]), [[org.verticalId, false]]);
  assert.equal((await admin.put(`/api/sucursales/${s.cuerpo.id}/verticales/${ajena.verticalId}`, {})).estado, 404, "una vertical de otra organización no existe");
  for (const c of [asesor, recepcion, maestro]) assert.equal((await c.put(ruta, {})).estado, 403);

  // Dependientes: con la relación viva no se da de baja la sucursal; con un programa de esa vertical, tampoco se quita la relación.
  assert.equal((await admin.delete(`/api/sucursales/${s.cuerpo.id}`)).estado, 409);
  assert.equal((await admin.put(ruta, { activo: true })).estado, 200);
  const p = await admin.post<Programa & Err>("/api/programas", { vertical_id: org.verticalId, sucursal_id: s.cuerpo.id, nombre: "Prog", edad_min: 4, edad_max: 8 });
  assert.equal(p.estado, 201, motivo(p));
  assert.equal((await admin.delete(ruta)).estado, 409);
  assert.equal((await admin.delete(`/api/programas/${p.cuerpo.id}`)).estado, 204);
  assert.equal((await admin.delete(ruta)).estado, 204);
  assert.equal((await admin.delete(`/api/sucursales/${s.cuerpo.id}`)).estado, 204);
  assert.ok((await prisma.sucursal.findUnique({ where: { id: s.cuerpo.id } }))?.eliminado_en);
  assert.ok((await db().registro_cambio.count({ where: { entidad_tipo: "sucursal", entidad_id: s.cuerpo.id } })) >= 3);
});

test("J7 programas: la sucursal debe ofrecer la vertical; edades coherentes; el traslape solo entre alternativas; carrera de dos altas que se traslapan", async () => {
  const sucursal = org.sucursales[0]!.id;
  const nuevo = (extra: Record<string, unknown>) => admin.post<Programa & Err>("/api/programas", { vertical_id: org.verticalId, sucursal_id: sucursal, ...extra });
  const base = await nuevo({ nombre: "Infantil", edad_min: 4, edad_max: 8, fecha_corte_edad: "2026-09-01" });
  assert.equal(base.estado, 201, motivo(base));
  assert.equal(base.cuerpo.fecha_corte_edad, "2026-09-01");
  assert.equal((await nuevo({ nombre: "Al revés", edad_min: 9, edad_max: 5 })).estado, 400);
  assert.equal((await nuevo({ nombre: "Infantil", edad_min: 20, edad_max: 30 })).estado, 409, "nombre repetido en la sucursal");
  const traslape = await nuevo({ nombre: "Se pisa", edad_min: 8, edad_max: 12 });
  assert.equal(traslape.estado, 409);
  assert.match((traslape.cuerpo as Err).error.mensaje, /Infantil/);
  assert.match((traslape.cuerpo as Err).error.mensaje, /permite traslape/i);
  assert.equal((await nuevo({ nombre: "Siguiente", edad_min: 9, edad_max: 12 })).estado, 201, "la edad siguiente no se traslapa");
  // Alternativas: AMBAS deben permitirlo.
  const alt1 = await nuevo({ nombre: "Estilo A", edad_min: 13, edad_max: 17, permite_traslape: true });
  assert.equal(alt1.estado, 201);
  assert.equal((await nuevo({ nombre: "Estilo B", edad_min: 14, edad_max: 16 })).estado, 409, "solo uno lo permite");
  assert.equal((await nuevo({ nombre: "Estilo B", edad_min: 14, edad_max: 16, permite_traslape: true })).estado, 201);
  // Cambiar edades re-valida; un programa inactivo no estorba.
  assert.equal((await admin.patch(`/api/programas/${base.cuerpo.id}`, { edad_max: 11 })).estado, 409);
  assert.equal((await admin.patch(`/api/programas/${base.cuerpo.id}`, { edad_min: 9 })).estado, 400);
  assert.equal((await admin.patch(`/api/programas/${base.cuerpo.id}`, { vertical_id: org.verticalId })).estado, 400, "la vertical no cambia");
  assert.equal((await admin.patch(`/api/programas/${base.cuerpo.id}`, { fecha_corte_edad: null })).estado, 200);
  // La vertical debe estar ofrecida en esa sucursal.
  const lejana = await admin.post<Sucursal>("/api/sucursales", { nombre: "Sin ofrecer", zona_horaria: "America/Mexico_City" });
  const sinOfrecer = await admin.post<Err>("/api/programas", { vertical_id: org.verticalId, sucursal_id: lejana.cuerpo.id, nombre: "Prog", edad_min: 4, edad_max: 8 });
  assert.equal(sinOfrecer.estado, 409);
  assert.match(sinOfrecer.cuerpo.error.mensaje, /no ofrece esa disciplina/);
  assert.equal((await admin.post("/api/programas", { vertical_id: ajena.verticalId, sucursal_id: sucursal, nombre: "Ajena", edad_min: 1, edad_max: 2 })).estado, 400);

  // Carrera: dos altas que se traslapan entre sí, a la vez, en una sucursal que ofrece la vertical → gana UNA.
  await admin.put(`/api/sucursales/${lejana.cuerpo.id}/verticales/${org.verticalId}`, {});
  const carrera = await Promise.all([
    admin.post<Programa & Err>("/api/programas", { vertical_id: org.verticalId, sucursal_id: lejana.cuerpo.id, nombre: "Carrera 1", edad_min: 5, edad_max: 9 }),
    admin.post<Programa & Err>("/api/programas", { vertical_id: org.verticalId, sucursal_id: lejana.cuerpo.id, nombre: "Carrera 2", edad_min: 7, edad_max: 12 }),
  ]);
  assert.deepEqual(carrera.map((x) => x.estado).sort(), [201, 409]);
  assert.equal(await db().programa.count({ where: { sucursal_id: lejana.cuerpo.id } }), 1);

  // Permisos, alcance y baja.
  for (const c of [asesor, recepcion, maestro]) assert.equal((await c.post("/api/programas", { vertical_id: org.verticalId, sucursal_id: sucursal, nombre: "No", edad_min: 1, edad_max: 2 })).estado, 403);
  const delAsesor = await asesor.get<{ datos: Programa[] }>("/api/programas");
  assert.ok(delAsesor.cuerpo.datos.some((x) => x.id === base.cuerpo.id));
  assert.ok(!delAsesor.cuerpo.datos.some((x) => x.nombre === "Carrera 1"), "un programa de una sucursal ajena no aparece");
  assert.equal((await adminAjeno.get(`/api/programas/${base.cuerpo.id}`)).estado, 404);
  assert.equal((await adminAjeno.delete(`/api/programas/${base.cuerpo.id}`)).estado, 404);
  const g = await admin.post<{ id: string }>("/api/grupos", { programa_id: base.cuerpo.id, nombre: "G", cupo_maximo: 5 });
  assert.equal(g.estado, 201);
  assert.equal((await admin.delete(`/api/programas/${base.cuerpo.id}`)).estado, 409, "con grupos no se da de baja");
  // Un grupo con inscripciones vigentes tampoco se da de baja (se pasan antes a otro).
  const alumno = await prisma.alumno.create({ data: { organizacion_id: org.organizacionId, nombre: "A", apellidos: "B", fecha_nacimiento: new Date("2018-01-01T00:00:00Z"), sucursal_id: sucursal } });
  const hoy = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const insc = await prisma.inscripcion.create({ data: { organizacion_id: org.organizacionId, alumno_id: alumno.id, programa_id: base.cuerpo.id, grupo_id: g.cuerpo.id, fecha_inscripcion: hoy, fecha_inicio: hoy, estatus: "activa", precio_inscripcion_aplicado: "1.00", precio_mensualidad_aplicado: "1.00", dia_corte_pago: 5 } });
  const conInscritos = await admin.delete<Err>(`/api/grupos/${g.cuerpo.id}`);
  assert.equal(conInscritos.estado, 409);
  assert.match(conInscritos.cuerpo.error.mensaje, /inscripci/);
  await prisma.inscripcion.update({ where: { id: insc.id }, data: { estatus: "baja", fecha_baja: hoy, motivo_baja_id: await sembrarMotivoBaja(prisma, org) } });
  assert.equal((await admin.delete(`/api/grupos/${g.cuerpo.id}`)).estado, 204, "sin inscripciones vigentes sí");
});

test("J7 canales y bandejas: el número se normaliza, es único en todo el sistema, la bandeja es una por canal y nada de esto lo ve quien no es administrador", async () => {
  const canal = await admin.post<Canal & Err>("/api/canales-whatsapp", { vertical_id: org.verticalId, nombre_publico: "Línea del centro", numero_whatsapp: "(55) 1234 5678", sucursal_id: org.sucursales[0]!.id });
  assert.equal(canal.estado, 201, motivo(canal));
  assert.equal(canal.cuerpo.numero_whatsapp, "whatsapp:+525512345678");
  assert.equal((await admin.post("/api/canales-whatsapp", { vertical_id: org.verticalId, nombre_publico: "Repetido", numero_whatsapp: "+52 55 1234 5678" })).estado, 409);
  assert.equal((await adminAjeno.post("/api/canales-whatsapp", { vertical_id: ajena.verticalId, nombre_publico: "Otro mismo número", numero_whatsapp: "5512345678" })).estado, 409, "único en TODO el sistema");
  assert.equal((await admin.post("/api/canales-whatsapp", { vertical_id: org.verticalId, nombre_publico: "Malo", numero_whatsapp: "123" })).estado, 400);
  assert.equal((await admin.post("/api/canales-whatsapp", { vertical_id: ajena.verticalId, nombre_publico: "Vertical ajena" })).estado, 400);
  for (const c of [asesor, recepcion, maestro]) {
    assert.equal((await c.get("/api/canales-whatsapp")).estado, 403, "los identificadores del proveedor son del administrador");
    assert.equal((await c.post("/api/canales-whatsapp", { vertical_id: org.verticalId, nombre_publico: "No" })).estado, 403);
    assert.equal((await c.post("/api/bandejas-chatwoot", { canal_whatsapp_id: canal.cuerpo.id, nombre: "No" })).estado, 403);
  }
  assert.ok(!(await adminAjeno.get<{ datos: Canal[] }>("/api/canales-whatsapp")).cuerpo.datos.some((c) => c.id === canal.cuerpo.id));
  assert.equal((await adminAjeno.patch(`/api/canales-whatsapp/${canal.cuerpo.id}`, { nombre_publico: "x" })).estado, 404);
  const cambio = await admin.patch<Canal>(`/api/canales-whatsapp/${canal.cuerpo.id}`, { numero_whatsapp: null, calidad_meta: "alta" });
  assert.equal(cambio.cuerpo.numero_whatsapp, null);
  // Bandeja: una por canal; la pareja (cuenta, bandeja) es única entre las vivas.
  const b = await admin.post<{ id: string } & Err>("/api/bandejas-chatwoot", { canal_whatsapp_id: canal.cuerpo.id, nombre: "Bandeja", chatwoot_account_id: 9001, chatwoot_inbox_id: 77 });
  assert.equal(b.estado, 201, motivo(b));
  assert.equal((await admin.post("/api/bandejas-chatwoot", { canal_whatsapp_id: canal.cuerpo.id, nombre: "Segunda" })).estado, 409);
  const otro = await admin.post<Canal>("/api/canales-whatsapp", { vertical_id: org.verticalId, nombre_publico: "Otra línea" });
  assert.equal((await admin.post("/api/bandejas-chatwoot", { canal_whatsapp_id: otro.cuerpo.id, nombre: "Misma bandeja", chatwoot_account_id: 9001, chatwoot_inbox_id: 77 })).estado, 409);
  assert.equal((await admin.post("/api/bandejas-chatwoot", { canal_whatsapp_id: otro.cuerpo.id, nombre: "Sin cuenta", chatwoot_inbox_id: 5 })).estado, 400);
  assert.equal((await admin.delete(`/api/canales-whatsapp/${canal.cuerpo.id}`)).estado, 409, "con bandeja viva");
  assert.equal((await admin.delete(`/api/bandejas-chatwoot/${b.cuerpo.id}`)).estado, 204);
  assert.equal((await admin.delete(`/api/canales-whatsapp/${canal.cuerpo.id}`)).estado, 204);
  const sinBandeja = (await admin.get<{ datos: Canal[] }>("/api/canales-whatsapp")).cuerpo.datos;
  assert.ok(!sinBandeja.some((c) => c.id === canal.cuerpo.id));
});

test("J7/J8 configuración: lectura con límites, escritura validada contra el rango de la base, registro de cambios y efecto inmediato en el lector del sistema", async () => {
  const antes = await admin.get<Record<string, unknown> & { limites: Record<string, { min: number; max: number }> }>("/api/configuracion");
  assert.equal(antes.estado, 200);
  assert.equal(antes.cuerpo["max_automaticos_por_dia"], 3);
  assert.equal(antes.cuerpo.limites["umbral_faltas_consecutivas"]!.max, 30);
  for (const c of [asesor, recepcion, maestro]) {
    assert.equal((await c.get("/api/configuracion")).estado, 403);
    assert.equal((await c.patch("/api/configuracion", { modo_cierre: "maestro_en_sitio" })).estado, 403);
  }
  assert.equal((await api.cliente().get("/api/configuracion")).estado, 401);
  for (const [campo, valor] of [["max_automaticos_por_dia", 101], ["max_automaticos_por_dia", -1], ["ventana_marketing_dias", 0], ["umbral_faltas_consecutivas", 31], ["umbral_dias_deuda", 366], ["cotizacion_vigencia_dias", 0], ["modo_cierre", "nadie"], ["sucursal_sin_programa", "ignorar"], ["max_marketing_por_ventana", 1.5]] as const) {
    assert.equal((await admin.patch("/api/configuracion", { [campo]: valor })).estado, 400, `${campo}=${valor}`);
  }
  assert.equal((await admin.patch("/api/configuracion", {})).estado, 400);
  assert.equal((await admin.patch("/api/configuracion", { inventado: 1 })).estado, 400);
  const r = await admin.patch<Record<string, unknown>>("/api/configuracion", { max_automaticos_por_dia: 5, modo_cierre: "maestro_en_sitio", sucursal_sin_programa: "avisar_asesor", umbral_dias_deuda: 20 });
  assert.equal(r.estado, 200, JSON.stringify(r.cuerpo));
  const leida = await leerConfiguracion(db());
  assert.deepEqual([leida.maxAutomaticosPorDia, leida.modoCierre, leida.sucursalSinPrograma, leida.umbralDiasDeuda, leida.maxMarketingPorVentana], [5, "maestro_en_sitio", "avisar_asesor", 20, 1]);
  const yo = await admin.get<{ configuracion: { modo_cierre: string } }>("/api/yo");
  assert.equal(yo.cuerpo.configuracion.modo_cierre, "maestro_en_sitio");
  const cambio = await db().registro_cambio.findFirst({ where: { entidad_tipo: "configuracion_organizacion" }, orderBy: { creado_en: "desc" } });
  assert.deepEqual((cambio?.despues as Record<string, unknown>)["max_automaticos_por_dia"], 5);
  assert.deepEqual((cambio?.antes as Record<string, unknown>)["max_automaticos_por_dia"], 3);
  // Otra organización no se entera.
  assert.equal((await adminAjeno.get<Record<string, unknown>>("/api/configuracion")).cuerpo["max_automaticos_por_dia"], 3);
  // Dos cambios simultáneos de ajustes distintos: ninguno se pierde.
  await Promise.all([admin.patch("/api/configuracion", { umbral_faltas_consecutivas: 4 }), admin.patch("/api/configuracion", { cotizacion_vigencia_dias: 9 })]);
  const final = await leerConfiguracion(db());
  assert.deepEqual([final.umbralFaltasConsecutivas, final.cotizacionVigenciaDias], [4, 9]);
  assert.equal(await prisma.configuracion_organizacion.count({ where: { organizacion_id: org.organizacionId, eliminado_en: null } }), 1, "sigue habiendo UNA fila de configuración");
});

test("K1 (por la API): una vertical y una sucursal nuevas, dadas de alta SOLO por administración, llegan hasta el cotizador y la landing sin tocar código", async () => {
  const v = await admin.post<Vertical & Err>("/api/verticales", { nombre: "Disciplina Nueva", etiqueta_progresion: "Grado", usa_progresion: true });
  assert.equal(v.estado, 201, motivo(v));
  const s = await admin.post<Sucursal & Err>("/api/sucursales", { nombre: "Sede Nueva", zona_horaria: "America/Merida" });
  assert.equal(s.estado, 201, motivo(s));
  assert.equal((await admin.put(`/api/sucursales/${s.cuerpo.id}/verticales/${v.cuerpo.id}`, {})).estado, 200);
  const p = await admin.post<Programa & Err>("/api/programas", { vertical_id: v.cuerpo.id, sucursal_id: s.cuerpo.id, nombre: "Pequeños", edad_min: 5, edad_max: 9 });
  assert.equal(p.estado, 201, motivo(p));
  assert.equal((await admin.post("/api/precios", { programa_id: p.cuerpo.id, costo_inscripcion: "300.00", costo_mensualidad: "800.00", vigencia_desde: "2020-01-01" })).estado, 201);
  const g = await admin.post<{ id: string } & Err>("/api/grupos", { programa_id: p.cuerpo.id, nombre: "Tarde", cupo_maximo: 12, horarios: [{ dia_semana: 2, hora_inicio_min: 1020, hora_fin_min: 1080 }] });
  assert.equal(g.estado, 201, motivo(g));
  const c = await admin.get<{ programas: { programa_id: string; precio: { costo_mensualidad: string } | null; grupos: { grupo_id: string; lugares_disponibles: number }[] }[] }>(`/api/cotizador?vertical_id=${v.cuerpo.id}&sucursal_id=${s.cuerpo.id}&edad=7`);
  assert.equal(c.estado, 200, JSON.stringify(c.cuerpo));
  const prog = c.cuerpo.programas.find((x) => x.programa_id === p.cuerpo.id);
  assert.equal(prog?.precio?.costo_mensualidad, "800.00");
  assert.deepEqual(prog?.grupos.map((x) => [x.grupo_id, x.lugares_disponibles]), [[g.cuerpo.id, 12]]);
  // Sin aviso de privacidad vigente la landing no recoge datos (se ve como una página que no existe); el administrador lo publica por la API.
  assert.equal((await fetch(`${api.base}/l/${v.cuerpo.slug}?org=${org.slug}`)).status, 404);
  assert.equal((await admin.post("/api/documentos-legales", { tipo: "aviso_privacidad", vertical_id: v.cuerpo.id, titulo: "Aviso de privacidad", texto: "Texto del aviso de la disciplina nueva." })).estado, 201);
  // La landing pública de la vertical nueva existe y ofrece la sucursal nueva.
  const landing = await fetch(`${api.base}/l/${v.cuerpo.slug}?org=${org.slug}`);
  const html = await landing.text();
  assert.equal(landing.status, 200, html.slice(0, 400));
  assert.match(html, /Disciplina Nueva/);
  assert.ok(html.includes(s.cuerpo.id) || html.includes("Sede Nueva"), "la landing ofrece la sucursal nueva");
});
