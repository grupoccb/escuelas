// K1: PRUEBA DE FUEGO TOTAL. Una escuela que acaba de nacer (la plantilla de organización: solo la organización, el embudo y la configuración, SIN usuarios, catálogo ni
// canal) y un administrador. Con ESE administrador y SOLO por la API de administración —los mismos endpoints que usa la interfaz— se da de alta una vertical nueva y una
// sucursal nueva con todo lo que necesitan (salón, usuarios por rol, instructor, programa, precio, grupo con horarios, promociones, producto, documentos legales, canal y
// bandeja de pruebas), y se opera de punta a punta con el transporte falso: un lead por la landing, otro por WhatsApp, el bot, la cotización, la clase muestra, el registro del
// maestro, la asistencia, la conversión, la inscripción con su promoción, el cargo, el pago, la entrega del beneficio y el expediente. Sin tocar una línea de código ni un
// seed de la vertical o la sucursal. Este archivo no nombra ninguna vertical ni sucursal real (`check:generico`): todo lo que se nombra lo inventa la prueba.
//
// Lo que se descubra que NO se pudo hacer por la API se anota en `FALTANTES` y se reporta en la bitácora: la prueba lo comprueba explícitamente para que una mejora futura
// (o una regresión) no pase desapercibida.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { InscripcionesActivas } from "../catalogo/cupo.ts";
import { procesarEntrante } from "../captacion/entrante.ts";
import { conAlcance } from "../datos/alcance.ts";
import { cuadratura } from "../finanzas/cuadratura.ts";
import { AtribucionDesdeChatwoot, MessagingProvider, TransporteFalso } from "../mensajeria/index.ts";
import { payloadMensajeEntrante } from "../mensajeria/chatwoot/fixtures.ts";
import { firmarCuerpoChatwoot } from "../mensajeria/chatwoot/webhook.ts";
import { crearCifrador } from "../sensibles/cifrado.ts";
import { levantarApi, sembrarUsuario, type ApiLevantada, type ClienteApi } from "../testutil/api.ts";
import { crearPrismaDePruebas, type PrismaPruebas } from "../testutil/prisma-pruebas.ts";

/** Lunes 2 de noviembre de 2026, 12:00 en la Ciudad de México. */
const AHORA = new Date("2026-11-02T18:00:00Z");
const SECRETO = "secreto-de-prueba";
const SLUG = `fuego-${randomBytes(4).toString("hex")}`;

/** Lo que la prueba NO pudo hacer por la API y se reporta (ver la bitácora, K1). Cada entrada se comprueba más abajo. */
export const FALTANTES = [
  "Las automatizaciones (recordatorios de clase muestra, reenganche, cobranza…) y sus plantillas iniciales no se pueden CREAR por la API: solo se ajustan (PATCH /api/automatizaciones) y se registran sus plantillas (POST /api/plantillas); el alta de cada automatización vive en el seed de la organización. La plantilla de organización no las trae.",
] as const;

let prisma: PrismaPruebas;
let api: ApiLevantada;
let orgId: string;
let admin: ClienteApi;
const transporte = new TransporteFalso();
const reloj = { ahora: AHORA };
const cifrador = crearCifrador(randomBytes(32));
let siguienteMensaje = randomInt(1_000_000, 2_000_000_000);

interface Err {
  error?: { codigo: string; mensaje: string; detalles?: { campo?: string; mensaje: string }[] };
}
const motivo = (r: { estado: number; cuerpo: unknown }): string => `${r.estado} ${JSON.stringify(r.cuerpo).slice(0, 500)}`;

before(async () => {
  prisma = crearPrismaDePruebas(process.env["DATABASE_URL"], 20);
  // 1. La escuela nace por seed (invariante 1): la plantilla de organización, con su identificador. Es lo único que se hace "a mano".
  const sql = readFileSync(new URL("../../prisma/seed/plantilla-organizacion.sql", import.meta.url), "utf8").replace("CAMBIAR-identificador-corto", SLUG).replace("CAMBIAR: nombre de la escuela", "Escuela de la prueba de fuego");
  const c = new pg.Client({ connectionString: process.env["DATABASE_URL"] });
  await c.connect();
  await c.query(sql);
  await c.end();
  orgId = (await prisma.organizacion.findFirstOrThrow({ where: { slug: SLUG } })).id;
  // 2. El primer administrador (en producción: scripts/crear-usuario.ts).
  const u = await sembrarUsuario(prisma, orgId, { rol: "administrador" });
  const mensajeria = new MessagingProvider({ transporte, reloj: () => reloj.ahora });
  const fuenteOcupacion = new InscripcionesActivas();
  api = levantarApi(
    prisma,
    { reloj: () => reloj.ahora, sensibles: { cifrador }, fuenteOcupacion, sesion: { duracionMs: 400 * 86_400_000, inactividadMs: 400 * 86_400_000 } },
    { procesarEntrante: (e) => procesarEntrante({ prisma, mensajeria, atribucion: new AtribucionDesdeChatwoot(), fuenteOcupacion, reloj: () => reloj.ahora }, e), reloj: () => reloj.ahora },
  );
  admin = api.cliente();
  assert.equal((await admin.login(SLUG, u.correo, u.contrasena)).estado, 201);
  // 3. V1: la plantilla deja encendida SOLO la captación. Para operar de punta a punta, el administrador enciende los demás módulos desde Administración (la API), sin tocar código.
  const modulos = await admin.get<{ modulos: { id: string; encendido: boolean }[] }>("/api/modulos");
  assert.deepEqual(modulos.cuerpo.modulos.filter((x) => x.encendido).map((x) => x.id), ["captacion"], "la escuela nueva arranca con solo la captación");
  assert.equal((await admin.get("/api/cargos")).estado, 404, "lo apagado no responde");
  const encendidos = await admin.put("/api/modulos", { cotizador: true, clase_muestra: true, inscripcion: true, operacion: true, finanzas: true, tableros: true });
  assert.equal(encendidos.estado, 200, motivo(encendidos));
});
after(async () => {
  await api.cerrar();
  await prisma.$disconnect();
});

// V10 / EK-24: la sucursal nueva vive en una zona que NO es la del servidor ni UTC, y su clase es a las 19:00 locales: en UTC ya es el día siguiente (00:00). Así, cualquier cálculo que use
// UTC en lugar de la zona de la sucursal (la fecha de la sesión, el pase de lista, el rango por día de un reporte, el aviso al maestro) se nota en esta prueba.
const ZONA_NUEVA = "America/Bogota";
const HORA_LOCAL = 19 * 60;
const horaLocal = (d: Date): string => new Intl.DateTimeFormat("en-GB", { timeZone: ZONA_NUEVA, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
const diaLocal = (d: Date): string => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_NUEVA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

test("K1: una escuela recién nacida, un administrador y SOLO la API de administración: una sucursal y una vertical nuevas operan de punta a punta", { timeout: 300_000 }, async () => {
  const db = conAlcance(prisma, orgId);
  assert.equal(await db.vertical.count({}), 0, "parte de cero: ninguna vertical");
  assert.equal(await db.sucursal.count({}), 0, "ninguna sucursal");
  assert.equal(await db.canal_whatsapp.count({}), 0, "ningún canal");

  // ── Administración ────────────────────────────────────────────────────────────────────────────────
  const vertical = await admin.post<{ id: string; slug: string } & Err>("/api/verticales", { nombre: "Disciplina Nueva", etiqueta_progresion: "Grado", usa_progresion: true, cotizador_whatsapp_activo: true, clase_muestra_whatsapp_activo: true });
  assert.equal(vertical.estado, 201, motivo(vertical));
  const sucursal = await admin.post<{ id: string } & Err>("/api/sucursales", { nombre: "Sede Nueva", direccion: "Calle de prueba 1", zona_horaria: ZONA_NUEVA });
  assert.equal(sucursal.estado, 201, motivo(sucursal));
  assert.equal((await admin.put(`/api/sucursales/${sucursal.cuerpo.id}/verticales/${vertical.cuerpo.id}`, {})).estado, 200);

  const salon = await admin.post<{ id: string } & Err>("/api/salones", { sucursal_id: sucursal.cuerpo.id, nombre: "Salón principal", capacidad: 30 });
  assert.equal(salon.estado, 201, motivo(salon));

  // Usuarios por rol (el administrador los da de alta; el maestro nace con su instructor).
  const clave = "una-contrasena-larga-y-propia-77";
  const nuevo = async (rol: "asesor" | "maestro" | "recepcion"): Promise<ClienteApi> => {
    const correo = `${rol}-${randomBytes(3).toString("hex")}@fuego.test`;
    const alta = await admin.post<{ id: string } & Err>("/api/usuarios", { correo, nombre: `Persona ${rol}`, rol, contrasena: clave, ...(rol === "maestro" ? {} : { sucursales: [sucursal.cuerpo.id] }) });
    assert.equal(alta.estado, 201, motivo(alta));
    const c = api.cliente();
    assert.equal((await c.login(SLUG, correo, clave)).estado, 201);
    return c;
  };
  const asesor = await nuevo("asesor");
  const maestro = await nuevo("maestro");
  const recepcion = await nuevo("recepcion");

  const instructores = await admin.get<{ datos: { id: string; nombre: string }[] }>("/api/instructores");
  const instructor = instructores.cuerpo.datos.find((i) => i.nombre === "Persona maestro")!;
  assert.ok(instructor, "el maestro nació con su instructor");
  assert.equal((await admin.patch(`/api/instructores/${instructor.id}`, { telefono: "+52 55 5000 0123", sucursales: [sucursal.cuerpo.id] })).estado, 200);

  const programa = await admin.post<{ id: string } & Err>("/api/programas", { vertical_id: vertical.cuerpo.id, sucursal_id: sucursal.cuerpo.id, nombre: "Pequeños", edad_min: 5, edad_max: 9, descripcion_publica: "Clases de prueba para pequeños." });
  assert.equal(programa.estado, 201, motivo(programa));
  assert.equal((await admin.post("/api/precios", { programa_id: programa.cuerpo.id, costo_inscripcion: "300.00", costo_mensualidad: "800.00", vigencia_desde: "2020-01-01" })).estado, 201);
  const grupo = await admin.post<{ id: string } & Err>("/api/grupos", {
    programa_id: programa.cuerpo.id,
    nombre: "Tarde de lunes y miércoles",
    cupo_maximo: 12,
    salon_id: salon.cuerpo.id,
    instructor_id: instructor.id,
    horarios: [{ dia_semana: 1, hora_inicio_min: HORA_LOCAL, hora_fin_min: HORA_LOCAL + 60 }, { dia_semana: 3, hora_inicio_min: HORA_LOCAL, hora_fin_min: HORA_LOCAL + 60 }],
  });
  assert.equal(grupo.estado, 201, motivo(grupo));

  // Un producto y dos promociones: inscripción gratis (inmediata) y un obsequio que se libera al pagar la primera mensualidad.
  const producto = await admin.post<{ id: string } & Err>("/api/productos", { vertical_id: vertical.cuerpo.id, nombre: "Uniforme de prueba", talla: "10", precio: "350.00", stock: 5 });
  assert.equal(producto.estado, 201, motivo(producto));
  const promoInscripcion = await admin.post<{ id: string } & Err>("/api/promociones", {
    nombre: "Inscripción gratis de prueba",
    codigo: "FUEGO-INSCRIPCION",
    vigencia_desde: "2026-01-01",
    condicion_tipo: "sin_condicion",
    acumulable: true,
    prioridad: 10,
    programas: [programa.cuerpo.id],
    beneficios: [{ tipo: "descuento_inscripcion", modo: "total", momento_disparo: "inmediato", descripcion: "Inscripción gratis" }],
  });
  assert.equal(promoInscripcion.estado, 201, motivo(promoInscripcion));
  const promoObsequio = await admin.post<{ id: string } & Err>("/api/promociones", {
    nombre: "Obsequio al pagar la primera mensualidad",
    codigo: "FUEGO-OBSEQUIO",
    vigencia_desde: "2026-01-01",
    condicion_tipo: "al_pagar_primera_mensualidad",
    acumulable: true,
    prioridad: 5,
    programas: [programa.cuerpo.id],
    beneficios: [{ tipo: "producto_gratis", modo: "total", momento_disparo: "al_cumplir_condicion", descripcion: "Uniforme", producto_id: producto.cuerpo.id }],
  });
  assert.equal(promoObsequio.estado, 201, motivo(promoObsequio));

  // Documentos legales (sin aviso de privacidad vigente la landing no recoge datos; sin reglamento no se inscribe).
  const docs: Record<string, { id: string; version: number }> = {};
  for (const tipo of ["aviso_privacidad", "reglamento", "uso_imagen"] as const) {
    const d = await admin.post<{ id: string; version: number } & Err>("/api/documentos-legales", { tipo, vertical_id: vertical.cuerpo.id, titulo: `Documento ${tipo}`, texto: `Texto de prueba del documento ${tipo}.` });
    assert.equal(d.estado, 201, motivo(d));
    docs[tipo] = d.cuerpo;
  }

  // El canal de WhatsApp de pruebas y su bandeja (los ids de Chatwoot son de mentira: el transporte es el falso).
  const numero = `whatsapp:+1555${randomInt(1_000_000, 9_999_999)}`;
  const canal = await admin.post<{ id: string } & Err>("/api/canales-whatsapp", { vertical_id: vertical.cuerpo.id, sucursal_id: null, numero_whatsapp: numero, nombre_publico: "Canal de pruebas" });
  assert.equal(canal.estado, 201, motivo(canal));
  const cuentaChatwoot = randomInt(1_000_000, 2_000_000_000);
  const bandejaChatwoot = randomInt(1_000_000, 2_000_000_000);
  const bandeja = await admin.post<{ id: string } & Err>("/api/bandejas-chatwoot", { canal_whatsapp_id: canal.cuerpo.id, nombre: "Bandeja de pruebas", chatwoot_account_id: cuentaChatwoot, chatwoot_inbox_id: bandejaChatwoot });
  assert.equal(bandeja.estado, 201, motivo(bandeja));

  // ── La landing pública de la vertical nueva: un lead ─────────────────────────────────────────────
  const campana = await admin.post<{ id: string } & Err>("/api/campanas", { nombre: "Campaña de la prueba de fuego", origen: "presencial", vertical_id: vertical.cuerpo.id, sucursal_id: sucursal.cuerpo.id });
  assert.equal(campana.estado, 201, motivo(campana));
  const qr = await asesor.get<{ url: string; codigo: string } & Err>(`/api/campanas/${campana.cuerpo.id}/qr?sucursal_id=${sucursal.cuerpo.id}&formato=url`);
  assert.equal(qr.estado, 200, motivo(qr));
  const rutaLanding = new URL(qr.cuerpo.url).pathname + new URL(qr.cuerpo.url).search;
  const pagina = await fetch(`${api.base}${rutaLanding}`);
  const html = await pagina.text();
  assert.equal(pagina.status, 200);
  assert.match(html, /Disciplina Nueva/);
  assert.ok(html.includes(sucursal.cuerpo.id) || html.includes("Sede Nueva"), "la landing ofrece la sucursal nueva");
  const campos = new URLSearchParams();
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const nombre = /name="([^"]*)"/.exec(m[0])?.[1];
    if (nombre) campos.set(nombre, (/value="([^"]*)"/.exec(m[0])?.[1] ?? "").replaceAll("&amp;", "&"));
  }
  for (const [k, v] of Object.entries({ nombre_alumno: "Sofía Prueba", edad: "7", sucursal_id: sucursal.cuerpo.id, telefono: "55 1234 5678", nombre_contacto: "Laura Prueba", acepta_aviso: "on", documento_id: docs["aviso_privacidad"]!.id, version: String(docs["aviso_privacidad"]!.version) })) campos.set(k, v);
  const envio = await fetch(`${api.base}${rutaLanding}`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "prueba-de-fuego" }, body: campos.toString() });
  assert.ok([200, 303].includes(envio.status), `la landing responde ${envio.status}`);
  await envio.arrayBuffer();
  const leadLanding = await db.lead.findFirstOrThrow({ where: { telefono: "+525512345678" }, include: { campana: true, prospectos: true } });
  assert.equal(leadLanding.vertical_interes_id, vertical.cuerpo.id);
  assert.equal(leadLanding.sucursal_interes_id, sucursal.cuerpo.id);
  assert.equal(leadLanding.campana?.nombre, "Campaña de la prueba de fuego", "atribuido por el código del QR");
  assert.equal(leadLanding.prospectos[0]?.nombre, "Sofía Prueba");

  // ── Un lead por WhatsApp: el bot, la cotización y la clase muestra ───────────────────────────────
  const conversacion = randomInt(100_000, 900_000);
  const telefono = "+5215598765432";
  const hablar = async (texto: string): Promise<string> => {
    const antes = transporte.envios.length;
    const cuerpo = JSON.stringify({ ...payloadMensajeEntrante({ id: siguienteMensaje++, cuenta: cuentaChatwoot, bandeja: bandejaChatwoot, conversacion, telefono, nombre: "Rosa Prueba", content: texto }), created_at: reloj.ahora.toISOString() });
    const ts = String(Math.floor(reloj.ahora.getTime() / 1000));
    const r = await fetch(`${api.base}/webhooks/chatwoot`, { method: "POST", headers: { "content-type": "application/json", "x-chatwoot-timestamp": ts, "x-chatwoot-signature": firmarCuerpoChatwoot(SECRETO, ts, Buffer.from(cuerpo)) }, body: cuerpo });
    assert.equal(r.status, 200);
    await r.arrayBuffer();
    // Todo lo que el bot dijo en esta vuelta (puede ser más de un mensaje: saludo y pregunta).
    const nuevos = transporte.envios.slice(antes).filter((e) => e.destino.chatwootConversacionId === conversacion && e.tipo === "mensaje");
    return nuevos.map((e) => e.texto ?? "").join("\n");
  };
  let respuesta = await hablar("Hola");
  assert.match(respuesta, /Disciplina Nueva/, "el saludo lleva el nombre de la vertical nueva, salido de la tabla");
  const dicho: string[] = [];
  for (let turno = 0; turno < 10; turno++) {
    const conv = await db.conversacion.findFirstOrThrow({ where: { chatwoot_conversacion_id: conversacion }, select: { paso_captacion: true, estado: true } });
    if (conv.paso_captacion === "completo" || conv.estado === "en_atencion_humana") break;
    let texto: string;
    if (/c[oó]mo se llama/i.test(respuesta)) texto = "Mateo";
    else if (/qu[eé] edad/i.test(respuesta)) texto = "7";
    else if (/clase muestra en/i.test(respuesta)) texto = /^\s*2\./m.test(respuesta) ? "2" : "1"; // la segunda fecha: queda tiempo por delante
    else texto = "1";
    dicho.push(respuesta);
    respuesta = await hablar(texto);
  }
  const todoElBot = [...dicho, respuesta].join("\n");
  assert.match(todoElBot, /Sede Nueva/);
  assert.match(todoElBot, /Pequeños/);
  assert.match(todoElBot, /Tarde de lunes y miércoles/);
  assert.match(todoElBot, /\$800\.00/, "la mensualidad sale de la tabla de precios que el administrador acaba de dar de alta");
  assert.match(todoElBot, /Inscripción gratis de prueba|Inscripción gratis/, "la promoción nueva aparece en la cotización");
  const leadWa = await db.lead.findFirstOrThrow({ where: { telefono: "+525598765432" }, include: { prospectos: true } });
  assert.equal(leadWa.vertical_interes_id, vertical.cuerpo.id);
  const prospecto = leadWa.prospectos[0]!;
  const cot = await asesor.get<{ datos: { estatus: string }[] }>(`/api/leads/${leadWa.id}/cotizaciones`);
  assert.equal(cot.cuerpo.datos[0]?.estatus, "vigente");
  const clase = await db.clase_muestra.findFirstOrThrow({ where: { lead_id: leadWa.id, estatus: "agendada" } });
  assert.equal(clase.agendada_por, "bot");
  assert.equal(clase.grupo_id, grupo.cuerpo.id);
  // EK-24: la sesión que el bot ofreció es a las 19:00 de la zona de la sucursal (00:00 UTC del día siguiente), lunes o miércoles allá.
  assert.equal(horaLocal(clase.fecha_hora), "19:00");
  assert.equal(clase.fecha_hora.getUTCHours(), 0, "en UTC ya es el día siguiente");
  assert.ok([1, 3].includes(new Date(`${diaLocal(clase.fecha_hora)}T12:00:00Z`).getUTCDay()), "lunes o miércoles según el calendario de la sucursal");
  assert.equal((await db.conversacion.findFirstOrThrow({ where: { chatwoot_conversacion_id: conversacion } })).estado, "en_atencion_humana", "la conversación pasa a una persona");

  // ── El maestro y su aviso ────────────────────────────────────────────────────────────────────────
  const hoy = await maestro.get<{ datos: { id: string }[] }>("/api/maestro/clases-muestra");
  assert.ok(hoy.cuerpo.datos.some((c) => c.id === clase.id), "el maestro ve la clase de su grupo nuevo");
  const avisos = await maestro.get<{ datos: { tipo: string }[] }>("/api/maestro/avisos");
  assert.ok(avisos.cuerpo.datos.some((a) => a.tipo === "agendada"), "y su aviso");
  assert.ok(JSON.stringify(avisos.cuerpo.datos).includes("19:00"), "el aviso al maestro dice la hora de la sucursal, no la de UTC");

  // ── La clase: registro del maestro, asistencia, aceptaciones, listo para cerrar ──────────────────
  reloj.ahora = new Date(clase.fecha_hora.getTime() + 30 * 60_000);
  const url = `/api/clases-muestra/${clase.id}/registro`;
  const registro = await maestro.patch(url, {
    alumno: { nombre: "Mateo", apellidos: "Prueba Ruiz", fecha_nacimiento: "2019-03-15", sexo: "masculino", escuela: "Primaria de prueba", turno_escolar: "matutino", talla_uniforme: "10" },
    tutores: [{ nombre: "Rosa", apellidos: "Prueba", parentesco: "madre", telefono, correo: "rosa@fuego.test", es_responsable_pago: true, lo_lleva: true }],
    antecedentes: { practico_antes: false, motivo_clase: "disciplina" },
    salud: { alergias: "Ninguna (prueba)", condiciones_medicas: "Ninguna (prueba)", medicamentos: "Ninguno (prueba)", contacto_emergencia: { nombre: "Abuela de prueba", telefono: "+525500001111", parentesco: "abuela" }, autorizacion_atencion_medica: true },
    observacion: { grupo_recomendado_id: grupo.cuerpo.id },
  });
  assert.equal(registro.estado, 200, motivo(registro));
  assert.equal((await maestro.post(`${url}/completar`, {})).estado, 200);
  assert.equal((await maestro.patch(`/api/clases-muestra/${clase.id}/asistencia`, { estatus: "asistio" })).estado, 200);
  for (const tipo of ["reglamento", "uso_imagen"] as const) {
    const a = await asesor.post(`${url}/aceptaciones`, { documento_id: docs[tipo]!.id, version: docs[tipo]!.version, resultado: "aceptada", aceptante: { nombre: "Rosa Prueba", parentesco: "madre" }, canal: "presencial", evidencia: { tipo } });
    assert.ok([200, 201].includes(a.estado), motivo(a));
  }
  assert.ok([200, 201].includes((await asesor.post(`/api/clases-muestra/${clase.id}/listo-para-cerrar`, {})).estado));

  // ── Conversión e inscripción ─────────────────────────────────────────────────────────────────────
  reloj.ahora = new Date(clase.fecha_hora.getTime() + 2 * 3_600_000);
  const previa = await asesor.get<{ listo: boolean; faltantes: unknown[] }>(`/api/leads/${leadWa.id}/conversion`);
  assert.deepEqual(previa.cuerpo.faltantes, [], "nada que recapturar: todo viene del bot y del maestro");
  const conversion = await asesor.post<{ tutor_id: string; alumnos: { alumno_id: string; inscripcion: { id: string } }[] } & Err>(`/api/leads/${leadWa.id}/convertir`, { tutor: { parentesco: "madre" }, prospectos: [{ prospecto_id: prospecto.id, alumno: {}, inscripcion: { grupo_id: grupo.cuerpo.id } }] });
  assert.equal(conversion.estado, 201, motivo(conversion));
  const { tutor_id: tutorId, alumnos } = conversion.cuerpo;
  const inscripcion = await asesor.get<{ precio_inscripcion_aplicado: string; precio_mensualidad_aplicado: string; descuento_inscripcion_aplicado: string }>(`/api/inscripciones/${alumnos[0]!.inscripcion.id}`);
  assert.deepEqual([inscripcion.cuerpo.precio_inscripcion_aplicado, inscripcion.cuerpo.precio_mensualidad_aplicado, inscripcion.cuerpo.descuento_inscripcion_aplicado], ["300.00", "800.00", "300.00"], "precio congelado y promoción aplicada");

  // ── EK-24: el pase de lista de la sucursal nueva y el rango por día de los reportes usan SU zona ────
  const sesionLocal = diaLocal(clase.fecha_hora);
  const pase = await maestro.pedir<{ creadas?: number; error?: unknown }>("PUT", `/api/grupos/${grupo.cuerpo.id}/pase`, { fecha: sesionLocal, asistencias: [{ inscripcion_id: alumnos[0]!.inscripcion.id, estatus: "presente" }] });
  assert.equal(pase.estado, 200, `el pase del día local de la sesión (${sesionLocal}): ${JSON.stringify(pase.cuerpo)}`);
  const reporte = await admin.get<{ resumen?: { agendadas?: number }; total?: { agendadas?: number } }>(`/api/reportes/clases-muestra?desde=${sesionLocal}&hasta=${sesionLocal}&sucursal_id=${sucursal.cuerpo.id}`);
  assert.equal(reporte.estado, 200, motivo(reporte));
  assert.ok(/"agendadas":[1-9]/.test(JSON.stringify(reporte.cuerpo)), `el reporte del día LOCAL de la sucursal cuenta la clase (a las 19:00 locales): ${JSON.stringify(reporte.cuerpo).slice(0, 300)}`);

  // ── Cargos, pago, beneficio y expediente ─────────────────────────────────────────────────────────
  const cargos = (await recepcion.get<{ datos: { id: string; concepto: string; monto_final: string; saldo: string }[] }>(`/api/cargos?tutor_id=${tutorId}&limite=50`)).cuerpo.datos;
  assert.deepEqual(cargos.map((c) => [c.concepto, c.monto_final]).sort(), [["inscripcion", "0.00"], ["mensualidad", "800.00"]]);
  const pago = await recepcion.post<Err>("/api/pagos", { tutor_id: tutorId, monto: "800.00", metodo: "efectivo", clave_idempotencia: "fuego-pago-0001" });
  assert.equal(pago.estado, 201, motivo(pago));
  const porEntregar = await recepcion.get<{ datos: { id: string }[] }>("/api/beneficios/por-entregar");
  assert.equal(porEntregar.cuerpo.datos.length, 1, "pagar la primera mensualidad liberó el obsequio");
  assert.ok([200, 201].includes((await recepcion.post(`/api/beneficios/${porEntregar.cuerpo.datos[0]!.id}/entregar`, { producto_id: producto.cuerpo.id, cantidad: 1 })).estado));
  const expediente = await admin.get<{ economico?: { saldo_total?: string; saldo?: string }; [k: string]: unknown }>(`/api/alumnos/${alumnos[0]!.alumno_id}/expediente`);
  assert.equal(expediente.estado, 200, motivo(expediente));
  assert.ok(JSON.stringify(expediente.cuerpo).includes("Disciplina Nueva"), "el expediente habla de la vertical nueva");
  const cuenta = await recepcion.get<{ saldo?: string; resumen?: { saldo?: string } }>(`/api/tutores/${tutorId}/estado-cuenta`);
  assert.equal(cuenta.cuerpo.resumen?.saldo ?? cuenta.cuerpo.saldo, "0.00");
  assert.equal((await cuadratura(db)).ok, true, "el dinero cuadra");

  // ── Y la vertical nueva es tan ciudadana como cualquiera: aparece en los reportes y en el cotizador ─
  const ejecutivo = await admin.get(`/api/reportes/ejecutivo`);
  assert.equal(ejecutivo.estado, 200, motivo(ejecutivo));
  assert.ok(JSON.stringify(ejecutivo.cuerpo).includes("Disciplina Nueva"), "el reporte ejecutivo ya habla de la vertical nueva");

  // ── Lo que NO se pudo por la API (FALTANTES): se comprueba, no se supone ──────────────────────────
  assert.equal(FALTANTES.length, 1);
  const automatizaciones = await admin.get<{ datos: unknown[] }>("/api/automatizaciones");
  assert.equal(automatizaciones.estado, 200, motivo(automatizaciones));
  assert.equal(automatizaciones.cuerpo.datos.length, 0, "una escuela recién nacida no trae automatizaciones y la API no tiene cómo crearlas (se reporta como salvedad)");
  assert.equal((await admin.post("/api/automatizaciones", { nombre: "x" })).estado, 404, "no existe el alta de automatizaciones por API");
});

test("K1: nada de lo anterior tocó código ni seeds de una vertical: check:generico está en verde y esta prueba no nombra ninguna vertical", () => {
  const r = spawnSync(process.execPath, ["scripts/check-generico.ts"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Cero términos de vertical o sucursal/);
});
