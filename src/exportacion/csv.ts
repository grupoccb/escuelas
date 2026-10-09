// Exportación a CSV (I5): serializar un reporte o una lista para Excel SIN regalar un agujero de seguridad ni estropear el dinero. PURO.
//
//   · ESCAPE (RFC 4180): un campo con el separador, comillas, salto de línea o retorno va entre comillas y sus comillas se duplican. Líneas separadas por CRLF.
//   · INYECCIÓN DE FÓRMULAS: una celda de TEXTO que empieza con `=`, `+`, `-`, `@`, tabulador o retorno de carro (o con espacios y luego uno de ellos) la interpretaría Excel como una
//     fórmula (`=HYPERLINK(...)`, `=cmd|…`): se le antepone un apóstrofo (`'`) para que se lea como texto. Solo los valores tipados como dinero o número que de verdad son un número
//     (`-12.50`) se dejan como están: se validan, no se confían.
//   · BOM UTF-8 al inicio, para que Excel abra bien los acentos y la «ñ».
//   · DINERO sin punto flotante: el importe sale como TEXTO decimal exacto con dos decimales («1234.50», sin símbolo ni separador de miles), que Excel lee como número. Los enteros, tal cual.
//   · SEPARADOR: coma por omisión (México); `;` si se pide (configuraciones regionales con coma decimal).

export const BOM = "\uFEFF";
export const CRLF = "\r\n";

export type TipoDeColumna = "texto" | "dinero" | "entero";

export interface Columna<F> {
  /** Encabezado visible. */
  titulo: string;
  /** El tipo de la columna, o una función cuando depende de la fila (una tabla «indicador, valor» mezcla dinero, enteros y texto). */
  tipo?: TipoDeColumna | ((fila: F) => TipoDeColumna);
  /** El valor de la celda para esa fila. */
  valor: (fila: F) => string | number | bigint | null | undefined;
}

export interface OpcionesDeCsv {
  separador?: "," | ";";
  /** Sin BOM (para pruebas o para quien lo pega en otro sistema). */
  sinBom?: boolean;
}

// Con lo que empieza una fórmula para Excel y LibreOffice (= + - @) y sus formas de ANCHO COMPLETO (no las interpretan hoy, pero otros lectores de hojas sí las normalizan).
const INICIOS_DE_FORMULA = new Set(["=", "+", "-", "@", "＝", "＋", "－", "＠"]);

/** ¿La celda empieza (tras espacios o caracteres de control) como una fórmula, o con tabulador o retorno de carro? */
export function esPeligrosa(texto: string): boolean {
  if (texto.startsWith("\t") || texto.startsWith("\r")) return true;
  for (const caracter of texto) {
    if (caracter.charCodeAt(0) <= 0x1f || /\s/.test(caracter)) continue;
    return INICIOS_DE_FORMULA.has(caracter);
  }
  return false;
}
const IMPORTE = /^-?\d{1,15}(?:\.\d{1,2})?$/;
const ENTERO = /^-?\d{1,15}$/;

/** Neutraliza una celda de texto que Excel leería como fórmula. */
export function neutralizarFormula(texto: string): string {
  return esPeligrosa(texto) ? `'${texto}` : texto;
}

/** Una celda lista para escribir (ya neutralizada y escapada). */
export function celda(valor: string | number | bigint | null | undefined, tipo: TipoDeColumna = "texto", separador: "," | ";" = ","): string {
  if (valor === null || valor === undefined) return "";
  let texto = typeof valor === "string" ? valor : String(valor);
  if (tipo === "dinero" && IMPORTE.test(texto)) {
    // Un importe válido (incluso negativo) se deja numérico; su forma ya es exacta.
  } else if (tipo === "entero" && ENTERO.test(texto)) {
    // Un entero válido.
  } else {
    texto = neutralizarFormula(texto);
  }
  const necesitaComillas = texto.includes(separador) || texto.includes('"') || texto.includes("\n") || texto.includes("\r");
  return necesitaComillas ? `"${texto.replaceAll('"', '""')}"` : texto;
}

/** La línea de encabezados (sin salto de línea). */
export function encabezadoDeCsv<F>(columnas: readonly Columna<F>[], separador: "," | ";" = ","): string {
  return columnas.map((c) => celda(c.titulo, "texto", separador)).join(separador);
}

/** Una fila de datos (sin salto de línea). */
export function filaDeCsv<F>(columnas: readonly Columna<F>[], fila: F, separador: "," | ";" = ","): string {
  return columnas.map((c) => celda(c.valor(fila), typeof c.tipo === "function" ? c.tipo(fila) : (c.tipo ?? "texto"), separador)).join(separador);
}

export function aCsv<F>(columnas: readonly Columna<F>[], filas: readonly F[], o: OpcionesDeCsv = {}): string {
  const sep = o.separador ?? ",";
  return (o.sinBom ? "" : BOM) + [encabezadoDeCsv(columnas, sep), ...filas.map((f) => filaDeCsv(columnas, f, sep))].join(CRLF) + CRLF;
}

/** Un nombre de archivo seguro para `Content-Disposition`: solo letras, números, guion y punto. */
export function nombreDeArchivo(base: string, extension = "csv"): string {
  const limpio = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-]+/, "")
    .replace(/[-]+$/, "");
  return `${limpio === "" ? "exportacion" : limpio}.${extension}`;
}
