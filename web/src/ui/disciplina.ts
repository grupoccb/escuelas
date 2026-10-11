// Lo que no necesita React del color por disciplina y de las iniciales (R1, handoff v2). Vive aparte de `disciplina.tsx` para probarse con `node:test` (que no lee JSX).

const PALABRAS_MENORES = new Set(["de", "del", "la", "las", "los", "el", "y", "e"]);

/** Las iniciales de un nombre (hasta dos): «Escuela de prueba» → «EP», «Adela Administradora» → «AA»; vacío → «?». */
export function iniciales(nombre: string): string {
  const palabras = nombre.split(/\s+/).filter((p) => p !== "" && !PALABRAS_MENORES.has(p.toLowerCase()));
  const letras = (palabras.length > 0 ? palabras : nombre.split(/\s+/).filter(Boolean)).slice(0, 2).map((p) => p.charAt(0).toUpperCase());
  return letras.join("") || "?";
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * El color de una disciplina (`vertical.color`, un hex) listo para ponerse en `--disciplina`; `null` si no hay o no es un hex válido (entonces se usa el neutro del sistema).
 * Solo valida y normaliza: el tono suave y la tinta los saca `base.css` con oklch relativo, nunca un mapa por nombre.
 */
export function colorDeDisciplina(color: string | null | undefined): string | null {
  const c = (color ?? "").trim();
  return HEX.test(c) ? c.toLowerCase() : null;
}
