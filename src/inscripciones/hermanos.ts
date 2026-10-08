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
      inscripciones: { some: { estatus: "activa" } },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return otros.map((a) => ({ alumnoId: a.id }));
}

export async function contarHermanosInscritos(tx: Consultas, alumnoId: string): Promise<number> {
  return (await hermanosInscritos(tx, alumnoId)).length;
}
