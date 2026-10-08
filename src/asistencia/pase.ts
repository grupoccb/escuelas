// Pase de lista (G1): quién vino a la sesión de un grupo un día. Determinista (invariante 10).
//
// Una «sesión» es un día de calendario LOCAL de la sucursal en que el grupo da clase (`grupo_horario`: día de la semana + hora de pared). El pase solo se toma
// de una sesión que ya empezó (no se pasa lista de una clase que no ha ocurrido) y su lista son las inscripciones ACTIVAS del grupo que ya habían empezado ese
// día, más las que ya tienen fila ese día (para poder corregir un pase aunque el alumno se haya dado de baja después). Es idempotente: una fila por
// (inscripción, fecha), y guardar lo mismo dos veces no cambia nada ni deja otro registro.

import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import { transaccionConBloqueo } from "../datos/bloqueos.ts";
import { instanteDeSesion, type HorarioDeGrupo } from "../clases-muestra/sesiones.ts";
import { fechaLocal } from "../lib/horario.ts";

export const ESTATUS_DE_ASISTENCIA = ["presente", "falta", "justificada"] as const;
export type EstatusDeAsistencia = (typeof ESTATUS_DE_ASISTENCIA)[number];
export const METODOS_DE_ASISTENCIA = ["manual", "qr"] as const;
export type MetodoDeAsistencia = (typeof METODOS_DE_ASISTENCIA)[number];

/** `AAAA-MM-DD` como la fecha de la columna `@db.Date` (medianoche UTC). */
export const fechaADate = (fecha: string): Date => new Date(`${fecha}T00:00:00.000Z`);
export const dateAFecha = (d: Date): string => d.toISOString().slice(0, 10);

/** Los instantes en que el grupo empieza sesión ese día de calendario local. Vacío si ese día de la semana no da clase (o la hora no existe ese día). */
export function sesionesDelDia(fecha: string, horarios: readonly HorarioDeGrupo[], zona: string): Date[] {
  const [anio, mes, dia] = fecha.split("-").map(Number) as [number, number, number];
  const diaSemana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  const inicios = new Map<number, Date>();
  for (const h of horarios) {
    if (h.dia_semana !== diaSemana) continue;
    const inicio = instanteDeSesion(anio, mes, dia, h.hora_inicio_min, zona);
    if (inicio) inicios.set(inicio.getTime(), inicio);
  }
  return [...inicios.values()].sort((a, b) => a.getTime() - b.getTime());
}

export type ProblemaDePase = "no_es_sesion" | "fecha_futura";

/** ¿Se puede tomar el pase de esa fecha? Tiene que ser una sesión del grupo y haber empezado ya (la primera sesión del día, en la zona de la sucursal). */
export function problemaDePase(fecha: string, e: { horarios: readonly HorarioDeGrupo[]; zona: string; ahora: Date }): ProblemaDePase | null {
  const sesiones = sesionesDelDia(fecha, e.horarios, e.zona);
  const primera = sesiones[0];
  if (!primera) return "no_es_sesion";
  return primera.getTime() > e.ahora.getTime() ? "fecha_futura" : null;
}

/** El día de calendario local de hoy en la zona de la sucursal. */
export const hoyEn = (zona: string, ahora: Date): string => fechaLocal(ahora, zona);

export interface GrupoDelPase {
  id: string;
  nombre: string;
  zona: string;
  sucursalId: string;
  verticalId: string;
  horarios: HorarioDeGrupo[];
}

/** El grupo con su zona y su calendario; null si no existe, está borrado o queda fuera de `donde` (el alcance del usuario). */
export async function cargarGrupoDelPase(db: Consultas, grupoId: string, donde: Record<string, unknown> = {}): Promise<GrupoDelPase | null> {
  const g = await db.grupo.findFirst({
    where: { id: grupoId, ...donde },
    select: {
      id: true,
      nombre: true,
      horarios: { where: { eliminado_en: null }, select: { dia_semana: true, hora_inicio_min: true } },
      programa: { select: { sucursal_id: true, vertical_id: true, sucursal: { select: { zona_horaria: true } } } },
    },
  });
  if (!g) return null;
  return { id: g.id, nombre: g.nombre, zona: g.programa.sucursal.zona_horaria, sucursalId: g.programa.sucursal_id, verticalId: g.programa.vertical_id, horarios: g.horarios };
}

export interface FilaDelPase {
  inscripcionId: string;
  alumnoId: string;
  alumno: string;
  /** Sigue activa: solo una activa puede recibir una fila nueva; una que ya la tiene se puede corregir aunque se haya dado de baja después. */
  activa: boolean;
  estatus: EstatusDeAsistencia | null;
  metodo: MetodoDeAsistencia | null;
}

/** La lista del pase de ese grupo y fecha, con lo ya registrado. */
export async function listaDelPase(db: Consultas, grupoId: string, fecha: string): Promise<{ lista: FilaDelPase[]; paseTomado: boolean }> {
  const dia = fechaADate(fecha);
  const filas = await db.asistencia.findMany({ where: { grupo_id: grupoId, fecha: dia }, select: { inscripcion_id: true, estatus: true, metodo: true } });
  const registradas = new Map(filas.map((f) => [f.inscripcion_id, f]));
  const inscripciones = await db.inscripcion.findMany({
    where: { OR: [{ grupo_id: grupoId, estatus: "activa", fecha_inicio: { lte: dia } }, { id: { in: [...registradas.keys()] } }] },
    select: { id: true, estatus: true, alumno_id: true, alumno: { select: { nombre: true, apellidos: true } } },
    orderBy: [{ alumno: { apellidos: "asc" } }, { alumno: { nombre: "asc" } }, { id: "asc" }],
  });
  return {
    paseTomado: filas.length > 0,
    lista: inscripciones.map((i) => {
      const fila = registradas.get(i.id);
      return { inscripcionId: i.id, alumnoId: i.alumno_id, alumno: `${i.alumno.nombre} ${i.alumno.apellidos}`, activa: i.estatus === "activa", estatus: fila?.estatus ?? null, metodo: fila?.metodo ?? null };
    }),
  };
}

export interface EntradaDePase {
  inscripcionId: string;
  estatus: EstatusDeAsistencia;
  metodo: MetodoDeAsistencia;
}

/** Un cambio hecho al guardar el pase, para que quien llama lo registre (en la MISMA transacción). */
export interface CambioDeAsistencia {
  asistenciaId: string;
  accion: "crear" | "actualizar";
  antes: { estatus: EstatusDeAsistencia; metodo: MetodoDeAsistencia; inscripcion_id: string; grupo_id: string; fecha: string } | null;
  despues: { estatus: EstatusDeAsistencia; metodo: MetodoDeAsistencia; inscripcion_id: string; grupo_id: string; fecha: string };
}

export type ResultadoDelGuardado =
  | { ok: true; creadas: number; actualizadas: number; sinCambio: number; inscripciones: string[] }
  | { ok: false; motivo: "inscripcion_fuera_de_lista" | "inscripcion_repetida"; detalles: { indice: number; inscripcionId: string }[] };

/**
 * Guarda el pase de un grupo y fecha, TODO o nada, bajo un candado por (grupo, fecha): dos pases simultáneos se forman en fila y gana el último, sin
 * duplicar filas (y el índice único parcial de la base lo respalda). Guardar lo mismo otra vez no cambia nada. Devuelve en `inscripciones` las que
 * cambiaron de verdad (para recalcular sus derivados, G2).
 */
export async function guardarPase(
  db: BaseDatos,
  p: { organizacionId: string; grupoId: string; fecha: string; usuarioId: string | null; entradas: readonly EntradaDePase[]; alCambiar?: (tx: Consultas, c: CambioDeAsistencia) => Promise<void> },
): Promise<ResultadoDelGuardado> {
  const dia = fechaADate(p.fecha);
  return transaccionConBloqueo(db, p.organizacionId, `pase:${p.grupoId}:${p.fecha}`, async (tx) => {
    const { lista } = await listaDelPase(tx, p.grupoId, p.fecha);
    const enLista = new Map(lista.map((f) => [f.inscripcionId, f]));
    // 1. Validar todo antes de escribir nada.
    const vistos = new Set<string>();
    const repetidas: { indice: number; inscripcionId: string }[] = [];
    const ajenas: { indice: number; inscripcionId: string }[] = [];
    p.entradas.forEach((e, indice) => {
      if (vistos.has(e.inscripcionId)) repetidas.push({ indice, inscripcionId: e.inscripcionId });
      vistos.add(e.inscripcionId);
      const f = enLista.get(e.inscripcionId);
      // Fuera de la lista, o una inscripción que ya no está activa y no tenía fila ese día (no se le inventa asistencia).
      if (!f || (!f.activa && f.estatus === null)) ajenas.push({ indice, inscripcionId: e.inscripcionId });
    });
    if (repetidas.length > 0) return { ok: false as const, motivo: "inscripcion_repetida" as const, detalles: repetidas };
    if (ajenas.length > 0) return { ok: false as const, motivo: "inscripcion_fuera_de_lista" as const, detalles: ajenas };

    // 2. Escribir.
    const existentes = new Map(
      (await tx.asistencia.findMany({ where: { grupo_id: p.grupoId, fecha: dia, inscripcion_id: { in: p.entradas.map((e) => e.inscripcionId) } }, select: { id: true, inscripcion_id: true, estatus: true, metodo: true } })).map((f) => [f.inscripcion_id, f]),
    );
    let creadas = 0;
    let actualizadas = 0;
    let sinCambio = 0;
    const tocadas: string[] = [];
    for (const e of p.entradas) {
      const previa = existentes.get(e.inscripcionId);
      const despues = { estatus: e.estatus, metodo: e.metodo, inscripcion_id: e.inscripcionId, grupo_id: p.grupoId, fecha: p.fecha };
      if (!previa) {
        const nueva = await tx.asistencia.create({
          data: altaConAlcance({ inscripcion_id: e.inscripcionId, grupo_id: p.grupoId, fecha: dia, estatus: e.estatus, metodo: e.metodo, registrado_por_usuario_id: p.usuarioId }),
          select: { id: true },
        });
        creadas++;
        tocadas.push(e.inscripcionId);
        await p.alCambiar?.(tx, { asistenciaId: nueva.id, accion: "crear", antes: null, despues });
      } else if (previa.estatus === e.estatus && previa.metodo === e.metodo) {
        sinCambio++;
      } else {
        await tx.asistencia.update({ where: { id: previa.id }, data: { estatus: e.estatus, metodo: e.metodo, registrado_por_usuario_id: p.usuarioId } });
        actualizadas++;
        // Solo la corrección del ESTATUS mueve los derivados; cambiar el método no.
        if (previa.estatus !== e.estatus) tocadas.push(e.inscripcionId);
        await p.alCambiar?.(tx, { asistenciaId: previa.id, accion: "actualizar", antes: { estatus: previa.estatus, metodo: previa.metodo, inscripcion_id: e.inscripcionId, grupo_id: p.grupoId, fecha: p.fecha }, despues });
      }
    }
    return { ok: true as const, creadas, actualizadas, sinCambio, inscripciones: tocadas };
  });
}
