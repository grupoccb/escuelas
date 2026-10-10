// Identidad de un salón por su nombre (EC-05). Los choques se calculan por `salon_id`, así que dos filas que son el
// mismo cuarto escrito distinto («Salón A», «salón a», «SALÓN  A», «Salon A») harían invisible un choque real.
// La clave quita mayúsculas, acentos y espacios de más; dos salones de una sucursal con la misma clave son el mismo.

/**
 * Caracteres que no se ven (ancho cero, guion suave, controles bidireccionales…) y los «rellenos» Hangul: «Sala\u200B Uno» y «Sala Uno» se ven igual y no pueden ser dos
 * salones (EF-18). Mismos que filtra la landing en los nombres de personas.
 */
const INVISIBLES = /\p{Cf}|[\u2028\u2029\u115F\u1160\u3164\uFFA0]|\u17B4|\u17B5|\u034F|\u180B|\u180C|\u180D/gu;

/** El nombre como se guarda: sin caracteres invisibles, sin espacios en los extremos y con los internos colapsados en uno solo. */
export function nombreDeSalon(nombre: string): string {
  return nombre.replace(INVISIBLES, "").replace(/\s+/gu, " ").trim();
}

/** La clave de comparación: minúsculas, sin acentos ni marcas, espacios colapsados. */
export function claveDeSalon(nombre: string): string {
  return nombreDeSalon(nombre).normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("es-MX");
}

/** Los salones de una misma sucursal cuyo nombre es «el mismo» salvo por la forma; vacío si no hay ninguno. */
export function salonesRepetidosPorForma(salones: readonly { id: string; sucursalId: string; nombre: string }[]): { sucursalId: string; clave: string; ids: string[] }[] {
  const grupos = new Map<string, { sucursalId: string; clave: string; ids: string[] }>();
  for (const s of salones) {
    const clave = claveDeSalon(s.nombre);
    const llave = `${s.sucursalId}|${clave}`;
    const g = grupos.get(llave) ?? { sucursalId: s.sucursalId, clave, ids: [] };
    g.ids.push(s.id);
    grupos.set(llave, g);
  }
  return [...grupos.values()].filter((g) => g.ids.length > 1).map((g) => ({ ...g, ids: [...g.ids].sort() }));
}
