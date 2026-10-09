// El formulario del registro del alumno: del registro del servidor a los campos de pantalla (siempre texto) y de vuelta al cuerpo del `PATCH`, más las validaciones
// de FORMATO del lado del cliente (el servidor valida todo otra vez). Puro: se prueba con `node --test`.
// Guardar es un borrador: aquí no se exige que esté todo (eso lo dice el servidor al «completar»), solo que lo escrito tenga forma de lo que es.

import { edadEn, esFechaReal } from "../../lib/fechas.ts";
import type { Registro, TutorDeRegistro } from "./tipos.ts";

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
    if (t.nombre.trim() === "") e[`${p}.nombre`] = "Escribe el nombre";
    if (t.parentesco.trim() === "") e[`${p}.parentesco`] = "Escribe el parentesco (madre, padre, abuela…)";
    if (t.telefono.trim() === "") e[`${p}.telefono`] = "Escribe el teléfono";
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
