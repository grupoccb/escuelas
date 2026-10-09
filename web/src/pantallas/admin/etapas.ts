// Reglas puras de la pantalla «Etapas del embudo» (V5): qué movimientos de orden permite el servidor. Se repiten aquí solo para apagar los botones que no llevan a nada; el servidor es el que manda.
// El lead solo avanza por orden y el sistema busca cada etapa por su papel, así que las etapas de sistema conservan su orden entre sí y las de cierre (inscrito, perdido) van al final.

export interface EtapaDeLista {
  id: string;
  nombre: string;
  orden: number;
  tipo_sistema: string | null;
  es_ganado: boolean;
  es_perdido: boolean;
  dias_alerta_sin_movimiento: number | null;
}

export const esDeCierre = (e: Pick<EtapaDeLista, "es_ganado" | "es_perdido" | "tipo_sistema">): boolean => e.es_ganado || e.es_perdido || e.tipo_sistema === "inscrito" || e.tipo_sistema === "perdido";
export const esPropia = (e: Pick<EtapaDeLista, "es_ganado" | "es_perdido" | "tipo_sistema">): boolean => e.tipo_sistema === null && !esDeCierre(e);

/** ¿Es válido este orden? (las de sistema entre sí intactas; las de cierre al final). */
export function ordenValido(antes: readonly EtapaDeLista[], despues: readonly EtapaDeLista[]): boolean {
  const sis = (l: readonly EtapaDeLista[]) => l.filter((e) => e.tipo_sistema !== null).map((e) => e.id).join();
  if (sis(antes) !== sis(despues)) return false;
  const primera = despues.findIndex(esDeCierre);
  return primera === -1 || despues.slice(primera).every(esDeCierre);
}

/** La lista con la etapa `i` movida `delta` lugares, o `null` si el servidor no lo aceptaría. */
export function moverEtapa(lista: readonly EtapaDeLista[], i: number, delta: -1 | 1): EtapaDeLista[] | null {
  const j = i + delta;
  if (i < 0 || j < 0 || j >= lista.length) return null;
  const nueva = [...lista];
  [nueva[i], nueva[j]] = [nueva[j]!, nueva[i]!];
  return ordenValido(lista, nueva) ? nueva : null;
}
