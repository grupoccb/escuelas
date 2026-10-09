// Las plantillas de la carga del catálogo (V6), generadas desde la tabla de hojas (`esquemas.ts`) para que nunca se desfasen del importador. PURO.
//
//   · CSV con coma, UTF-8 con BOM (Excel lo abre con acentos), fin de línea \r\n, una fila de encabezados y UNA fila de ejemplo claramente falsa (empieza con «EJEMPLO»):
//     el importador la ignora, así que dejarla no crea nada.
//   · `LEEME.txt`: instrucciones cortas para quien llena las hojas.
//   · `todas.zip`: todo lo anterior en un solo archivo (zip sin comprimir: no necesita ninguna dependencia).
//
// Los mismos archivos viven en `docs/plantillas-catalogo/` (`npm run catalogo:plantillas` los regenera; un test comprueba que no se desfasen).

import { crc32 } from "node:zlib";
import { ESQUEMAS, TIPOS, type EsquemaDeHoja, type Tipo } from "./esquemas.ts";

const BOM = "﻿";
const FIN_DE_LINEA = "\r\n";

function celdaCsv(valor: string): string {
  return /[",;\r\n\t]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor;
}

const filaCsv = (celdas: readonly string[]): string => celdas.map(celdaCsv).join(",");

/** Una fila es de ejemplo si lo primero que trae escrito empieza con «EJEMPLO» (sin distinguir mayúsculas ni acentos). */
export function esFilaDeEjemplo(celdas: readonly string[]): boolean {
  const primera = celdas.find((x) => x.trim() !== "") ?? "";
  return /^ejemplo\b/i.test(primera.trim());
}

/** El texto del CSV de una hoja (con BOM). */
export function plantillaCsv(tipo: Tipo): string {
  const e: EsquemaDeHoja = ESQUEMAS[tipo];
  return BOM + filaCsv(e.columnas.map((x) => x.titulo)) + FIN_DE_LINEA + filaCsv(e.columnas.map((x) => x.ejemplo)) + FIN_DE_LINEA;
}

export const NOMBRE_DE_INSTRUCCIONES = "LEEME.txt";

export function instrucciones(): string {
  const l: string[] = [];
  l.push(
    "CÓMO LLENAR LAS PLANTILLAS DEL CATÁLOGO",
    "========================================",
    "",
    "Son hasta ocho archivos de Excel (CSV). Llena solo los que necesites; los que no cambian no hace falta subirlos. Si algo sale mal, el sistema te dice en qué",
    "archivo, fila y columna está el problema; no guarda nada hasta que todo esté bien y tú confirmes.",
    "",
    "ORDEN SUGERIDO (cada archivo usa nombres que escribiste en los anteriores):",
    ...TIPOS.map((t, i) => `  ${i + 1}. ${ESQUEMAS[t].archivo.padEnd(18)} ${ESQUEMAS[t].descripcion}`),
    "",
    "REGLAS GENERALES",
    "  - No cambies ni borres la primera fila (los encabezados). Puedes dejar vacías las columnas opcionales.",
    "  - La segunda fila de cada archivo es un EJEMPLO inventado (empieza con la palabra EJEMPLO). Bórrala o déjala: el sistema la ignora.",
    "  - Los nombres se escriben igual en todos los archivos (por ejemplo, la sucursal de un salón). No importan las mayúsculas ni los acentos.",
    "  - Guarda cada archivo como «CSV UTF-8 (delimitado por comas)». Si tu Excel solo ofrece «CSV (delimitado por comas)» o separa con punto y coma, también funciona.",
    "  - Fechas: día/mes/año, por ejemplo 15/09/2026. Horas: de 24 horas, por ejemplo 17:00. Días: lunes, martes, miércoles… Sí/No: escribe Sí o No.",
    "  - Dinero: 500 o 500.50 (también 500,50). Sin signo de pesos ni separador de miles.",
    "  - Varias sucursales en una misma celda: sepáralas con |, por ejemplo  Centro | Norte.",
    "",
    "LO QUE HACE EL SISTEMA CON LO QUE SUBES",
    "  - Lo que no existe, lo crea. Lo que ya existe y cambió en el archivo, lo actualiza. Lo que ya está igual, lo deja igual y dice «Sin cambios».",
    "  - NUNCA borra nada: si quitas una fila del archivo, lo que ya estaba en el sistema se queda. Para dar de baja algo, usa Administración.",
    "  - Una celda vacía en una fila que ya existe NO borra el dato que tenía: lo deja como está.",
    "  - Un precio nuevo empieza en su fecha «Vigente desde» y cierra el anterior. Los precios que ya se cobraron no cambian.",
    "  - Puedes subir el mismo archivo otra vez sin miedo: no duplica nada.",
    "",
    "DETALLE DE CADA ARCHIVO (OBLIGATORIAS marcadas con *)",
  );
  for (const t of TIPOS) {
    const e = ESQUEMAS[t];
    l.push("", `${e.archivo}`);
    for (const col of e.columnas) l.push(`  - ${col.titulo}${col.obligatoria ? " *" : ""}: ${col.ayuda}`);
  }
  l.push("");
  return BOM + l.join(FIN_DE_LINEA);
}

export interface ArchivoDePlantilla {
  nombre: string;
  tipoDeContenido: string;
  contenido: Buffer;
}

export function archivosDePlantillas(): ArchivoDePlantilla[] {
  return [
    { nombre: NOMBRE_DE_INSTRUCCIONES, tipoDeContenido: "text/plain; charset=utf-8", contenido: Buffer.from(instrucciones(), "utf8") },
    ...TIPOS.map((t) => ({ nombre: ESQUEMAS[t].archivo, tipoDeContenido: "text/csv; charset=utf-8", contenido: Buffer.from(plantillaCsv(t), "utf8") })),
  ];
}

// ── Zip sin compresión ───────────────────────────────────────────────────────────────────────────

const FECHA_DOS = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** Un .zip con los archivos tal cual (método «almacenado»), nombres en UTF-8. Determinista: la misma entrada da los mismos bytes. */
export function crearZip(archivos: readonly { nombre: string; contenido: Buffer }[]): Buffer {
  const partes: Buffer[] = [];
  const central: Buffer[] = [];
  let posicion = 0;
  for (const a of archivos) {
    const nombre = Buffer.from(a.nombre, "utf8");
    const suma = crc32(a.contenido);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(FECHA_DOS, 12);
    local.writeUInt32LE(suma, 14);
    local.writeUInt32LE(a.contenido.length, 18);
    local.writeUInt32LE(a.contenido.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    local.writeUInt16LE(0, 28);
    partes.push(local, nombre, a.contenido);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(0, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(FECHA_DOS, 14);
    dir.writeUInt32LE(suma, 16);
    dir.writeUInt32LE(a.contenido.length, 20);
    dir.writeUInt32LE(a.contenido.length, 24);
    dir.writeUInt16LE(nombre.length, 28);
    dir.writeUInt32LE(posicion, 42);
    central.push(dir, nombre);
    posicion += local.length + nombre.length + a.contenido.length;
  }
  const directorio = Buffer.concat(central);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(posicion, 16);
  return Buffer.concat([...partes, directorio, fin]);
}

export const NOMBRE_DEL_ZIP = "plantillas-catalogo.zip";

/** Todo lo que se puede descargar: cada plantilla, las instrucciones y el zip con todo. */
export function descargasDePlantillas(): ArchivoDePlantilla[] {
  const archivos = archivosDePlantillas();
  return [...archivos, { nombre: NOMBRE_DEL_ZIP, tipoDeContenido: "application/zip", contenido: crearZip(archivos) }];
}
