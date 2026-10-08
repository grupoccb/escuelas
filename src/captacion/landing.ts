// Landing pública por vertical (E1): la página `/l/:vertical` con el cuestionario. Este módulo es la LÓGICA (sin HTML ni Express): carga lo que la
// página muestra, valida lo que envía quien la llena y registra el envío. Todo lo que se ve (nombre de la vertical, color, logo, sucursales, el
// aviso de privacidad) sale de las tablas (invariante 2).
//
// Un envío, de punta a punta, en este orden y sin duplicar nada si se repite:
//   1. el teléfono pasa por `normalizarTelefono()` (invariante 7);
//   2. bajo un candado por (teléfono, vertical): se encuentra o se crea el LEAD (mismo teléfono y vertical = el mismo lead, a lo más uno por el índice
//      único de la base) con la atribución de la landing (utm_* y el código de campaña) SOLO si es nuevo: un lead que ya existe conserva la suya y
//      nadie puede reescribirlo mandando su teléfono; y el PROSPECTO (el niño o alumno) con su nombre y edad, reutilizando el que ya tiene ese nombre y edad;
//   3. la aceptación del aviso de privacidad vigente queda como evidencia (`aceptacion_legal`, canal web, con IP y agente: D6);
//   4. el consentimiento (`consentimiento`, opt-in por formulario) con esa evidencia, EXCEPTO si el teléfono tiene una baja: el formulario no prueba que
//      quien lo llena sea el dueño del número, así que no levanta una baja (invariante de bajas);
//   5. el enlace de WhatsApp (`wa.me`) con el mensaje prellenado y el código de rastreo del lead (E2).
// Quien llena el formulario recibe SIEMPRE la misma respuesta, exista o no el lead: no se puede averiguar qué teléfonos ya están en el sistema.

import { type BaseDatos, type Consultas, altaConAlcance, conAlcance } from "../datos/alcance.ts";
import { transaccionConBloqueo } from "../datos/bloqueos.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import type { ValorJson } from "../datos/tipos.ts";
import { resolverVerticalPublica } from "../datos/sistema.ts";
import { registrarAltaDeLead } from "../embudo/historial.ts";
import { type DocumentoLegal, documentoVigente } from "../legal/documentos.ts";
import { registrarAceptacion } from "../legal/aceptaciones.ts";
import { normalizarTelefono } from "../lib/telefono.ts";
import { estaDadoDeBaja } from "../mensajeria/consentimiento.ts";
import { normalizarNombre } from "../sensibles/campos.ts";
import { buscarCodigoUsable, codigoDeLead, formatearCodigo, generarCodigo, normalizarCodigoEscrito } from "./codigos.ts";

export const PARAMETROS_UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_UTM = 100;

// ── Lo que la página muestra ───────────────────────────────────────────────────────────────────────────

export interface Landing {
  organizacionId: string;
  verticalId: string;
  nombre: string;
  /** `#RRGGBB` validado, o null (la página usa su color por omisión). */
  colorMarca: string | null;
  /** Solo https. */
  logoUrl: string | null;
  sucursales: { id: string; nombre: string }[];
  /** El aviso de privacidad vigente de la vertical; null = la página no se puede publicar (no habría evidencia de consentimiento). */
  aviso: DocumentoLegal | null;
}

export function colorValido(c: string | null | undefined): string | null {
  return c && COLOR.test(c) ? c.toLowerCase() : null;
}

/** Solo URLs https (nada de `javascript:` ni `data:`). */
export function logoValido(u: string | null | undefined): string | null {
  if (!u || u.length > 500) return null;
  try {
    return new URL(u).protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** La landing de una vertical por su slug (y, si hace falta desambiguar, el de la organización). null si no existe o es ambigua. */
export async function cargarLanding(prisma: PrismaRaiz, slugVertical: string, slugOrganizacion: string | null, ahora: Date): Promise<Landing | null> {
  const r = await resolverVerticalPublica(prisma, slugVertical, slugOrganizacion);
  if (!r) return null;
  const db = conAlcance(prisma, r.organizacion_id);
  const vertical = await db.vertical.findFirst({ where: { id: r.vertical_id }, select: { nombre: true, color_marca: true, logo_url: true } });
  if (!vertical) return null;
  const filas = await db.sucursal_vertical.findMany({
    where: { vertical_id: r.vertical_id, activo: true, sucursal: { activo: true, eliminado_en: null } },
    select: { sucursal: { select: { id: true, nombre: true } } },
  });
  const sucursales = filas.map((f) => f.sucursal).sort((a, b) => a.nombre.localeCompare(b.nombre, "es-MX") || a.id.localeCompare(b.id));
  return { organizacionId: r.organizacion_id, verticalId: r.vertical_id, nombre: vertical.nombre, colorMarca: colorValido(vertical.color_marca), logoUrl: logoValido(vertical.logo_url), sucursales, aviso: await documentoVigente(db, "aviso_privacidad", r.vertical_id, ahora) };
}

// ── Parámetros de la URL (campaña, sucursal, utm) ──────────────────────────────────────────────────────

export interface ParametrosDeLanding {
  /** Código de campaña (`c`), ya normalizado; null si no viene o no tiene la forma de un código. */
  codigo: string | null;
  /** Sucursal sugerida (`s`, un uuid). Se valida contra las de la vertical al usarla. */
  sucursalId: string | null;
  utm: Record<string, string>;
}

const sinControl = (t: string): string => [...t].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127).join("").trim();

/** Lee y limpia los parámetros opcionales de la URL: lo raro se ignora en silencio (nada se refleja sin escapar ni rompe la página). */
export function leerParametros(fuente: Record<string, unknown>): ParametrosDeLanding {
  const texto = (k: string): string | null => (typeof fuente[k] === "string" ? (fuente[k] as string) : null);
  const c = texto("c");
  const s = texto("s");
  const utm: Record<string, string> = {};
  for (const k of PARAMETROS_UTM) {
    const v = texto(k);
    const limpio = v === null ? "" : sinControl(v).slice(0, MAX_UTM);
    if (limpio) utm[k] = limpio;
  }
  return { codigo: c ? normalizarCodigoEscrito(c) : null, sucursalId: s && UUID.test(s) ? s.toLowerCase() : null, utm };
}

// ── Validación del envío ───────────────────────────────────────────────────────────────────────────────

export interface DatosDelEnvio {
  nombreAlumno: string;
  edad: number;
  sucursalId: string | null;
  telefono: string;
  nombreContacto: string | null;
  documentoId: string;
  version: number;
}

/** Lo que se le devuelve al formulario si algo falla: el mensaje por campo y los valores (para repintarlos, ya escapados por la plantilla). */
export interface ErroresDelEnvio {
  campos: Partial<Record<"nombre_alumno" | "edad" | "sucursal_id" | "telefono" | "nombre_contacto" | "acepta_aviso", string>>;
  general?: string;
}

const COMPACTAR = /\s+/g;
const nombreLimpio = (t: unknown, max: number): string | null => {
  if (typeof t !== "string") return null;
  const limpio = sinControl(t.normalize("NFKC")).replace(COMPACTAR, " ");
  return limpio.length >= 1 && limpio.length <= max ? limpio : null;
};

export type ResultadoDeValidacion = { ok: true; datos: DatosDelEnvio } | { ok: false; errores: ErroresDelEnvio };

/** Valida en el servidor lo que mandó el formulario. Mensajes cortos y genéricos; nunca reflejan internos. */
export function validarEnvio(cuerpo: Record<string, unknown>, landing: Pick<Landing, "sucursales" | "aviso">): ResultadoDeValidacion {
  const campos: ErroresDelEnvio["campos"] = {};
  const alumno = nombreLimpio(cuerpo["nombre_alumno"], 120);
  if (!alumno) campos.nombre_alumno = "Escribe el nombre de quien tomará la clase (hasta 120 caracteres).";
  else if (/[<>]/.test(alumno)) campos.nombre_alumno = "El nombre solo puede llevar letras, números y signos de puntuación comunes.";

  const edadTexto = typeof cuerpo["edad"] === "string" ? cuerpo["edad"].trim() : "";
  const edad = /^\d{1,2}$/.test(edadTexto) ? Number(edadTexto) : null;
  if (edad === null || edad < 1 || edad > 99) campos.edad = "Escribe la edad con número, de 1 a 99.";

  let sucursalId: string | null = null;
  const s = typeof cuerpo["sucursal_id"] === "string" ? cuerpo["sucursal_id"].trim() : "";
  if (landing.sucursales.length > 0) {
    // Con una sola sucursal no se pregunta: es esa.
    const elegida = landing.sucursales.length === 1 && s === "" ? landing.sucursales[0]! : landing.sucursales.find((x) => x.id === s.toLowerCase());
    if (!elegida) campos.sucursal_id = "Elige una de las sucursales de la lista.";
    else sucursalId = elegida.id;
  }

  const telefonoCrudo = typeof cuerpo["telefono"] === "string" ? cuerpo["telefono"].trim() : "";
  const telefono = telefonoCrudo.length > 0 && telefonoCrudo.length <= 30 ? normalizarTelefono(telefonoCrudo) : null;
  if (!telefono) campos.telefono = "Escribe un teléfono válido, con lada (por ejemplo 55 1234 5678).";

  let nombreContacto: string | null = null;
  const nc = cuerpo["nombre_contacto"];
  if (typeof nc === "string" && nc.trim() !== "") {
    nombreContacto = nombreLimpio(nc, 120);
    if (!nombreContacto || /[<>]/.test(nombreContacto)) campos.nombre_contacto = "Escribe tu nombre (hasta 120 caracteres, sin símbolos raros) o déjalo en blanco.";
  }

  if (!["on", "si", "sí", "1", "true"].includes(typeof cuerpo["acepta_aviso"] === "string" ? cuerpo["acepta_aviso"].toLowerCase() : "")) campos.acepta_aviso = "Para continuar necesitamos que aceptes el aviso de privacidad.";

  // Lo que se mostró tiene que ser lo vigente: si el aviso cambió mientras llenaba el formulario, vuelve a leerlo.
  const documentoId = typeof cuerpo["documento_id"] === "string" ? cuerpo["documento_id"] : "";
  const version = typeof cuerpo["version"] === "string" && /^\d{1,6}$/.test(cuerpo["version"]) ? Number(cuerpo["version"]) : 0;
  let general: string | undefined;
  if (!landing.aviso) general = "Esta página no está disponible por ahora.";
  else if (landing.aviso.id !== documentoId || landing.aviso.version !== version) general = "El aviso de privacidad cambió. Léelo de nuevo y vuelve a enviar el formulario.";

  if (Object.keys(campos).length > 0 || general) return { ok: false, errores: { campos, ...(general ? { general } : {}) } };
  return { ok: true, datos: { nombreAlumno: alumno!, edad: edad!, sucursalId, telefono: telefono!, nombreContacto, documentoId, version } };
}

// ── Enlace de WhatsApp ─────────────────────────────────────────────────────────────────────────────────

/** El número de un canal en la forma que pide `wa.me` (solo dígitos, con lada de país). `whatsapp:+525512345678` → `525512345678`. */
export function numeroParaEnlace(numeroWhatsapp: string | null | undefined): string | null {
  if (!numeroWhatsapp) return null;
  const digitos = numeroWhatsapp.replace(/^whatsapp:/i, "").replace(/\D/g, "");
  return digitos.length >= 8 && digitos.length <= 15 ? digitos : null;
}

/** El enlace `wa.me` con el mensaje prellenado (el nombre de la vertical sale de la tabla) y el código de rastreo. */
export function enlaceDeWhatsapp(numero: string, nombreVertical: string, codigo: string): string {
  const mensaje = `Hola, quiero información de ${nombreVertical}. Mi código es ${formatearCodigo(codigo)}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
}

/** El número de WhatsApp al que debe escribir quien eligió esa sucursal: el canal de la sucursal, o el general de la vertical (sin sucursal), o el primero con número. */
export async function numeroDeContacto(db: BaseDatos | Consultas, verticalId: string, sucursalId: string | null): Promise<string | null> {
  const canales = await db.canal_whatsapp.findMany({ where: { vertical_id: verticalId, activo: true, numero_whatsapp: { not: null } }, select: { numero_whatsapp: true, sucursal_id: true }, orderBy: [{ creado_en: "asc" }, { id: "asc" }] });
  const elegido = canales.find((c) => sucursalId !== null && c.sucursal_id === sucursalId) ?? canales.find((c) => c.sucursal_id === null) ?? canales[0];
  return numeroParaEnlace(elegido?.numero_whatsapp);
}

/** Para el campo trampa (EE-10): el mismo enlace que un envío bueno, con un código al azar que NO se guarda. null si la vertical no tiene número. */
export async function enlaceSimulado(prisma: PrismaRaiz, landing: Landing): Promise<string | null> {
  const numero = await numeroDeContacto(conAlcance(prisma, landing.organizacionId), landing.verticalId, null);
  return numero ? enlaceDeWhatsapp(numero, landing.nombre, generarCodigo()) : null;
}

// ── El envío ───────────────────────────────────────────────────────────────────────────────────────────

export interface Procedencia {
  ip: string | null;
  agenteUsuario: string | null;
}

export type ResultadoDelEnvio =
  | { ok: true; leadId: string; prospectoId: string; creado: boolean; codigo: string; enlace: string | null }
  | { ok: false; motivo: "aviso_cambio" | "sin_etapas" };

const comparable = (t: string): string => normalizarNombre(t).replaceAll("_", " ").trim();

/** Registra el envío del formulario (ver la cabecera). Idempotente: repetirlo, o dos a la vez, deja UN lead, UN prospecto y UNA aceptación. */
export async function registrarEnvioDeLanding(prisma: PrismaRaiz, landing: Landing, datos: DatosDelEnvio, parametros: ParametrosDeLanding, procedencia: Procedencia, ahora: Date): Promise<ResultadoDelEnvio> {
  const db = conAlcance(prisma, landing.organizacionId);
  const etapaInicial = await db.etapa_pipeline.findFirst({ where: { es_ganado: false, es_perdido: false, OR: [{ tipo_sistema: null }, { tipo_sistema: { notIn: ["inscrito", "perdido"] } }] }, orderBy: { orden: "asc" }, select: { id: true } });
  if (!etapaInicial) return { ok: false, motivo: "sin_etapas" };

  const creado = await transaccionConBloqueo(db, landing.organizacionId, `landing:${landing.verticalId}:${datos.telefono}`, async (tx) => {
    let lead = await tx.lead.findFirst({ where: { vertical_interes_id: landing.verticalId, telefono: datos.telefono }, select: { id: true, campana_id: true, sucursal_interes_id: true } });
    let esNuevo = false;
    if (!lead) {
      // La atribución es del PRIMER contacto: solo un lead nuevo la recibe.
      const campana = parametros.codigo ? await buscarCodigoUsable(tx, parametros.codigo, ahora) : null;
      const delCodigo = campana && campana.tipo === "campana" && (campana.verticalId === null || campana.verticalId === landing.verticalId) ? campana : null;
      const atribucion: Record<string, unknown> = { fuente: "landing", ...(delCodigo ? { codigo_rastreo: delCodigo.codigo, campana_id: delCodigo.campanaId, sucursal_del_codigo_id: delCodigo.sucursalId } : {}), ...(Object.keys(parametros.utm).length > 0 ? { utm: parametros.utm } : {}) };
      lead = await tx.lead.create({
        data: altaConAlcance({
          vertical_interes_id: landing.verticalId,
          sucursal_interes_id: datos.sucursalId,
          campana_id: delCodigo?.campanaId ?? null,
          etapa_id: etapaInicial.id,
          telefono: datos.telefono,
          nombre_contacto: datos.nombreContacto,
          ultima_interaccion_en: ahora,
          atribucion: atribucion as ValorJson,
        }),
        select: { id: true, campana_id: true, sucursal_interes_id: true },
      });
      await registrarAltaDeLead(tx, lead.id, etapaInicial.id, ahora);
      esNuevo = true;
      // Un código de campaña se «registra»: cuenta una vez más (con tope, si lo tiene).
      if (delCodigo) await tx.codigo_rastreo.updateMany({ where: { id: delCodigo.id, OR: [{ max_usos: null }, { usos: { lt: delCodigo.maxUsos ?? 0 } }] }, data: { usos: { increment: 1 } } });
    }
    // El prospecto: el mismo nombre y la misma edad es el mismo niño; otro es otro prospecto del mismo lead.
    const prospectos = await tx.prospecto.findMany({ where: { lead_id: lead.id }, select: { id: true, nombre: true, edad_declarada: true, origen: true }, orderBy: [{ creado_en: "asc" }, { id: "asc" }] });
    const mismo = prospectos.find((p) => p.nombre !== null && comparable(p.nombre) === comparable(datos.nombreAlumno) && p.edad_declarada === datos.edad);
    let prospectoId = mismo?.id;
    if (!prospectoId) {
      // El primero es del bot (el bot de WhatsApp continúa sobre él sin preguntar lo que ya se sabe); los demás, de la landing.
      const origen = prospectos.some((p) => p.origen === "bot") ? ("landing" as const) : ("bot" as const);
      prospectoId = (await tx.prospecto.create({ data: altaConAlcance({ lead_id: lead.id, vertical_interes_id: landing.verticalId, nombre: datos.nombreAlumno, edad_declarada: datos.edad, origen }), select: { id: true } })).id;
    }
    const codigo = await codigoDeLead(tx, { leadId: lead.id, campanaId: lead.campana_id, sucursalId: lead.sucursal_interes_id, verticalId: landing.verticalId }, ahora);
    return { leadId: lead.id, prospectoId, esNuevo, codigo, sucursalId: lead.sucursal_interes_id };
  });

  // Evidencia del aviso de privacidad (D6): con IP y agente porque llegó por la web. Si el aviso cambió justo ahora, no se registra nada más.
  const aceptacion = await registrarAceptacion(db, landing.organizacionId, {
    prospectoId: creado.prospectoId,
    documentoId: datos.documentoId,
    version: datos.version,
    resultado: "aceptada",
    aceptante: { nombre: datos.nombreContacto ?? "Contacto del formulario web", parentesco: null },
    canal: "web",
    usuarioId: null,
    evidencia: { origen: "landing" },
    ip: procedencia.ip,
    agenteUsuario: procedencia.agenteUsuario,
    ahora,
  });
  if (!aceptacion.ok) return { ok: false, motivo: "aviso_cambio" };

  // Consentimiento por formulario (opt-in), salvo que el teléfono tenga una baja: el formulario no prueba que sea el dueño del número.
  if (!(await estaDadoDeBaja(db, datos.telefono, "todo"))) {
    const ultimo = await db.consentimiento.findFirst({ where: { telefono: datos.telefono, alcance: "todo" }, orderBy: [{ fecha: "desc" }, { creado_en: "desc" }], select: { estado: true } });
    if (ultimo?.estado !== "opt_in") {
      await db.consentimiento.create({
        data: altaConAlcance({ telefono: datos.telefono, estado: "opt_in" as const, alcance: "todo" as const, origen: "formulario", fecha: ahora, evidencia: { aceptacion_legal_id: aceptacion.aceptacion.id, documento_id: datos.documentoId, version: datos.version, lead_id: creado.leadId, canal: "landing" } as ValorJson }),
      });
    }
  }

  const numero = await numeroDeContacto(db, landing.verticalId, creado.sucursalId);
  return { ok: true, leadId: creado.leadId, prospectoId: creado.prospectoId, creado: creado.esNuevo, codigo: creado.codigo, enlace: numero ? enlaceDeWhatsapp(numero, landing.nombre, creado.codigo) : null };
}
