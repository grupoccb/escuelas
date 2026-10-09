// De archivos a tablas (V6): decodifica, lee el CSV, reconoce qué hoja es cada archivo por sus encabezados y separa las filas de datos de las vacías y de las de ejemplo. PURO.
// Los problemas que encuentra son del archivo (no se reconoce, comillas sin cerrar, dos archivos de la misma hoja, demasiadas filas); los de cada dato los encuentra `plan.ts`.

import { ErrorDeCsv, decodificarBytes, leerCsv } from "./csv.ts";
import { ESQUEMAS, reconocerHoja, type Tipo } from "./esquemas.ts";
import { esFilaDeEjemplo } from "./plantillas.ts";

/** Lo más que se acepta por archivo y en total: la carga es de unos cientos de filas, no de un archivo de millones. */
export const MAXIMO_DE_FILAS_POR_ARCHIVO = 5000;
export const MAXIMO_DE_ARCHIVOS = 12;

export interface ArchivoDeEntrada {
  nombre: string;
  bytes: Uint8Array;
}

/** Un problema o aviso con su lugar: archivo, fila y columna (si aplica). El texto completo lo arma `textoDeProblema`. */
export interface Problema {
  /** Nombre del archivo tal como lo subieron. */
  archivo: string;
  tipo: Tipo | null;
  /** Fila de la hoja (la 1 es la de encabezados); null si es del archivo entero. */
  fila: number | null;
  /** Encabezado de la columna; null si es de la fila entera. */
  columna: string | null;
  mensaje: string;
}

export interface FilaLeida {
  numero: number;
  /** Valor de cada columna reconocida, recortado; vacío si la columna no está o la celda está vacía. */
  v: Record<string, string>;
}

export interface TablaLeida {
  tipo: Tipo;
  archivo: string;
  filas: FilaLeida[];
}

export interface Lectura {
  tablas: Partial<Record<Tipo, TablaLeida>>;
  /** Los archivos con su hoja reconocida (o null) y cuántas filas de datos traen. */
  archivos: { nombre: string; tipo: Tipo | null; filas: number }[];
  problemas: Problema[];
  avisos: Problema[];
}

export function leerArchivos(entradas: readonly ArchivoDeEntrada[]): Lectura {
  const lectura: Lectura = { tablas: {}, archivos: [], problemas: [], avisos: [] };
  if (entradas.length > MAXIMO_DE_ARCHIVOS) {
    lectura.problemas.push({ archivo: "(todos)", tipo: null, fila: null, columna: null, mensaje: `son demasiados archivos (${entradas.length}); la carga acepta hasta ${MAXIMO_DE_ARCHIVOS}, uno por plantilla` });
    return lectura;
  }
  for (const entrada of entradas) {
    const { nombre } = entrada;
    const falla = (mensaje: string, tipo: Tipo | null = null): void => {
      lectura.problemas.push({ archivo: nombre, tipo, fila: null, columna: null, mensaje });
      lectura.archivos.push({ nombre, tipo, filas: 0 });
    };
    let csv;
    try {
      csv = leerCsv(decodificarBytes(entrada.bytes));
    } catch (e) {
      if (!(e instanceof ErrorDeCsv)) throw e;
      falla(e.message);
      continue;
    }
    const [encabezados, ...datos] = csv.filas;
    if (!encabezados) {
      falla("el archivo está vacío. Usa la plantilla, que trae los encabezados en la primera fila");
      continue;
    }
    const hoja = reconocerHoja(nombre, encabezados.celdas);
    if (!hoja.tipo || !hoja.mapa) {
      falla(hoja.motivo ?? "no se reconoce");
      continue;
    }
    const tipo = hoja.tipo;
    if (lectura.tablas[tipo]) {
      falla(`ya se subió otro archivo de ${ESQUEMAS[tipo].plural} («${lectura.tablas[tipo]!.archivo}»). Sube solo uno por plantilla`, tipo);
      continue;
    }
    for (const x of hoja.mapa.desconocidos) lectura.avisos.push({ archivo: nombre, tipo, fila: encabezados.numero, columna: x, mensaje: "esta columna no es de la plantilla y se ignoró" });
    const filas: FilaLeida[] = [];
    for (const f of datos) {
      if (esFilaDeEjemplo(f.celdas)) {
        lectura.avisos.push({ archivo: nombre, tipo, fila: f.numero, columna: null, mensaje: "es la fila de ejemplo de la plantilla y se ignoró" });
        continue;
      }
      const v: Record<string, string> = {};
      for (const col of ESQUEMAS[tipo].columnas) {
        const pos = hoja.mapa.posiciones[col.clave];
        v[col.clave] = pos === undefined ? "" : (f.celdas[pos] ?? "").split(String.fromCharCode(0)).join("").trim();
      }
      filas.push({ numero: f.numero, v });
    }
    if (filas.length > MAXIMO_DE_FILAS_POR_ARCHIVO) {
      falla(`trae ${filas.length} filas y la carga acepta hasta ${MAXIMO_DE_FILAS_POR_ARCHIVO} por archivo`, tipo);
      continue;
    }
    lectura.tablas[tipo] = { tipo, archivo: nombre, filas };
    lectura.archivos.push({ nombre, tipo, filas: filas.length });
  }
  return lectura;
}

/** «Fila 7, columna “Salón”: …», o «Archivo “x.csv”: …» si el problema es del archivo entero. */
export function textoDeProblema(p: Pick<Problema, "fila" | "columna" | "mensaje">): string {
  const lugar = p.fila === null ? "En el archivo" : p.columna ? `Fila ${p.fila}, columna “${p.columna}”` : `Fila ${p.fila}`;
  const texto = `${lugar}: ${p.mensaje}`;
  return /[.!?]$/.test(texto) ? texto : `${texto}.`;
}
