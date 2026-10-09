// Hermanos inscritos de una familia (F7). Los hermanos de un alumno son los OTROS alumnos de sus tutores (`tutor_alumno`), contados una sola
// vez aunque compartan dos tutores (mamá y papá, o mamá y abuela): se cuentan alumnos distintos, no vínculos. «Inscrito» = tiene al menos una
// inscripción ACTIVA (una congelada o una baja no cuenta para la promoción por hermanos).

import type { Consultas } from "../datos/alcance.ts";

/** Los alumnos (distintos del dado) de los tutores del alumno, con una inscripción activa. */
export async function hermanosInscritos(tx: Consultas, alumnoId: string): Promise<{ alumnoId: string }[]> {
  const mios = await tx.tutor_alumno.findMany({ where: { alumno_id: alumnoId }, select: { tutor_id: true } });
  if (mios.length === 0) return [];
  const otros = await tx.alumno.findMany({
    where: {
      id: { not: alumnoId },
      tutores: { some: { eliminado_en: null, tutor_id: { in: mios.map((m) => m.tutor_id) } } },
      // EF-08: las condiciones anidadas no pasan por el alcance (conAlcance solo filtra el modelo de la consulta): una inscripción borrada no cuenta.
      inscripciones: { some: { estatus: "activa", eliminado_en: null } },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return otros.map((a) => ({ alumnoId: a.id }));
}

export async function contarHermanosInscritos(tx: Consultas, alumnoId: string): Promise<number> {
  return (await hermanosInscritos(tx, alumnoId)).length;
}

/**
 * EF-11 (V3): el candado de la FAMILIA. Los hermanos de un alumno se cuentan por los adultos que comparten (`tutor_alumno`), y dos hermanos que se inscriben a la vez en
 * transacciones separadas no se veían entre sí (cada una contaba 0 hermanos inscritos y ninguno recibía la promoción). Quien inscribe toma antes el candado de los adultos del
 * alumno —una fila de `tutor` cada uno, siempre en orden de id, todos de una vez— y cuenta después: la segunda inscripción ya ve la primera. Orden de candados de TODO el
 * sistema: lead → adultos → grupo (cupo). Con los candados tomados en ese orden, nadie se interbloquea.
 */
export async function bloquearTutores(tx: Consultas, tutorIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(tutorIds)].sort()) await tx.tutor.updateMany({ where: { id }, data: { actualizado_en: new Date() } });
}

/** Los adultos de un alumno (ids). */
export async function tutoresDeAlumno(tx: Consultas, alumnoId: string): Promise<string[]> {
  return (await tx.tutor_alumno.findMany({ where: { alumno_id: alumnoId, eliminado_en: null }, select: { tutor_id: true } })).map((t) => t.tutor_id);
}
