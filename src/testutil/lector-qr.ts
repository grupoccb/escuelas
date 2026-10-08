// El lector de QR de las pruebas (jsQR, dependencia SOLO de desarrollo): decodifica un QR dibujado, como lo haría una cámara. Ajusta el tipo de la importación
// (el paquete es CommonJS y su `default` es la función).

import jsQRImportado from "jsqr";

type Decodificar = typeof import("jsqr").default;
const jsQR = jsQRImportado as unknown as Decodificar;

/** El texto que contiene el QR de esa imagen (RGBA, `ancho` × `alto`), o null si no encuentra ninguno. */
export function leerQr(rgba: Uint8ClampedArray, ancho: number, alto: number): string | null {
  return jsQR(rgba, ancho, alto, { inversionAttempts: "dontInvert" })?.data ?? null;
}

/** Una matriz de módulos (con su zona de silencio de 4) como imagen en escala de grises, `escala` píxeles por módulo, lista para `leerQr`. */
export function imagenDeModulos(modulos: boolean[][], escala = 6): { rgba: Uint8ClampedArray; ancho: number } {
  const lado = modulos.length + 8;
  const ancho = lado * escala;
  const rgba = new Uint8ClampedArray(ancho * ancho * 4).fill(255);
  for (let y = 0; y < modulos.length; y++) {
    for (let x = 0; x < modulos.length; x++) {
      if (!modulos[y]![x]) continue;
      for (let dy = 0; dy < escala; dy++) for (let dx = 0; dx < escala; dx++) rgba.set([0, 0, 0, 255], (((y + 4) * escala + dy) * ancho + (x + 4) * escala + dx) * 4);
    }
  }
  return { rgba, ancho };
}
