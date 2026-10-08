// Dibujo de un QR (E3) en SVG y en PNG, listos para imprimir: con la zona de silencio de 4 módulos que pide el estándar, negro sobre blanco y sin degradados.
// El SVG lleva su tamaño físico en milímetros (se imprime a esa medida sin importar la resolución); el PNG, un tamaño entero de píxeles por módulo.

import { deflateSync } from "node:zlib";
import type { Qr } from "./qr.ts";

export const ZONA_DE_SILENCIO = 4;

const escaparXml = (t: string): string => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** `lado` módulos por lado con la zona de silencio. */
export const ladoConSilencio = (qr: Qr): number => qr.tamano + 2 * ZONA_DE_SILENCIO;

/**
 * El QR como SVG. `mm` es el lado impreso (20 a 300 mm); `titulo` es el texto accesible (se escapa). Un solo `<path>` con las rachas horizontales de módulos oscuros:
 * pequeño y sin costuras entre módulos (`crispEdges`).
 */
export function qrASvg(qr: Qr, o: { mm?: number; titulo?: string } = {}): string {
  const lado = ladoConSilencio(qr);
  const mm = Math.min(300, Math.max(20, Math.round(o.mm ?? 60)));
  const trazos: string[] = [];
  for (let y = 0; y < qr.tamano; y++) {
    for (let x = 0; x < qr.tamano; x++) {
      if (!qr.modulos[y]![x]) continue;
      let largo = 1;
      while (x + largo < qr.tamano && qr.modulos[y]![x + largo]) largo++;
      trazos.push(`M${x + ZONA_DE_SILENCIO} ${y + ZONA_DE_SILENCIO}h${largo}v1h-${largo}z`);
      x += largo - 1;
    }
  }
  const titulo = escaparXml(o.titulo ?? "Código QR");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" width="${mm}mm" height="${mm}mm" role="img" aria-label="${titulo}" shape-rendering="crispEdges"><title>${titulo}</title><rect width="${lado}" height="${lado}" fill="#ffffff"/><path d="${trazos.join("")}" fill="#000000"/></svg>\n`;
}

// ── PNG ───────────────────────────────────────────────────────────────────────────────────────────────────────

const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of datos) c = TABLA_CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function trozo(tipo: string, datos: Uint8Array): Buffer {
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** Los píxeles (0 = negro, 255 = blanco) de un QR con su zona de silencio, `escala` píxeles por módulo. */
export function pixelesDeQr(qr: Qr, escala: number): { ancho: number; filas: Uint8Array[] } {
  const lado = ladoConSilencio(qr);
  const ancho = lado * escala;
  const filas: Uint8Array[] = [];
  for (let py = 0; py < ancho; py++) {
    const fila = new Uint8Array(ancho).fill(255);
    const my = Math.floor(py / escala) - ZONA_DE_SILENCIO;
    if (my >= 0 && my < qr.tamano) {
      for (let px = 0; px < ancho; px++) {
        const mx = Math.floor(px / escala) - ZONA_DE_SILENCIO;
        if (mx >= 0 && mx < qr.tamano && qr.modulos[my]![mx]) fila[px] = 0;
      }
    }
    filas.push(fila);
  }
  return { ancho, filas };
}

/** El QR como PNG en escala de grises de 8 bits (`escala` píxeles por módulo, 1 a 40). */
export function qrAPng(qr: Qr, o: { escala?: number } = {}): Buffer {
  const escala = Math.min(40, Math.max(1, Math.round(o.escala ?? 16)));
  const { ancho, filas } = pixelesDeQr(qr, escala);
  const crudo = Buffer.alloc((ancho + 1) * ancho);
  filas.forEach((fila, y) => {
    crudo[y * (ancho + 1)] = 0; // filtro «ninguno»
    crudo.set(fila, y * (ancho + 1) + 1);
  });
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(ancho, 0);
  cabecera.writeUInt32BE(ancho, 4);
  cabecera[8] = 8; // profundidad
  cabecera[9] = 0; // escala de grises
  cabecera[10] = 0;
  cabecera[11] = 0;
  cabecera[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo("IHDR", cabecera), trozo("IDAT", deflateSync(crudo, { level: 9 })), trozo("IEND", new Uint8Array())]);
}
