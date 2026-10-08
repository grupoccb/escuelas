// Elegibilidad (G4): ¿puede un alumno presentarse al siguiente peldaño de una vertical? Por clases mínimas: sus asistencias `presente` EN ESA VERTICAL desde que
// obtuvo su nivel actual (estrictamente después de la fecha en que lo obtuvo: la clase del examen no cuenta para el siguiente) tienen que alcanzar las
// `clases_minimas` del SIGUIENTE peldaño. Sin nivel actual cuentan todas las asistencias de la vertical y el siguiente es el primero. Las horas mínimas del
// peldaño se capturan pero hoy no se exigen (la asistencia no guarda la duración de la sesión). Determinista (invariante 10).

import type { Consultas } from "../datos/alcance.ts";
import { historialDeVertical, nivelesDeVertical, siguienteNivel, type NivelDeVertical, type NivelObtenido } from "./progresion.ts";

export type MotivoNoElegible = "sin_inscripcion_activa" | "sin_siguiente_nivel" | "clases_insuficientes";

export interface Elegibilidad {
  elegible: boolean;
  motivo: MotivoNoElegible | null;
  /** Asistencias `presente` contadas (desde el nivel actual). */
  clasesCumplidas: number;
  /** Las `clases_minimas` del siguiente peldaño (0 si no hay). */
  clasesRequeridas: number;
  /** Cuántas faltan (0 si ya alcanza o no aplica). */
  faltan: number;
  nivelActual: NivelObtenido | null;
  siguiente: NivelDeVertical | null;
}

/** La regla pura. El orden de las razones es el de los códigos: primero que sea alumno vigente, luego que haya a dónde subir, luego las clases. */
export function evaluarElegibilidad(e: { tieneInscripcionActiva: boolean; siguiente: NivelDeVertical | null; clasesCumplidas: number }): Pick<Elegibilidad, "elegible" | "motivo" | "clasesRequeridas" | "faltan"> {
  const requeridas = e.siguiente?.clasesMinimas ?? 0;
  const faltan = Math.max(0, requeridas - e.clasesCumplidas);
  if (!e.tieneInscripcionActiva) return { elegible: false, motivo: "sin_inscripcion_activa", clasesRequeridas: requeridas, faltan };
  if (!e.siguiente) return { elegible: false, motivo: "sin_siguiente_nivel", clasesRequeridas: 0, faltan: 0 };
  if (e.clasesCumplidas < requeridas) return { elegible: false, motivo: "clases_insuficientes", clasesRequeridas: requeridas, faltan };
  return { elegible: true, motivo: null, clasesRequeridas: requeridas, faltan: 0 };
}

/** Las asistencias `presente` del alumno en la vertical, estrictamente después de `desde` (`AAAA-MM-DD`) si se da. */
export async function clasesDeLaVertical(db: Consultas, alumnoId: string, verticalId: string, desde: string | null): Promise<number> {
  return db.asistencia.count({
    where: { estatus: "presente", inscripcion: { alumno_id: alumnoId, programa: { vertical_id: verticalId } }, ...(desde ? { fecha: { gt: new Date(`${desde}T00:00:00.000Z`) } } : {}) },
  });
}

/** La elegibilidad de un alumno en una vertical, con lo que hace falta para explicarla. */
export async function elegibilidadDe(db: Consultas, alumnoId: string, verticalId: string): Promise<Elegibilidad> {
  const [niveles, historial, activa] = await Promise.all([
    nivelesDeVertical(db, verticalId),
    historialDeVertical(db, alumnoId, verticalId),
    db.inscripcion.findFirst({ where: { alumno_id: alumnoId, estatus: "activa", programa: { vertical_id: verticalId } }, select: { id: true } }),
  ]);
  const actual = historial[0] ?? null;
  const siguiente = siguienteNivel(niveles, actual?.nivel ?? null);
  const clasesCumplidas = await clasesDeLaVertical(db, alumnoId, verticalId, actual?.fechaObtenido ?? null);
  return { ...evaluarElegibilidad({ tieneInscripcionActiva: activa !== null, siguiente, clasesCumplidas }), clasesCumplidas, nivelActual: actual, siguiente };
}
