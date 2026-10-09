// Un catálogo de ejemplo (V6) escrito como lo llenaría la escuela en las plantillas: filas de texto en el orden de las columnas de cada hoja. Lo comparten las pruebas del
// importador (unitarias, de integración y de navegador). Los nombres son inventados y genéricos (invariante 2: ni una disciplina ni una sucursal reales en el código).

import { ESQUEMAS, TIPOS, type Tipo } from "../catalogo/importacion/esquemas.ts";

export type HojasDeEjemplo = Record<Tipo, string[][]>;

/** Una disciplina con dos sucursales, tres salones, dos instructores, tres programas, tres grupos, cuatro horarios y tres precios. */
export const catalogoDeEjemplo = (): HojasDeEjemplo => ({
  disciplinas: [["Disciplina A", "#2E7D32"]],
  sucursales: [
    ["Centro", "Calle 1", "Centro"],
    ["Norte", "Calle 2", "Centro"],
  ],
  salones: [
    ["Centro", "Sala 1", "20"],
    ["Centro", "Sala 2", "10"],
    ["Norte", "Sala 1", "12"],
  ],
  instructores: [
    ["Ana Pérez", "55 1234 5678", "ana@ejemplo.com", "Centro"],
    ["Luis Gómez", "", "", "Centro | Norte"],
  ],
  programas: [
    ["Disciplina A", "Centro", "Infantil", "6", "9", "", "", "", ""],
    ["Disciplina A", "Centro", "Juvenil", "10", "14", "01/09/2026", "Medio", "Para jóvenes", ""],
    ["Disciplina A", "Norte", "Infantil", "6", "9", "", "", "", ""],
  ],
  grupos: [
    ["Centro", "Infantil", "Tarde", "15", "Sala 1", "Ana Pérez", ""],
    ["Centro", "Juvenil", "Tarde", "8", "Sala 2", "Luis Gómez", "Sí"],
    ["Norte", "Infantil", "Mañana", "10", "Sala 1", "Luis Gómez", ""],
  ],
  horarios: [
    ["Centro", "Infantil", "Tarde", "lunes", "17:00", "18:00"],
    ["Centro", "Infantil", "Tarde", "Miércoles", "17:00", "18:00"],
    ["Centro", "Juvenil", "Tarde", "martes", "17:00", "18:00"],
    ["Norte", "Infantil", "Mañana", "sábado", "9:00", "10:30"],
  ],
  precios: [
    ["Centro", "Infantil", "500", "800", "01/09/2026"],
    ["Centro", "Juvenil", "$500.00", "900,50", "2026-09-01"],
    ["Norte", "Infantil", "500", "750", "01/09/2026"],
  ],
});

export interface FormatoDeCsv {
  separador?: "," | ";" | "\t";
  bom?: boolean;
  finDeLinea?: "\r\n" | "\n" | "\r";
}

const celda = (v: string, sep: string): string => (v.includes(sep) || /["\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** El CSV de una hoja: sus encabezados de la plantilla y las filas dadas. Por omisión como lo guarda Excel en español (UTF-8 con BOM, \r\n). */
export function csvDeHoja(tipo: Tipo, filas: readonly (readonly string[])[], f: FormatoDeCsv = {}): string {
  const sep = f.separador ?? ",";
  const fin = f.finDeLinea ?? "\r\n";
  const todas = [ESQUEMAS[tipo].columnas.map((c) => c.titulo), ...filas];
  return (f.bom === false ? "" : "﻿") + todas.map((fila) => fila.map((v) => celda(v, sep)).join(sep)).join(fin) + fin;
}

export interface ArchivoDeCarga {
  nombre: string;
  bytes: Buffer;
}

/** Los archivos (nombre y bytes) de las hojas dadas; las que no se den no se suben. */
export function archivosDeCarga(hojas: Partial<HojasDeEjemplo>, f: FormatoDeCsv = {}): ArchivoDeCarga[] {
  return TIPOS.filter((t) => hojas[t] !== undefined).map((t) => ({ nombre: ESQUEMAS[t].archivo, bytes: Buffer.from(csvDeHoja(t, hojas[t]!, f), "utf8") }));
}

/** El cuerpo de `POST /api/catalogo/importacion`. */
export function cuerpoDeCarga(modo: "simulacion" | "aplicar", archivos: readonly ArchivoDeCarga[]): { modo: string; archivos: { nombre: string; contenido_base64: string }[] } {
  return { modo, archivos: archivos.map((a) => ({ nombre: a.nombre, contenido_base64: a.bytes.toString("base64") })) };
}

/** El catálogo de ejemplo con UNA celda cambiada (hoja, fila de datos desde 0, posición de la columna). */
export function conCelda(hoja: Tipo, fila: number, columna: number, valor: string, base: HojasDeEjemplo = catalogoDeEjemplo()): HojasDeEjemplo {
  base[hoja][fila]![columna] = valor;
  return base;
}
