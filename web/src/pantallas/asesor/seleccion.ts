// La selección en lote del embudo (R2a), sin React: un conjunto de ids de lead. Las funciones devuelven un conjunto NUEVO (el estado de React no se muta).

/** Agrega el id si no está y lo quita si ya estaba. */
export function alternar(seleccion: ReadonlySet<string>, id: string): Set<string> {
  const nueva = new Set(seleccion);
  if (nueva.has(id)) nueva.delete(id);
  else nueva.add(id);
  return nueva;
}

/** Deja solo los ids que siguen a la vista (los que un filtro, otra sucursal o una recarga ya no muestran, se sueltan). Devuelve el MISMO conjunto si no cambia nada. */
export function depurar(seleccion: ReadonlySet<string>, visibles: ReadonlySet<string>): ReadonlySet<string> {
  let sobra = false;
  for (const id of seleccion) if (!visibles.has(id)) sobra = true;
  if (!sobra) return seleccion;
  return new Set([...seleccion].filter((id) => visibles.has(id)));
}

/** «seleccionado» / «seleccionados» para el conteo de la barra. */
export const palabraDeSeleccion = (cantidad: number): string => (cantidad === 1 ? "seleccionado" : "seleccionados");

/** El resumen de lo que pasó al mover varios leads (el aviso «ya quedó»). */
export function avisoDeMovimiento(o: { nombre: string; cantidad: number; etapa: string }): string {
  return o.cantidad === 1 ? `${o.nombre} pasó a ${o.etapa}.` : `${o.cantidad} leads pasaron a ${o.etapa}.`;
}
