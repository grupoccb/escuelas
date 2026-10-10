// Qué parece lo que se escribió en el buscador de familias. La búsqueda la hace el servidor: el teléfono pasa por `normalizarTelefono()` allá (invariante 7); aquí solo se decide si
// lo escrito parece un teléfono o un nombre. Nada de esto toca el FORMATO de un teléfono.

/** ¿Lo escrito es un teléfono? Solo dígitos y signos de teléfono, y al menos siete dígitos. */
export function pareceTelefono(texto: string): boolean {
  const t = texto.trim();
  return /^[\d\s()+\-.]+$/.test(t) && t.replace(/\D/g, "").length >= 7;
}

/** ¿Solo hay dígitos y signos de teléfono (sin una sola letra)? Entonces quien escribe busca por teléfono, aunque le falten dígitos: un número no es un nombre. */
export const soloTelefono = (texto: string): boolean => /^[\d\s()+\-.]+$/.test(texto.trim());
