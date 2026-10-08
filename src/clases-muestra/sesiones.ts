// Sesiones de un grupo: los instantes concretos en que da clase (D1). PURO (sin base ni reloj propio): el calendario del grupo
// (`grupo_horario`: día de la semana + minutos desde la medianoche LOCAL de la sucursal) se convierte a instantes con la zona
// horaria de la sucursal, así que un cambio de horario de verano mueve el instante UTC pero no la hora de pared.
//
// Una «sesión» es un instante, no un día de la semana: la clase muestra de un prospecto ocupa un lugar en UNA sesión.

import { horaDeMinutos, nombreDeDia } from "../lib/horario.ts";
import { instanteLocal, partesLocales } from "../mensajeria/reglas.ts";

export interface HorarioDeGrupo {
  /** 0 = domingo … 6 = sábado. */
  dia_semana: number;
  /** Minutos desde la medianoche local de la sucursal. */
  hora_inicio_min: number;
}

const MINUTO_MS = 60_000;
const DIA_MS = 24 * 60 * MINUTO_MS;

/**
 * El instante en que, en esa zona, es esa fecha de calendario a esa hora de pared. `null` si esa hora no existe ese día
 * (el salto de primavera se la salta). Si existe dos veces (el retroceso de otoño) es la primera: la sesión canónica.
 */
export function instanteDeSesion(anio: number, mes: number, dia: number, minutos: number, zona: string): Date | null {
  const i = instanteLocal(anio, mes, dia, minutos, zona);
  const p = partesLocales(i, zona);
  return p.anio === anio && p.mes === mes && p.dia === dia && p.minutos === minutos ? i : null;
}

/** ¿Ese instante es exactamente el inicio de una sesión del grupo (día de la semana y hora de pared, en la zona de la sucursal)? */
export function esSesionDelGrupo(fechaHora: Date, horarios: readonly HorarioDeGrupo[], zona: string): boolean {
  if (Number.isNaN(fechaHora.getTime()) || fechaHora.getTime() % MINUTO_MS !== 0) return false;
  const p = partesLocales(fechaHora, zona);
  if (!horarios.some((h) => h.dia_semana === p.diaSemana && h.hora_inicio_min === p.minutos)) return false;
  // Canónica: la otra de las dos veces que existe una hora del retroceso de otoño no es una sesión.
  return instanteDeSesion(p.anio, p.mes, p.dia, p.minutos, zona)?.getTime() === fechaHora.getTime();
}

/**
 * Las sesiones del grupo con `desde <= inicio <= hasta`, en orden y sin repetir (dos franjas que dieran el mismo instante
 * cuentan una vez). Recorre los días de calendario LOCALES, no bloques de 24 h: así sobrevive al cambio de horario.
 */
export function sesionesEntre(horarios: readonly HorarioDeGrupo[], zona: string, desde: Date, hasta: Date): Date[] {
  if (hasta.getTime() < desde.getTime() || horarios.length === 0) return [];
  const primero = partesLocales(desde, zona);
  // Un día de margen a cada lado cubre cualquier desfase de la zona.
  const dias = Math.ceil((hasta.getTime() - desde.getTime()) / DIA_MS) + 3;
  const salida = new Map<number, Date>();
  for (let i = -1; i <= dias; i++) {
    const dia = new Date(Date.UTC(primero.anio, primero.mes - 1, primero.dia + i));
    for (const h of horarios) {
      if (dia.getUTCDay() !== h.dia_semana) continue;
      const inicio = instanteDeSesion(dia.getUTCFullYear(), dia.getUTCMonth() + 1, dia.getUTCDate(), h.hora_inicio_min, zona);
      if (inicio && inicio.getTime() >= desde.getTime() && inicio.getTime() <= hasta.getTime()) salida.set(inicio.getTime(), inicio);
    }
  }
  return [...salida.values()].sort((a, b) => a.getTime() - b.getTime());
}

export interface DescripcionDeSesion {
  /** «lunes 12 de octubre». */
  fecha: string;
  /** «16:00». */
  hora: string;
  /** «lunes 12 de octubre a las 16:00». */
  completa: string;
}

/** La sesión como texto para el contacto o el maestro, en la hora de pared de la sucursal. Genérico: sin términos de una vertical. */
export function describirSesion(fechaHora: Date, zona: string): DescripcionDeSesion {
  const p = partesLocales(fechaHora, zona);
  const mes = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, p.mes - 1, 15)));
  const fecha = `${nombreDeDia(p.diaSemana)} ${p.dia} de ${mes}`;
  const hora = horaDeMinutos(p.minutos);
  return { fecha, hora, completa: `${fecha} a las ${hora}` };
}

export type ProblemaDeFecha = "no_es_sesion" | "sin_anticipacion" | "fuera_de_horizonte";

/**
 * ¿Se puede agendar una clase muestra en esa sesión? Pura: la fecha tiene que ser una sesión del grupo, empezar al menos
 * `anticipacionMin` después de `ahora` (inclusive: justo con la anticipación mínima ya se puede) y no pasar de `horizonteDias`
 * días (inclusive). Devuelve el problema o null.
 */
export function problemaDeFecha(
  fechaHora: Date,
  e: { ahora: Date; horarios: readonly HorarioDeGrupo[]; zona: string; anticipacionMin: number; horizonteDias: number },
): ProblemaDeFecha | null {
  if (!esSesionDelGrupo(fechaHora, e.horarios, e.zona)) return "no_es_sesion";
  if (fechaHora.getTime() < e.ahora.getTime() + e.anticipacionMin * MINUTO_MS) return "sin_anticipacion";
  if (fechaHora.getTime() > e.ahora.getTime() + e.horizonteDias * DIA_MS) return "fuera_de_horizonte";
  return null;
}

/** Las sesiones que se podrían agendar ahora (con la anticipación y el horizonte de la configuración), en orden. */
export function sesionesAgendables(e: { ahora: Date; horarios: readonly HorarioDeGrupo[]; zona: string; anticipacionMin: number; horizonteDias: number }): Date[] {
  return sesionesEntre(e.horarios, e.zona, new Date(e.ahora.getTime() + e.anticipacionMin * MINUTO_MS), new Date(e.ahora.getTime() + e.horizonteDias * DIA_MS));
}
