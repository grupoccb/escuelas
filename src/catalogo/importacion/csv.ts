// Lector de CSV de la carga del catálogo (V6). PURO: recibe bytes o texto y devuelve filas; no toca archivos ni la base.
//
// Tolera lo que produce Excel en español sin que la escuela tenga que saber nada de formatos:
//   · UTF-8 con o sin BOM (el «CSV UTF-8» de Excel lo trae), UTF-16 con BOM y, si los bytes no son UTF-8, Windows-1252 (el «CSV» a secas de Excel en Windows);
//   · separador coma, punto y coma o tabulador (se decide con la fila de encabezados; Excel en español suele usar punto y coma);
//   · comillas dobles, comillas dobles repetidas dentro de un campo y saltos de línea dentro de un campo entrecomillado;
//   · fin de línea \r\n, \n o \r (Excel de Mac antiguo).
//
// El número de fila es el que ve la persona en Excel: la fila 1 es la de encabezados y las filas vacías cuentan (así «fila 7» es la fila 7 de la hoja). Un salto de línea
// DENTRO de un campo entrecomillado no cuenta como otra fila.

export type SeparadorDeCsv = "," | ";" | "\t";

export interface FilaDeCsv {
  /** Número de fila en la hoja (1 = la primera). */
  numero: number;
  celdas: string[];
}

export interface CsvLeido {
  separador: SeparadorDeCsv;
  /** Solo las filas con algo escrito, en orden. La primera es la de encabezados. */
  filas: FilaDeCsv[];
}

export class ErrorDeCsv extends Error {}

/** Bytes → texto. Quita el BOM y elige la codificación: UTF-16 con BOM, UTF-8 y, si los bytes no son UTF-8 válido, Windows-1252. */
export function decodificarBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return quitarBom(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch {
    return quitarBom(new TextDecoder("windows-1252").decode(bytes));
  }
}

export const quitarBom = (texto: string): string => (texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto);

/** El separador de la primera fila con contenido: el que más aparece fuera de comillas (empate o ninguno: coma). */
export function detectarSeparador(texto: string): SeparadorDeCsv {
  const cuentas: Record<SeparadorDeCsv, number> = { ",": 0, ";": 0, "\t": 0 };
  let entreComillas = false;
  for (const c of texto) {
    if (c === '"') entreComillas = !entreComillas;
    else if (!entreComillas && (c === "\n" || c === "\r")) {
      if (cuentas[","] + cuentas[";"] + cuentas["\t"] > 0) break;
    } else if (!entreComillas && c in cuentas) cuentas[c as SeparadorDeCsv] += 1;
  }
  let mejor: SeparadorDeCsv = ",";
  for (const s of [";", "\t"] as const) if (cuentas[s] > cuentas[mejor]) mejor = s;
  return mejor;
}

/** Lee el texto completo. Lanza `ErrorDeCsv` si quedan comillas sin cerrar. */
export function leerCsv(texto: string): CsvLeido {
  const t = quitarBom(texto);
  const separador = detectarSeparador(t);
  const filas: FilaDeCsv[] = [];
  let celdas: string[] = [];
  let campo = "";
  let entreComillas = false;
  /** El campo se abrió con comillas (aunque quede vacío, `""` es un valor escrito a propósito). */
  let hayComillas = false;
  let numero = 1;
  let abiertoEn = 1;

  const cerrarCampo = (): void => {
    celdas.push(hayComillas ? campo : campo.trim());
    campo = "";
    hayComillas = false;
  };
  const cerrarFila = (): void => {
    cerrarCampo();
    if (celdas.some((c) => c.trim() !== "")) filas.push({ numero, celdas });
    celdas = [];
    numero += 1;
  };

  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (entreComillas) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else entreComillas = false;
      } else campo += c;
      continue;
    }
    if (c === '"' && campo.trim() === "" && !hayComillas) {
      // Las comillas que abren un campo (ignorando espacios antes de ellas).
      campo = "";
      hayComillas = true;
      entreComillas = true;
      abiertoEn = numero;
    } else if (c === separador) cerrarCampo();
    else if (c === "\r") {
      if (t[i + 1] === "\n") i += 1;
      cerrarFila();
    } else if (c === "\n") cerrarFila();
    else campo += c;
  }
  if (entreComillas) throw new ErrorDeCsv(`En la fila ${abiertoEn} se abrieron comillas (") y no se cerraron. Revisa que cada comilla que abre tenga otra que cierre.`);
  // Última fila sin salto de línea al final.
  if (campo !== "" || hayComillas || celdas.length > 0) cerrarFila();
  return { separador, filas };
}
