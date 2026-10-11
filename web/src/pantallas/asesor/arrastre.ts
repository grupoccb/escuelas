// Arrastrar y soltar en el embudo (R2a): la parte PURA. El gesto lo manejan los pointer events de `useArrastre.ts` (solo ratón: en táctil se usa «Mover de etapa»); aquí viven las
// decisiones que se prueban sin navegador: qué ids viajan, sobre qué columna se está, cuándo empieza el arrastre y hacia dónde se desplaza el tablero.

/** El rectángulo de una columna en la ventana (lo que da `getBoundingClientRect`). */
export interface CajaDeColumna {
  id: string;
  izquierda: number;
  derecha: number;
  arriba: number;
  abajo: number;
}

/** Cuánto hay que mover el ratón (en píxeles, sumando los dos ejes) para que un clic se vuelva arrastre. */
export const UMBRAL_DE_ARRASTRE = 6;
/** A cuántos píxeles del borde del tablero empieza a desplazarse solo, y cuánto avanza en cada cuadro. */
export const BORDE_DE_AUTODESPLAZAMIENTO = 80;
export const PASO_DE_AUTODESPLAZAMIENTO = 18;

/** ¿Ya se movió lo bastante desde donde se presionó para considerarlo un arrastre y no un clic? */
export function superaElUmbral(dx: number, dy: number, umbral: number = UMBRAL_DE_ARRASTRE): boolean {
  return Math.abs(dx) + Math.abs(dy) >= umbral;
}

/** La columna que está bajo el punto (x, y); `null` si el puntero no está sobre ninguna. Si dos se tocan, gana la primera de la lista. */
export function columnaBajo(cajas: readonly CajaDeColumna[], x: number, y: number): string | null {
  for (const c of cajas) if (x >= c.izquierda && x <= c.derecha && y >= c.arriba && y <= c.abajo) return c.id;
  return null;
}

/**
 * Los ids que viajan al arrastrar la tarjeta `id`: si está seleccionada, TODA la selección (en el orden de `ordenVisible`, para que la pila y los mensajes salgan siempre igual);
 * si no, solo ella. Una selección que ya no se ve (la filtraron) no viaja.
 */
export function idsAArrastrar(id: string, seleccion: ReadonlySet<string>, ordenVisible: readonly string[]): string[] {
  if (!seleccion.has(id)) return [id];
  const lista = ordenVisible.filter((x) => seleccion.has(x));
  return lista.includes(id) ? lista : [id];
}

/** Cuánto desplazar el tablero (negativo = a la izquierda, 0 = nada) según dónde está el puntero respecto a sus bordes. */
export function pasoDeAutodesplazamiento(x: number, tablero: { izquierda: number; derecha: number }, borde: number = BORDE_DE_AUTODESPLAZAMIENTO, paso: number = PASO_DE_AUTODESPLAZAMIENTO): number {
  if (x > tablero.derecha - borde) return paso;
  if (x < tablero.izquierda + borde) return -paso;
  return 0;
}

/** Dónde queda la esquina de la tarjeta fantasma: el puntero menos el punto de la tarjeta donde se agarró. */
export function posicionDelFantasma(puntero: { x: number; y: number }, agarre: { dx: number; dy: number }): { x: number; y: number } {
  return { x: puntero.x - agarre.dx, y: puntero.y - agarre.dy };
}
