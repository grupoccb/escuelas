// La disciplina de cada hijo de una familia, para pintar su etiqueta con el color de su disciplina (R4a). La API no trae la disciplina del alumno: se arma con lo que sí hay
// (`GET /api/inscripciones?tutor_id=` da el grupo y el programa; `GET /api/programas` da la disciplina de cada programa; `GET /api/verticales` da su nombre y su `color_marca`).
// Nada de esto es un mapa por nombre: el color siempre es el dato de la disciplina. Si falta cualquier pieza (módulo apagado, sin permiso), el hijo queda con etiqueta neutra.

export interface InscripcionDeFamilia {
  alumno_id: string;
  grupo: string;
  programa_id: string;
  estatus: string;
}

export interface ProgramaDeCatalogo {
  id: string;
  vertical_id: string;
}

export interface DisciplinaDeCatalogo {
  id: string;
  nombre: string;
  color_marca: string | null;
}

/** Un hijo con una de sus disciplinas (un hijo en dos disciplinas tiene dos etiquetas; uno sin inscripción activa, una neutra). */
export interface EtiquetaDeHijo {
  clave: string;
  alumnoId: string;
  nombre: string;
  /** El grupo en el que está inscrito («Infantil 3-5»), o `null` si no tiene inscripción activa o no se pudo saber. */
  grupo: string | null;
  disciplina: string | null;
  color: string | null;
}

export function etiquetasDeHijos(
  alumnos: readonly { alumno_id: string; nombre: string }[],
  inscripciones: readonly InscripcionDeFamilia[],
  programas: readonly ProgramaDeCatalogo[],
  disciplinas: readonly DisciplinaDeCatalogo[],
): EtiquetaDeHijo[] {
  const programaPorId = new Map(programas.map((p) => [p.id, p]));
  const disciplinaPorId = new Map(disciplinas.map((d) => [d.id, d]));
  const salida: EtiquetaDeHijo[] = [];
  for (const a of alumnos) {
    const activas = inscripciones.filter((i) => i.alumno_id === a.alumno_id && i.estatus === "activa");
    if (activas.length === 0) {
      salida.push({ clave: a.alumno_id, alumnoId: a.alumno_id, nombre: a.nombre, grupo: null, disciplina: null, color: null });
      continue;
    }
    for (const i of activas) {
      const programa = programaPorId.get(i.programa_id);
      const d = programa ? disciplinaPorId.get(programa.vertical_id) : undefined;
      salida.push({ clave: `${a.alumno_id}-${i.grupo}-${i.programa_id}`, alumnoId: a.alumno_id, nombre: a.nombre, grupo: i.grupo, disciplina: d?.nombre ?? null, color: d?.color_marca ?? null });
    }
  }
  return salida;
}

/** Las disciplinas de un hijo, sin repetir y en orden («Uno, Dos»), o `null` si no se sabe ninguna. */
export function disciplinasDe(etiquetas: readonly EtiquetaDeHijo[], alumnoId: string): { texto: string; color: string | null } | null {
  const propias = etiquetas.filter((e) => e.alumnoId === alumnoId && e.disciplina !== null);
  if (propias.length === 0) return null;
  const nombres = [...new Set(propias.map((e) => e.disciplina as string))];
  return { texto: nombres.join(", "), color: propias[0]?.color ?? null };
}
