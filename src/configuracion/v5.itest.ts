// V5, configuración sin SQL: los ajustes que la escuela cambia desde Administración → Configuración. Postgres real, la app real. Por cada ajuste nuevo:
//  · el valor por omisión (columna de la base = constante del código que reemplaza = lo que lee el sistema sin fila);
//  · los límites (fuera de rango → 400 con un mensaje en español que dice qué hacer; la base repite el rango con un CHECK);
//  · el efecto REAL en el comportamiento, sin reiniciar;
//  · solo el administrador escribe; ninguna fuga entre organizaciones; cada cambio en el registro;
//  · un ajuste de un módulo apagado se puede editar y no hace nada.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomInt } from "node:crypto";
import { conAlcance, altaConAlcance } from "../datos/alcance.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";
import { fijarConfiguracion, sembrarEntrante, sembrarOrganizacion, sembrarPrograma, OcupacionFija, type OrganizacionDePrueba } from "../testutil/semilla.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { MessagingProvider, TransporteFalso, respuestaA, type Saliente } from "../mensajeria/index.ts";
import { estrecharAutomatizaciones, horarioDeEnvio } from "../mensajeria/horario-envio.ts";
import { ocupacionPorGrupo } from "../reportes/ejecutivo.ts";
import { CONFIGURACION_POR_DEFECTO, leerConfiguracion } from "./index.ts";

let prisma: PrismaPruebas;
let api: ApiLevantada;
let org: OrganizacionDePrueba;
let ajena: OrganizacionDePrueba;
let admin: ClienteApi;
let adminAjeno: ClienteApi;
const otros: Record<"asesor" | "recepcion" | "maestro", ClienteApi> = {} as never;
const db = () => conAlcance(prisma, org.organizacionId);

interface Err { error: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] } }
interface Config extends Record<string, unknown> { limites: Record<string, { min: number; max: number; por_omision: number; efecto: string; grupo: string; unidad: string; modulo: string | null }> }

before(async () => {
  prisma = crearPrismaDePruebas();
  api = levantarApi(prisma);
  org = await sembrarOrganizacion(prisma, "V5 configuración");
  ajena = await sembrarOrganizacion(prisma, "V5 ajena");
  const entrar = async (o: OrganizacionDePrueba, rol: "administrador" | "asesor" | "maestro" | "recepcion") => {
    const u = await sembrarUsuario(prisma, o.organizacionId, { rol, sucursales: rol === "asesor" || rol === "recepcion" ? [o.sucursales[0]!.id] : [] });
    const c = api.cliente();
    assert.equal((await c.login(o.slug, u.correo, u.contrasena)).estado, 201);
    return c;
  };
  admin = await entrar(org, "administrador");
  adminAjeno = await entrar(ajena, "administrador");
  for (const rol of ["asesor", "recepcion", "maestro"] as const) otros[rol] = await entrar(org, rol);
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

const mensaje = (r: { cuerpo: unknown }): string => JSON.stringify((r.cuerpo as Err).error ?? r.cuerpo);
const detalle = (r: { cuerpo: unknown }): string => ((r.cuerpo as Err).error.detalles ?? []).map((d) => d.mensaje).join(" | ");

const NUEVOS = ["horario_envio_inicio_min", "horario_envio_fin_min", "lead_a_medias_minutos", "bot_max_intentos", "ocupacion_a_reventar_pct", "ocupacion_vacio_pct"] as const;

test("valor por omisión: la columna, la constante del código y el lector dicen lo mismo, y la API lo muestra con su rango y su explicación", async () => {
  const o = await sembrarOrganizacion(prisma, "V5 por omisión");
  // Sin fila: el lector da los valores por omisión.
  assert.deepEqual(await leerConfiguracion(conAlcance(prisma, o.organizacionId)), CONFIGURACION_POR_DEFECTO);
  // Con fila nueva: los DEFAULT de las columnas son los mismos.
  const fila = await prisma.configuracion_organizacion.create({ data: { organizacion_id: o.organizacionId } });
  assert.deepEqual([fila.horario_envio_inicio_min, fila.horario_envio_fin_min, fila.lead_a_medias_minutos, fila.bot_max_intentos, fila.ocupacion_a_reventar_pct, fila.ocupacion_vacio_pct], [540, 1200, 30, 3, 90, 25]);
  assert.deepEqual(await leerConfiguracion(conAlcance(prisma, o.organizacionId)), CONFIGURACION_POR_DEFECTO);
  // La API (organización sin fila): los valores por omisión, con límites y explicación en cada ajuste.
  const g = await admin.get<Config>("/api/configuracion");
  assert.equal(g.estado, 200);
  for (const k of NUEVOS) {
    const l = g.cuerpo.limites[k]!;
    assert.ok(l, k);
    assert.equal(g.cuerpo[k], l.por_omision, k);
    assert.ok(l.efecto.length > 20 && l.grupo.length > 3, k);
  }
  assert.deepEqual([g.cuerpo["horario_envio_inicio_min"], g.cuerpo["horario_envio_fin_min"]], [540, 1200]);
  assert.deepEqual([g.cuerpo.limites["horario_envio_inicio_min"]!.min, g.cuerpo.limites["horario_envio_fin_min"]!.max], [540, 1200]);
});

test("la base repite los rangos con un CHECK: horario fuera de 09:00–20:00 o al revés, silencio del bot, intentos y umbrales de ocupación", async () => {
  const o = await sembrarOrganizacion(prisma, "V5 CHECK");
  const crear = (d: Record<string, number>) => prisma.configuracion_organizacion.create({ data: { organizacion_id: o.organizacionId, ...d } });
  await assert.rejects(crear({ horario_envio_inicio_min: 539 }), /configuracion_horario_envio_chk/);
  await assert.rejects(crear({ horario_envio_fin_min: 1201 }), /configuracion_horario_envio_chk/);
  await assert.rejects(crear({ horario_envio_inicio_min: 700, horario_envio_fin_min: 700 }), /configuracion_horario_envio_chk/);
  await assert.rejects(crear({ horario_envio_inicio_min: 900, horario_envio_fin_min: 800 }), /configuracion_horario_envio_chk/);
  for (const malo of [4, 1441, 0]) await assert.rejects(crear({ lead_a_medias_minutos: malo }), /configuracion_lead_a_medias_chk/, String(malo));
  for (const malo of [0, 11, -1]) await assert.rejects(crear({ bot_max_intentos: malo }), /configuracion_bot_intentos_chk/, String(malo));
  await assert.rejects(crear({ ocupacion_a_reventar_pct: 101 }), /configuracion_ocupacion_chk/);
  await assert.rejects(crear({ ocupacion_vacio_pct: 90 }), /configuracion_ocupacion_chk/, "vacío igual que a reventar");
  await assert.rejects(crear({ ocupacion_vacio_pct: 60, ocupacion_a_reventar_pct: 50 }), /configuracion_ocupacion_chk/);
  await assert.rejects(crear({ ocupacion_vacio_pct: -1 }), /configuracion_ocupacion_chk/);
  // Los extremos válidos.
  await crear({ horario_envio_inicio_min: 540, horario_envio_fin_min: 541, lead_a_medias_minutos: 5, bot_max_intentos: 1, ocupacion_vacio_pct: 0, ocupacion_a_reventar_pct: 1 });
});

test("límites por la API: fuera de rango → 400 con un mensaje que dice qué hacer; el horario nunca se amplía más allá de 09:00–20:00", async () => {
  const casos: [string, number, RegExp][] = [
    ["horario_envio_inicio_min", 539, /solo pueden salir entre las 09:00 y las 20:00\. Elige una hora de 09:00 a 19:59/],
    ["horario_envio_inicio_min", 0, /entre las 09:00 y las 20:00/],
    ["horario_envio_inicio_min", 1200, /entre las 09:00 y las 20:00/],
    ["horario_envio_fin_min", 1201, /entre las 09:00 y las 20:00\. Elige una hora de 09:01 a 20:00/],
    ["horario_envio_fin_min", 1440, /entre las 09:00 y las 20:00/],
    ["horario_envio_fin_min", 540, /entre las 09:00 y las 20:00/],
    ["lead_a_medias_minutos", 4, /Escribe un número entero de 5 a 1440/],
    ["lead_a_medias_minutos", 1441, /Escribe un número entero de 5 a 1440/],
    ["bot_max_intentos", 0, /Escribe un número entero de 1 a 10/],
    ["bot_max_intentos", 11, /Escribe un número entero de 1 a 10/],
    ["ocupacion_a_reventar_pct", 0, /de 1 a 100/],
    ["ocupacion_a_reventar_pct", 101, /de 1 a 100/],
    ["ocupacion_vacio_pct", -1, /de 0 a 99/],
    ["ocupacion_vacio_pct", 100, /de 0 a 99/],
  ];
  for (const [campo, valor, texto] of casos) {
    const r = await admin.patch<Err>("/api/configuracion", { [campo]: valor });
    assert.equal(r.estado, 400, `${campo}=${valor}: ${mensaje(r)}`);
    assert.match(detalle(r), texto, `${campo}=${valor}`);
    assert.equal(r.cuerpo.error.detalles?.[0]?.campo, campo);
  }
  // No números enteros ni textos.
  for (const malo of [1.5, "10", null, true]) assert.equal((await admin.patch("/api/configuracion", { lead_a_medias_minutos: malo })).estado, 400, String(malo));
  // Nada se guardó.
  assert.deepEqual(await leerConfiguracion(db()), CONFIGURACION_POR_DEFECTO);
});

test("reglas entre dos ajustes: el inicio antes del fin y «vacío» por debajo de «a reventar» (se juzgan con lo que quedaría, no con lo que llegó)", async () => {
  const o = await sembrarOrganizacion(prisma, "V5 cruzadas");
  const u = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
  const c = api.cliente();
  await c.login(o.slug, u.correo, u.contrasena);
  const r1 = await c.patch<Err>("/api/configuracion", { horario_envio_inicio_min: 1000, horario_envio_fin_min: 900 });
  assert.equal(r1.estado, 400);
  assert.match(detalle(r1), /hora de inicio debe ser antes que la hora de fin\. Cambia una de las dos/);
  // Solo el inicio, pero pasa al fin que ya está guardado.
  assert.equal((await c.patch("/api/configuracion", { horario_envio_fin_min: 700 })).estado, 200);
  const r2 = await c.patch<Err>("/api/configuracion", { horario_envio_inicio_min: 700 });
  assert.equal(r2.estado, 400, mensaje(r2));
  assert.match(detalle(r2), /antes que la hora de fin/);
  const r3 = await c.patch<Err>("/api/configuracion", { ocupacion_vacio_pct: 95 });
  assert.equal(r3.estado, 400);
  assert.match(detalle(r3), /«vacío» debe ser menor que el de «a reventar»\. Baja uno o sube el otro/);
  assert.equal((await c.patch("/api/configuracion", { ocupacion_a_reventar_pct: 100, ocupacion_vacio_pct: 95 })).estado, 200);
  assert.equal((await c.patch("/api/configuracion", { ocupacion_a_reventar_pct: 80 })).estado, 400, "bajar «a reventar» por debajo del «vacío» guardado");
  const final = await leerConfiguracion(conAlcance(prisma, o.organizacionId));
  assert.deepEqual([final.horarioEnvioFinMin, final.horarioEnvioInicioMin, final.ocupacionAReventarPct, final.ocupacionVacioPct], [700, 540, 100, 95]);
});

test("solo el administrador escribe y lee; sin sesión, 401; cada cambio queda en el registro con su antes y su después", async () => {
  for (const rol of ["asesor", "recepcion", "maestro"] as const) {
    assert.equal((await otros[rol].get("/api/configuracion")).estado, 403, rol);
    for (const campo of NUEVOS) assert.equal((await otros[rol].patch("/api/configuracion", { [campo]: 10 })).estado, 403, `${rol} ${campo}`);
  }
  assert.equal((await api.cliente().patch("/api/configuracion", { bot_max_intentos: 4 })).estado, 401);
  const o = await sembrarOrganizacion(prisma, "V5 registro");
  const u = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
  const c = api.cliente();
  await c.login(o.slug, u.correo, u.contrasena);
  const r = await c.patch<Config>("/api/configuracion", { horario_envio_inicio_min: 600, horario_envio_fin_min: 1080, lead_a_medias_minutos: 45, bot_max_intentos: 4, ocupacion_a_reventar_pct: 85, ocupacion_vacio_pct: 20 });
  assert.equal(r.estado, 200, mensaje(r));
  assert.deepEqual([r.cuerpo["horario_envio_inicio_min"], r.cuerpo["horario_envio_fin_min"], r.cuerpo["lead_a_medias_minutos"], r.cuerpo["bot_max_intentos"]], [600, 1080, 45, 4]);
  const cambio = await prisma.registro_cambio.findFirst({ where: { organizacion_id: o.organizacionId, entidad_tipo: "configuracion_organizacion" }, orderBy: { creado_en: "desc" } });
  assert.deepEqual((cambio?.antes as Record<string, unknown>)["horario_envio_inicio_min"], 540);
  assert.deepEqual((cambio?.despues as Record<string, unknown>)["horario_envio_inicio_min"], 600);
  assert.deepEqual((cambio?.despues as Record<string, unknown>)["bot_max_intentos"], 4);
  // Lo que no cambió no se registra.
  assert.equal((cambio?.despues as Record<string, unknown>)["modo_cierre"], undefined);
  // Surte efecto en la siguiente lectura, sin reiniciar nada.
  const leida = await leerConfiguracion(conAlcance(prisma, o.organizacionId));
  assert.deepEqual([leida.horarioEnvioInicioMin, leida.horarioEnvioFinMin, leida.leadAMediasMinutos, leida.botMaxIntentos, leida.ocupacionAReventarPct, leida.ocupacionVacioPct], [600, 1080, 45, 4, 85, 20]);
});

test("no hay fuga entre organizaciones: lo que una escuela ajusta no lo ve ni lo afecta otra", async () => {
  await fijarConfiguracion(prisma, org.organizacionId, { horario_envio_inicio_min: 660, horario_envio_fin_min: 1020, lead_a_medias_minutos: 90, bot_max_intentos: 6 });
  const mia = await leerConfiguracion(db());
  const ajenaCfg = await leerConfiguracion(conAlcance(prisma, ajena.organizacionId));
  assert.deepEqual([mia.horarioEnvioInicioMin, mia.leadAMediasMinutos, mia.botMaxIntentos], [660, 90, 6]);
  assert.deepEqual([ajenaCfg.horarioEnvioInicioMin, ajenaCfg.leadAMediasMinutos, ajenaCfg.botMaxIntentos], [540, 30, 3]);
  const g = await adminAjeno.get<Config>("/api/configuracion");
  assert.deepEqual([g.cuerpo["horario_envio_inicio_min"], g.cuerpo["lead_a_medias_minutos"]], [540, 30]);
  assert.equal((await adminAjeno.patch("/api/configuracion", { lead_a_medias_minutos: 100 })).estado, 200);
  assert.equal((await leerConfiguracion(db())).leadAMediasMinutos, 90, "la mía no se movió");
  assert.equal((await horarioDeEnvio(db())).inicioMin, 660);
  assert.equal((await horarioDeEnvio(conAlcance(prisma, ajena.organizacionId))).inicioMin, 540);
  // Restablecer lo mío para las demás pruebas.
  await fijarConfiguracion(prisma, org.organizacionId, { horario_envio_inicio_min: 540, horario_envio_fin_min: 1200, lead_a_medias_minutos: 30, bot_max_intentos: 3 });
  await fijarConfiguracion(prisma, ajena.organizacionId, { lead_a_medias_minutos: 30 });
});

// ── Efecto real: el horario de envío ──────────────────────────────────────────────────────────────────

/** 8-oct-2026, hora de Ciudad de México = UTC-6. */
const local = (hora: string, dia = 8): Date => new Date(`2026-10-${String(dia).padStart(2, "0")}T${hora}:00-06:00`);

async function escenarioDeEnvio(nombre: string) {
  const o = await sembrarOrganizacion(prisma, nombre);
  const d = conAlcance(prisma, o.organizacionId);
  const plantilla = (codigo: string, clase: "servicio" | "marketing") =>
    d.plantilla_mensaje.create({ data: altaConAlcance({ codigo, content_sid: "HX00000000000000000000000000000000", categoria: clase === "marketing" ? ("marketing" as const) : ("utility" as const), clase_mensaje: clase, estado_aprobacion: "aprobada" as const, cuerpo_referencia: codigo }) });
  const servicio = await plantilla("aviso", "servicio");
  const lead = await d.lead.create({ data: altaConAlcance({ vertical_interes_id: o.verticalId, sucursal_interes_id: o.sucursales[0]!.id, etapa_id: o.etapaInicialId, telefono: `+5255${randomInt(10_000_000, 99_999_999)}` }) });
  const conv = await d.conversacion.create({ data: altaConAlcance({ bandeja_chatwoot_id: o.bandejaId, lead_id: lead.id, chatwoot_conversacion_id: randomInt(1, 2_000_000_000), ventana_servicio_hasta: null }) });
  const transporte = new TransporteFalso();
  /** Manda un aviso automático (plantilla de servicio) como si fuera `ahora`. */
  const mandar = async (ahora: Date) => {
    const provider = new MessagingProvider({ transporte, reloj: () => ahora });
    const s: Saliente = { tipo: "mensaje", cuerpo: "recordatorio", origen: "automatizacion", plantilla: { id: servicio.id, variables: {} } };
    await d.$transaction((tx) => provider.encolar(tx, conv.id, [s]));
    return (await provider.despachar(d, conv.id)).resultados.map((x) => [x.resultado, x.motivo] as const);
  };
  return { o, d, mandar };
}

test("EFECTO horario: con el de siempre sale a las 09:30; con 10:00–18:00 espera; después de las 18:00 tampoco; dentro, sale. Sin reiniciar", async () => {
  const s = await escenarioDeEnvio("V5 horario");
  assert.deepEqual(await s.mandar(local("09:30")), [["enviado", undefined]], "horario de siempre");
  await fijarConfiguracion(prisma, s.o.organizacionId, { horario_envio_inicio_min: 600, horario_envio_fin_min: 1080 });
  assert.deepEqual(await s.mandar(local("09:30", 9)), [["bloqueado", "fuera_de_horario"]], "antes de abrir");
  assert.deepEqual(await s.mandar(local("18:30", 9)), [["bloqueado", "fuera_de_horario"]], "ya cerró");
  assert.deepEqual(await s.mandar(local("18:00", 9)), [["bloqueado", "fuera_de_horario"]], "el cierre es exclusivo");
  assert.deepEqual(await s.mandar(local("10:00", 9)), [["enviado", undefined]], "justo al abrir");
  assert.deepEqual(await s.mandar(local("17:59", 10)), [["enviado", undefined]]);
  // Volver al de siempre también surte efecto en seguida.
  await fijarConfiguracion(prisma, s.o.organizacionId, { horario_envio_inicio_min: 540, horario_envio_fin_min: 1200 });
  assert.deepEqual(await s.mandar(local("19:30", 11)), [["enviado", undefined]]);
});

test("EFECTO horario: contestar a quien acaba de escribir NO tiene horario, ni con el horario estrechado (invariante 14)", async () => {
  const s = await escenarioDeEnvio("V5 horario respuesta");
  await fijarConfiguracion(prisma, s.o.organizacionId, { horario_envio_inicio_min: 600, horario_envio_fin_min: 1080 });
  const ahora = local("08:15", 9); // antes de que abra el horario de la escuela
  const conv = await s.d.conversacion.findFirstOrThrow({});
  await s.d.conversacion.update({ where: { id: conv.id }, data: { ventana_servicio_hasta: new Date(ahora.getTime() + 3_600_000) } });
  const entrante = await sembrarEntrante(s.d, conv.id);
  const provider = new MessagingProvider({ transporte: new TransporteFalso(), reloj: () => ahora });
  await s.d.$transaction((tx) => provider.encolar(tx, conv.id, [respuestaA(entrante, "Con gusto")]));
  const r = await provider.despachar(s.d, conv.id);
  assert.deepEqual(r.resultados.map((x) => [x.resultado, x.motivo]), [["enviado", undefined]], "responder no tiene restricción de horario");
});

test("EFECTO horario: lo que se programa (recordatorios y demás) respeta el de la escuela y el de la automatización, el más estrecho de los dos", async () => {
  const o = await sembrarOrganizacion(prisma, "V5 programar");
  const d = conAlcance(prisma, o.organizacionId);
  const autos = [
    { hora_inicio_min: 540, hora_fin_min: 1200 },
    { hora_inicio_min: 660, hora_fin_min: 900 },
    { hora_inicio_min: 540, hora_fin_min: 600 },
  ];
  assert.deepEqual(await estrecharAutomatizaciones(d, autos), autos, "sin ajuste de la escuela, tal cual");
  await fijarConfiguracion(prisma, o.organizacionId, { horario_envio_inicio_min: 600, horario_envio_fin_min: 1080 });
  assert.deepEqual(await estrecharAutomatizaciones(d, autos), [
    { hora_inicio_min: 600, hora_fin_min: 1080 },
    { hora_inicio_min: 660, hora_fin_min: 900 },
    { hora_inicio_min: 600, hora_fin_min: 1080 },
  ]);
  assert.deepEqual(await estrecharAutomatizaciones(d, []), []);
});

// ── Efecto real: ocupación en el tablero ─────────────────────────────────────────────────────────────

test("EFECTO ocupación: el tablero marca «a reventar» y «vacío» con los umbrales de la escuela, y por omisión con los de siempre", async () => {
  const o = await sembrarOrganizacion(prisma, "V5 ocupación");
  const programa = await sembrarPrograma(prisma, o, { sucursalId: o.sucursales[0]!.id, nombre: "Programa", edadMin: 5, edadMax: 12, grupos: [{ nombre: "Grupo de 10", cupoMaximo: 10 }] });
  const grupoId = programa.grupos[0]!.id;
  const d = conAlcance(prisma, o.organizacionId);
  const fuente = new OcupacionFija();
  const estado = async () => (await ocupacionPorGrupo(d, fuente)).find((g) => g.grupo.id === grupoId)!.estado;
  fuente.fijar(grupoId, 8);
  assert.equal(await estado(), "normal", "80 % con los umbrales de siempre");
  await fijarConfiguracion(prisma, o.organizacionId, { ocupacion_a_reventar_pct: 70, ocupacion_vacio_pct: 40 });
  assert.equal(await estado(), "a_reventar", "80 % pasa de 70 %");
  fuente.fijar(grupoId, 4);
  assert.equal(await estado(), "vacio", "40 % no pasa de 40 %");
  fuente.fijar(grupoId, 5);
  assert.equal(await estado(), "normal");
  await fijarConfiguracion(prisma, o.organizacionId, { ocupacion_a_reventar_pct: 90, ocupacion_vacio_pct: 25 });
  fuente.fijar(grupoId, 8);
  assert.equal(await estado(), "normal");
  fuente.fijar(grupoId, 9);
  assert.equal(await estado(), "a_reventar");
});

// ── Módulos apagados ───────────────────────────────────────────────────────────────────────────────────

test("un ajuste de un módulo apagado se puede editar (queda guardado) pero no hace nada hasta encenderlo; la API lo dice con el módulo de cada ajuste", async () => {
  const o = await sembrarOrganizacion(prisma, "V5 módulo apagado");
  const u = await sembrarUsuario(prisma, o.organizacionId, { rol: "administrador" });
  const c = api.cliente();
  await c.login(o.slug, u.correo, u.contrasena);
  const g = await c.get<Config>("/api/configuracion");
  assert.equal(g.cuerpo.limites["ocupacion_a_reventar_pct"]!.modulo, "tableros");
  assert.equal(g.cuerpo.limites["horario_envio_inicio_min"]!.modulo, null, "el horario es de la captación: siempre encendida");
  assert.equal(g.cuerpo.limites["lead_a_medias_minutos"]!.modulo, null);
  // Con TODO apagado salvo la captación, los ajustes de los demás módulos se editan sin problema.
  await fijarConfiguracion(prisma, o.organizacionId, { modulo_cotizador: false, modulo_clase_muestra: false, modulo_inscripcion: false, modulo_operacion: false, modulo_finanzas: false, modulo_tableros: false });
  const r = await c.patch<Config>("/api/configuracion", { ocupacion_a_reventar_pct: 80, ocupacion_vacio_pct: 10, umbral_dias_deuda: 20, cotizacion_vigencia_dias: 3 });
  assert.equal(r.estado, 200, mensaje(r));
  const leida = await leerConfiguracion(conAlcance(prisma, o.organizacionId));
  assert.deepEqual([leida.ocupacionAReventarPct, leida.ocupacionVacioPct, leida.umbralDiasDeuda, leida.cotizacionVigenciaDias], [80, 10, 20, 3]);
  // Y no hacen nada: el tablero (módulo apagado) no responde.
  assert.equal((await c.get("/api/reportes/ejecutivo")).estado, 404);
  // Los ajustes de la captación siguen funcionando con todo lo demás apagado.
  assert.equal((await c.patch("/api/configuracion", { lead_a_medias_minutos: 20, bot_max_intentos: 2 })).estado, 200);
});
