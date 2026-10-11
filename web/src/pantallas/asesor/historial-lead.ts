// El historial de etapas de un lead (`GET /api/leads/:id/historial`): su forma, cómo se dicen los motivos en palabras de la escuela y la línea de tiempo de la ficha lateral (R2b).
// La ficha completa (`FichaLead.tsx`) y la ficha lateral del embudo leen el MISMO endpoint; aquí vive lo que comparten. Sin React: se prueba con `node --test`.

import type { Etapa } from "../../api/tipos.ts";
import { esEtapaDeInscrito } from "./inscrito-a-mano.ts";

export interface Historial {
  etapa_actual: string;
  /** V10b: hoy está inscrito a mano (sin inscripción real). */
  inscrito_a_mano: { por: { id: string; nombre: string } | null; en: string } | null;
  /** V10b: fechas de las inscripciones reales del lead (solo con el módulo de inscripción encendido). */
  inscripciones: { fecha: string }[];
  cambios: { id: string; a_mano: boolean; desde: { id: string; nombre: string | null } | null; hacia: { id: string; nombre: string | null }; origen: string; usuario: { id: string; nombre: string } | null; motivo: string; motivo_perdida: { id: string; nombre: string } | null; nota: string | null; es_recuperacion: boolean; creado_en: string }[];
}

/** El motivo del cambio de etapa, en palabras de la escuela (V10b agrega los de «a mano»). */
const MOTIVOS_DE_CAMBIO: Record<string, string> = { inscripcion_a_mano: "marcado a mano", correccion_de_inscrito_a_mano: "corrección de una inscripción a mano", inscripcion: "inscripción" };
export const textoDeMotivo = (motivo: string): string => MOTIVOS_DE_CAMBIO[motivo] ?? motivo.replace(/_/g, " ");

/** Un punto de la línea de tiempo: qué pasó, las notas que lo acompañan, quién lo hizo y cuándo (instante ISO o fecha). */
export interface ItemDeLinea {
  id: string;
  titulo: string;
  notas: string[];
  quien: string;
  cuando: string;
}

/**
 * La línea de tiempo de la ficha lateral: lo más reciente primero (la API entrega lo más antiguo primero). Cada cambio dice a qué etapa pasó; un movimiento a la etapa de inscrito, que se inscribió;
 * un lead que vuelve de perdidos, que se recuperó. Las inscripciones registradas en el sistema entran en su fecha.
 */
export function lineaDeTiempo(h: Historial, etapas: readonly Etapa[]): ItemDeLinea[] {
  const inscrita = new Set(etapas.filter(esEtapaDeInscrito).map((e) => e.id));
  const cambios: ItemDeLinea[] = h.cambios.map((c) => {
    const hacia = c.hacia.nombre ?? "—";
    let titulo = c.desde === null ? `Llegó a ${hacia}` : `Pasó a ${hacia}`;
    if (c.a_mano) titulo = "Se marcó como inscrito a mano";
    else if (inscrita.has(c.hacia.id) && c.desde !== null) titulo = "Se inscribió";
    else if (c.es_recuperacion) titulo = `Se recuperó: pasó a ${hacia}`;
    const notas = [c.motivo_perdida ? `Motivo: ${c.motivo_perdida.nombre}` : null, c.nota].filter((x): x is string => x !== null && x.trim() !== "");
    return { id: c.id, titulo, notas, quien: c.origen === "sistema" ? "Automático" : (c.usuario?.nombre ?? "Una persona"), cuando: c.creado_en };
  });
  const inscripciones: ItemDeLinea[] = h.inscripciones.map((i, n) => ({ id: `inscripcion-${n}`, titulo: "Inscripción registrada en el sistema", notas: [], quien: "Sistema", cuando: i.fecha }));
  return [...cambios, ...inscripciones].map((x, orden) => ({ x, orden })).sort((a, b) => Date.parse(b.x.cuando) - Date.parse(a.x.cuando) || b.orden - a.orden).map(({ x }) => x);
}

/** «hoy», «ayer» o «hace N días». */
export function haceTexto(dias: number): string {
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}
