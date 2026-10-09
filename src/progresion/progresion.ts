// Progresión genérica (G3): los peldaños de cada vertical son FILAS (`nivel_progresion`) y lo que cada alumno ha obtenido, `alumno_progresion`. Nada de
// ningún término de una vertical en el código (invariante 2): cómo se llama el avance vive en `vertical.etiqueta_progresion`.
//
// El nivel ACTUAL de un alumno en una vertical es el más reciente que obtuvo (`fecha_obtenido` y, a igualdad, el último que se registró). El SIGUIENTE es el de
// `orden` inmediatamente mayor al actual; sin nivel actual, el primero. Determinista (invariante 10).

import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import { fechaLocal } from "../lib/horario.ts";

export interface NivelDeVertical {
  id: string;
  nombre: string;
  orden: number;
  colorHex: string | null;
  horasMinimas: number;
  clasesMinimas: number;
  requisitosTexto: string | null;
}

export const SELECCION_NIVEL = { id: true, nombre: true, orden: true, color_hex: true, horas_minimas: true, clases_minimas: true, requisitos_texto: true } as const;

export function nivelDesdeFila(f: { id: string; nombre: string; orden: number; color_hex: string | null; horas_minimas: number; clases_minimas: number; requisitos_texto: string | null }): NivelDeVertical {
  return { id: f.id, nombre: f.nombre, orden: f.orden, colorHex: f.color_hex, horasMinimas: f.horas_minimas, clasesMinimas: f.clases_minimas, requisitosTexto: f.requisitos_texto };
}

/** Los peldaños vivos de la vertical, del primero al último. */
export async function nivelesDeVertical(db: Consultas, verticalId: string): Promise<NivelDeVertical[]> {
  return (await db.nivel_progresion.findMany({ where: { vertical_id: verticalId }, select: SELECCION_NIVEL, orderBy: [{ orden: "asc" }, { id: "asc" }] })).map(nivelDesdeFila);
}

/** El siguiente peldaño: el de `orden` inmediatamente mayor al actual (o el primero si todavía no tiene ninguno). Puro. */
export function siguienteNivel(niveles: readonly NivelDeVertical[], actual: Pick<NivelDeVertical, "orden"> | null): NivelDeVertical | null {
  const ordenados = [...niveles].sort((a, b) => a.orden - b.orden);
  return ordenados.find((n) => actual === null || n.orden > actual.orden) ?? null;
}

export interface NivelObtenido {
  progresionId: string;
  nivel: NivelDeVertical;
  fechaObtenido: string;
  eventoId: string | null;
  instructorId: string | null;
}

/** Lo que el alumno ha obtenido en esa vertical, del más reciente al más antiguo. */
export async function historialDeVertical(db: Consultas, alumnoId: string, verticalId: string): Promise<NivelObtenido[]> {
  const filas = await db.alumno_progresion.findMany({
    where: { alumno_id: alumnoId, nivel: { vertical_id: verticalId, eliminado_en: null } },
    select: { id: true, fecha_obtenido: true, evento_id: true, instructor_id: true, nivel: { select: SELECCION_NIVEL } },
    orderBy: [{ fecha_obtenido: "desc" }, { creado_en: "desc" }, { id: "desc" }],
  });
  return filas.map((f) => ({ progresionId: f.id, nivel: nivelDesdeFila(f.nivel), fechaObtenido: f.fecha_obtenido.toISOString().slice(0, 10), eventoId: f.evento_id, instructorId: f.instructor_id }));
}

/** El nivel actual: el más reciente, o null si todavía no obtiene ninguno. */
export async function nivelActual(db: Consultas, alumnoId: string, verticalId: string): Promise<NivelObtenido | null> {
  return (await historialDeVertical(db, alumnoId, verticalId))[0] ?? null;
}

export type MotivoDeRechazoDeNivel = "alumno_inexistente" | "nivel_inexistente" | "vertical_sin_progresion" | "sin_inscripcion_en_la_vertical" | "fecha_futura" | "nivel_ya_obtenido" | "instructor_inexistente" | "fecha_incoherente_con_el_orden";

export type ResultadoDeNivel = { ok: true; progresionId: string; verticalId: string; nivelId: string } | { ok: false; motivo: MotivoDeRechazoDeNivel; mensaje: string };

const rechazo = (motivo: MotivoDeRechazoDeNivel, mensaje: string): ResultadoDeNivel => ({ ok: false, motivo, mensaje });

/**
 * Le registra un peldaño a un alumno. Reglas: el alumno y el nivel existen, la vertical usa progresión, el alumno tiene una inscripción activa o congelada en ESA
 * vertical, la fecha no es futura (en la zona de la sucursal de esa inscripción) y no lo tenía ya. Va dentro de la transacción de quien llama (el evento de G4
 * la usa para que el resultado y el peldaño sean una sola cosa).
 */
export async function otorgarNivel(
  tx: Consultas,
  p: { alumnoId: string; nivelId: string; fechaObtenido: string; ahora: Date; usuarioId: string | null; instructorId?: string | null; eventoId?: string | null; observaciones?: string | null },
): Promise<ResultadoDeNivel> {
  const nivel = await tx.nivel_progresion.findFirst({ where: { id: p.nivelId }, select: { id: true, vertical_id: true, orden: true, vertical: { select: { usa_progresion: true } } } });
  if (!nivel) return rechazo("nivel_inexistente", "No se encontró el nivel");
  if (!(await tx.alumno.findFirst({ where: { id: p.alumnoId }, select: { id: true } }))) return rechazo("alumno_inexistente", "No se encontró el alumno");
  if (!nivel.vertical.usa_progresion) return rechazo("vertical_sin_progresion", "Esta vertical no lleva progresión");
  const insc = await tx.inscripcion.findFirst({
    where: { alumno_id: p.alumnoId, estatus: { in: ["activa", "congelada"] }, programa: { vertical_id: nivel.vertical_id } },
    select: { grupo: { select: { programa: { select: { sucursal: { select: { zona_horaria: true } } } } } } },
    orderBy: [{ fecha_inicio: "asc" }, { id: "asc" }],
  });
  if (!insc) return rechazo("sin_inscripcion_en_la_vertical", "El alumno no tiene una inscripción vigente en esta vertical");
  if (p.fechaObtenido > fechaLocal(p.ahora, insc.grupo.programa.sucursal.zona_horaria)) return rechazo("fecha_futura", "La fecha en que se obtuvo no puede ser futura");
  if (p.instructorId && !(await tx.instructor.findFirst({ where: { id: p.instructorId }, select: { id: true } }))) return rechazo("instructor_inexistente", "No se encontró el instructor");
  if (await tx.alumno_progresion.findFirst({ where: { alumno_id: p.alumnoId, nivel_id: p.nivelId }, select: { id: true } })) return rechazo("nivel_ya_obtenido", "El alumno ya obtuvo este nivel");
  // EG-07: el nivel actual es el más reciente por fecha, así que un peldaño más bajo con una fecha POSTERIOR a la de uno más alto haría retroceder al alumno (y uno más alto con
  // una fecha anterior a la de uno más bajo lo dejaría sin efecto). El historial a mano sigue siendo posible —peldaños más bajos con fechas anteriores—, el retroceso no.
  for (const h of await historialDeVertical(tx, p.alumnoId, nivel.vertical_id)) {
    if ((nivel.orden < h.nivel.orden && p.fechaObtenido > h.fechaObtenido) || (nivel.orden > h.nivel.orden && p.fechaObtenido < h.fechaObtenido)) {
      return rechazo("fecha_incoherente_con_el_orden", `Un peldaño más alto no puede haberse obtenido antes que uno más bajo: «${h.nivel.nombre}» se obtuvo el ${h.fechaObtenido}`);
    }
  }
  const fila = await tx.alumno_progresion.create({
    data: altaConAlcance({
      alumno_id: p.alumnoId,
      nivel_id: p.nivelId,
      fecha_obtenido: new Date(`${p.fechaObtenido}T00:00:00.000Z`),
      evento_id: p.eventoId ?? null,
      instructor_id: p.instructorId ?? null,
      observaciones: p.observaciones ?? null,
      registrado_por_usuario_id: p.usuarioId,
    }),
    select: { id: true },
  });
  return { ok: true, progresionId: fila.id, verticalId: nivel.vertical_id, nivelId: p.nivelId };
}
