// J8: la administración de mensajería por la API — plantillas (con su clase declarada, INV-6), automatizaciones (activar, desfases, horario dentro de 09:00–20:00),
// la bandeja de eventos inesperados y las tareas sin lead del administrador. Postgres real, la app real.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { conAlcance } from "../datos/alcance.ts";
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

interface Err { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
interface Plantilla { id: string; codigo: string; clase_mensaje: string; categoria: string; estado_aprobacion: string; automatizaciones: number; variables: { pos: number; nombre: string }[] }
interface Automatizacion { id: string; activo: boolean; offset_minutos: number; hora_inicio_min: number; hora_fin_min: number; dias_permitidos: number[]; plantilla: { codigo: string; clase_mensaje: string } | null }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  org = await sembrarOrganizacion(prisma, "Mensajería");
  ajena = await sembrarOrganizacion(prisma, "Mensajería ajena");
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

const alta = (c: ClienteApi, extra: Record<string, unknown> = {}) => c.post<Plantilla & Err>("/api/plantillas", { codigo: "aviso_uno", content_sid: "HX0001", categoria: "utility", clase_mensaje: "servicio", variables: [{ pos: 1, nombre: "nombre_familia" }], ...extra });

test("J8 plantillas: la clase se DECLARA al darla de alta (sin valor por omisión) y una de servicio no puede ser de marketing ante Meta", async () => {
  const r = await alta(admin);
  assert.equal(r.estado, 201, JSON.stringify(r.cuerpo));
  assert.deepEqual([r.cuerpo.clase_mensaje, r.cuerpo.estado_aprobacion, r.cuerpo.automatizaciones], ["servicio", "pendiente", 0]);
  const sinClase = await admin.post<Err>("/api/plantillas", { codigo: "sin_clase", content_sid: "HX0002", categoria: "utility" });
  assert.equal(sinClase.estado, 400);
  assert.ok(sinClase.cuerpo.error.detalles?.some((d) => d.campo === "clase_mensaje"), "la clase es obligatoria");
  const cruzada = await alta(admin, { codigo: "cruzada", clase_mensaje: "servicio", categoria: "marketing" });
  assert.equal(cruzada.estado, 400);
  assert.match(JSON.stringify(cruzada.cuerpo), /no puede ser de categoría marketing/);
  assert.equal((await alta(admin, { codigo: "mkt", content_sid: "HX0003", clase_mensaje: "marketing", categoria: "marketing" })).estado, 201);
  assert.equal((await alta(admin, { codigo: "Mal Codigo" })).estado, 400);
  assert.equal((await alta(admin, { codigo: "vars", variables: [{ pos: 1, nombre: "a" }, { pos: 1, nombre: "b" }] })).estado, 400, "dos variables en la misma posición");
  assert.equal((await alta(admin)).estado, 409, "mismo código, vertical e idioma");
  assert.equal((await alta(admin, { vertical_id: org.verticalId })).estado, 201, "el mismo código para otra vertical sí");
  assert.equal((await alta(admin, { codigo: "otra", vertical_id: ajena.verticalId })).estado, 400, "vertical de otra organización");
  // Roles, anónimo e IDOR.
  for (const c of [asesor, recepcion, maestro]) {
    assert.equal((await c.get("/api/plantillas")).estado, 403);
    assert.equal((await alta(c, { codigo: "no" })).estado, 403);
    assert.equal((await c.patch(`/api/plantillas/${r.cuerpo.id}`, { activo: false })).estado, 403);
    assert.equal((await c.delete(`/api/plantillas/${r.cuerpo.id}`)).estado, 403);
  }
  assert.equal((await api.cliente().get("/api/plantillas")).estado, 401);
  assert.equal((await adminAjeno.patch(`/api/plantillas/${r.cuerpo.id}`, { activo: false })).estado, 404);
  assert.equal((await adminAjeno.delete(`/api/plantillas/${r.cuerpo.id}`)).estado, 404);
  assert.ok(!(await adminAjeno.get<{ datos: Plantilla[] }>("/api/plantillas")).cuerpo.datos.some((p) => p.id === r.cuerpo.id));
  // Editar: estado de aprobación, clase (sin romper la regla) y variables.
  const aprobada = await admin.patch<Plantilla & Err>(`/api/plantillas/${r.cuerpo.id}`, { estado_aprobacion: "aprobada", variables: [{ pos: 1, nombre: "nombre_familia" }, { pos: 2, nombre: "hora" }] });
  assert.deepEqual([aprobada.cuerpo.estado_aprobacion, aprobada.cuerpo.variables.length], ["aprobada", 2]);
  assert.equal((await admin.patch(`/api/plantillas/${r.cuerpo.id}`, { categoria: "marketing" })).estado, 400, "dejaría una de servicio como marketing");
  assert.equal((await admin.patch(`/api/plantillas/${r.cuerpo.id}`, { codigo: "otro" })).estado, 400, "el código no se edita");
  assert.equal((await admin.patch(`/api/plantillas/${r.cuerpo.id}`, {})).estado, 400);
  // La base repite la regla aunque se salte la API.
  await assert.rejects(prisma.plantilla_mensaje.update({ where: { id: r.cuerpo.id }, data: { categoria: "marketing" } }), /check|clase_mensaje|violates/i);
  const lista = await admin.get<{ datos: Plantilla[] }>("/api/plantillas?clase_mensaje=marketing");
  assert.ok(lista.cuerpo.datos.length >= 1 && lista.cuerpo.datos.every((p) => p.clase_mensaje === "marketing"));
  assert.ok((await db().registro_cambio.count({ where: { entidad_tipo: "plantilla_mensaje", entidad_id: r.cuerpo.id } })) >= 2);
  assert.equal((await admin.delete(`/api/plantillas/${r.cuerpo.id}`)).estado, 204);
  assert.ok((await prisma.plantilla_mensaje.findUnique({ where: { id: r.cuerpo.id } }))?.eliminado_en, "baja lógica");
});

test("J8 automatizaciones: activar y ajustar; el horario nunca sale de 09:00–20:00 y el desfase respeta el sentido del evento; la base lo repite", async () => {
  const plantilla = (await alta(admin, { codigo: "recordatorio", content_sid: "HX0100" })).cuerpo;
  const nueva = (evento: "clase_muestra_proxima" | "cargo_vencido", offset: number) =>
    prisma.automatizacion.create({ data: { organizacion_id: org.organizacionId, nombre: `Aviso ${evento}`, evento_disparador: evento, offset_minutos: offset, plantilla_id: plantilla.id, max_intentos: 2, espaciado_minutos: 120 } });
  const antes = await nueva("clase_muestra_proxima", -1440);
  const despues = await nueva("cargo_vencido", 1440);

  const lista = await admin.get<{ datos: Automatizacion[] }>("/api/automatizaciones?evento_disparador=clase_muestra_proxima");
  const fila = lista.cuerpo.datos.find((a) => a.id === antes.id);
  assert.deepEqual([fila?.plantilla?.codigo, fila?.plantilla?.clase_mensaje, fila?.activo], ["recordatorio", "servicio", true]);

  for (const c of [asesor, recepcion, maestro]) {
    assert.equal((await c.get("/api/automatizaciones")).estado, 403);
    assert.equal((await c.patch(`/api/automatizaciones/${antes.id}`, { activo: false })).estado, 403);
  }
  assert.equal((await adminAjeno.patch(`/api/automatizaciones/${antes.id}`, { activo: false })).estado, 404);
  assert.ok(!(await adminAjeno.get<{ datos: Automatizacion[] }>("/api/automatizaciones")).cuerpo.datos.some((a) => a.id === antes.id));

  // Encender y apagar.
  assert.equal((await admin.patch<Automatizacion>(`/api/automatizaciones/${antes.id}`, { activo: false })).cuerpo.activo, false);
  assert.equal((await admin.patch<Automatizacion>(`/api/automatizaciones/${antes.id}`, { activo: true })).cuerpo.activo, true);

  // Horario: dentro de 09:00–20:00 y empezando antes de terminar (invariante 14).
  const horario = (inicio: number, fin: number) => admin.patch<Automatizacion & Err>(`/api/automatizaciones/${antes.id}`, { hora_inicio_min: inicio, hora_fin_min: fin });
  assert.equal((await horario(480, 1000)).estado, 400, "08:00 es antes de las 09:00");
  assert.equal((await horario(600, 1260)).estado, 400, "21:00 es después de las 20:00");
  assert.equal((await horario(900, 900)).estado, 400);
  assert.equal((await horario(1000, 900)).estado, 400);
  const bien = await horario(600, 1080);
  assert.deepEqual([bien.estado, bien.cuerpo.hora_inicio_min, bien.cuerpo.hora_fin_min], [200, 600, 1080]);
  // Con solo mover el inicio también se revisa contra el fin que ya tiene.
  assert.equal((await admin.patch(`/api/automatizaciones/${antes.id}`, { hora_inicio_min: 1100 })).estado, 400);
  // La base repite la regla aunque se salte la API.
  await assert.rejects(prisma.automatizacion.update({ where: { id: antes.id }, data: { hora_inicio_min: 0 } }), /check|horario/i);

  // Desfase según el sentido del evento.
  assert.equal((await admin.patch(`/api/automatizaciones/${antes.id}`, { offset_minutos: 60 })).estado, 400, "un recordatorio ANTES de la clase no puede ser positivo");
  assert.equal((await admin.patch(`/api/automatizaciones/${antes.id}`, { offset_minutos: -120 })).estado, 200);
  assert.equal((await admin.patch(`/api/automatizaciones/${despues.id}`, { offset_minutos: -5 })).estado, 400, "un aviso DESPUÉS del vencimiento no puede ser negativo");
  assert.equal((await admin.patch(`/api/automatizaciones/${despues.id}`, { offset_minutos: 2880, max_intentos: 4, espaciado_minutos: 10_080 })).estado, 200);
  assert.equal((await admin.patch(`/api/automatizaciones/${despues.id}`, { espaciado_minutos: 30 })).estado, 400, "al menos 60 minutos");
  assert.equal((await admin.patch(`/api/automatizaciones/${despues.id}`, { max_intentos: 0 })).estado, 400);
  assert.equal((await admin.patch(`/api/automatizaciones/${despues.id}`, { espaciado_minutos: null })).estado, 200);

  // Días y plantilla.
  assert.equal((await admin.patch(`/api/automatizaciones/${antes.id}`, { dias_permitidos: [] })).estado, 400);
  assert.equal((await admin.patch(`/api/automatizaciones/${antes.id}`, { dias_permitidos: [1, 1] })).estado, 400);
  assert.equal((await admin.patch(`/api/automatizaciones/${antes.id}`, { dias_permitidos: [7] })).estado, 400);
  assert.deepEqual((await admin.patch<Automatizacion>(`/api/automatizaciones/${antes.id}`, { dias_permitidos: [1, 2, 3, 4, 5] })).cuerpo.dias_permitidos, [1, 2, 3, 4, 5]);
  const ajenaP = (await adminAjeno.post<Plantilla>("/api/plantillas", { codigo: "ajena", content_sid: "HX9", categoria: "utility", clase_mensaje: "servicio" })).cuerpo;
  assert.equal((await admin.patch(`/api/automatizaciones/${antes.id}`, { plantilla_id: ajenaP.id })).estado, 400, "una plantilla de otra organización no existe");
  assert.equal((await admin.patch(`/api/automatizaciones/${antes.id}`, { nombre: "x" })).estado, 400, "solo se ajustan los tiempos: no se renombra ni se cambia el evento");
  assert.equal((await admin.delete(`/api/plantillas/${plantilla.id}`)).estado, 409, "una plantilla en uso no se da de baja");
  assert.ok((await db().registro_cambio.count({ where: { entidad_tipo: "automatizacion", entidad_id: antes.id } })) >= 5);
});

test("J8 eventos inesperados y tareas sin lead: solo el administrador los ve, solo los de su organización, y nunca traen el contenido", async () => {
  const tarea = await prisma.tarea_asesor.create({ data: { organizacion_id: org.organizacionId, tipo: "evento_inesperado", descripcion: "Un evento que no se pudo atar a ningún lead" } });
  const evento = await prisma.evento_inesperado.create({ data: { organizacion_id: org.organizacionId, origen: "twilio_entrante", clave: "clave-1", causa: "forma_inesperada", detalle: "falta el campo From", forma: { cuerpo: "objeto(3)" }, tarea_id: tarea.id } });
  const resuelto = await prisma.evento_inesperado.create({ data: { organizacion_id: org.organizacionId, origen: "landing", clave: "clave-2", causa: "dato_invalido", detalle: "edad fuera de rango" } });
  await prisma.evento_inesperado.create({ data: { organizacion_id: ajena.organizacionId, origen: "chatwoot", clave: "clave-3", causa: "error_interno", detalle: "ajeno" } });

  const lista = await admin.get<{ datos: { id: string; origen: string; causa: string; forma: unknown; tarea: { estado: string } | null }[]; paginacion: { total: number } }>("/api/eventos-inesperados");
  assert.equal(lista.estado, 200);
  assert.deepEqual(lista.cuerpo.datos.map((e) => e.id).sort(), [evento.id, resuelto.id].sort(), "solo los de mi organización");
  assert.deepEqual((await admin.get<{ datos: { id: string }[] }>("/api/eventos-inesperados?pendientes=true")).cuerpo.datos.map((e) => e.id), [evento.id]);
  assert.deepEqual((await admin.get<{ datos: { id: string }[] }>("/api/eventos-inesperados?origen=landing")).cuerpo.datos.map((e) => e.id), [resuelto.id]);
  assert.equal((await admin.get("/api/eventos-inesperados?origen=otro")).estado, 400);
  for (const c of [asesor, recepcion, maestro]) assert.equal((await c.get("/api/eventos-inesperados")).estado, 403);
  assert.equal((await api.cliente().get("/api/eventos-inesperados")).estado, 401);
  assert.deepEqual((await adminAjeno.get<{ datos: { causa: string }[] }>("/api/eventos-inesperados")).cuerpo.datos.map((e) => e.causa), ["error_interno"]);

  // La tarea sin lead: el administrador la ve con `sin_lead=true`; un asesor no la ve ni así.
  const sinLead = await admin.get<{ datos: { id: string; lead_id: string | null }[] }>("/api/tareas?sin_lead=true");
  assert.ok(sinLead.cuerpo.datos.some((t) => t.id === tarea.id && t.lead_id === null));
  assert.ok(sinLead.cuerpo.datos.every((t) => t.lead_id === null));
  assert.ok(!(await asesor.get<{ datos: { id: string }[] }>("/api/tareas?sin_lead=true")).cuerpo.datos.some((t) => t.id === tarea.id));
  assert.equal((await asesor.patch(`/api/tareas/${tarea.id}`, { estado: "hecha" })).estado, 404, "un asesor no puede resolver lo que no ve");
  assert.equal((await admin.patch(`/api/tareas/${tarea.id}`, { estado: "hecha" })).estado, 200);
  assert.deepEqual((await admin.get<{ datos: { id: string }[] }>("/api/eventos-inesperados?pendientes=true")).cuerpo.datos, [], "al resolver la tarea el evento deja de estar pendiente");
});
