// Lógica pura de las pantallas de administración (con su prueba): horas, formularios y textos. Sin React ni red.

import { horaDeMinutos } from "../../lib/fechas.ts";
import type { LimiteDeAjuste } from "./tipos.ts";

export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;

/** «16:30» → 990. `null` si no es una hora del día. */
export function minutosDeHora(texto: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : null;
}

export interface FilaDeHorario {
  dia: string;
  inicio: string;
  fin: string;
}

export interface HorarioCrudo {
  dia_semana: number;
  hora_inicio_min: number;
  hora_fin_min: number;
}

/** Los horarios escritos en pantalla → los que manda la API, o los errores por fila (`horarios[i]`). */
export function horariosParaApi(filas: readonly FilaDeHorario[]): { horarios: HorarioCrudo[]; errores: Record<number, string> } {
  const horarios: HorarioCrudo[] = [];
  const errores: Record<number, string> = {};
  filas.forEach((f, i) => {
    const inicio = minutosDeHora(f.inicio);
    const fin = minutosDeHora(f.fin);
    const dia = Number(f.dia);
    if (f.dia === "" || !Number.isInteger(dia) || dia < 0 || dia > 6) errores[i] = "Elige el día";
    else if (inicio === null || fin === null) errores[i] = "Escribe las horas como 16:00";
    else if (inicio >= fin) errores[i] = "La hora de inicio debe ser antes que la de fin";
    else horarios.push({ dia_semana: dia, hora_inicio_min: inicio, hora_fin_min: fin });
  });
  return { horarios, errores };
}

export const filaDeHorario = (h: HorarioCrudo): FilaDeHorario => ({ dia: String(h.dia_semana), inicio: horaDeMinutos(h.hora_inicio_min), fin: horaDeMinutos(h.hora_fin_min) });

/** «Lun, Mié 16:00–17:00» agrupando los días con la misma franja. */
export function resumenDeHorarios(hs: readonly HorarioCrudo[]): string {
  if (hs.length === 0) return "Sin horario";
  const porFranja = new Map<string, number[]>();
  for (const h of [...hs].sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio_min - b.hora_inicio_min)) {
    const k = `${horaDeMinutos(h.hora_inicio_min)}–${horaDeMinutos(h.hora_fin_min)}`;
    porFranja.set(k, [...(porFranja.get(k) ?? []), h.dia_semana]);
  }
  return [...porFranja].map(([franja, dias]) => `${dias.map((d) => (DIAS[d] ?? "?").slice(0, 3)).join(", ")} ${franja}`).join(" · ");
}

/** Un entero que alguien tecleó (con signo opcional), o `null` si no lo es. */
export function enteroDe(texto: string, min: number, max: number): number | null {
  const t = texto.trim();
  if (!/^-?\d{1,9}$/.test(t)) return null;
  const n = Number(t);
  return n >= min && n <= max ? n : null;
}

/** `#RRGGBB` válido (con o sin la almohadilla) → con almohadilla y en mayúsculas; `null` si no. Vacío = sin color (`""`). */
export function colorDe(texto: string): string | null | "" {
  const t = texto.trim();
  if (t === "") return "";
  const con = t.startsWith("#") ? t : `#${t}`;
  return /^#[0-9A-Fa-f]{6}$/.test(con) ? con.toUpperCase() : null;
}

/** «lunes 7 a 8:30» no: aquí solo las horas de envío de una automatización (minutos desde la medianoche) en 09:00–20:00. */
export const ENVIO_MIN = 540;
export const ENVIO_MAX = 1200;
export function horarioDeEnvio(inicio: string, fin: string): { inicio: number; fin: number } | string {
  const i = minutosDeHora(inicio);
  const f = minutosDeHora(fin);
  if (i === null || f === null) return "Escribe las horas como 09:00";
  if (i < ENVIO_MIN || f > ENVIO_MAX) return "Los mensajes solo salen entre las 09:00 y las 20:00";
  if (i >= f) return "La hora de inicio debe ser antes que la de fin";
  return { inicio: i, fin: f };
}

/** Un ajuste de la configuración tal como lo escribió la escuela: su valor, o lo que debe corregir (con el mismo rango que impone el servidor y la base). */
export function problemaDeAjuste(l: Pick<LimiteDeAjuste, "min" | "max" | "unidad">, texto: string): { valor: number } | { error: string } {
  if (l.unidad === "hora_del_dia") {
    const m = minutosDeHora(texto);
    if (m === null) return { error: "Escribe la hora completa, por ejemplo 09:00" };
    if (m < l.min || m > l.max) return { error: `Los mensajes automáticos solo pueden salir entre las 09:00 y las 20:00. Elige una hora de ${horaDeMinutos(l.min)} a ${horaDeMinutos(l.max)}.` };
    return { valor: m };
  }
  const n = enteroDe(texto, l.min, l.max);
  return n === null ? { error: `Escribe un número de ${l.min} a ${l.max}` } : { valor: n };
}
