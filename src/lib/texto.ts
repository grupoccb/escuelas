// Comparar texto como lo haría una persona en el mostrador: sin importar mayúsculas ni acentos («ANGEL» encuentra a «Ángel», «nunez» a «Núñez»). Una sola función para
// toda búsqueda por nombre; el formato de los teléfonos NO pasa por aquí (invariante 7: `normalizarTelefono()`).

/** Minúsculas y sin acentos ni diéresis (la «ñ» queda «n»): lo que se compara en una búsqueda por nombre. */
export function plegar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** ¿Cada palabra de `busqueda` aparece (plegada) en `pajar`? Una búsqueda vacía coincide con todo. Se usan a lo más `maxPalabras` palabras. */
export function contieneTodas(pajar: string, busqueda: string, maxPalabras = 6): boolean {
  const palabras = plegar(busqueda).split(/\s+/).filter(Boolean).slice(0, maxPalabras);
  const base = plegar(pajar);
  return palabras.every((p) => base.includes(p));
}
