// E3: el codificador de QR, comprobado contra un LECTOR independiente (jsQR, solo en desarrollo): todo lo que se genera se decodifica de vuelta al mismo texto,
// para los tres niveles, varias versiones y textos con acentos; más la estructura del estándar (buscadores, sincronía, formato) y el PNG/SVG.

import { test } from "node:test";
import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { leerQr } from "../testutil/lector-qr.ts";
import { QrDemasiadoLargo, VERSION_MAXIMA, bitsSobrantes, capacidadMaximaEnBytes, crearQr, penalizacionesPorMascara, versionMinima, type NivelQr, type Qr } from "./qr.ts";
import { ZONA_DE_SILENCIO, crc32, ladoConSilencio, pixelesDeQr, qrAPng, qrASvg } from "./render.ts";

/** Decodifica un QR como lo haría una cámara: se dibuja con zona de silencio y escala y se le pasa a jsQR. */
function decodificar(qr: Qr, escala = 6): string | null {
  const { ancho, filas } = pixelesDeQr(qr, escala);
  const rgba = new Uint8ClampedArray(ancho * ancho * 4);
  filas.forEach((fila, y) => fila.forEach((v, x) => rgba.set([v, v, v, 255], (y * ancho + x) * 4)));
  return leerQr(rgba, ancho, ancho);
}

const URL_DE_EJEMPLO = "https://escuela.ejemplo.test/l/vertical-uno?org=mi-escuela&c=QR7M2KXA&s=11111111-1111-4111-8111-111111111111";

test("round-trip: la URL de una landing decodifica EXACTAMENTE igual en los tres niveles", () => {
  for (const nivel of ["L", "M", "Q"] as NivelQr[]) {
    const qr = crearQr(URL_DE_EJEMPLO, nivel);
    assert.equal(decodificar(qr), URL_DE_EJEMPLO, `nivel ${nivel} (versión ${qr.version})`);
  }
});

test("round-trip en TODAS las versiones 1 a 10 y los tres niveles, justo en el límite de cada una y con un byte menos", () => {
  const vistas = new Set<string>();
  for (const nivel of ["L", "M", "Q"] as NivelQr[]) {
    for (let largo = 1; largo <= capacidadMaximaEnBytes(nivel); largo++) {
      const v = versionMinima(largo, nivel);
      const enElBorde = v === VERSION_MAXIMA || versionMinima(largo + 1, nivel) !== v; // el último texto que cabe en esa versión
      if (!enElBorde && largo !== 1) continue;
      const texto = Array.from({ length: largo }, (_, i) => "abcdefghijklmnopqrstuvwxyz0123456789-._~:/?#"[(i * 7 + largo) % 43]).join("");
      const qr = crearQr(texto, nivel);
      assert.equal(qr.version, v);
      assert.equal(qr.tamano, 17 + 4 * v);
      assert.equal(decodificar(qr), texto, `nivel ${nivel}, versión ${v}, ${largo} bytes`);
      vistas.add(`${nivel}${v}`);
    }
  }
  for (const nivel of ["L", "M", "Q"]) for (let v = 1; v <= VERSION_MAXIMA; v++) assert.ok(vistas.has(`${nivel}${v}`), `se probó ${nivel}${v}`);
});

test("round-trip con UTF-8: acentos, eñes, emojis y varios idiomas", () => {
  for (const texto of ["Hola, quiero información de la clase de niños", "Año 2026 — ¿Cuánto cuesta? ñandú", "日本語のテキスト", "😀 QR 🎉", "https://x.test/l/acción?c=QR7M2KXA"]) {
    assert.equal(decodificar(crearQr(texto, "M")), texto, texto);
  }
});

test("el tamaño de la matriz, los buscadores, la sincronía, el módulo oscuro y la información de formato cumplen el estándar", () => {
  const qr = crearQr("HOLA", "M");
  assert.equal(qr.version, 1);
  assert.equal(qr.tamano, 21);
  const m = qr.modulos;
  // Buscadores 7×7 en tres esquinas: anillo oscuro, anillo claro, centro 3×3 oscuro.
  const buscador = (x0: number, y0: number): void => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) assert.equal(m[y0 + y]![x0 + x], Math.max(Math.abs(x - 3), Math.abs(y - 3)) !== 2, `buscador en (${x0},${y0}) módulo (${x},${y})`);
  };
  buscador(0, 0);
  buscador(14, 0);
  buscador(0, 14);
  // Separadores claros alrededor.
  for (let i = 0; i < 8; i++) {
    assert.equal(m[7]![i], false);
    assert.equal(m[i]![7], false);
  }
  // Sincronía: alterna oscuro-claro entre los buscadores.
  for (let i = 8; i < 13; i++) {
    assert.equal(m[6]![i], i % 2 === 0);
    assert.equal(m[i]![6], i % 2 === 0);
  }
  assert.equal(m[21 - 8]![8], true, "el módulo oscuro fijo");
  // La información de formato (BCH) leída de las dos copias coincide y decodifica al nivel y a la máscara elegida.
  const leer = (celdas: [number, number][]): number => celdas.reduce((a, [x, y], i) => a | ((m[y]![x] ? 1 : 0) << i), 0);
  const copia1 = leer([[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]]);
  const copia2 = leer([...Array.from({ length: 8 }, (_, i): [number, number] => [20 - i, 8]), ...Array.from({ length: 7 }, (_, k): [number, number] => [8, 21 - 7 + k])]);
  assert.equal(copia1, copia2);
  const formato = copia1 ^ 0x5412;
  assert.equal(formato >>> 13, 0, "el nivel M son los bits 00");
  assert.equal((formato >>> 10) & 7, qr.mascara);
  // BCH: el residuo de dividir los 15 bits por el generador 0x537 es 0.
  let resto = formato;
  for (let i = 14; i >= 10; i--) if ((resto >>> i) & 1) resto ^= 0x537 << (i - 10);
  assert.equal(resto, 0, "información de formato con BCH válido");
});

test("la información de versión (v7 en adelante) lleva su BCH válido en las dos copias", () => {
  const qr = crearQr("x".repeat(150), "M");
  assert.ok(qr.version >= 7, `versión ${qr.version}`);
  const n = qr.tamano;
  const copiaA = Array.from({ length: 18 }, (_, i): number => (qr.modulos[Math.floor(i / 3)]![n - 11 + (i % 3)] ? 1 : 0)).reduce((a, b, i) => a | (b << i), 0);
  const copiaB = Array.from({ length: 18 }, (_, i): number => (qr.modulos[n - 11 + (i % 3)]![Math.floor(i / 3)] ? 1 : 0)).reduce((a, b, i) => a | (b << i), 0);
  assert.equal(copiaA, copiaB);
  assert.equal(copiaA >>> 12, qr.version);
  let resto = copiaA;
  for (let i = 17; i >= 12; i--) if ((resto >>> i) & 1) resto ^= 0x1f25 << (i - 12);
  assert.equal(resto, 0);
});

test("determinista y distinto: el mismo texto da la misma matriz; textos distintos dan matrices distintas; el nivel cambia la matriz", () => {
  const a = crearQr(URL_DE_EJEMPLO);
  const b = crearQr(URL_DE_EJEMPLO);
  assert.deepEqual(a.modulos, b.modulos);
  const otra = crearQr(URL_DE_EJEMPLO.replace("QR7M2KXA", "QR7M2KXB"));
  assert.notDeepEqual(a.modulos, otra.modulos);
  assert.notDeepEqual(crearQr(URL_DE_EJEMPLO, "L").modulos, a.modulos);
});

test("lo que no cabe se rechaza con un error claro (no se genera un QR roto); los bits sobrantes por versión son los del estándar", () => {
  for (const nivel of ["L", "M", "Q"] as NivelQr[]) {
    const max = capacidadMaximaEnBytes(nivel);
    assert.ok(crearQr("a".repeat(max), nivel));
    assert.throws(() => crearQr("a".repeat(max + 1), nivel), QrDemasiadoLargo);
  }
  assert.equal(capacidadMaximaEnBytes("L"), 271);
  assert.equal(capacidadMaximaEnBytes("M"), 213);
  assert.equal(capacidadMaximaEnBytes("Q"), 151);
  assert.deepEqual([1, 2, 6, 7, 10].map(bitsSobrantes), [0, 7, 7, 0, 0]);
  assert.throws(() => crearQr("é".repeat(200), "M"), QrDemasiadoLargo, "cuenta bytes UTF-8, no letras");
});

test("SVG: viewBox con la zona de silencio, tamaño físico en milímetros, título escapado, un solo path y nada ejecutable; se decodifica de vuelta", () => {
  const qr = crearQr(URL_DE_EJEMPLO);
  const svg = qrASvg(qr, { mm: 80, titulo: 'QR "campaña" <A&B>' });
  // La zona de silencio que pide el estándar es de 4 módulos por lado (EE-09: antes la prueba usaba la propia constante y no atrapaba un valor menor).
  assert.equal(ZONA_DE_SILENCIO, 4);
  const lado = qr.tamano + 8;
  assert.match(svg, new RegExp(`viewBox="0 0 ${lado} ${lado}" width="80mm" height="80mm"`));
  assert.match(svg, /<title>QR &quot;campaña&quot; &lt;A&amp;B&gt;<\/title>/);
  assert.ok(!svg.includes("<script") && !svg.includes("onload") && !svg.includes("<A&B>"));
  assert.equal((svg.match(/<path/g) ?? []).length, 1);
  assert.match(svg, /fill="#ffffff"/);
  assert.equal(qrASvg(qr, { mm: 5 }).match(/width="(\d+)mm"/)?.[1], "20", "mínimo de 20 mm");
  assert.equal(qrASvg(qr, { mm: 9999 }).match(/width="(\d+)mm"/)?.[1], "300", "máximo de 300 mm");
  // El dibujo: cada módulo oscuro del path coincide con la matriz (se reconstruye desde el SVG y se compara).
  const reconstruida = Array.from({ length: qr.tamano }, () => new Array<boolean>(qr.tamano).fill(false));
  for (const m of svg.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
    const [x, y, largo] = [Number(m[1]), Number(m[2]), Number(m[3])];
    for (let i = 0; i < largo; i++) reconstruida[y - ZONA_DE_SILENCIO]![x - ZONA_DE_SILENCIO + i] = true;
  }
  assert.deepEqual(reconstruida, qr.modulos);
});

test("PNG: firma, cabecera, CRC de cada trozo, tamaño (módulos + silencio) × escala; al descomprimirlo y pasárselo al lector da la misma URL", () => {
  const qr = crearQr(URL_DE_EJEMPLO);
  const png = qrAPng(qr, { escala: 8 });
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const trozos: { tipo: string; datos: Buffer }[] = [];
  for (let i = 8; i < png.length; ) {
    const largo = png.readUInt32BE(i);
    const tipo = png.toString("ascii", i + 4, i + 8);
    const datos = png.subarray(i + 8, i + 8 + largo);
    assert.equal(png.readUInt32BE(i + 8 + largo), crc32(Buffer.concat([Buffer.from(tipo), datos])), `CRC de ${tipo}`);
    trozos.push({ tipo, datos });
    i += 12 + largo;
  }
  assert.deepEqual(trozos.map((t) => t.tipo), ["IHDR", "IDAT", "IEND"]);
  const ancho = ladoConSilencio(qr) * 8;
  const ihdr = trozos[0]!.datos;
  assert.deepEqual([ihdr.readUInt32BE(0), ihdr.readUInt32BE(4), ihdr[8], ihdr[9]], [ancho, ancho, 8, 0]);
  const crudo = inflateSync(trozos[1]!.datos);
  assert.equal(crudo.length, (ancho + 1) * ancho);
  // Se reconstruyen los píxeles (filtro 0 en todas las filas) y se decodifica como una foto del QR impreso.
  const rgba = new Uint8ClampedArray(ancho * ancho * 4);
  for (let y = 0; y < ancho; y++) {
    assert.equal(crudo[y * (ancho + 1)], 0);
    for (let x = 0; x < ancho; x++) {
      const v = crudo[y * (ancho + 1) + 1 + x]!;
      assert.ok(v === 0 || v === 255);
      rgba.set([v, v, v, 255], (y * ancho + x) * 4);
    }
  }
  assert.equal(leerQr(rgba, ancho, ancho), URL_DE_EJEMPLO);
  // La zona de silencio de 4 módulos es toda blanca.
  for (let y = 0; y < ZONA_DE_SILENCIO * 8; y++) for (let x = 0; x < ancho; x++) assert.equal(crudo[y * (ancho + 1) + 1 + x], 255);
  assert.ok(qrAPng(qr, { escala: 1 }).length < qrAPng(qr, { escala: 20 }).length);
  assert.equal(crc32(Buffer.from("IEND")), 0xae426082, "el CRC de un trozo IEND vacío es el conocido del estándar PNG");
});

test("EE-09: la máscara elegida es la de MENOR penalización (reglas N1 a N4); las ocho penalizaciones no son iguales y la elección no es siempre la máscara 0", () => {
  const textos = [URL_DE_EJEMPLO, "https://escuela.ejemplo.test/l/a?c=ABCD2EFG", "Hola", "https://escuela.ejemplo.test/l/vertical-dos?org=otra-escuela&c=ZZZZ2222&s=22222222-2222-4222-8222-222222222222&utm_source=anuncio", "Año nuevo, ¡clase gratis! 🎉"];
  const elegidas = new Set<number>();
  for (const texto of textos) {
    for (const nivel of ["L", "M", "Q"] as const) {
      const p = penalizacionesPorMascara(texto, nivel);
      assert.equal(p.length, 8);
      assert.ok(new Set(p).size > 1, "las máscaras se penalizan distinto");
      const qr = crearQr(texto, nivel);
      assert.equal(qr.mascara, p.indexOf(Math.min(...p)), `${nivel}: ${texto.slice(0, 30)}`);
      elegidas.add(qr.mascara);
    }
  }
  assert.ok(elegidas.size > 1, "se eligen máscaras distintas según el contenido");
});
