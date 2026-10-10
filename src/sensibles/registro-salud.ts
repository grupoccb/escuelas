// La sección «salud y seguridad» del registro de la clase muestra (D5). Los datos de salud de un menor son SENSIBLES
// (decisión 12): este módulo es el único camino por el que el registro los toca, y lo hace SOLO con `guardarSensible()` (cifrados
// en `ficha_salud`, ligados al prospecto, con el registro de accesos). El registro (`registro_clase_muestra`) no guarda ni un valor:
// solo dos banderas de presencia que se calculan aquí sin descifrar nada.
//
// Por qué vive en `src/sensibles/` y no en la ruta: `check:sensibles` prohíbe nombrar estos campos en cualquier otro lugar, así que
// la ruta del registro recibe la sección como un objeto OPACO y la entrega a `leerEntradaDeSalud`, que la valida con su esquema.
// Leer los valores sigue siendo `GET /api/salud/…` (permiso `salud:leer`, motivo obligatorio, constancia de cada acceso).

import { tienePermiso } from "../api/permisos.ts";
import { validacion, ErrorApi, type DetalleDeError } from "../api/errores.ts";
import { booleano, nulable, objeto, opcional, parsear, texto } from "../api/validar.ts";
import type { BaseDatos } from "../datos/alcance.ts";
import { normalizarTelefono } from "../lib/telefono.ts";
import { camposConDato, contactoDeEmergenciaCoincide, ErrorAccesoSensible, guardarSensible, registrarDenegado, type ActorSensible, type OpcionesSensibles } from "./ficha.ts";
import { CAMPOS_SENSIBLES, normalizarNombre } from "./campos.ts";

const esquemaSalud = objeto({
  alergias: opcional(nulable(texto({ max: 2000 }))),
  condiciones_medicas: opcional(nulable(texto({ max: 2000 }))),
  medicamentos: opcional(nulable(texto({ max: 2000 }))),
  contacto_emergencia: opcional(nulable(objeto({ nombre: texto({ max: 120 }), telefono: texto({ max: 30 }), parentesco: opcional(texto({ max: 60 })) }))),
  autorizacion_atencion_medica: opcional(nulable(booleano())),
});

/** La sección de salud ya validada (teléfono normalizado). Opaca para quien la recibe: solo se pasa a `guardarSaludDelRegistro`. */
export interface EntradaDeSalud {
  readonly valores: Partial<Record<(typeof CAMPOS_SENSIBLES)[number], unknown>>;
  /** El contacto de emergencia que trae esta entrada (para compararlo con los tutores antes de escribir), si trae uno. */
  readonly contacto: { nombre: string; telefono: string } | null;
}

const conPrefijo = (detalles: DetalleDeError[] | undefined): DetalleDeError[] =>
  (detalles ?? []).map((d) => ({ ...(d.campo ? { campo: `salud.${d.campo}` } : { campo: "salud" }), mensaje: d.mensaje }));

/**
 * Valida la sección «salud» del cuerpo del registro (un objeto cualquiera hasta aquí) y normaliza el teléfono del contacto de
 * emergencia con `normalizarTelefono()` (invariante 7). Lanza `validacion` (400) con los campos prefijados `salud.`.
 */
export function leerEntradaDeSalud(opaco: unknown): EntradaDeSalud {
  let valores: Record<string, unknown>;
  try {
    valores = parsear(esquemaSalud, opaco);
  } catch (e) {
    if (e instanceof ErrorApi && e.codigo === "validacion") throw validacion(conPrefijo(e.detalles));
    throw e;
  }
  const v = valores;
  if (Object.keys(v).length === 0) throw validacion([{ campo: "salud", mensaje: "No hay ningún dato de salud que guardar" }]);
  let contacto: EntradaDeSalud["contacto"] = null;
  const c = v["contacto_emergencia"] as { nombre: string; telefono: string; parentesco?: string } | null | undefined;
  if (c) {
    const telefono = normalizarTelefono(c.telefono);
    if (!telefono) throw validacion([{ campo: "salud.contacto_emergencia.telefono", mensaje: "No es un teléfono válido" }]);
    v["contacto_emergencia"] = { ...c, telefono };
    contacto = { nombre: c.nombre, telefono };
  }
  return { valores: v as EntradaDeSalud["valores"], contacto };
}

/** Un adulto del registro, lo mínimo para compararlo con el contacto de emergencia. */
export interface PersonaDelRegistro {
  nombre: string;
  telefono: string;
}

const nombreComparable = (t: string): string => normalizarNombre(t).replace(/_+/g, " ").trim();

/** ¿Es la misma persona? Mismo teléfono normalizado, o mismo nombre completo sin acentos ni mayúsculas. */
export function mismaPersona(a: PersonaDelRegistro, b: PersonaDelRegistro): boolean {
  return a.telefono === b.telefono || (nombreComparable(a.nombre) !== "" && nombreComparable(a.nombre) === nombreComparable(b.nombre));
}

/** El detalle de validación cuando el contacto de emergencia es uno de los tutores. */
export const ERROR_CONTACTO_ES_TUTOR: DetalleDeError = {
  campo: "salud.contacto_emergencia",
  mensaje: "El contacto de emergencia debe ser una persona distinta de los tutores del registro (otro nombre y otro teléfono)",
};

/** ¿El contacto de esta entrada es alguno de los tutores? (comparación en memoria, antes de escribir nada) */
export function contactoDeEntradaEsTutor(entrada: EntradaDeSalud, tutores: readonly PersonaDelRegistro[]): boolean {
  return entrada.contacto !== null && tutores.some((t) => mismaPersona(entrada.contacto!, t));
}

/**
 * El contacto de emergencia YA guardado, ¿es alguno de estos tutores? (se usa cuando cambian los tutores o al completar el
 * registro). `false` si no hay contacto guardado. Deja constancia con la acción `validar`; no devuelve ni muestra ningún valor.
 */
export async function contactoGuardadoEsTutor(db: BaseDatos, actor: ActorSensible, p: { prospectoId: string; ruta: string }, tutores: readonly PersonaDelRegistro[], opciones?: OpcionesSensibles): Promise<boolean> {
  const r = await contactoDeEmergenciaCoincide(db, actor, { sujetoTipo: "prospecto", sujetoId: p.prospectoId, motivo: "validar que el contacto de emergencia sea distinto de los tutores", ruta: p.ruta }, (c) => tutores.some((t) => mismaPersona(c, t)), opciones);
  return r === true;
}

/** ¿Puede este rol escribir salud? (la matriz de permisos, `salud:escribir`). */
export const puedeEscribirSalud = (actor: ActorSensible): boolean => tienePermiso(actor.rol, "salud:escribir");

/** Deja constancia de un intento de escribir salud sin permiso (asesor, recepción) antes de negarlo. */
export async function rechazarEscrituraDeSalud(db: BaseDatos, actor: ActorSensible, p: { prospectoId: string; ruta: string }): Promise<void> {
  await registrarDenegado(db, actor, { sujetoTipo: "prospecto", sujetoId: p.prospectoId, motivo: "captura del registro de la clase muestra", ruta: p.ruta }, "escribir", "sin_permiso", CAMPOS_SENSIBLES);
}

/** Guarda la sección con `guardarSensible()` (cifrada, con permiso, regla del maestro y constancia). Lanza `ErrorAccesoSensible`. */
export async function guardarSaludDelRegistro(db: BaseDatos, actor: ActorSensible, p: { prospectoId: string; ruta: string; entrada: EntradaDeSalud }, opciones?: OpcionesSensibles): Promise<void> {
  await guardarSensible(db, actor, { sujetoTipo: "prospecto", sujetoId: p.prospectoId, motivo: "captura del registro de la clase muestra", ruta: p.ruta, valores: p.entrada.valores }, opciones);
}

export interface EstadoDeSalud {
  /** Hay un contacto de emergencia guardado. */
  contactoRegistrado: boolean;
  /** Los cinco campos de la ficha tienen respuesta (aunque sea «ninguna»). */
  completa: boolean;
  /** Los nombres de los campos que faltan (solo nombres, nunca valores). */
  faltantes: string[];
}

/** Qué falta de la ficha de salud de un prospecto, sin descifrar nada. */
export async function estadoDeSalud(db: BaseDatos, prospectoId: string): Promise<EstadoDeSalud> {
  const con = new Set<string>(await camposConDato(db, "prospecto", prospectoId));
  const faltantes = CAMPOS_SENSIBLES.filter((c) => !con.has(c));
  return { contactoRegistrado: con.has("contacto_emergencia"), completa: faltantes.length === 0, faltantes: [...faltantes] };
}

export { ErrorAccesoSensible };

// ── Notas libres sin salud ─────────────────────────────────────────────────────────────────────────────

const SIN_ACENTOS = (t: string): string => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Letras sueltas separadas por espacios o signos («a s m a», «t.d.a.h») se juntan para que no esquiven la búsqueda (EF-21). */
const JUNTAR_LETRAS_SUELTAS = /(?<![a-z0-9])(?:[a-z][\s.\-_*·]+){2,}[a-z](?![a-z0-9])/g;
/** Caracteres invisibles que se cuelan entre las letras de una palabra. */
const INVISIBLES = /[\p{Cf}\u3164\uFFA0\u115F\u1160]/gu;
const comparable = (t: string): string => SIN_ACENTOS(t).replace(INVISIBLES, "").replace(JUNTAR_LETRAS_SUELTAS, (m) => m.replace(/[^a-z]/g, ""));
/**
 * Palabras que delatan un dato de salud en un texto libre. Las notas del maestro NO son para eso: la salud va cifrada en su
 * sección (decisión 12). No es una garantía —nadie puede detectar toda mención— sino un freno a lo evidente.
 */
const PALABRAS_DE_SALUD = /(?<![a-z])(alergi|medicament|medicina|diabet|asma|asmatic|epilep|enfermedad|enfermo|enferma|padecimiento|condicion medica|tratamiento medico|cirugia|fractura|lesion|gripe|fiebre|tdah|tda\b|autis|hiperactiv|deficit de atencion|sindrome|trastorno|discapacidad|convuls|cardiac|cardiopat|dislexia)/;

/** ¿El texto libre parece traer un dato de salud? */
export function mencionaSalud(texto: string): boolean {
  return PALABRAS_DE_SALUD.test(comparable(texto));
}

export const MENSAJE_SIN_SALUD = "Las notas no son para datos de salud (alergias, medicamentos, condiciones médicas…): captúralos en la sección de salud";
