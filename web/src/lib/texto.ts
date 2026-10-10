// Buscar como lo haría una persona: sin importar mayúsculas ni acentos («ANGEL» encuentra a «Ángel»). Es la misma regla que `src/lib/texto.ts` del servidor, para los buscadores que
// filtran lo que ya está en pantalla (la lista de pantallas de Administración, de usuarios, de grupos…).

/** Minúsculas y sin acentos ni diéresis (la «ñ» queda «n»). */
export function plegar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** ¿Cada palabra de `busqueda` aparece (plegada) en `pajar`? Una búsqueda vacía coincide con todo. */
export function coincide(pajar: string, busqueda: string): boolean {
  const palabras = plegar(busqueda).split(/\s+/).filter(Boolean);
  const base = plegar(pajar);
  return palabras.every((p) => base.includes(p));
}
