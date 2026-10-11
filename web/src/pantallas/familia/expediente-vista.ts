// Lo que dice el expediente del alumno (R6a): el estado del encabezado, la línea de tiempo de la trayectoria, las celdas de las últimas clases y el aviso de faltas. Lógica pura, con su
// prueba: sin React ni red. Las fechas son `AAAA-MM-DD` (texto) y se escriben con `lib/fechas.ts`.

import { formatearDiaYMes } from "../../lib/fechas.ts";
import { porcentajeEntero } from "./alumnos-vista.ts";
import type { Comercial, InscripcionDeExpediente, Operativo, Trayectoria } from "./tipos.ts";
import { textoDeElegibilidad, textoLegible } from "./vista.ts";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"] as const;

/** «2026-08-03» → «3 ago». */
export function diaCorto(fecha: string): string {
  const x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!x) return fecha;
  return `${Number(x[3])} ${MESES_CORTOS[Number(x[2]) - 1] ?? "?"}`;
}

export type TonoDeEstado = "exito" | "info" | "peligro";

/** El estado del alumno en palabras, para la píldora del encabezado: «Activo desde el 3 de marzo», «Congelado», «Baja desde el 1 de noviembre». */
export function estadoDelAlumno(estatus: "activo" | "baja" | "congelado", t: Pick<Trayectoria, "fecha_de_inicio" | "inscripciones">, hoy: string): { texto: string; tono: TonoDeEstado } {
  if (estatus === "congelado") return { texto: "Congelado", tono: "info" };
  if (estatus === "baja") {
    const baja = t.inscripciones.map((i) => i.fecha_baja).filter((f): f is string => f !== null).sort().at(-1);
    return { texto: baja ? `Baja desde el ${formatearDiaYMes(baja, hoy)}` : "Baja", tono: "peligro" };
  }
  return { texto: t.fecha_de_inicio ? `Activo desde el ${formatearDiaYMes(t.fecha_de_inicio, hoy)}` : "Activo", tono: "exito" };
}

/** Las inscripciones que dan o guardan un lugar (activas y congeladas). */
export const vigentes = (t: Pick<Trayectoria, "inscripciones">): InscripcionDeExpediente[] => t.inscripciones.filter((i) => i.estatus !== "baja");

export interface HitoDeTrayectoria {
  clave: string;
  titulo: string;
  detalle: string;
  /** `AAAA-MM-DD`, para ordenar. */
  fecha: string;
}

/**
 * La trayectoria como línea de tiempo, lo más reciente primero: cuándo se inscribió (en el grupo en que entró), cada cambio de grupo, cada nivel que alcanzó, los eventos a los que ya
 * llegó o faltó y la baja con su motivo. Todo sale del expediente: no se inventa ningún hito.
 */
export function lineaDeTiempo(t: Trayectoria, extras: { eventos?: Operativo["eventos"]; bajas?: Comercial["motivo_de_baja"]; hoy: string }): HitoDeTrayectoria[] {
  const hitos: HitoDeTrayectoria[] = [];
  const dia = (f: string): string => formatearDiaYMes(f, extras.hoy);
  const cambios = [...t.historial_de_cambios_de_grupo].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  for (const i of t.inscripciones) {
    // El grupo en que entró es el de antes de su primer cambio; si nunca cambió, el de ahora.
    const primero = cambios.find((c) => c.inscripcion_id === i.id);
    const grupoDeEntrada = primero?.grupo_anterior?.nombre ?? i.grupo.nombre;
    hitos.push({ clave: `alta-${i.id}`, titulo: `Se inscribió en ${grupoDeEntrada}`, detalle: `${dia(i.fecha_inicio)} · ${i.programa.nombre} · ${i.sucursal.nombre}`, fecha: i.fecha_inicio });
    if (i.fecha_baja) {
      const motivo = extras.bajas?.find((b) => b.inscripcion_id === i.id)?.motivo?.nombre;
      hitos.push({ clave: `baja-${i.id}`, titulo: `Se dio de baja de ${i.grupo.nombre}`, detalle: motivo ? `${dia(i.fecha_baja)} · ${motivo}` : dia(i.fecha_baja), fecha: i.fecha_baja });
    }
  }
  cambios.forEach((c, n) => hitos.push({ clave: `cambio-${c.inscripcion_id}-${n}`, titulo: `Cambió de ${c.grupo_anterior?.nombre ?? "—"} a ${c.grupo_nuevo?.nombre ?? "—"}`, detalle: dia(c.fecha), fecha: c.fecha }));
  for (const n of t.niveles) {
    if (n.nivel && n.fecha_obtenido) hitos.push({ clave: `nivel-${n.vertical.id}`, titulo: `Pasó a ${n.nivel.nombre}`, detalle: `${n.vertical.etiqueta_progresion ?? "Nivel"} en ${n.vertical.nombre} · ${dia(n.fecha_obtenido)}`, fecha: n.fecha_obtenido });
  }
  for (const e of extras.eventos ?? []) {
    if (e.estatus !== "asistio" && e.estatus !== "no_asistio") continue;
    const resultado = [e.resultado ? textoLegible(e.resultado) : "", e.nivel_otorgado?.nombre ?? ""].filter(Boolean).join(" · ");
    hitos.push({ clave: `evento-${e.evento.id}`, titulo: `${e.estatus === "asistio" ? "Asistió a" : "No asistió a"} ${e.evento.nombre}`, detalle: resultado ? `${dia(e.evento.fecha)} · ${resultado}` : dia(e.evento.fecha), fecha: e.evento.fecha });
  }
  // Lo más reciente primero; a igual fecha, el orden en que se fueron armando (la alta antes que un cambio del mismo día).
  return hitos.map((h, i) => ({ h, i })).sort((a, b) => (a.h.fecha < b.h.fecha ? 1 : a.h.fecha > b.h.fecha ? -1 : a.i - b.i)).map((x) => x.h);
}

export type MarcaDeClase = "presente" | "falta" | "justificada";

export interface CeldaDeClase {
  fecha: string;
  dia: string;
  marca: "Presente" | "Falta" | "Justificada";
  tono: "exito" | "peligro" | "info";
  /** Para el `title` y para quien lee: «3 ago: Presente». */
  titulo: string;
}

const MARCAS: Record<MarcaDeClase, Pick<CeldaDeClase, "marca" | "tono">> = {
  presente: { marca: "Presente", tono: "exito" },
  falta: { marca: "Falta", tono: "peligro" },
  justificada: { marca: "Justificada", tono: "info" },
};

export const CLASES_A_MOSTRAR = 16;

/** Las últimas clases con pase de lista (de todas las inscripciones vigentes), la más antigua primero, como en el prototipo. `filas` en cualquier orden. */
export function celdasDeClases(filas: readonly { fecha: string; estatus: string }[], cuantas = CLASES_A_MOSTRAR): CeldaDeClase[] {
  return [...filas]
    .filter((f) => f.estatus in MARCAS)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
    .slice(0, cuantas)
    .reverse()
    .map((f) => {
      const m = MARCAS[f.estatus as MarcaDeClase];
      return { fecha: f.fecha, dia: diaCorto(f.fecha), marca: m.marca, tono: m.tono, titulo: `${diaCorto(f.fecha)}: ${m.marca}` };
    });
}

/** El aviso de faltas seguidas: solo al llegar al umbral (el sistema crea entonces la tarea para el asesor). */
export function avisoDeFaltas(racha: number, umbral: number): string | null {
  if (umbral < 1 || racha < umbral) return null;
  return `Lleva ${racha} ${racha === 1 ? "falta seguida" : "faltas seguidas"}. Se creó una tarea para que el asesor hable con la familia.`;
}

/** «62 % asistencia»: el porcentaje de 30 días como entero, o «—» sin dato. */
export function textoDeAsistencia(valor: number | string | null | undefined): string {
  const p = porcentajeEntero(valor);
  return p === null ? "—" : `${p} %`;
}

/** Cuánto lleva de las clases que pide el próximo evento, como porcentaje entero (0 a 100); `null` si no se piden clases. */
export function avanceHaciaElEvento(e: { clases_cumplidas: number; clases_requeridas: number }): number | null {
  if (e.clases_requeridas <= 0) return null;
  return Math.min(100, Math.floor((e.clases_cumplidas * 100) / e.clases_requeridas));
}

/** El renglón del próximo evento: «Próximo examen: Examen de otoño · jueves 20 de noviembre. Le faltan 4 clases (8 de 12).». Sin evento y sin clases requeridas, no hay nada que decir. */
export function textoDeProximoEvento(p: Trayectoria["proximo_examen"][number], formatearFechaLarga: (f: string) => string): string | null {
  const etiqueta = p.vertical.etiqueta_evento ?? "evento";
  const clases = p.evento || p.elegibilidad.clases_requeridas > 0 ? textoDeElegibilidad(p.elegibilidad) : "";
  if (!p.evento && clases === "") return null;
  const evento = p.evento ? `Próximo ${etiqueta.toLowerCase()}: ${p.evento.nombre} · ${formatearFechaLarga(p.evento.fecha)}.` : `Sin ${etiqueta.toLowerCase()} próximo.`;
  return clases === "" ? evento : `${evento} ${clases}.`;
}
