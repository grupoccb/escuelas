/** Un entero chico que alguien tecleó (0 a 999), o `null` si no lo es (vacío, letras, negativo, decimal). Nada de dinero: eso va por `lib/dinero.ts`. */
export function aEntero(texto: string): number | null {
  const t = texto.trim();
  return /^\d{1,3}$/.test(t) ? Number(t) : null;
}
