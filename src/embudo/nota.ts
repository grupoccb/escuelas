// La nota de un movimiento de etapa (V13-fix, EV-26): una nota obligatoria no se cumple con 10 caracteres invisibles (espacio de ancho cero, el blanco braille U+2800, el relleno
// hangul U+3164…) ni con «..........»: `trim()` no los quita. Se normaliza (se quitan los invisibles y se recortan los lados) y el largo que cuenta es el de letras y dígitos.
// El mismo criterio vive en la interfaz (web/src/pantallas/asesor/inscrito-a-mano.ts) para avisar antes de enviar; el servidor es el que manda.

/** Caracteres de formato, de control y «rellenos» que se ven como nada (los de la categoría Cf, los de control, los separadores de línea y los blancos braille y hangul). */
// (Armada con `new RegExp`: el linter protesta de los caracteres combinantes dentro de una clase escrita como literal.)
const INVISIBLES = new RegExp("[\\p{Cf}\\p{Cc}\\p{Zl}\\p{Zp}\\u2800\\u3164\\uFFA0\\u115F\\u1160\\u180E]", "gu");
/** Los espacios de verdad que sí se conservan entre palabras (espacio, salto de línea y tabulador), aunque estén en Cc. */
const ESPACIOS_DE_VERDAD = /[\t\n\r]/g;

/** El texto sin invisibles y sin espacios en los lados. Los saltos de línea y tabuladores se vuelven un espacio. */
export function normalizarNota(nota: string | null | undefined): string {
  if (!nota) return "";
  return nota.replace(ESPACIOS_DE_VERDAD, " ").replace(INVISIBLES, "").trim();
}

/** Cuántas letras y dígitos trae (lo que cuenta para «una frase, no un ok»). */
export function caracteresUtiles(nota: string): number {
  return nota.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
}
