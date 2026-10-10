// Marcar a un lead como inscrito a mano (V10b): cuándo se ofrece y qué se le pide. La regla vive en el servidor (`src/embudo/transiciones.ts`); aquí solo se anticipa
// para no ofrecer un botón que el servidor va a rechazar.

import type { Etapa } from "../../api/tipos.ts";

/** Mismo mínimo que el servidor (`LARGO_MINIMO_NOTA_A_MANO`). */
export const LARGO_MINIMO_NOTA = 10;
export const LARGO_MAXIMO_NOTA = 1000;

export const esEtapaDeInscrito = (e: Pick<Etapa, "es_ganado" | "tipo_sistema">): boolean => e.es_ganado || e.tipo_sistema === "inscrito";
export const esEtapaPerdida = (e: Pick<Etapa, "es_perdido" | "tipo_sistema">): boolean => e.es_perdido || e.tipo_sistema === "perdido";

/** La etapa de inscrito de la escuela (por su papel, nunca por su nombre). */
export const etapaDeInscrito = (etapas: readonly Etapa[]): Etapa | undefined => etapas.find((e) => e.tipo_sistema === "inscrito") ?? etapas.find((e) => e.es_ganado);

/**
 * ¿Se ofrece «Marcar como inscrito»? Solo con la inscripción APAGADA (con ella encendida se inscribe desde la ficha), para quien puede escribir leads, y mientras el lead siga en
 * una etapa abierta: uno ya inscrito no necesita marcarse y uno perdido primero se recupera.
 */
export function sePuedeMarcarComoInscrito(o: { inscripcionEncendida: boolean; puedeEscribir: boolean; etapaActual: Pick<Etapa, "es_ganado" | "es_perdido" | "tipo_sistema"> | undefined }): boolean {
  if (o.inscripcionEncendida || !o.puedeEscribir || !o.etapaActual) return false;
  return !esEtapaDeInscrito(o.etapaActual) && !esEtapaPerdida(o.etapaActual);
}

/** Qué falta en la nota (null si está bien): el mismo criterio que el servidor, con el mismo texto. */
export function problemaDeNota(nota: string): string | null {
  const t = nota.trim();
  if (t === "") return "Escribe cómo se inscribió";
  if (t.length < LARGO_MINIMO_NOTA) return `Cuenta un poco más: la nota necesita al menos ${LARGO_MINIMO_NOTA} caracteres`;
  if (t.length > LARGO_MAXIMO_NOTA) return `La nota es muy larga: máximo ${LARGO_MAXIMO_NOTA} caracteres`;
  return null;
}
