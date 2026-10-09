// Carga del catálogo desde Excel (V6): tipos del informe que devuelve el servidor y las pequeñas funciones puras de la pantalla (leer un archivo a base64, agrupar los errores por
// archivo, resumir lo que se va a hacer). El servidor es quien valida; aquí solo se presenta.

export interface ProblemaDeCarga {
  archivo: string;
  fila: number | null;
  columna: string | null;
  mensaje: string;
  /** «Fila 7, columna “Salón”: …», listo para mostrar. */
  texto: string;
}

export interface FilaDeResumen {
  clave: string;
  nombre: string;
  creados: number;
  actualizados: number;
  sin_cambios: number;
}

export interface InformeDeCarga {
  modo: "simulacion" | "aplicar";
  limpia: boolean;
  aplicado: boolean;
  sin_cambios: boolean;
  archivos: { nombre: string; hoja: string | null; filas: number }[];
  errores: ProblemaDeCarga[];
  errores_omitidos: number;
  avisos: ProblemaDeCarga[];
  resumen: FilaDeResumen[];
  cambios: { entidad: string; accion: "crear" | "actualizar"; descripcion: string }[];
  cambios_omitidos: number;
}

export interface ArchivoElegido {
  nombre: string;
  tamano: number;
  base64: string;
}

/** Lo más que se acepta en total: el servidor admite 8 MB de JSON y el base64 pesa un tercio más. */
export const MAXIMO_DE_BYTES = 5_000_000;
export const MAXIMO_DE_ARCHIVOS = 12;

export function aBase64(bytes: Uint8Array): string {
  let texto = "";
  for (let i = 0; i < bytes.length; i += 0x8000) texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(texto);
}

export async function leerArchivo(archivo: File): Promise<ArchivoElegido> {
  return { nombre: archivo.name, tamano: archivo.size, base64: aBase64(new Uint8Array(await archivo.arrayBuffer())) };
}

/** Por qué no se pueden subir estos archivos, o null si se puede. */
export function problemaConLosArchivos(archivos: readonly Pick<ArchivoElegido, "nombre" | "tamano">[]): string | null {
  if (archivos.length > MAXIMO_DE_ARCHIVOS) return `Elegiste ${archivos.length} archivos y se aceptan hasta ${MAXIMO_DE_ARCHIVOS}.`;
  const total = archivos.reduce((s, a) => s + a.tamano, 0);
  if (total > MAXIMO_DE_BYTES) return "Los archivos pesan demasiado (más de 5 MB en total). Revisa que sean las plantillas y no otros documentos.";
  const repetido = archivos.find((a, i) => archivos.findIndex((b) => b.nombre === a.nombre) !== i);
  return repetido ? `El archivo «${repetido.nombre}» está elegido dos veces.` : null;
}

/** Los errores agrupados por archivo, en el orden en que salieron. */
export function erroresPorArchivo(errores: readonly ProblemaDeCarga[]): { archivo: string; errores: ProblemaDeCarga[] }[] {
  const grupos: { archivo: string; errores: ProblemaDeCarga[] }[] = [];
  for (const e of errores) {
    const g = grupos.find((x) => x.archivo === e.archivo) ?? (grupos.push({ archivo: e.archivo, errores: [] }), grupos[grupos.length - 1]!);
    g.errores.push(e);
  }
  return grupos;
}

/** «Se crearán 12 cosas nuevas y se actualizarán 3. Nada se borra» (o, ya hecho: «Se crearon 12 cosas nuevas y se actualizaron 3. Nada se borró»). */
export function frase(resumen: readonly FilaDeResumen[], hecho = false): string {
  const creados = resumen.reduce((s, r) => s + r.creados, 0);
  const actualizados = resumen.reduce((s, r) => s + r.actualizados, 0);
  const partes: string[] = [];
  const unaVez = (n: number, hecha: string, futuro: string): string => (hecho ? hecha : futuro).replace("{n}", String(n));
  if (creados > 0) partes.push(creados === 1 ? unaVez(1, "se creó 1 cosa nueva", "se creará 1 cosa nueva") : unaVez(creados, "se crearon {n} cosas nuevas", "se crearán {n} cosas nuevas"));
  if (actualizados > 0) partes.push(actualizados === 1 ? unaVez(1, "se actualizó 1", "se actualizará 1") : unaVez(actualizados, "se actualizaron {n}", "se actualizarán {n}"));
  if (partes.length === 0) return "No hay nada que crear ni actualizar";
  const t = partes.join(" y ");
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}. ${hecho ? "Nada se borró" : "Nada se borra"}`;
}

export const tamanoTexto = (bytes: number): string => (bytes < 1024 ? `${bytes} bytes` : bytes < 1_048_576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`);
