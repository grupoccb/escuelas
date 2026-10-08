// Reglas PURAS del registro de la clase muestra (D5): sin base, sin reloj y sin red. Validan, normalizan y deciden qué falta.
// El servicio (`registro.ts`) las usa dentro de su transacción; aquí se pueden probar solas.

import { edadCumplida, partesDeFecha } from "../lib/edad.ts";
import { normalizarTelefono } from "../lib/telefono.ts";

export interface Problema {
  campo: string;
  mensaje: string;
}

// ── Fecha de nacimiento ────────────────────────────────────────────────────────────────────────────────

/** Edad mínima y máxima razonables de quien toma una clase: ni un recién nacido ni alguien de más de cien años. */
export const EDAD_MINIMA_ANIOS = 1;
export const EDAD_MAXIMA_ANIOS = 99;

/**
 * La fecha de nacimiento del acta (`AAAA-MM-DD`) es razonable respecto a `hoy` (la fecha local de la escuela, `AAAA-MM-DD`):
 * existe en el calendario, no es futura y la edad queda entre 1 y 99 años. Devuelve el mensaje del problema o null.
 */
export function problemaDeFechaDeNacimiento(fecha: string, hoy: string): string | null {
  try {
    partesDeFecha(fecha);
  } catch {
    return "No es una fecha del calendario (AAAA-MM-DD)";
  }
  if (fecha > hoy) return "La fecha de nacimiento no puede ser futura";
  const edad = edadCumplida(fecha, hoy);
  if (edad < EDAD_MINIMA_ANIOS) return `La edad debe ser de al menos ${EDAD_MINIMA_ANIOS} año`;
  if (edad > EDAD_MAXIMA_ANIOS) return `La fecha de nacimiento no es razonable (más de ${EDAD_MAXIMA_ANIOS} años)`;
  return null;
}

// ── Tutores ────────────────────────────────────────────────────────────────────────────────────────────

export interface TutorEntrada {
  id?: string;
  nombre: string;
  apellidos?: string | null;
  parentesco: string;
  telefono: string;
  correo?: string | null;
  es_responsable_pago?: boolean;
  lo_lleva?: boolean;
  puede_recoger?: boolean;
}

export interface TutorNormalizado {
  id?: string;
  nombre: string;
  apellidos: string | null;
  parentesco: string;
  /** E.164, de `normalizarTelefono()` (invariante 7). */
  telefono: string;
  correo: string | null;
  es_responsable_pago: boolean;
  lo_lleva: boolean;
  puede_recoger: boolean;
}

/**
 * Normaliza la lista de adultos del registro y detecta lo que la base también impide: teléfono inválido, el mismo teléfono en dos
 * personas, más de un responsable de pago o más de uno que lo lleva, y un `id` repetido. Devuelve la lista y los problemas.
 */
export function normalizarTutores(entrada: readonly TutorEntrada[]): { tutores: TutorNormalizado[]; problemas: Problema[] } {
  const problemas: Problema[] = [];
  const tutores: TutorNormalizado[] = [];
  const telefonos = new Map<string, number>();
  const ids = new Set<string>();
  entrada.forEach((t, i) => {
    const campo = `tutores[${i}]`;
    const telefono = normalizarTelefono(t.telefono);
    if (!telefono) problemas.push({ campo: `${campo}.telefono`, mensaje: "No es un teléfono válido" });
    else if (telefonos.has(telefono)) problemas.push({ campo: `${campo}.telefono`, mensaje: `Es el mismo teléfono de tutores[${telefonos.get(telefono)}]: cada adulto lleva el suyo` });
    else telefonos.set(telefono, i);
    if (t.id !== undefined) {
      if (ids.has(t.id)) problemas.push({ campo: `${campo}.id`, mensaje: "Está repetido" });
      ids.add(t.id);
    }
    tutores.push({
      ...(t.id !== undefined ? { id: t.id } : {}),
      nombre: t.nombre,
      apellidos: t.apellidos ?? null,
      parentesco: t.parentesco,
      telefono: telefono ?? t.telefono,
      correo: t.correo ?? null,
      es_responsable_pago: t.es_responsable_pago ?? false,
      lo_lleva: t.lo_lleva ?? false,
      puede_recoger: t.puede_recoger ?? false,
    });
  });
  if (tutores.filter((t) => t.es_responsable_pago).length > 1) problemas.push({ campo: "tutores", mensaje: "Solo un adulto puede ser el responsable de pago" });
  if (tutores.filter((t) => t.lo_lleva).length > 1) problemas.push({ campo: "tutores", mensaje: "Solo un adulto puede ser quien lo lleva" });
  return { tutores, problemas };
}

// ── Coherencia de los antecedentes ─────────────────────────────────────────────────────────────────────

export interface Antecedentes {
  practico_antes: boolean | null;
  practico_donde: string | null;
  practico_nivel: string | null;
  motivo_clase: string | null;
  motivo_clase_detalle: string | null;
}

export function problemasDeAntecedentes(a: Antecedentes): Problema[] {
  const p: Problema[] = [];
  if (a.practico_antes === false && (a.practico_donde !== null || a.practico_nivel !== null)) {
    p.push({ campo: "antecedentes.practico_antes", mensaje: "Si no ha practicado antes, no hay dónde ni nivel que anotar" });
  }
  if (a.motivo_clase_detalle !== null && a.motivo_clase === null) p.push({ campo: "antecedentes.motivo_clase_detalle", mensaje: "El detalle necesita un motivo" });
  if (a.motivo_clase_detalle !== null && a.motivo_clase !== "otro") p.push({ campo: "antecedentes.motivo_clase_detalle", mensaje: "El detalle solo se anota cuando el motivo es «otro»" });
  return p;
}

// ── Qué falta ──────────────────────────────────────────────────────────────────────────────────────────

export interface DatosParaFaltantes {
  alumno_nombre: string | null;
  alumno_apellidos: string | null;
  alumno_fecha_nacimiento: string | null;
  alumno_sexo: string | null;
  practico_antes: boolean | null;
  motivo_clase: string | null;
  tutores: readonly { telefono: string; es_responsable_pago: boolean }[];
  /** Los campos de la ficha de salud que aún no tienen respuesta (solo nombres; los calcula src/sensibles/). */
  saludFaltantes: readonly string[];
}

/**
 * Lo que le falta a un registro para estar COMPLETO (todo lo necesario para convertir a la familia sin recapturar): el alumno
 * (nombre, apellidos, fecha de nacimiento del acta y sexo), al menos un adulto con teléfono y un responsable de pago, los antecedentes
 * (si practicó antes y el motivo) y la ficha de salud entera. La observación del maestro no entra: se captura después de la clase.
 * Lista vacía = completo. Los nombres son rutas de campo (`alumno.nombre`, `tutores`, `salud.<campo>`).
 */
export function faltantesDelRegistro(d: DatosParaFaltantes): string[] {
  const f: string[] = [];
  if (!d.alumno_nombre) f.push("alumno.nombre");
  if (!d.alumno_apellidos) f.push("alumno.apellidos");
  if (!d.alumno_fecha_nacimiento) f.push("alumno.fecha_nacimiento");
  if (!d.alumno_sexo) f.push("alumno.sexo");
  if (d.tutores.length === 0) f.push("tutores");
  else if (!d.tutores.some((t) => t.es_responsable_pago)) f.push("tutores.responsable_pago");
  if (d.practico_antes === null) f.push("antecedentes.practico_antes");
  if (d.motivo_clase === null) f.push("antecedentes.motivo_clase");
  for (const c of d.saludFaltantes) f.push(`salud.${c}`);
  return f;
}
