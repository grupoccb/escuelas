// «Cero recaptura» en la pantalla: lo que el servidor dice que FALTA (`GET /api/leads/:id/conversion`) menos lo que la persona ya escribió en el asistente.
// Los `campo` son rutas del servidor: `tutor.parentesco`, `prospectos.<id>.alumno.apellidos`, `prospectos.<id>.grupo_id`, `.precio`, `.reglamento`.
// Puro: se prueba con `node --test`. Aquí NO hay ningún dato capturado: solo se pregunta por lo que falta.

import { edadEn, esFechaReal } from "../../lib/fechas.ts";

export interface Falta {
  campo: string;
  mensaje: string;
}

export interface EntradaDeTutor {
  parentesco: string;
  nombre: string;
  apellidos: string;
  correo: string;
}

export interface EntradaDeAlumno {
  nombre: string;
  apellidos: string;
  fecha_nacimiento: string;
}

export interface Entrada {
  tutor: EntradaDeTutor;
  /** Por `prospecto_id`: SOLO lo que la persona tecleó (o corrigió). */
  alumnos: Record<string, EntradaDeAlumno>;
  /** Por `prospecto_id`: el grupo elegido. */
  grupos: Record<string, string>;
}

export const entradaVacia = (): Entrada => ({ tutor: { parentesco: "", nombre: "", apellidos: "", correo: "" }, alumnos: {}, grupos: {} });

export type Paso = "familia" | "alumnos" | "grupo" | "precio" | "reglamento" | "otros";

export const PASOS: readonly { id: Exclude<Paso, "otros">; titulo: string }[] = [
  { id: "familia", titulo: "Familia" },
  { id: "alumnos", titulo: "Alumnos" },
  { id: "grupo", titulo: "Grupo y horario" },
  { id: "precio", titulo: "Precio" },
  { id: "reglamento", titulo: "Reglamento e imagen" },
];

const RUTA_DE_PROSPECTO = /^prospectos\.([^.]+)\.(.+)$/;

/** A qué paso del asistente pertenece una falta. */
export function pasoDe(campo: string): Paso {
  if (campo.startsWith("tutor.")) return "familia";
  const m = RUTA_DE_PROSPECTO.exec(campo);
  if (!m) return "otros";
  const resto = m[2] ?? "";
  if (resto.startsWith("alumno.")) return "alumnos";
  if (resto === "grupo_id") return "grupo";
  if (resto === "precio") return "precio";
  if (resto === "reglamento") return "reglamento";
  return "otros";
}

/** El prospecto al que se refiere una falta, si es de uno. */
export const prospectoDe = (campo: string): string | null => RUTA_DE_PROSPECTO.exec(campo)?.[1] ?? null;

const ETIQUETAS: Record<string, string> = {
  "tutor.parentesco": "Parentesco del adulto responsable",
  "tutor.nombre": "Nombre del adulto responsable",
  "tutor.telefono": "Teléfono del adulto responsable",
  "alumno.nombre": "Nombre del alumno",
  "alumno.apellidos": "Apellidos del alumno",
  "alumno.fecha_nacimiento": "Fecha de nacimiento del alumno",
  grupo_id: "Grupo y horario",
  precio: "Precio del programa",
  reglamento: "Reglamento aceptado por la familia",
  prospecto_id: "Alumno",
};

/**
 * La falta en palabras de una persona. Con varios niños a la vez (`nombreDe` devuelve el nombre de cada uno), la falta dice DE QUIÉN es: «Apellidos de Sofía» y «Apellidos de Mateo»
 * en vez de dos «Apellidos del alumno» idénticos (V7).
 */
export function etiquetaDeFalta(campo: string, nombreDe?: (prospectoId: string) => string | null): string {
  if (campo.startsWith("tutor.")) return ETIQUETAS[campo] ?? campo;
  const m = RUTA_DE_PROSPECTO.exec(campo);
  if (m) {
    const base = ETIQUETAS[m[2] ?? ""] ?? campo;
    const nombre = nombreDe?.(m[1] ?? "") ?? null;
    if (!nombre || base === campo) return base;
    return base.includes("del alumno") ? base.replace("del alumno", `de ${nombre}`) : `${base} (${nombre})`;
  }
  return campo === "prospectos" ? "Al menos un alumno" : campo;
}

/** Un nombre o apellido escrito con algo (no solo espacios). */
const con = (t: string | undefined): boolean => (t ?? "").trim() !== "";

/** Una fecha de nacimiento real, no futura y de 1 a 99 años (lo mismo que exige el servidor). */
export function nacimientoValido(fecha: string, hoy: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !esFechaReal(fecha)) return false;
  const e = edadEn(fecha, hoy);
  return e !== null && e >= 1 && e <= 99;
}

/**
 * Lo que sigue faltando: cada falta del servidor se descarta si ya se escribió lo que pedía. Las que no se pueden resolver escribiendo (un contacto sin
 * teléfono, un alumno ajeno) siempre se quedan; el reglamento se quita cuando el servidor deja de pedirlo (al recargar la vista previa).
 */
export function restantes(faltas: readonly Falta[], e: Entrada, ctx: { hoy: string; grupoConPrecio: (prospectoId: string) => boolean }): Falta[] {
  return faltas.filter((f) => {
    if (f.campo === "tutor.parentesco") return !con(e.tutor.parentesco);
    if (f.campo === "tutor.nombre") return !con(e.tutor.nombre);
    const m = RUTA_DE_PROSPECTO.exec(f.campo);
    if (!m) return true;
    const id = m[1] ?? "";
    const a = e.alumnos[id];
    switch (m[2]) {
      case "alumno.nombre":
        return !con(a?.nombre);
      case "alumno.apellidos":
        return !con(a?.apellidos);
      case "alumno.fecha_nacimiento":
        return !(a && nacimientoValido(a.fecha_nacimiento, ctx.hoy));
      case "grupo_id":
        return !con(e.grupos[id]);
      case "precio":
        return !(con(e.grupos[id]) && ctx.grupoConPrecio(id));
      default:
        return true;
    }
  });
}

/** Las faltas de un paso. */
export const delPaso = (faltas: readonly Falta[], paso: Paso): Falta[] => faltas.filter((f) => pasoDe(f.campo) === paso);

/** El cuerpo de `POST /api/leads/:id/convertir`: SOLO lo que la persona escribió o eligió; nada de lo ya capturado viaja otra vez. */
export function cuerpoDeConversion(
  e: Entrada,
  pendientes: readonly string[],
  opciones: Record<string, { fecha_inicio: string; dia_corte_pago: string; meses: string }>,
  entero: (t: string) => number | null,
): Record<string, unknown> {
  const tutor = Object.fromEntries(Object.entries({ parentesco: e.tutor.parentesco, nombre: e.tutor.nombre, apellidos: e.tutor.apellidos, correo: e.tutor.correo }).filter(([, v]) => con(v)).map(([k, v]) => [k, v.trim()]));
  const prospectos = pendientes.map((id) => {
    const a = e.alumnos[id];
    const alumno = a ? Object.fromEntries(Object.entries(a).filter(([, v]) => con(v)).map(([k, v]) => [k, v.trim()])) : {};
    const o = opciones[id];
    const dia = o && con(o.dia_corte_pago) ? entero(o.dia_corte_pago) : null;
    const meses = o && con(o.meses) ? entero(o.meses) : null;
    const inscripcion = {
      ...(con(e.grupos[id]) ? { grupo_id: e.grupos[id] } : {}),
      ...(o && con(o.fecha_inicio) ? { fecha_inicio: o.fecha_inicio } : {}),
      ...(dia !== null ? { dia_corte_pago: dia } : {}),
      ...(meses !== null && meses > 0 ? { meses_pagados_por_adelantado: meses } : {}),
    };
    return { prospecto_id: id, ...(Object.keys(alumno).length > 0 ? { alumno } : {}), ...(Object.keys(inscripcion).length > 0 ? { inscripcion } : {}) };
  });
  return { ...(Object.keys(tutor).length > 0 ? { tutor } : {}), prospectos };
}
