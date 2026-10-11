// Lo que el embudo decide sobre las ETAPAS (R2a), sin React: cuáles son de cierre, de qué tono es cada una, los rótulos de «suelta aquí», qué columnas empiezan plegadas y qué opciones
// ofrece «Mover a…». Las etapas se reconocen por su papel (`tipo_sistema`, `es_ganado`, `es_perdido`), nunca por su nombre (invariante 2).

import type { Etapa } from "../../api/tipos.ts";
import { esEtapaDeInscrito, esEtapaPerdida } from "./inscrito-a-mano.ts";

export type TonoDeEtapa = "neutro" | "exito" | "peligro";

type PapelDeEtapa = Pick<Etapa, "es_ganado" | "es_perdido" | "tipo_sistema">;

export const esDeCierre = (e: PapelDeEtapa): boolean => esEtapaDeInscrito(e) || esEtapaPerdida(e);

/** El tono de la columna: la de inscritos, verde; la de perdidos, rojo; las demás, el del sistema. */
export function tonoDeEtapa(e: PapelDeEtapa): TonoDeEtapa {
  return esEtapaDeInscrito(e) ? "exito" : esEtapaPerdida(e) ? "peligro" : "neutro";
}

/** El rótulo que aparece en la columna sobre la que se va a soltar. */
export function textoDeDestino(e: PapelDeEtapa): string {
  return esEtapaDeInscrito(e) ? "Suelta para inscribir" : esEtapaPerdida(e) ? "Suelta y elige el motivo" : "Suelta para mover aquí";
}

/** Lo que dice una columna sin leads. */
export function textoDeColumnaVacia(e: PapelDeEtapa): string {
  if (esEtapaDeInscrito(e)) return "Suelta aquí un lead para inscribirlo.";
  if (esEtapaPerdida(e)) return "Suelta aquí un lead que ya no sigue.";
  if (e.tipo_sistema === "nuevo") return "Cuando una familia escriba por WhatsApp o llene la página de captación, aparecerá aquí.";
  return "Arrastra aquí un lead para cambiarlo a esta etapa.";
}

/** Las etapas abiertas de la clase muestra en adelante (de la «asistida» hacia el cierre): ahí el segundo botón de la tarjeta inscribe en vez de agendar. Sin etapa «asistida», ninguna. */
export function etapasDespuesDeLaClase(etapas: readonly Etapa[]): Set<string> {
  const base = etapas.find((e) => e.tipo_sistema === "muestra_asistida");
  if (!base) return new Set();
  return new Set(etapas.filter((e) => e.orden >= base.orden && !esDeCierre(e)).map((e) => e.id));
}

/** Lo que hace el botón de acción de la tarjeta y la acción principal de la ficha lateral: se decide aquí para que las dos hablen igual. */
export type AccionDeEtapa = "marcar" | "inscribir" | "agendar" | "cambiar-clase";

/**
 * La acción que toca a un lead ABIERTO según dónde va: con la inscripción apagada, marcarlo como inscrito a mano (V10b); de la clase muestra asistida en adelante, inscribirlo; antes de eso,
 * agendar su clase (o cambiarla si ya tiene una agendada). `null` si no hay nada que ofrecerle (un lead de cierre, o sin el permiso o el módulo que hace falta).
 */
export function accionDeEtapa(o: { cerrada: boolean; puedeMarcar: boolean; despuesDeLaClase: boolean; puedeInscribir: boolean; puedeAgendar: boolean; tieneClaseAgendada: boolean }): AccionDeEtapa | null {
  if (o.cerrada) return null;
  if (o.puedeMarcar) return "marcar";
  if (o.despuesDeLaClase) return o.puedeInscribir ? "inscribir" : null;
  if (o.puedeAgendar) return o.tieneClaseAgendada ? "cambiar-clase" : "agendar";
  return null;
}

/** La etapa a la que vuelve un lead que se recupera desde la ficha: la de «contactado» y, si la escuela no la tiene, la primera abierta por orden. `undefined` si no hay ninguna abierta. */
export function etapaDeRecuperacion(etapas: readonly Etapa[]): Etapa | undefined {
  return etapas.find((e) => e.tipo_sistema === "contactado") ?? [...etapas].sort((a, b) => a.orden - b.orden).find((e) => !esDeCierre(e));
}

// ─── Columnas plegadas ────────────────────────────────────────────────────────────────────────

export const CLAVE_DE_PLEGADAS = "embudo.plegadas";

/** Lo que la persona dejó plegado o desplegado, leído del almacenamiento del navegador; cualquier cosa rara se ignora. */
export function leerPlegadas(texto: string | null): Record<string, boolean> {
  if (!texto) return {};
  try {
    const valor: unknown = JSON.parse(texto);
    if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return {};
    const salida: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(valor)) if (typeof v === "boolean") salida[k] = v;
    return salida;
  } catch {
    return {};
  }
}

/**
 * ¿La columna va plegada? Gana lo que la persona eligió; sin elección, las de cierre empiezan plegadas. Una columna a la que ACABA de llegar un lead (`reveladas`) se muestra para que se vea
 * dónde quedó, sin cambiar lo que la persona dejó elegido.
 */
export function estaPlegada(e: Etapa, elegidas: Readonly<Record<string, boolean>>, reveladas: ReadonlySet<string> = new Set()): boolean {
  if (reveladas.has(e.id)) return false;
  return elegidas[e.id] ?? esDeCierre(e);
}

// ─── Mover a… (menú de la barra de selección y hoja de una tarjeta) ───────────────────────────

export interface OpcionDeMover {
  etapaId: string;
  nombre: string;
  deshabilitada: boolean;
  /** Texto corto a la derecha: «Pide el motivo», «Abre la inscripción», «De una en una», «Aquí está». */
  nota: string;
}

/**
 * Las etapas que ofrece «Mover a…» para `cantidad` leads. Con más de uno, «Inscrito» se deshabilita (la inscripción es de una familia a la vez). En la hoja de UNA tarjeta, la etapa en que
 * ya está (`actualId`) aparece deshabilitada con «Aquí está».
 */
export function opcionesDeMover(etapas: readonly Etapa[], cantidad: number, actualId?: string): OpcionDeMover[] {
  return etapas.map((e) => {
    if (e.id === actualId) return { etapaId: e.id, nombre: e.nombre, deshabilitada: true, nota: "Aquí está" };
    if (esEtapaDeInscrito(e)) return cantidad > 1 ? { etapaId: e.id, nombre: e.nombre, deshabilitada: true, nota: "De una en una" } : { etapaId: e.id, nombre: e.nombre, deshabilitada: false, nota: "Abre la inscripción" };
    if (esEtapaPerdida(e)) return { etapaId: e.id, nombre: e.nombre, deshabilitada: false, nota: "Pide el motivo" };
    return { etapaId: e.id, nombre: e.nombre, deshabilitada: false, nota: "" };
  });
}

// ─── Indicadores ──────────────────────────────────────────────────────────────────────────────

export interface Indicadores {
  abiertos: number;
  inscritos: number;
  /** Los que siguen en la primera etapa (la de `tipo_sistema` «nuevo» o, si no hay, la primera por orden); `null` si no hay etapas. */
  nuevos: number | null;
  /** Los de la etapa de clase muestra agendada; `null` si la escuela no tiene esa etapa. */
  clasesAgendadas: number | null;
}

export function contarIndicadores(etapas: readonly Etapa[], leads: readonly { etapa_id: string }[]): Indicadores {
  const porEtapa = new Map<string, number>();
  for (const l of leads) porEtapa.set(l.etapa_id, (porEtapa.get(l.etapa_id) ?? 0) + 1);
  const cuantos = (e: Etapa | undefined): number | null => (e ? (porEtapa.get(e.id) ?? 0) : null);
  const primera = etapas.find((e) => e.tipo_sistema === "nuevo") ?? [...etapas].sort((a, b) => a.orden - b.orden).find((e) => !esDeCierre(e));
  const agendada = etapas.find((e) => e.tipo_sistema === "muestra_agendada");
  const cerradas = new Set(etapas.filter(esDeCierre).map((e) => e.id));
  return {
    abiertos: leads.filter((l) => !cerradas.has(l.etapa_id)).length,
    inscritos: cuantos(etapas.find(esEtapaDeInscrito)) ?? 0,
    nuevos: cuantos(primera),
    clasesAgendadas: cuantos(agendada),
  };
}
