// Demo guiada (K8): recorre y NARRA, en español, el camino completo de una familia, del anuncio al primer pago, contra servicios simulados (transporte de
// mensajes falso: ni Twilio ni Chatwoot reales) y sobre una base PROPIA que se recrea en cada corrida.
//
// Es reproducible: el reloj es inyectado (un lunes fijo), los datos de la familia son fijos y todo lo que se muestra sale de las tablas (nombres de la
// escuela, sucursal, programa, grupo, precios y promociones del seed): el código no nombra ninguna vertical ni sucursal (invariante 2). Cada paso pasa por el
// mismo camino que en producción: los webhooks firmados de Chatwoot, la landing, la API con sesión y permisos, el barrido (`correrCiclo`) con el reloj
// adelantado, y `MessagingProvider` para todo mensaje saliente.
//
// Uso: `npm run demo:guiada` (ver scripts/demo-guiada.ts).

/* eslint-disable @typescript-eslint/no-explicit-any -- el relato lee, campo por campo, las respuestas JSON de la propia API; tiparlas todas sería repetir los esquemas del servidor */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";
import pg from "pg";
import { crearApp } from "../../src/http/app.ts";
import { crearPrisma, type PrismaRaiz } from "../../src/datos/prisma.ts";
import { conAlcance, type BaseDatos } from "../../src/datos/alcance.ts";
import { InscripcionesActivas } from "../../src/catalogo/cupo.ts";
import { procesarEntrante } from "../../src/captacion/entrante.ts";
import { correrCiclo } from "../../src/ciclo.ts";
import { cuadratura } from "../../src/finanzas/cuadratura.ts";
import { ProveedorEconomicoDeFinanzas } from "../../src/finanzas/estado-cuenta.ts";
import { ProveedorProductosDeFinanzas } from "../../src/finanzas/productos.ts";
import { AtribucionDesdeChatwoot, EstadosEntregaChatwoot, MessagingProvider, TransporteFalso, registrarEstadoEntrega } from "../../src/mensajeria/index.ts";
import { payloadMensajeEntrante } from "../../src/mensajeria/chatwoot/fixtures.ts";
import { firmarCuerpoChatwoot } from "../../src/mensajeria/chatwoot/webhook.ts";
import { crearCifrador } from "../../src/sensibles/cifrado.ts";
import { registrarTomaDeConversacion } from "../../src/captacion/toma.ts";
import { crearManejadorDeInesperados } from "../../src/webhooks/inesperado.ts";
import { listarOrganizaciones } from "../../src/datos/sistema.ts";
import { escucharServidor } from "./servidor-local.ts";

export const SECRETO_WEBHOOK = "secreto-de-la-demo-guiada-0001";
const CLAVE_DEMO = "Demo-local-2026!";
/** Lunes 2 de noviembre de 2026, 12:00 en la Ciudad de México. Las clases de la demo caen en lunes y miércoles. */
export const INICIO = new Date("2026-11-02T18:00:00Z");
const SEEDS = ["demo.sql", "catalogo.sql", "catalogo-completo.sql", "clase-muestra.sql", "seguimiento.sql", "progresion.sql"];

export interface OpcionesDeDemoGuiada {
  /** URL del servidor de Postgres (la base se cambia). */
  urlServidor: string;
  /** Nombre de la base propia de la demo. Tiene que contener «demo_guiada»: nunca toca otra. */
  base: string;
  /** Puerto del servidor HTTP (0 = uno libre). */
  puerto?: number;
  /** Deja el servidor encendido al terminar, para recorrer la interfaz con las ligas del resumen. */
  servir?: boolean;
  narrar: (linea: string) => void;
}

export interface ResultadoDeDemoGuiada {
  cuadra: boolean;
  /** Las ligas locales del resumen (vacías si no se pudo servir). */
  ligas: string[];
  servidor: Server | null;
  cerrar: () => Promise<void>;
}

// ── Utilidades ─────────────────────────────────────────────────────────────────────────────────────────────

const dinero = (t: string): string => `$${Number(t).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Una fecha con la hora de la Ciudad de México: «lunes 9 de noviembre, 16:00». */
function cuando(d: Date, zona = "America/Mexico_City"): string {
  const t = new Intl.DateTimeFormat("es-MX", { timeZone: zona, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return t.replace(",", "");
}

interface Respuesta<T = any> {
  estado: number;
  cuerpo: T;
}

/** Un cliente HTTP mínimo con cookie de sesión (como un navegador). */
class Cliente {
  private cookie = "";
  private readonly base: string;
  constructor(base: string) {
    this.base = base;
  }

  async pedir<T = any>(metodo: string, ruta: string, cuerpo?: unknown): Promise<Respuesta<T>> {
    const cabeceras: Record<string, string> = { "x-requested-with": "demo-guiada" };
    if (this.cookie) cabeceras["cookie"] = this.cookie;
    if (cuerpo !== undefined) cabeceras["content-type"] = "application/json";
    const r = await fetch(`${this.base}${ruta}`, { method: metodo, headers: cabeceras, ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}) });
    const c = r.headers.getSetCookie()[0];
    if (c) this.cookie = c.split(";")[0]!;
    const texto = await r.text();
    let json: unknown = texto;
    try {
      json = texto === "" ? null : JSON.parse(texto);
    } catch {
      // no era JSON
    }
    return { estado: r.status, cuerpo: json as T };
  }

  get = <T = any>(ruta: string) => this.pedir<T>("GET", ruta);
  post = <T = any>(ruta: string, cuerpo?: unknown) => this.pedir<T>("POST", ruta, cuerpo ?? {});
  patch = <T = any>(ruta: string, cuerpo: unknown) => this.pedir<T>("PATCH", ruta, cuerpo);
}

function exigir<T>(r: Respuesta<T>, esperados: number[], que: string): T {
  if (!esperados.includes(r.estado)) throw new Error(`${que}: respondió ${r.estado} ${JSON.stringify(r.cuerpo).slice(0, 400)}`);
  return r.cuerpo;
}

// ── La base propia ──────────────────────────────────────────────────────────────────────────────────────────

async function prepararBase(urlServidor: string, base: string, narrar: (l: string) => void): Promise<string> {
  if (!/demo_guiada/.test(base) || !/^[a-z_][a-z0-9_]*$/.test(base)) throw new Error(`La base de la demo guiada debe llamarse con «demo_guiada» (recibí «${base}»): nunca toca otra.`);
  const u = new URL(urlServidor);
  u.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: u.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${base}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${base}"`);
  await admin.end();
  u.pathname = `/${base}`;
  const url = u.toString();
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: ["ignore", "ignore", "inherit"] });
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  for (const s of SEEDS) await c.query(readFileSync(new URL(`../../prisma/seed/${s}`, import.meta.url), "utf8"));
  // Las bandejas de Chatwoot no existen en la demo simulada: se les da una cuenta y una bandeja de mentira para que los webhooks las reconozcan.
  await c.query("UPDATE bandeja_chatwoot SET chatwoot_account_id = 1, chatwoot_inbox_id = 100 + (SELECT count(*) FROM bandeja_chatwoot b2 WHERE b2.creado_en < bandeja_chatwoot.creado_en OR (b2.creado_en = bandeja_chatwoot.creado_en AND b2.id < bandeja_chatwoot.id))");
  await c.end();
  narrar(`Base propia «${base}» recreada: migraciones y datos de ejemplo del catálogo de la escuela.`);
  return url;
}

// ── Lo que la demo recorre ──────────────────────────────────────────────────────────────────────────────────

export async function ejecutarDemoGuiada(o: OpcionesDeDemoGuiada): Promise<ResultadoDeDemoGuiada> {
  const { narrar } = o;
  const url = await prepararBase(o.urlServidor, o.base, narrar);
  const prisma: PrismaRaiz = crearPrisma(url, 10);
  const transporte = new TransporteFalso();
  const reloj = { ahora: new Date(INICIO) };
  const mensajeria = new MessagingProvider({ transporte, reloj: () => reloj.ahora });
  const atribucion = new AtribucionDesdeChatwoot();
  const fuenteOcupacion = new InscripcionesActivas();
  const cifrador = crearCifrador(Buffer.alloc(32, 7)); // clave de la demo (solo esta base)

  const app = crearApp({
    pingDb: async () => {},
    secretoWebhookChatwoot: SECRETO_WEBHOOK,
    reloj: () => reloj.ahora,
    inesperados: crearManejadorDeInesperados(prisma),
    procesarEntrante: (e) => procesarEntrante({ prisma, mensajeria, atribucion, fuenteOcupacion, reloj: () => reloj.ahora }, e),
    registrarTomaDeConversacion: (e) => registrarTomaDeConversacion({ prisma }, e),
    estadosEntrega: new EstadosEntregaChatwoot(),
    registrarEstadoEntrega: (c) => registrarEstadoEntrega({ prisma }, c),
    landing: { prisma },
    web: { directorio: "web/dist" },
    api: {
      prisma,
      sensibles: { cifrador },
      fuenteOcupacion,
      reloj: () => reloj.ahora,
      sesion: { duracionMs: 400 * 86_400_000, inactividadMs: 400 * 86_400_000 },
      expediente: { economico: new ProveedorEconomicoDeFinanzas(), productos: new ProveedorProductosDeFinanzas() },
      cookieSegura: false,
      origenesPermitidos: [],
    },
  });
  const { server, puerto } = await escucharServidor(app, o.puerto ?? 0);
  const origen = `http://127.0.0.1:${puerto}`;
  const cerrar = async (): Promise<void> => {
    await new Promise<void>((r) => server.close(() => r()));
    await (prisma as unknown as { $disconnect(): Promise<void> }).$disconnect();
  };

  try {
    const resultado = await recorrer({ ...o, prisma, mensajeria, origen, transporte, reloj, narrar });
    if (!o.servir) await cerrar();
    return { ...resultado, servidor: o.servir ? server : null, cerrar };
  } catch (e) {
    await cerrar();
    throw e;
  }
}

interface Contexto extends OpcionesDeDemoGuiada {
  prisma: PrismaRaiz;
  mensajeria: MessagingProvider;
  origen: string;
  transporte: TransporteFalso;
  reloj: { ahora: Date };
}

async function recorrer(c: Contexto): Promise<Omit<ResultadoDeDemoGuiada, "servidor" | "cerrar">> {
  const { prisma, mensajeria, narrar, transporte, reloj, origen } = c;
  const organizaciones = await listarOrganizaciones(prisma);
  const organizacion = organizaciones[0];
  if (!organizacion) throw new Error("La base de la demo no tiene organización");
  const db: BaseDatos = conAlcance(prisma, organizacion.id);
  const org = await db.organizacion.findFirstOrThrow({ select: { id: true, nombre: true, slug: true } });
  let n = -1;
  const paso = (titulo: string): void => {
    n++;
    narrar("");
    narrar(`Paso ${n}. ${titulo}`);
  };
  const dato = (t: string): void => narrar(`  • ${t}`);

  // Con qué trabaja la demo: se descubre en las tablas (un maestro con su grupo), no está escrito en el código.
  const maestroUsuario = await db.usuario.findFirstOrThrow({ where: { rol: "maestro", instructores: { some: {} } }, orderBy: { correo: "asc" } });
  const instructor = await db.instructor.findFirstOrThrow({ where: { usuario_id: maestroUsuario.id } });
  const grupo = await db.grupo.findFirstOrThrow({
    where: { instructor_id: instructor.id, activo: true, horarios: { some: { dia_semana: 1 } } },
    orderBy: [{ nombre: "asc" }, { id: "asc" }],
    include: { programa: { include: { sucursal: true, vertical: true } }, horarios: true },
  });
  const programa = grupo.programa;
  const sucursal = programa.sucursal;
  const vertical = programa.vertical;
  const zona = sucursal.zona_horaria;
  const edad = programa.edad_min + 1;
  const bandeja = await db.bandeja_chatwoot.findFirstOrThrow({ where: { canal_whatsapp: { vertical_id: vertical.id } }, orderBy: [{ creado_en: "asc" }, { id: "asc" }] });

  const admin = new Cliente(origen);
  const asesor = new Cliente(origen);
  const maestro = new Cliente(origen);
  const recepcion = new Cliente(origen);
  for (const [cliente, correo] of [[admin, "admin@demo.test"], [asesor, "asesor@demo.test"], [maestro, "maestro@demo.test"], [recepcion, "recepcion@demo.test"]] as const) {
    exigir(await cliente.post("/api/sesion", { organizacion: org.slug, correo, contrasena: CLAVE_DEMO }), [201], `inicio de sesión de ${correo}`);
  }

  narrar("══════════════════════════════════════════════════════════════════════════════");
  narrar(` Demo guiada: del anuncio al primer pago — ${org.nombre}`);
  narrar("══════════════════════════════════════════════════════════════════════════════");
  narrar(`Reloj simulado: ${cuando(reloj.ahora, zona)} de 2026 (hora de ${sucursal.nombre}). Los mensajes no salen a ningún lado: el transporte es falso.`);
  narrar(`Escuela: ${org.nombre} · vertical «${vertical.nombre}» · sucursal «${sucursal.nombre}» · programa «${programa.nombre}» (${programa.edad_min} a ${programa.edad_max} años) · grupo «${grupo.nombre}».`);

  // Lo que se envía por el transporte falso a una conversación.
  const CONVERSACION = 880_001;
  const enviadosA = (conversacion: number) => transporte.envios.filter((e) => e.destino.chatwootConversacionId === conversacion);
  const ultimoMensaje = (conversacion: number): string => [...enviadosA(conversacion)].reverse().find((e) => e.tipo === "mensaje")?.texto ?? "";
  let idMensaje = 770_000;
  const hablar = async (conversacion: number, telefono: string, nombre: string, texto: string, extra: Record<string, unknown> = {}): Promise<string> => {
    const cuerpo = JSON.stringify({ ...payloadMensajeEntrante({ id: ++idMensaje, cuenta: bandeja.chatwoot_account_id ?? 1, bandeja: bandeja.chatwoot_inbox_id ?? 100, conversacion, telefono, nombre, content: texto, ...extra }), created_at: reloj.ahora.toISOString() });
    const ts = String(Math.floor(reloj.ahora.getTime() / 1000));
    const r = await fetch(`${origen}/webhooks/chatwoot`, { method: "POST", headers: { "content-type": "application/json", "x-chatwoot-timestamp": ts, "x-chatwoot-signature": firmarCuerpoChatwoot(SECRETO_WEBHOOK, ts, Buffer.from(cuerpo)) }, body: cuerpo });
    if (r.status !== 200) throw new Error(`El webhook respondió ${r.status}`);
    await r.arrayBuffer();
    return ultimoMensaje(conversacion);
  };
  /** El número de la opción de una lista numerada («2. Nombre …») que menciona el texto buscado; si no hay, la primera. */
  const opcion = (mensaje: string, buscado: string | null): string => {
    const lineas = [...mensaje.matchAll(/^\s*(\d+)\.\s+(.*)$/gm)];
    const elegida = buscado ? lineas.find((l) => l[2]!.toLowerCase().includes(buscado.toLowerCase())) : undefined;
    return (elegida ?? lineas[0])?.[1] ?? "1";
  };

  // ── 0. Preparativos ───────────────────────────────────────────────────────────────────────────────
  paso("Preparativos de la escuela");
  exigir(await admin.patch(`/api/instructores/${instructor.id}`, { telefono: "+52 55 5000 0099" }), [200], "teléfono del maestro");
  dato(`El administrador registra el WhatsApp de ${instructor.nombre} (maestro del grupo «${grupo.nombre}») para que reciba el aviso de cada clase muestra.`);

  // ── 1. El anuncio ─────────────────────────────────────────────────────────────────────────────────
  paso("Un anuncio simulado de Click-to-WhatsApp y una familia que escribe");
  const anuncioId = "120330000000000001";
  const campana = exigir(await admin.post("/api/campanas", { nombre: "Demo guiada: anuncio simulado", origen: "facebook", vertical_id: vertical.id, sucursal_id: sucursal.id, anuncio_id: anuncioId, fecha_inicio: "2026-10-01" }), [201], "alta de la campaña");
  dato(`El administrador dio de alta la campaña «${campana.nombre}» (fuente ${campana.origen}); el anuncio es el ${anuncioId}.`);
  const telefono = "+5215512340001";
  const referral = { source_id: anuncioId, source_type: "ad", source_url: "https://fb.me/anuncio-simulado", headline: "Clase muestra gratis esta semana", ctwa_clid: "AFnDemoGuiadaClid0001" };
  let respuesta = await hablar(CONVERSACION, telefono, "Rosa Mena", "Hola, vi su anuncio", { referral });
  dato(`Rosa Mena escribe «Hola, vi su anuncio» desde el anuncio «${referral.headline}».`);
  const lead = await db.lead.findFirstOrThrow({ where: { telefono: "+525512340001" }, include: { campana: true, etapa: true } });
  dato(`El sistema creó el lead y lo atribuyó a la campaña «${lead.campana?.nombre ?? "(sin campaña)"}»; etapa «${lead.etapa.nombre}».`);

  // ── 2. La landing por QR ──────────────────────────────────────────────────────────────────────────
  paso("Otra familia llega por el código QR de la campaña y llena la landing");
  const qr = exigir(await admin.get(`/api/campanas/${campana.id}/qr?sucursal_id=${sucursal.id}&formato=url`), [200], "QR de la campaña");
  const rutaLanding = new URL(qr.url).pathname + new URL(qr.url).search;
  dato(`El QR de la campaña en «${sucursal.nombre}» apunta a la landing de «${vertical.nombre}» con su código de rastreo propio (el que identifica campaña y sucursal).`);
  const html = await (await fetch(`${origen}${rutaLanding}`)).text();
  const campos = new URLSearchParams();
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)) {
    const nombre = /name="([^"]*)"/.exec(m[0])?.[1];
    const valor = /value="([^"]*)"/.exec(m[0])?.[1] ?? "";
    if (nombre) campos.set(nombre, valor.replaceAll("&amp;", "&"));
  }
  const avisoLegal = exigir(await admin.get(`/api/documentos-legales/vigentes?vertical_id=${vertical.id}`), [200], "documentos vigentes");
  const aviso = (avisoLegal.datos as { id: string; tipo: string; version: number }[]).find((d) => d.tipo === "aviso_privacidad");
  if (aviso && !campos.has("documento_id")) campos.set("documento_id", aviso.id);
  if (aviso && !campos.has("version")) campos.set("version", String(aviso.version));
  for (const [k, v] of Object.entries({ nombre_alumno: "Sofía Ramos", edad: String(edad), sucursal_id: sucursal.id, telefono: "55 1234 0002", nombre_contacto: "Laura Ramos", acepta_aviso: "on" })) campos.set(k, v);
  const envio = await fetch(`${origen}/l/${vertical.slug}`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "demo-guiada" }, body: campos.toString() });
  const destinoWa = envio.headers.get("location") ?? "";
  await envio.arrayBuffer();
  dato(`Laura Ramos acepta el aviso de privacidad y deja los datos de Sofía (${edad} años); ${envio.status === 303 && destinoWa.startsWith("https://wa.me/") ? "la landing la manda a WhatsApp con un enlace wa.me que lleva su código de rastreo" : "la landing muestra su página de gracias (el canal de la demo no tiene un número de WhatsApp configurado, así que no hay salto a wa.me)"}.`);
  const lead2 = await db.lead.findFirstOrThrow({ where: { telefono: "+525512340002" }, include: { campana: true } });
  dato(`Ya existe su lead, ligado a la campaña «${lead2.campana?.nombre ?? "(sin campaña)"}» por el código del QR, y el bot no le volverá a preguntar lo que ya capturó.`);

  // ── 3. El bot ─────────────────────────────────────────────────────────────────────────────────────
  paso("El bot de tres preguntas (sin inteligencia artificial: una máquina de estados)");
  dato(`Bot: «${respuesta.replaceAll("\n", " ")}»`);
  let turnos = 0;
  const conversaciones = (): Promise<{ paso_captacion: string; estado: string }> => db.conversacion.findFirstOrThrow({ where: { chatwoot_conversacion_id: CONVERSACION }, select: { paso_captacion: true, estado: true } });
  while (turnos++ < 12) {
    const conv = await conversaciones();
    if (conv.paso_captacion === "completo" || conv.estado === "en_atencion_humana") break;
    let texto: string;
    if (/c[oó]mo se llama/i.test(respuesta)) texto = "Mateo";
    else if (/qu[eé] edad/i.test(respuesta)) texto = String(edad);
    else if (/horarios? disponibles/i.test(respuesta) || /clase muestra en/i.test(respuesta)) texto = opcion(respuesta, null);
    else if (/n[uú]mero/i.test(respuesta)) texto = /sucursal/i.test(respuesta) ? opcion(respuesta, sucursal.nombre) : /opciones|programa/i.test(respuesta) ? opcion(respuesta, programa.nombre) : opcion(respuesta, grupo.nombre);
    else break;
    // Entre las fechas de la clase muestra se elige la segunda, para que haya recordatorios de 24 h y 2 h por delante.
    if (/clase muestra en/i.test(respuesta)) texto = opcion(respuesta, null) === "1" && /^\s*2\./m.test(respuesta) ? "2" : texto;
    dato(`Mamá: «${texto}»`);
    respuesta = await hablar(CONVERSACION, telefono, "Rosa Mena", texto);
    dato(`Bot: «${respuesta.replaceAll("\n", " ").slice(0, 600)}»`);
  }
  const conv = await db.conversacion.findFirstOrThrow({ where: { chatwoot_conversacion_id: CONVERSACION }, include: { lead: { include: { etapa: true, prospectos: true } } } });
  const leadId = conv.lead_id;
  const prospecto = conv.lead.prospectos[0]!;

  // ── 4. La cotización ──────────────────────────────────────────────────────────────────────────────
  paso("La cotización, calculada por código determinista con precios y promociones de las tablas");
  const cotizaciones = exigir(await asesor.get(`/api/leads/${leadId}/cotizaciones`), [200], "cotizaciones del lead");
  const cot = cotizaciones.datos[0];
  if (!cot) throw new Error("El bot no guardó una cotización");
  const precio = cot.snapshot?.precio ?? cot.snapshot?.programa?.precio ?? null;
  dato(`Cotización ${cot.estatus} para «${programa.nombre}»${precio ? `: inscripción ${dinero(String(precio.costo_inscripcion ?? precio.inscripcion))}, mensualidad ${dinero(String(precio.costo_mensualidad ?? precio.mensualidad))}` : ""}.`);
  const promos = (cot.snapshot?.promociones ?? cot.snapshot?.programa?.promociones ?? []) as { nombre?: string }[];
  if (promos.length > 0) dato(`Promociones que aplican: ${promos.map((x) => x.nombre).join(", ")}.`);

  // ── 5. La clase muestra ───────────────────────────────────────────────────────────────────────────
  paso("La clase muestra queda agendada y la conversación pasa a una persona");
  const clase = await db.clase_muestra.findFirstOrThrow({ where: { lead_id: leadId, estatus: "agendada" } });
  dato(`Clase muestra de ${prospecto.nombre} en «${grupo.nombre}»: ${cuando(clase.fecha_hora, zona)} (la agendó ${clase.agendada_por === "bot" ? "el bot" : "una persona"}).`);
  const convFinal = await conversaciones();
  dato(`La conversación quedó «${convFinal.estado}»: el bot deja de contestar; los avisos de servicio sobre lo ya acordado (recordatorios) siguen saliendo.`);
  const estadoLead = await db.lead.findFirstOrThrow({ where: { id: leadId }, include: { etapa: true } });
  dato(`El lead avanzó a la etapa «${estadoLead.etapa.nombre}».`);

  // ── 6. Aviso al maestro y recordatorios ───────────────────────────────────────────────────────────
  paso("Aviso al maestro y recordatorios a la familia");
  const antesAviso = transporte.envios.length;
  await correrCiclo({ prisma, mensajeria, reloj: () => reloj.ahora });
  const alMaestro = transporte.envios.slice(antesAviso).filter((e) => e.destino.chatwootConversacionId !== CONVERSACION);
  dato(`El barrido del sistema (cada minuto) manda el aviso: ${alMaestro.length > 0 ? `${alMaestro.map((e) => (e.tipo === "plantilla" ? `plantilla «${e.plantilla?.codigo}»` : e.tipo === "abrir" || e.tipo === "iniciar" ? "apertura de la conversación" : e.tipo)).join(" + ")}` : "nada por WhatsApp (queda solo en su pantalla)"}.`);
  const avisos = exigir(await maestro.get("/api/maestro/avisos"), [200], "avisos del maestro");
  const aviso1 = avisos.datos[0];
  dato(`${instructor.nombre} ve en su pantalla el aviso «${aviso1?.tipo ?? "agendada"}» de la clase (entrega por WhatsApp: ${aviso1?.entrega ?? "sin dato"}${aviso1?.motivo_entrega ? ` — ${aviso1.motivo_entrega}` : ""}).`);
  for (const [horas, etiqueta] of [[24, "24 horas antes"], [2, "2 horas antes"]] as const) {
    reloj.ahora = new Date(clase.fecha_hora.getTime() - horas * 3_600_000 + 5 * 60_000);
    const antes = transporte.envios.length;
    await correrCiclo({ prisma, mensajeria, reloj: () => reloj.ahora });
    const nuevos = transporte.envios.slice(antes).filter((e) => e.destino.chatwootConversacionId === CONVERSACION);
    dato(`${cuando(reloj.ahora, zona)} (${etiqueta}): ${nuevos.length > 0 ? `sale a la familia ${nuevos.map((e) => (e.tipo === "plantilla" ? `la plantilla «${e.plantilla?.codigo ?? "aprobada"}»` : "un mensaje")).join(" y ")} (por el único camino de salida: MessagingProvider; fuera de la ventana de 24 h solo viaja una plantilla aprobada)` : "nada sale (el motor lo omitió con su motivo registrado)"}.`);
  }

  // ── 7. El registro del maestro ────────────────────────────────────────────────────────────────────
  reloj.ahora = new Date(clase.fecha_hora.getTime() + 30 * 60_000);
  paso("El maestro registra al alumno durante la clase (salud cifrada) y pasa lista");
  const registro = await maestro.patch(`/api/clases-muestra/${clase.id}/registro`, {
    alumno: { nombre: "Mateo", apellidos: "Mena Ruiz", fecha_nacimiento: `${2026 - edad}-03-15`, sexo: "masculino", escuela: "Primaria de ejemplo", turno_escolar: "matutino", talla_uniforme: "10" },
    tutores: [{ nombre: "Rosa", apellidos: "Mena", parentesco: "madre", telefono, correo: "rosa@ejemplo.test", es_responsable_pago: true, lo_lleva: true }],
    antecedentes: { practico_antes: false, motivo_clase: "disciplina" },
    salud: { alergias: "Ninguna conocida (registro de ejemplo de la demo)", condiciones_medicas: "Ninguna (demo)", medicamentos: "Ninguno (demo)", contacto_emergencia: { nombre: "Abuela de ejemplo", telefono: "+525512349999", parentesco: "abuela" }, autorizacion_atencion_medica: true },
    observacion: { grupo_recomendado_id: grupo.id },
  });
  exigir(registro, [200], "registro del maestro");
  exigir(await maestro.post(`/api/clases-muestra/${clase.id}/registro/completar`), [200], "completar el registro");
  dato(`${instructor.nombre} captura al alumno, a la madre (responsable de pago), antecedentes y salud (cifrada; este relato nunca la muestra) y completa el registro.`);
  exigir(await maestro.patch(`/api/clases-muestra/${clase.id}/asistencia`, { estatus: "asistio" }), [200], "asistencia");
  dato("Marca que el alumno asistió: el lead pasa a «clase muestra asistida».");
  const docs = exigir(await asesor.get(`/api/documentos-legales/vigentes?vertical_id=${vertical.id}`), [200], "documentos vigentes");
  const vigentes = docs.datos as { id: string; tipo: string; version: number }[];
  const dReglamento = vigentes.find((d) => d.tipo === "reglamento")!;
  const dImagen = vigentes.find((d) => d.tipo === "uso_imagen")!;
  for (const [documento, etiqueta, tipo] of [[dReglamento, "el reglamento", "reglamento"], [dImagen, "la autorización de uso de imagen", "imagen"]] as const) {
    exigir(await asesor.post(`/api/clases-muestra/${clase.id}/registro/aceptaciones`, { documento_id: documento.id, version: documento.version, resultado: "aceptada", aceptante: { nombre: "Rosa Mena", parentesco: "madre" }, canal: "presencial", evidencia: { tipo } }), [200, 201], `aceptación de ${etiqueta}`);
  }
  dato("La madre acepta en persona el reglamento y la autorización de imagen; queda la evidencia (versión, quién, cuándo).");
  const listo = await asesor.post(`/api/clases-muestra/${clase.id}/listo-para-cerrar`);
  exigir(listo, [200, 201], "listo para cerrar");
  dato("Se marca «lista para cerrar»: el lead pasa a negociación y el asesor recibe UNA tarea.");

  // ── 8. La conversión ──────────────────────────────────────────────────────────────────────────────
  reloj.ahora = new Date(clase.fecha_hora.getTime() + 2 * 3_600_000);
  paso("El asesor convierte al lead: familia, alumno e inscripción sin volver a capturar nada");
  const previa = exigir(await asesor.get(`/api/leads/${leadId}/conversion`), [200], "vista previa de la conversión");
  dato(`La vista previa solo pide lo que falta: ${previa.faltantes.length === 0 ? "nada" : previa.faltantes.map((f: { campo: string }) => f.campo.replace(/^prospectos\.[0-9a-f-]+\./, "")).join(", ")}.`);
  const conversion = exigir(
    await asesor.post(`/api/leads/${leadId}/convertir`, {
      tutor: { parentesco: "madre" },
      prospectos: [{ prospecto_id: prospecto.id, alumno: {}, inscripcion: { grupo_id: grupo.id } }],
    }),
    [200, 201],
    "conversión",
  );
  const alumnoId = conversion.alumnos[0].alumno_id as string;
  const inscripcionId = conversion.alumnos[0].inscripcion.id as string;
  const tutorId = conversion.tutor_id as string;
  const inscripcion = exigir(await asesor.get(`/api/inscripciones/${inscripcionId}`), [200], "inscripción");
  dato(`Se crearon la familia (un tutor por teléfono), el alumno y la inscripción en «${grupo.nombre}» con el precio CONGELADO: inscripción ${dinero(inscripcion.precio_inscripcion_aplicado)}, mensualidad ${dinero(inscripcion.precio_mensualidad_aplicado)}.`);
  const aplicadas = (inscripcion.promociones ?? inscripcion.promocion_aplicaciones ?? []) as { promocion?: { nombre?: string }; nombre?: string; estatus?: string }[];
  if (aplicadas.length > 0) dato(`Promociones aplicadas: ${aplicadas.map((a) => `${a.promocion?.nombre ?? a.nombre ?? "promoción"} (${a.estatus ?? "aplicada"})`).join("; ")}.`);
  else dato(`Descuento de inscripción congelado: ${dinero(inscripcion.descuento_inscripcion_aplicado ?? "0")}; meses gratis: ${inscripcion.meses_gratis_aplicados ?? 0}.`);
  const etapaFinal = await db.lead.findFirstOrThrow({ where: { id: leadId }, include: { etapa: true } });
  dato(`El lead quedó en «${etapaFinal.etapa.nombre}».`);

  // ── 9. El primer pago ─────────────────────────────────────────────────────────────────────────────
  paso("Recepción vende una playera y registra el primer pago, repartido entre los cargos");
  const productos = exigir(await recepcion.get(`/api/productos?vertical_id=${vertical.id}&activo=true&limite=50`), [200], "productos").datos as { id: string; nombre: string; precio: string; stock: number }[];
  let uniforme = productos.find((p) => p.nombre === "Uniforme" && p.stock > 0);
  let playera = productos.find((p) => p.nombre === "Playera de la escuela" && p.stock > 0);
  if (!uniforme) uniforme = exigir(await admin.post("/api/productos", { vertical_id: vertical.id, nombre: "Uniforme", talla: "10", precio: "350.00", stock: 5 }), [201], "alta del uniforme");
  if (!playera) playera = exigir(await admin.post("/api/productos", { vertical_id: vertical.id, nombre: "Playera de la escuela", talla: "10", precio: "180.00", stock: 10 }), [201], "alta de la playera");
  dato(`El inventario tiene «${uniforme!.nombre}» y «${playera!.nombre}» (${dinero(playera!.precio)}).`);
  exigir(await recepcion.post("/api/ventas", { alumno_id: alumnoId, producto_id: playera!.id, cantidad: 1 }), [201], "venta de la playera");
  dato(`Recepción le vende una playera a Mateo: el stock baja y nace un cargo de producto a nombre de la madre.`);
  const cargos = (exigir(await recepcion.get(`/api/cargos?tutor_id=${tutorId}&limite=50`), [200], "cargos").datos as { id: string; concepto: string; monto_final: string; saldo: string; fecha_vencimiento: string }[]).filter((cg) => Number(cg.saldo) > 0 || cg.concepto === "inscripcion");
  for (const cg of cargos) dato(`Cargo «${cg.concepto}»: ${dinero(cg.monto_final)} (vence ${cg.fecha_vencimiento}).`);
  const adeudado = cargos.reduce((a, cg) => a + Math.round(Number(cg.saldo) * 100), 0);
  const montoPago = (adeudado / 100).toFixed(2);
  const propuesta = exigir(await recepcion.get(`/api/pagos/propuesta?tutor_id=${tutorId}&monto=${montoPago}`), [200], "propuesta de pago");
  dato(`Se paga ${dinero(montoPago)} en efectivo; el sistema propone el reparto, más antiguo primero: ${propuesta.aplicaciones.map((a: { cargo_id: string; monto: string }) => `${dinero(a.monto)} a «${cargos.find((cg) => cg.id === a.cargo_id)?.concepto}»`).join(" + ")}.`);
  const pago = exigir(await recepcion.post("/api/pagos", { tutor_id: tutorId, monto: montoPago, metodo: "efectivo", clave_idempotencia: "demo-guiada-pago-0001" }), [201], "pago");
  const repetido = await recepcion.post("/api/pagos", { tutor_id: tutorId, monto: montoPago, metodo: "efectivo", clave_idempotencia: "demo-guiada-pago-0001" });
  dato(`Pago registrado. Si la caja repite el envío por error, la misma clave devuelve el mismo pago (${repetido.estado === 200 && repetido.cuerpo.repetido ? "idempotente: no se cobra dos veces" : "verifica la idempotencia"}).`);
  void pago;

  // ── 10. Beneficio liberado y uniforme ─────────────────────────────────────────────────────────────
  paso("El beneficio se libera y el uniforme queda por entregar");
  const porEntregar = exigir(await recepcion.get("/api/beneficios/por-entregar"), [200], "beneficios por entregar").datos as { id: string; descripcion?: string; beneficio?: { descripcion?: string }; alumno?: { nombre?: string }; promocion?: { nombre?: string } }[];
  if (porEntregar.length === 0) dato("No hay beneficios por entregar con las promociones de este catálogo.");
  for (const b of porEntregar) dato(`Por entregar: ${b.beneficio?.descripcion ?? b.descripcion ?? "beneficio"}${b.alumno?.nombre ? ` — alumno ${b.alumno.nombre}` : ""}${b.promocion?.nombre ? ` (promoción «${b.promocion.nombre}»)` : ""}. Se liberó al pagar la primera mensualidad completa.`);
  const aEntregar = porEntregar[0];
  if (aEntregar) {
    const stockAntes = exigir(await recepcion.get(`/api/productos/${uniforme!.id}`), [200], "producto").stock as number;
    exigir(await recepcion.post(`/api/beneficios/${aEntregar.id}/entregar`, { producto_id: uniforme!.id, cantidad: 1 }), [200, 201], "entrega del uniforme");
    const stockDespues = exigir(await recepcion.get(`/api/productos/${uniforme!.id}`), [200], "producto").stock as number;
    dato(`Recepción entrega el uniforme: el beneficio queda «entregado» y el inventario baja de ${stockAntes} a ${stockDespues}, sin cobrar nada (venta promocional de precio cero).`);
  }

  // ── 11. Estado de cuenta ──────────────────────────────────────────────────────────────────────────
  paso("Estado de cuenta de la familia");
  const cuenta = exigir(await recepcion.get(`/api/tutores/${tutorId}/estado-cuenta`), [200], "estado de cuenta");
  dato(`Cargado ${dinero(cuenta.resumen?.total_cargado ?? cuenta.total_cargado ?? "0")} · pagado ${dinero(cuenta.resumen?.total_pagado ?? cuenta.total_pagado ?? "0")} · saldo ${dinero(cuenta.resumen?.saldo ?? cuenta.saldo ?? "0")}.`);

  // ── 12. Cuadratura ────────────────────────────────────────────────────────────────────────────────
  paso("Cuadratura: todo el dinero contra sí mismo");
  const cu = await cuadratura(db);
  dato(cu.ok ? `✓ cuadra — ${cu.resumen.cargos} cargos, ${cu.resumen.pagos} pagos, ${cu.resumen.aplicaciones} aplicaciones; cargado ${dinero(cu.resumen.totalCargado)}, pagado ${dinero(cu.resumen.totalPagado)}, saldo ${dinero(cu.resumen.saldoTotal)}.` : `✗ NO CUADRA: ${cu.discrepancias.length} discrepancias`);

  // ── Resumen ───────────────────────────────────────────────────────────────────────────────────────
  narrar("");
  narrar("══════════════════════════════════════════════════════════════════════════════");
  narrar(" Resumen");
  narrar("══════════════════════════════════════════════════════════════════════════════");
  narrar(` Recorrido: anuncio simulado → landing y WhatsApp → bot → cotización → clase muestra → aviso al maestro y recordatorios → registro y asistencia → conversión → inscripción con promoción → primer pago repartido → beneficio por entregar → estado de cuenta.`);
  narrar(` Cuadratura: ${cu.ok ? "en verde" : "CON DISCREPANCIAS"}.`);
  const ligas = [
    `Interfaz:               ${origen}/            (usuarios de la demo: admin@demo.test, asesor@demo.test, maestro@demo.test, recepcion@demo.test; contraseña ${CLAVE_DEMO})`,
    `Ficha del lead:         ${origen}/leads/${leadId}`,
    `Clase muestra (maestro): ${origen}/clases/${clase.id}/registro`,
    `Expediente del alumno:  ${origen}/alumnos/${alumnoId}`,
    `Estado de cuenta:       ${origen}/cuenta/${tutorId}`,
    `Uniformes por entregar: ${origen}/uniformes`,
  ];
  return { cuadra: cu.ok, ligas };
}
