// El formulario del registro del alumno: del registro del servidor a los campos de pantalla (siempre texto) y de vuelta al cuerpo del `PATCH`, más las validaciones
// de FORMATO del lado del cliente (el servidor valida todo otra vez). Puro: se prueba con `node --test`.
// Guardar es un borrador: aquí no se exige que esté todo (eso lo dice el servidor al «completar»), solo que lo escrito tenga forma de lo que es.

import { edadEn, esFechaReal } from "../../lib/fechas.ts";
import type { EstadoLegal, Registro, TutorDeRegistro } from "./tipos.ts";

export type Errores = Record<string, string>;

export interface FormAlumno {
  nombre: string;
  apellidos: string;
  fecha_nacimiento: string;
  sexo: string;
  escuela: string;
  turno_escolar: string;
  talla_uniforme: string;
}

export interface FormTutor {
  /** Identificador estable para React y, si ya existe en el servidor, su id (así se conserva la fila). */
  clave: string;
  id?: string;
  nombre: string;
  apellidos: string;
  parentesco: string;
  telefono: string;
  correo: string;
  es_responsable_pago: boolean;
  lo_lleva: boolean;
  puede_recoger: boolean;
}

export interface FormAntecedentes {
  practico_antes: "" | "si" | "no";
  practico_donde: string;
  practico_nivel: string;
  motivo_clase: string;
  motivo_clase_detalle: string;
}

export interface FormObservacion {
  nivel_observado: string;
  grupo_recomendado_id: string;
  interes_percibido: string;
  notas: string;
}

let consecutivo = 0;
export const nuevaClave = (): string => `nuevo-${++consecutivo}`;

export const alumnoDesde = (r: Registro): FormAlumno => ({
  nombre: r.alumno.nombre ?? "",
  apellidos: r.alumno.apellidos ?? "",
  fecha_nacimiento: r.alumno.fecha_nacimiento ?? "",
  sexo: r.alumno.sexo ?? "",
  escuela: r.alumno.escuela ?? "",
  turno_escolar: r.alumno.turno_escolar ?? "",
  talla_uniforme: r.alumno.talla_uniforme ?? "",
});

export const tutorDesde = (t: TutorDeRegistro): FormTutor => ({
  clave: t.id,
  id: t.id,
  nombre: t.nombre,
  apellidos: t.apellidos ?? "",
  parentesco: t.parentesco,
  telefono: t.telefono,
  correo: t.correo ?? "",
  es_responsable_pago: t.es_responsable_pago,
  lo_lleva: t.lo_lleva,
  puede_recoger: t.puede_recoger,
});

export const tutoresDesde = (r: Registro): FormTutor[] => r.tutores.map(tutorDesde);

export const tutorVacio = (): FormTutor => ({ clave: nuevaClave(), nombre: "", apellidos: "", parentesco: "", telefono: "", correo: "", es_responsable_pago: false, lo_lleva: false, puede_recoger: false });

export const antecedentesDesde = (r: Registro): FormAntecedentes => ({
  practico_antes: r.antecedentes.practico_antes === null ? "" : r.antecedentes.practico_antes ? "si" : "no",
  practico_donde: r.antecedentes.practico_donde ?? "",
  practico_nivel: r.antecedentes.practico_nivel ?? "",
  motivo_clase: r.antecedentes.motivo_clase ?? "",
  motivo_clase_detalle: r.antecedentes.motivo_clase_detalle ?? "",
});

export const observacionDesde = (r: Registro): FormObservacion => ({
  nivel_observado: r.observacion.nivel_observado ?? "",
  grupo_recomendado_id: r.observacion.grupo_recomendado_id ?? "",
  interes_percibido: r.observacion.interes_percibido ?? "",
  notas: r.observacion.notas ?? "",
});

const nulo = (t: string): string | null => (t.trim() === "" ? null : t.trim());

export const cuerpoDeAlumno = (f: FormAlumno) => ({
  nombre: nulo(f.nombre),
  apellidos: nulo(f.apellidos),
  fecha_nacimiento: nulo(f.fecha_nacimiento),
  sexo: nulo(f.sexo),
  escuela: nulo(f.escuela),
  turno_escolar: nulo(f.turno_escolar),
  talla_uniforme: nulo(f.talla_uniforme),
});

/** La lista COMPLETA de adultos (el servidor reemplaza el conjunto; con `id` conserva la fila). */
export const cuerpoDeTutores = (ts: readonly FormTutor[]) =>
  ts.map((t) => ({
    ...(t.id ? { id: t.id } : {}),
    nombre: t.nombre.trim(),
    apellidos: nulo(t.apellidos),
    parentesco: t.parentesco.trim(),
    telefono: t.telefono.trim(),
    correo: nulo(t.correo),
    es_responsable_pago: t.es_responsable_pago,
    lo_lleva: t.lo_lleva,
    puede_recoger: t.puede_recoger,
  }));

export const cuerpoDeAntecedentes = (f: FormAntecedentes) => {
  const practico = f.practico_antes === "" ? null : f.practico_antes === "si";
  return {
    practico_antes: practico,
    // Quien no practicó no tiene dónde ni nivel que anotar (el servidor lo exige).
    practico_donde: practico === true ? nulo(f.practico_donde) : null,
    practico_nivel: practico === true ? nulo(f.practico_nivel) : null,
    motivo_clase: nulo(f.motivo_clase),
    // El detalle solo vale con el motivo «otro».
    motivo_clase_detalle: f.motivo_clase === "otro" ? nulo(f.motivo_clase_detalle) : null,
  };
};

export const cuerpoDeObservacion = (f: FormObservacion) => ({
  nivel_observado: nulo(f.nivel_observado),
  grupo_recomendado_id: nulo(f.grupo_recomendado_id),
  interes_percibido: nulo(f.interes_percibido),
  notas: nulo(f.notas),
});

// ── Validaciones de formato ───────────────────────────────────────────────────────────────────────────

/** Dígitos de un teléfono tal como lo teclea una persona (el servidor lo normaliza). */
export const digitosDe = (t: string): string => t.replace(/\D/g, "");
export const telefonoValido = (t: string): boolean => {
  const d = digitosDe(t);
  return d.length >= 10 && d.length <= 15;
};
export const correoValido = (c: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.trim());

export function validarAlumno(f: FormAlumno, hoy: string): Errores {
  const e: Errores = {};
  if (f.fecha_nacimiento.trim() !== "") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha_nacimiento) || !esFechaReal(f.fecha_nacimiento)) e["alumno.fecha_nacimiento"] = "Escribe una fecha real (día, mes y año)";
    else if (f.fecha_nacimiento > hoy) e["alumno.fecha_nacimiento"] = "La fecha de nacimiento no puede ser futura";
    else {
      const edad = edadEn(f.fecha_nacimiento, hoy);
      if (edad === null || edad < 1 || edad > 99) e["alumno.fecha_nacimiento"] = "La edad debe estar entre 1 y 99 años: revisa el año";
    }
  }
  return e;
}

export function validarTutores(ts: readonly FormTutor[]): Errores {
  const e: Errores = {};
  const vistos = new Map<string, number>();
  ts.forEach((t, i) => {
    const p = `tutores[${i}]`;
    if (t.nombre.trim() === "") e[`${p}.nombre`] = "Falta: nombre.";
    if (t.parentesco.trim() === "") e[`${p}.parentesco`] = "Falta: parentesco (madre, padre, abuela…).";
    if (t.telefono.trim() === "") e[`${p}.telefono`] = "Falta: teléfono.";
    else if (!telefonoValido(t.telefono)) e[`${p}.telefono`] = "El teléfono debe tener 10 dígitos (con lada)";
    else {
      const d = digitosDe(t.telefono).slice(-10);
      if (vistos.has(d)) e[`${p}.telefono`] = `Es el mismo teléfono del adulto ${(vistos.get(d) ?? 0) + 1}: cada adulto lleva el suyo`;
      else vistos.set(d, i);
    }
    if (t.correo.trim() !== "" && !correoValido(t.correo)) e[`${p}.correo`] = "Escribe un correo válido (nombre@dominio.com)";
  });
  if (ts.filter((t) => t.es_responsable_pago).length > 1) e["tutores"] = "Solo un adulto puede ser el responsable de pago";
  if (ts.filter((t) => t.lo_lleva).length > 1) e["tutores"] = "Solo un adulto puede ser quien lo lleva";
  return e;
}

export function validarAntecedentes(f: FormAntecedentes): Errores {
  const e: Errores = {};
  if (f.motivo_clase_detalle.trim() !== "" && f.motivo_clase !== "otro") e["antecedentes.motivo_clase_detalle"] = "El detalle solo se anota cuando el motivo es «Otro»";
  return e;
}

/** Los mensajes del servidor (`detalles[].campo`) mezclados con los del cliente; los del cliente van primero. */
export const unirErrores = (cliente: Errores, servidor: Errores): Errores => ({ ...servidor, ...cliente });

// ── Estado de cada sección del acordeón (R4b) ─────────────────────────────────────────────────────────────

export type IdDeSeccion = "alumno" | "tutores" | "salud" | "antecedentes" | "observacion" | "legal";

/**
 * Cuántos datos le faltan a una sección, según lo GUARDADO. Alumno, adultos, salud y antecedentes salen de la lista de faltantes que da el servidor (`registro.faltantes`, con la salud
 * en `registro.salud.faltantes`). La observación del maestro no la exige el servidor para completar el registro; aquí cuenta su dato principal, el interés percibido, para que
 * la sección diga si ya se anotó. «Reglamento e imagen» no sale de aquí: la lee `Aceptaciones` (`datosLegalesQueFaltan`).
 */
export function faltanDeSeccion(id: Exclude<IdDeSeccion, "legal">, r: Pick<Registro, "faltantes" | "salud" | "observacion">): number {
  if (id === "salud") return r.salud.faltantes.length;
  if (id === "observacion") return r.observacion.interes_percibido ? 0 : 1;
  const prefijo = id === "tutores" ? "tutores" : id;
  return r.faltantes.filter((f) => f === prefijo || f.startsWith(`${prefijo}.`)).length;
}

/** «Completa», «Falta 1 dato», «Faltan 3 datos». */
export const textoDeFaltan = (n: number): string => (n === 0 ? "Completa" : n === 1 ? "Falta 1 dato" : `Faltan ${n} datos`);

/** Del reglamento y de la autorización de imagen: el reglamento tiene que estar aceptado y la imagen respondida (aceptada, rechazada o revocada). Un documento sin vigente no cuenta. */
export function datosLegalesQueFaltan(documentos: readonly string[], estados: readonly Pick<EstadoLegal, "tipo" | "estado">[]): number {
  const de = (tipo: string) => estados.find((e) => e.tipo === tipo)?.estado ?? "sin_respuesta";
  let n = 0;
  if (documentos.includes("reglamento") && de("reglamento") !== "aceptada") n += 1;
  if (documentos.includes("uso_imagen") && de("uso_imagen") === "sin_respuesta") n += 1;
  return n;
}

/** «hace un momento», «hace 3 min», «hace 2 h», «hace 3 d»: cuánto pasó desde `iso` (el reloj, en ms). */
export function guardadoHace(iso: string, ahoraMs: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "hace un momento";
  const min = Math.max(0, Math.floor((ahoraMs - t) / 60_000));
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.floor(min / 60)} h`;
  return `hace ${Math.floor(min / (24 * 60))} d`;
}
