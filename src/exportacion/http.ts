// Entregar un CSV por HTTP (I5): `Content-Disposition` de descarga con nombre seguro (RFC 6266 con `filename*`), tipo `text/csv`, sin caché y sin que el navegador adivine el tipo.
// Dos formas: `enviarCsv` (un reporte o una lista corta, ya en memoria) y `enviarCsvPorLotes` (una lista grande: se pide por lotes con cursor y se escribe a medida que llega, de modo
// que en memoria hay un lote y no toda la lista).

import { BOM, CRLF, encabezadoDeCsv, filaDeCsv, nombreDeArchivo, type Columna } from "./csv.ts";

/** Lo mínimo que se necesita de la respuesta HTTP (Express la cumple; las pruebas usan una falsa). */
export interface RespuestaDeDescarga {
  status(codigo: number): unknown;
  setHeader(nombre: string, valor: string): unknown;
  send(cuerpo: string): unknown;
  write(trozo: string): boolean;
  end(): unknown;
  once(evento: "drain" | "close", escucha: () => void): unknown;
  destroy(error?: Error): unknown;
  readonly destroyed: boolean;
}

function cabeceras(res: RespuestaDeDescarga, nombreBase: string): void {
  const nombre = nombreDeArchivo(nombreBase);
  res.status(200);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nombre}"; filename*=UTF-8''${encodeURIComponent(nombre)}`);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function enviarCsv(res: RespuestaDeDescarga, nombreBase: string, contenido: string): void {
  cabeceras(res, nombreBase);
  res.send(contenido);
}

/** Cuántas filas se piden por lote y cuántas se entregan como máximo en una descarga (un tope para que una lista enorme no sea un arma contra el servidor). */
export const TAMANO_DE_LOTE = 500;
export const MAXIMO_DE_FILAS = 100_000;

/** Pide el lote que sigue a `ultima` (null: el primero). Devuelve menos de `tamano` filas cuando ya no hay más. */
export type SiguienteLote<F> = (ultima: F | null, tamano: number) => Promise<F[]>;

/**
 * Descarga por lotes. El PRIMER lote se pide antes de escribir cabeceras: si falla (permiso, validación, base) la respuesta es el error HTTP de siempre. Una falla DESPUÉS de
 * empezar a escribir ya no puede ser un error HTTP: se corta la conexión (el navegador ve una descarga fallida, nunca un archivo truncado que parezca completo).
 */
export async function enviarCsvPorLotes<F>(res: RespuestaDeDescarga, nombreBase: string, columnas: readonly Columna<F>[], siguiente: SiguienteLote<F>, o: { tamano?: number; maximo?: number; alFallar?: (error: unknown) => void } = {}): Promise<number> {
  const tamano = o.tamano ?? TAMANO_DE_LOTE;
  const maximo = o.maximo ?? MAXIMO_DE_FILAS;
  let lote = await siguiente(null, tamano);
  cabeceras(res, nombreBase);
  const escribir = async (texto: string): Promise<void> => {
    if (!res.write(texto)) await new Promise<void>((listo) => { res.once("drain", listo); res.once("close", listo); });
  };
  let entregadas = 0;
  try {
    await escribir(BOM + encabezadoDeCsv(columnas) + CRLF);
    for (;;) {
      const restantes = maximo - entregadas;
      const aEscribir = lote.length > restantes ? lote.slice(0, restantes) : lote;
      if (aEscribir.length > 0) await escribir(aEscribir.map((f) => filaDeCsv(columnas, f) + CRLF).join(""));
      entregadas += aEscribir.length;
      if (res.destroyed || lote.length < tamano || entregadas >= maximo) break;
      lote = await siguiente(lote[lote.length - 1] ?? null, tamano);
    }
    res.end();
  } catch (error) {
    o.alFallar?.(error);
    res.destroy(error instanceof Error ? error : new Error("falló la descarga"));
  }
  return entregadas;
}
