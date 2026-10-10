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

import type { Server } from "node:http";
import { crearApp } from "../../src/http/app.ts";
import { crearPrisma, type PrismaRaiz } from "../../src/datos/prisma.ts";
import { conAlcance, type BaseDatos } from "../../src/datos/alcance.ts";
import { InscripcionesActivas } from "../../src/catalogo/cupo.ts";
import { procesarEntrante } from "../../src/captacion/entrante.ts";
import { correrCiclo } from "../../src/ciclo.ts";
import { cuadratura } from "../../src/finanzas/cuadratura.ts";
import { aTexto, deTexto } from "../../src/lib/dinero.ts";
import { ProveedorEconomicoDeFinanzas } from "../../src/finanzas/estado-cuenta.ts";
import { ProveedorProductosDeFinanzas } from "../../src/finanzas/productos.ts";
import { AtribucionDesdeChatwoot, EstadosEntregaChatwoot, MessagingProvider, TransporteFalso, registrarEstadoEntrega } from "../../src/mensajeria/index.ts";
import { payloadMensajeEntrante } from "../../src/mensajeria/chatwoot/fixtures.ts";
import { firmarCuerpoChatwoot } from "../../src/mensajeria/chatwoot/webhook.ts";
import { crearCifrador } from "../../src/sensibles/cifrado.ts";
import { registrarTomaDeConversacion } from "../../src/captacion/toma.ts";
import { crearManejadorDeInesperados } from "../../src/webhooks/inesperado.ts";
import { listarOrganizaciones } from "../../src/datos/sistema.ts";
import { recrearBaseDeDemo } from "./base-de-demo.ts";
import { escucharServidor } from "./servidor-local.ts";

export const SECRETO_WEBHOOK = "secreto-de-la-demo-guiada-0001";
const CLAVE_DEMO = "Demo-local-2026!";
/** Lunes 2 de noviembre de 2026, 12:00 en la Ciudad de México. Las clases de la demo caen en lunes y miércoles. */
export const INICIO = new Date("2026-11-02T18:00:00Z");

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
  if (!/demo_guiada/.test(base)) throw new Error(`La base de la demo guiada debe llamarse con «demo_guiada» (recibí «${base}»): nunca toca otra.`);
  const url = await recrearBaseDeDemo(urlServidor, base, /demo_guiada/);
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
  const respuesta = await hablar(CONVERSACION, telefono, "Rosa Mena", "Hola, vi su anuncio", { referral });
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
  /** La madre contesta lo que el bot pregunta (nombre, edad, sucursal, programa, horario…) hasta que la captura termina o una persona toma la conversación. */
  const conversarConElBot = async (conversacion: number, telefonoMama: string, nombreMama: string, primera: string, hijo: string, quien: string, decir: boolean): Promise<string> => {
    let ultima = primera;
    for (let turnos = 0; turnos++ < 12; ) {
      const c = await db.conversacion.findFirstOrThrow({ where: { chatwoot_conversacion_id: conversacion }, select: { paso_captacion: true, estado: true } });
      if (c.paso_captacion === "completo" || c.estado === "en_atencion_humana") break;
      let texto: string;
      if (/c[oó]mo se llama/i.test(ultima)) texto = hijo;
      else if (/qu[eé] edad/i.test(ultima)) texto = String(edad);
      else if (/horarios? disponibles/i.test(ultima) || /clase muestra en/i.test(ultima)) texto = opcion(ultima, null);
      else if (/n[uú]mero/i.test(ultima)) texto = /sucursal/i.test(ultima) ? opcion(ultima, sucursal.nombre) : /opciones|programa/i.test(ultima) ? opcion(ultima, programa.nombre) : opcion(ultima, grupo.nombre);
      else break;
      // Entre las fechas de la clase muestra se elige la segunda, para que haya recordatorios de 24 h y 2 h por delante.
      if (/clase muestra en/i.test(ultima)) texto = opcion(ultima, null) === "1" && /^\s*2\./m.test(ultima) ? "2" : texto;
      if (decir) dato(`${quien}: «${texto}»`);
      ultima = await hablar(conversacion, telefonoMama, nombreMama, texto);
      if (decir) dato(`Bot: «${ultima.replaceAll("\n", " ").slice(0, 600)}»`);
    }
    return ultima;
  };
  await conversarConElBot(CONVERSACION, telefono, "Rosa Mena", respuesta, "Mateo", "Mamá", true);
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
  const convFinal = await db.conversacion.findFirstOrThrow({ where: { chatwoot_conversacion_id: CONVERSACION }, select: { estado: true } });
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
  paso("El asesor agrega a la hermana y convierte al lead: familia, dos alumnos e inscripción en UNA operación, sin volver a capturar nada");
  // V3: el bot capturó a un niño; el asesor agrega a los demás desde la ficha (o por la API). Lo que escribe aquí es lo que la conversión usa: no se vuelve a pedir.
  const nacimientoHermana = `${2026 - programa.edad_min}-06-15`;
  const claveHermana = "demo-guiada-hermana-0001";
  const hermana = exigir(await asesor.post(`/api/leads/${leadId}/prospectos`, { nombre: "Valentina", apellidos: "Mena Ruiz", fecha_nacimiento: nacimientoHermana, clave_idempotencia: claveHermana }), [201], "alta de la hermana");
  const reintento = await asesor.post(`/api/leads/${leadId}/prospectos`, { nombre: "Valentina", apellidos: "Mena Ruiz", fecha_nacimiento: nacimientoHermana, clave_idempotencia: claveHermana });
  dato(`El asesor agrega a ${hermana.nombre} ${hermana.apellidos} (${hermana.edad} años, nacida el ${nacimientoHermana}) desde la ficha: otro niño del mismo lead, con sus datos estructurados. Si la respuesta se pierde y reintenta con la misma clave, el sistema responde ${reintento.estado === 200 && reintento.cuerpo.repetido ? "que ya estaba (no la duplica)" : "otra cosa: revisa la idempotencia"}.`);
  exigir(await asesor.post(`/api/leads/${leadId}/prospectos/${hermana.id}/aceptaciones-del-hermano`, { desde_prospecto_id: prospecto.id }), [200, 201], "reglamento de la hermana");
  dato("La madre acepta el reglamento por la hermana con el mismo medio que por su hermano: queda como una aceptación nueva, con la nota de que se extendió de él.");
  const previa = exigir(await asesor.get(`/api/leads/${leadId}/conversion`), [200], "vista previa de la conversión");
  dato(`La vista previa solo pide lo que falta: ${previa.faltantes.length === 0 ? "nada" : previa.faltantes.map((f: { campo: string }) => f.campo.replace(/^prospectos\.[0-9a-f-]+\./, "")).join(", ")}. El adulto no se pregunta de nuevo: la madre ya está en el registro del maestro.`);
  const hermanosPrevistos = (previa.previsiones as { prospecto_id: string; hermanos_previstos: number }[]).find((x) => x.prospecto_id === hermana.id)?.hermanos_previstos ?? 0;
  const cotizadaPrevia = exigir(await asesor.get(`/api/cotizador?vertical_id=${vertical.id}&sucursal_id=${sucursal.id}&fecha_nacimiento=${nacimientoHermana}&hermanos_inscritos=${hermanosPrevistos}`), [200], "cotización previa de la hermana").programas.find((x: { programa_id: string }) => x.programa_id === programa.id);
  dato(`Antes de confirmar, la cotización de la hermana cuenta ${hermanosPrevistos} hermano ya inscrito (el que se inscribe antes, en esta misma operación): inscripción ${dinero(cotizadaPrevia.promociones.inscripcion.final_ahora)}, mensualidad ${dinero(cotizadaPrevia.promociones.mensualidad.final_ahora)}.`);
  const conversion = exigir(
    await asesor.post(`/api/leads/${leadId}/convertir`, {
      tutor: { parentesco: "madre" },
      prospectos: [
        { prospecto_id: prospecto.id, alumno: {}, inscripcion: { grupo_id: grupo.id } },
        { prospecto_id: hermana.id, inscripcion: { grupo_id: grupo.id } },
      ],
    }),
    [200, 201],
    "conversión",
  );
  const delPrimero = conversion.alumnos.find((a: { prospecto_id: string }) => a.prospecto_id === prospecto.id);
  const delaHermana = conversion.alumnos.find((a: { prospecto_id: string }) => a.prospecto_id === hermana.id);
  const alumnoId = delPrimero.alumno_id as string;
  const inscripcionId = delPrimero.inscripcion.id as string;
  const tutorId = conversion.tutor_id as string;
  const inscripcion = exigir(await asesor.get(`/api/inscripciones/${inscripcionId}`), [200], "inscripción");
  const inscripcionHermana = exigir(await asesor.get(`/api/inscripciones/${delaHermana.inscripcion.id}`), [200], "inscripción de la hermana");
  dato(`En una sola operación se crearon la familia (un tutor por teléfono, el mismo para los dos), dos alumnos y dos inscripciones en «${grupo.nombre}» con el precio CONGELADO: la de ${prospecto.nombre} con inscripción ${dinero(inscripcion.precio_inscripcion_aplicado)} y mensualidad ${dinero(inscripcion.precio_mensualidad_aplicado)}.`);
  const aplicadas = (inscripcion.promociones ?? inscripcion.promocion_aplicaciones ?? []) as { promocion?: string; nombre?: string; estatus?: string }[];
  if (aplicadas.length > 0) dato(`Promociones aplicadas al primero: ${aplicadas.map((a) => `${a.promocion ?? a.nombre ?? "promoción"} (${a.estatus ?? "aplicada"})`).join("; ")}.`);
  else dato(`Descuento de inscripción congelado: ${dinero(inscripcion.descuento_inscripcion_aplicado ?? "0")}; meses gratis: ${inscripcion.meses_gratis_aplicados ?? 0}.`);
  const aplicadasHermana = (inscripcionHermana.promociones ?? []) as { promocion?: string; estatus?: string }[];
  dato(`La promoción por hermanos se aplicó sola a ${hermana.nombre}: descuento en la mensualidad ${dinero(inscripcionHermana.descuento_mensualidad_aplicado)} (mensualidad de ${dinero(inscripcionHermana.precio_mensualidad_aplicado)} a ${dinero(aTexto(deTexto(inscripcionHermana.precio_mensualidad_aplicado) - deTexto(inscripcionHermana.descuento_mensualidad_aplicado)))}); promociones: ${aplicadasHermana.map((a) => `${a.promocion ?? "promoción"} (${a.estatus ?? "aplicada"})`).join("; ") || "ninguna"}. Coincide con la cotización previa.`);
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
  const cargos = (exigir(await recepcion.get(`/api/cargos?tutor_id=${tutorId}&limite=50`), [200], "cargos").datos as { id: string; concepto: string; monto_final: string; saldo: string; fecha_vencimiento: string }[]).filter((cg) => Number(cg.saldo) > 0 || cg.concepto === "inscripcion").sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento) || a.concepto.localeCompare(b.concepto));
  for (const cg of cargos) dato(`Cargo «${cg.concepto}»: ${dinero(cg.monto_final)} (vence ${cg.fecha_vencimiento}).`);
  const adeudado = cargos.reduce((a, cg) => a + Math.round(Number(cg.saldo) * 100), 0);
  const montoPago = (adeudado / 100).toFixed(2);
  const propuesta = exigir(await recepcion.get(`/api/pagos/propuesta?tutor_id=${tutorId}&monto=${montoPago}`), [200], "propuesta de pago");
  dato(`Se paga ${dinero(montoPago)} en efectivo; el sistema propone el reparto, más antiguo primero: ${propuesta.aplicaciones.map((a: { cargo_id: string; monto: string }) => `${dinero(a.monto)} a «${cargos.find((cg) => cg.id === a.cargo_id)?.concepto}»`).sort().join(" + ")}.`);
  const pago = exigir(await recepcion.post("/api/pagos", { tutor_id: tutorId, monto: montoPago, metodo: "efectivo", clave_idempotencia: "demo-guiada-pago-0001" }), [201], "pago");
  const repetido = await recepcion.post("/api/pagos", { tutor_id: tutorId, monto: montoPago, metodo: "efectivo", clave_idempotencia: "demo-guiada-pago-0001" });
  dato(`Pago registrado. Si la caja repite el envío por error, la misma clave devuelve el mismo pago (${repetido.estado === 200 && repetido.cuerpo.repetido ? "idempotente: no se cobra dos veces" : "verifica la idempotencia"}).`);
  void pago;

  // ── 10. Beneficio liberado y uniforme ─────────────────────────────────────────────────────────────
  paso("El beneficio se libera y el uniforme queda por entregar");
  const porEntregar = exigir(await recepcion.get("/api/beneficios/por-entregar"), [200], "beneficios por entregar").datos as { id: string; descripcion?: string; beneficio?: { descripcion?: string }; alumno?: { nombre?: string }; promocion?: { nombre?: string } }[];
  // Los dos hermanos se inscriben en la misma operación (mismo instante): sin un orden propio el relato cambiaba entre corridas (hallazgo de V5, flaky desde V3).
  porEntregar.sort((a, b) => (a.alumno?.nombre ?? "").localeCompare(b.alumno?.nombre ?? "", "es"));
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

  // ── 12 a 14. Los módulos ──────────────────────────────────────────────────────────────────────────
  const nombresDeModulos = async (): Promise<Record<string, string>> => Object.fromEntries((exigir(await admin.get("/api/modulos"), [200], "módulos").modulos as { id: string; nombre: string }[]).map((m) => [m.id, m.nombre]));
  const modulosDe = async (c: Cliente): Promise<Record<string, boolean>> => exigir(await c.get("/api/yo"), [200], "mi sesión").modulos;
  const nombres = await nombresDeModulos();
  const lista = (ids: string[]): string => ids.map((m) => `«${nombres[m] ?? m}»`).join(", ");

  paso("Módulos: la escuela arranca solo con la captación y enciende el resto cuando está lista");
  const antesPermisos = (exigir(await asesor.get("/api/yo"), [200], "mi sesión").permisos as string[]).length;
  dato(`La demo trae todo encendido. El administrador ve los siete módulos en Administración → Módulos: ${lista(Object.keys(nombres))}.`);
  const apagar = { cotizador: false, inscripcion: false, operacion: false, finanzas: false, tableros: false };
  exigir(await admin.pedir("PUT", "/api/modulos", apagar), [200], "apagar módulos");
  const quedan = Object.entries(await modulosDe(asesor)).filter(([, v]) => v).map(([k]) => k);
  dato(`Apaga ${lista(Object.keys(apagar))} (de una sola vez: el sistema no deja apagar uno del que otro depende). Surte efecto en la siguiente petición, sin reiniciar nada: al asesor le quedan encendidos ${lista(quedan)}.`);
  const despuesPermisos = (exigir(await asesor.get("/api/yo"), [200], "mi sesión").permisos as string[]).length;
  dato(`Lo que el asesor puede hacer baja de ${antesPermisos} a ${despuesPermisos} permisos: desaparecen de su pantalla las secciones de lo apagado.`);
  const ruta404 = await asesor.get(`/api/leads/${leadId}/conversion`);
  const recepcion404 = await recepcion.get(`/api/tutores/${tutorId}/estado-cuenta`);
  dato(`Lo apagado no existe para nadie: convertir o inscribir responde ${ruta404.estado} «${ruta404.cuerpo?.error?.mensaje ?? "no encontrada"}» y el estado de cuenta de recepción, ${recepcion404.estado}; ni siquiera el administrador las ve.`);

  const CONVERSACION_2 = 880_002;
  const telefono2 = "+5215512340003";
  const respuesta2 = await hablar(CONVERSACION_2, telefono2, "Ernesto Lugo", "Hola, quiero informes");
  dato(`Una familia nueva escribe «Hola, quiero informes» con el cotizador apagado. Bot: «${respuesta2.replaceAll("\n", " ")}»`);
  await conversarConElBot(CONVERSACION_2, telefono2, "Ernesto Lugo", respuesta2, "Tomás", "Papá", true);
  const conv2 = await db.conversacion.findFirstOrThrow({ where: { chatwoot_conversacion_id: CONVERSACION_2 }, include: { lead: { include: { prospectos: true, etapa: true } } } });
  const lead3 = conv2.lead;
  // Sin cotizar = el bot no guardó ninguna cotización de este lead (el texto de despedida sí menciona que el asesor le dará horarios y costos).
  const sinCotizar = (await db.cotizacion.count({ where: { lead_id: lead3.id } })) === 0;
  dato(`Con el cotizador apagado el bot solo toma nombre, edad y sucursal y pasa al asesor${sinCotizar ? ", SIN cotizar ni ofrecer horarios" : ""}: la conversación quedó «${conv2.estado}» y el lead, en la etapa «${lead3.etapa.nombre}».`);
  const cotizaciones404 = await asesor.get(`/api/leads/${lead3.id}/cotizaciones`);
  dato(`Las cotizaciones del lead (${cotizaciones404.estado}) tampoco existen mientras el módulo está apagado.`);

  paso("Inscripción apagada: el asesor marca «inscrito a mano», con nota obligatoria y quedando quién lo hizo");
  // La clase muestra no depende de la inscripción: el asesor agenda la de Tomás y la familia acepta el reglamento en persona (lo que después pedirá la inscripción de verdad).
  const prospecto3 = lead3.prospectos[0]!;
  const sesion3 = (exigir(await asesor.get(`/api/clases-muestra/sesiones?grupo_id=${grupo.id}&maximo=2`), [200], "sesiones del grupo").datos as { fecha_hora: string }[])[0]!;
  const clase3 = exigir(await asesor.post("/api/clases-muestra", { prospecto_id: prospecto3.id, grupo_id: grupo.id, fecha_hora: sesion3.fecha_hora }), [201], "clase muestra de Tomás");
  exigir(await asesor.post(`/api/clases-muestra/${clase3.id}/registro/aceptaciones`, { documento_id: dReglamento.id, version: dReglamento.version, resultado: "aceptada", aceptante: { nombre: "Ernesto Lugo", parentesco: "padre" }, canal: "presencial", evidencia: { tipo: "reglamento" } }), [200, 201], "reglamento de Tomás");
  dato(`Con el módulo de clase muestra encendido el asesor agenda la de Tomás (${cuando(new Date(sesion3.fecha_hora), zona)}) y el padre acepta el reglamento en persona.`);
  const etapas = exigir(await asesor.get("/api/etapas"), [200], "etapas").datos as { id: string; nombre: string; tipo_sistema: string | null }[];
  const inscrita = etapas.find((e) => e.tipo_sistema === "inscrito")!;
  const sinNota = await asesor.patch(`/api/leads/${lead3.id}/etapa`, { etapa_id: inscrita.id });
  const notaCorta = await asesor.patch(`/api/leads/${lead3.id}/etapa`, { etapa_id: inscrita.id, nota: "ya pagó" });
  dato(`Sin nota (${sinNota.estado}) o con una nota de menos de diez letras (${notaCorta.estado}) el sistema no lo deja: «${sinNota.cuerpo?.error?.mensaje ?? notaCorta.cuerpo?.error?.mensaje ?? "nota obligatoria"}».`);
  exigir(await asesor.patch(`/api/leads/${lead3.id}/etapa`, { etapa_id: inscrita.id, nota: "Se inscribió en recepción con la maestra; pagó en efectivo y quedó en el grupo de la tarde." }), [200], "inscrito a mano");
  const historial = exigir(await asesor.get(`/api/leads/${lead3.id}/historial`), [200], "historial del lead");
  dato(`El lead queda en «${inscrita.nombre}» y el historial dice quién lo hizo: ${historial.inscrito_a_mano ? `«inscrito a mano por ${historial.inscrito_a_mano.por.nombre}»` : "(sin dato)"}. No crea alumno, inscripción ni cargos: por eso no cuenta en los alumnos activos del tablero ni inventa ingresos.`);
  const reporteUno = exigir(await admin.get("/api/exportaciones/leads"), [200], "exportación de leads");
  dato(`El reporte de leads lo cuenta aparte: ${typeof reporteUno === "string" && /A mano/.test(reporteUno) ? "la columna «Cómo se inscribió» dice «A mano»" : "se distingue de los inscritos por el sistema"}.`);

  paso("Al encender la inscripción, ya no se marca a mano: se inscribe de verdad, y el lead cuenta una sola vez");
  const encender = Object.fromEntries(Object.keys(apagar).map((m) => [m, true]));
  exigir(await admin.pedir("PUT", "/api/modulos", encender), [200], "encender módulos");
  dato(`El administrador vuelve a encender ${lista(Object.keys(encender))}: todo reaparece sin reiniciar.`);
  const lead2Estado = await asesor.patch(`/api/leads/${lead2.id}/etapa`, { etapa_id: inscrita.id, nota: "Intento marcarlo a mano con la inscripción encendida." });
  dato(`Con la inscripción encendida, marcar a mano ya no se puede (${lead2Estado.estado}): «${lead2Estado.cuerpo?.error?.mensaje ?? "inscríbela desde la ficha"}».`);
  const nacimiento3 = `${2026 - edad}-04-20`;
  const conversion3 = exigir(
    await asesor.post(`/api/leads/${lead3.id}/convertir`, { tutor: { parentesco: "padre", nombre: "Ernesto", apellidos: "Lugo" }, prospectos: [{ prospecto_id: prospecto3.id, alumno: { nombre: "Tomás", apellidos: "Lugo", fecha_nacimiento: nacimiento3, sexo: "masculino" }, inscripcion: { grupo_id: grupo.id } }] }),
    [200, 201],
    "inscripción del lead marcado a mano",
  );
  const insc3 = conversion3.alumnos[0].inscripcion.id as string;
  const historial3 = exigir(await asesor.get(`/api/leads/${lead3.id}/historial`), [200], "historial del lead");
  dato(`El asesor inscribe de verdad a Tomás en «${grupo.nombre}» (ya con alumno, inscripción y cargos): ${historial3.inscripciones?.length ?? 0} inscripción real, y el lead YA NO figura como «a mano» (${historial3.inscrito_a_mano === null ? "cuenta una sola vez, por su inscripción" : "revisa: sigue a mano"}). La marca anterior queda en el historial.`);
  void insc3;

  // ── 15. Cuadratura ────────────────────────────────────────────────────────────────────────────────
  paso("Cuadratura: todo el dinero contra sí mismo");
  const cu = await cuadratura(db);
  dato(cu.ok ? `✓ cuadra — ${cu.resumen.cargos} cargos, ${cu.resumen.pagos} pagos, ${cu.resumen.aplicaciones} aplicaciones; cargado ${dinero(cu.resumen.totalCargado)}, pagado ${dinero(cu.resumen.totalPagado)}, saldo ${dinero(cu.resumen.saldoTotal)}.` : `✗ NO CUADRA: ${cu.discrepancias.length} discrepancias`);

  // ── Resumen ───────────────────────────────────────────────────────────────────────────────────────
  narrar("");
  narrar("══════════════════════════════════════════════════════════════════════════════");
  narrar(" Resumen");
  narrar("══════════════════════════════════════════════════════════════════════════════");
  narrar(` Recorrido: anuncio simulado → landing y WhatsApp → bot → cotización → clase muestra → aviso al maestro y recordatorios → registro y asistencia → segundo hijo en la ficha → conversión de los dos hermanos en una operación → inscripción con promoción por hermanos → primer pago repartido → beneficio por entregar → estado de cuenta → módulos: apagar el cotizador (el bot pasa al asesor sin cotizar), «inscrito a mano» con la inscripción apagada, encender y inscribir de verdad.`);
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
