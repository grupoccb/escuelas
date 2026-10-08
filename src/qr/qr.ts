// Codificador de códigos QR (E3), sin dependencias: modo de bytes (UTF-8), versiones 1 a 10 y corrección de errores L, M y Q. Es suficiente para la URL de una
// landing (hasta 213 bytes con el nivel M). Sigue ISO/IEC 18004: datos + relleno, bloques con Reed-Solomon sobre GF(256) (polinomio 0x11D), intercalado, patrones
// de función (buscadores, sincronía, alineación), colocación en zigzag, las 8 máscaras con su penalización (reglas N1 a N4), y la información de formato y de
// versión con sus códigos BCH. El test decodifica lo que genera con una librería de lectura independiente (jsQR, solo en desarrollo) para cada nivel y varias versiones.
//
//   const qr = crearQr("https://escuela.example/l/vertical?c=ABCD2EFG");   // { version, nivel, tamano, modulos[fila][columna] (true = oscuro), mascara }

export type NivelQr = "L" | "M" | "Q";

export class QrDemasiadoLargo extends Error {}

export interface Qr {
  version: number;
  nivel: NivelQr;
  /** Módulos por lado (21 en la versión 1, +4 por versión). */
  tamano: number;
  /** `modulos[fila][columna]`: true = módulo oscuro. Sin la zona de silencio. */
  modulos: boolean[][];
  mascara: number;
}

export const VERSION_MAXIMA = 10;

// Por versión (índice = versión; 0 sin uso): codewords por bloque de corrección y número de bloques, según el nivel. Sacados de la tabla 9 del estándar.
const ECC_POR_BLOQUE: Record<NivelQr, readonly number[]> = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
};
const NUM_BLOQUES: Record<NivelQr, readonly number[]> = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
};
/** Codewords totales (datos + corrección) por versión. */
const CODEWORDS_TOTALES = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
/** Posiciones de los patrones de alineación por versión. */
const ALINEACION: readonly (readonly number[])[] = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
/** Los 2 bits del nivel en la información de formato. */
const BITS_DE_NIVEL: Record<NivelQr, number> = { L: 1, M: 0, Q: 3 };

const tamanoDe = (version: number): number => 17 + 4 * version;

/** Bits de módulos disponibles para datos en esa versión (sin patrones de función), antes de restar los bits sobrantes. */
function modulosDeDatos(version: number): number {
  const v = version;
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (v >= 7) r -= 36;
  }
  return r;
}

const codewordsDeDatos = (version: number, nivel: NivelQr): number => CODEWORDS_TOTALES[version]! - ECC_POR_BLOQUE[nivel][version]! * NUM_BLOQUES[nivel][version]!;

// ── Reed-Solomon sobre GF(256) ───────────────────────────────────────────────────────────────────────────────

function multiplicarGf(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** Los coeficientes del polinomio divisor de grado `grado` (sin el término mayor, que es 1), del mayor al menor. */
function divisorRs(grado: number): number[] {
  const resultado = new Array<number>(grado).fill(0);
  resultado[grado - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grado; i++) {
    for (let j = 0; j < grado; j++) {
      resultado[j] = multiplicarGf(resultado[j]!, raiz);
      if (j + 1 < grado) resultado[j] = resultado[j]! ^ resultado[j + 1]!;
    }
    raiz = multiplicarGf(raiz, 0x02);
  }
  return resultado;
}

function residuoRs(datos: readonly number[], divisor: readonly number[]): number[] {
  const resultado = divisor.map(() => 0);
  for (const b of datos) {
    const factor = b ^ resultado.shift()!;
    resultado.push(0);
    divisor.forEach((coef, i) => {
      resultado[i] = resultado[i]! ^ multiplicarGf(coef, factor);
    });
  }
  return resultado;
}

// ── Datos ────────────────────────────────────────────────────────────────────────────────────────────────────

function bitsDeBytes(bytes: Uint8Array, version: number): number[] {
  const bits: number[] = [];
  const poner = (valor: number, cuantos: number): void => {
    for (let i = cuantos - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };
  poner(0b0100, 4); // modo de bytes
  poner(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) poner(b, 8);
  return bits;
}

/** La versión más chica en la que caben los bytes con ese nivel, o lanza `QrDemasiadoLargo`. */
export function versionMinima(largoEnBytes: number, nivel: NivelQr): number {
  for (let v = 1; v <= VERSION_MAXIMA; v++) {
    const bitsNecesarios = 4 + (v < 10 ? 8 : 16) + 8 * largoEnBytes;
    if (bitsNecesarios <= codewordsDeDatos(v, nivel) * 8) return v;
  }
  throw new QrDemasiadoLargo(`El texto (${largoEnBytes} bytes) no cabe en un QR de versión ${VERSION_MAXIMA} con corrección ${nivel}`);
}

/** Cuántos bytes caben como máximo en la versión 10 con ese nivel. */
export function capacidadMaximaEnBytes(nivel: NivelQr): number {
  return Math.floor((codewordsDeDatos(VERSION_MAXIMA, nivel) * 8 - 4 - 16) / 8);
}

function palabrasDeDatos(bytes: Uint8Array, version: number, nivel: NivelQr): number[] {
  const bits = bitsDeBytes(bytes, version);
  const capacidad = codewordsDeDatos(version, nivel) * 8;
  for (let i = 0; i < 4 && bits.length < capacidad; i++) bits.push(0); // terminador
  while (bits.length % 8 !== 0) bits.push(0);
  const palabras: number[] = [];
  for (let i = 0; i < bits.length; i += 8) palabras.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let relleno = 0xec; palabras.length < capacidad / 8; relleno ^= 0xec ^ 0x11) palabras.push(relleno);
  return palabras;
}

/** Parte los datos en bloques, calcula la corrección de cada uno e intercala (primero los datos, luego la corrección). */
function intercalar(datos: readonly number[], version: number, nivel: NivelQr): number[] {
  const bloques = NUM_BLOQUES[nivel][version]!;
  const eccPorBloque = ECC_POR_BLOQUE[nivel][version]!;
  const totalBloque = Math.floor(CODEWORDS_TOTALES[version]! / bloques);
  const bloquesCortos = bloques - (CODEWORDS_TOTALES[version]! % bloques);
  const largoCorto = totalBloque - eccPorBloque;
  const divisor = divisorRs(eccPorBloque);
  const partes: { datos: number[]; ecc: number[] }[] = [];
  for (let i = 0, k = 0; i < bloques; i++) {
    const d = datos.slice(k, k + largoCorto + (i < bloquesCortos ? 0 : 1));
    k += d.length;
    partes.push({ datos: d, ecc: residuoRs(d, divisor) });
  }
  const salida: number[] = [];
  for (let i = 0; i <= largoCorto; i++) for (let j = 0; j < partes.length; j++) if (i !== largoCorto || j >= bloquesCortos) salida.push(partes[j]!.datos[i]!);
  for (let i = 0; i < eccPorBloque; i++) for (const p of partes) salida.push(p.ecc[i]!);
  return salida;
}

// ── La matriz ────────────────────────────────────────────────────────────────────────────────────────────────

class Matriz {
  readonly version: number;
  readonly tamano: number;
  readonly modulos: boolean[][];
  readonly esFuncion: boolean[][];

  constructor(version: number) {
    this.version = version;
    this.tamano = tamanoDe(version);
    this.modulos = Array.from({ length: this.tamano }, () => new Array<boolean>(this.tamano).fill(false));
    this.esFuncion = Array.from({ length: this.tamano }, () => new Array<boolean>(this.tamano).fill(false));
  }

  poner(x: number, y: number, oscuro: boolean): void {
    this.modulos[y]![x] = oscuro;
    this.esFuncion[y]![x] = true;
  }

  dibujarPatronesDeFuncion(nivel: NivelQr): void {
    const n = this.tamano;
    for (let i = 0; i < n; i++) {
      this.poner(6, i, i % 2 === 0);
      this.poner(i, 6, i % 2 === 0);
    }
    this.buscador(3, 3);
    this.buscador(n - 4, 3);
    this.buscador(3, n - 4);
    const pos = ALINEACION[this.version]!;
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) continue; // coinciden con los buscadores
        this.alineacion(pos[i]!, pos[j]!);
      }
    }
    this.dibujarFormato(nivel, 0); // reserva el sitio (se vuelve a dibujar con la máscara elegida)
    this.dibujarVersion();
  }

  private buscador(cx: number, cy: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < this.tamano && y >= 0 && y < this.tamano) this.poner(x, y, dist !== 2 && dist !== 4);
      }
    }
  }

  private alineacion(cx: number, cy: number): void {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.poner(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }

  /** La información de formato (nivel + máscara) con su BCH(15,5), en las dos copias, y el módulo oscuro fijo. */
  dibujarFormato(nivel: NivelQr, mascara: number): void {
    const datos = (BITS_DE_NIVEL[nivel] << 3) | mascara;
    let resto = datos;
    for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
    const bits = ((datos << 10) | resto) ^ 0x5412;
    const bit = (i: number): boolean => ((bits >>> i) & 1) !== 0;
    const n = this.tamano;
    for (let i = 0; i <= 5; i++) this.poner(8, i, bit(i));
    this.poner(8, 7, bit(6));
    this.poner(8, 8, bit(7));
    this.poner(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.poner(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.poner(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.poner(8, n - 15 + i, bit(i));
    this.poner(8, n - 8, true); // el módulo oscuro
  }

  /** La información de versión (solo desde la 7) con su BCH(18,6), en las dos copias. */
  private dibujarVersion(): void {
    if (this.version < 7) return;
    let resto = this.version;
    for (let i = 0; i < 12; i++) resto = (resto << 1) ^ ((resto >>> 11) * 0x1f25);
    const bits = (this.version << 12) | resto;
    const n = this.tamano;
    for (let i = 0; i < 18; i++) {
      const oscuro = ((bits >>> i) & 1) !== 0;
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.poner(a, b, oscuro);
      this.poner(b, a, oscuro);
    }
  }

  /** Coloca los bits en zigzag, de abajo hacia arriba y de derecha a izquierda, saltando la columna de sincronía. */
  dibujarPalabras(palabras: readonly number[]): void {
    let i = 0;
    for (let par = this.tamano - 1; par >= 1; par -= 2) {
      // La columna de sincronía (la 6) no lleva datos: los pares de la izquierda se corren una columna (6,5 → 5,4; 4,3 → 3,2; 2,1 → 1,0).
      const derecha = par <= 6 ? par - 1 : par;
      for (let vert = 0; vert < this.tamano; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = derecha - j;
          const haciaArriba = ((derecha + 1) & 2) === 0;
          const y = haciaArriba ? this.tamano - 1 - vert : vert;
          if (!this.esFuncion[y]![x] && i < palabras.length * 8) {
            this.modulos[y]![x] = ((palabras[i >>> 3]! >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  aplicarMascara(mascara: number): void {
    for (let y = 0; y < this.tamano; y++) {
      for (let x = 0; x < this.tamano; x++) {
        if (this.esFuncion[y]![x]) continue;
        const invertir =
          mascara === 0 ? (x + y) % 2 === 0
          : mascara === 1 ? y % 2 === 0
          : mascara === 2 ? x % 3 === 0
          : mascara === 3 ? (x + y) % 3 === 0
          : mascara === 4 ? (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
          : mascara === 5 ? ((x * y) % 2) + ((x * y) % 3) === 0
          : mascara === 6 ? (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
          : (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        if (invertir) this.modulos[y]![x] = !this.modulos[y]![x];
      }
    }
  }

  /** Penalización de la matriz con las cuatro reglas del estándar (N1: rachas, N2: bloques 2×2, N3: patrones tipo buscador, N4: balance de oscuros). */
  penalizacion(): number {
    const n = this.tamano;
    const m = this.modulos;
    let total = 0;
    const lineas: boolean[][] = [...m, ...Array.from({ length: n }, (_, x) => m.map((fila) => fila[x]!))];
    for (const linea of lineas) {
      let racha = 1;
      for (let i = 1; i < n; i++) {
        if (linea[i] === linea[i - 1]) {
          racha++;
          if (racha === 5) total += 3;
          else if (racha > 5) total += 1;
        } else {
          racha = 1;
        }
      }
      // N3: 1:1:3:1:1 (oscuro-claro-oscuro×3-claro-oscuro) con 4 claros a un lado.
      for (let i = 0; i + 11 <= n; i++) {
        const t = linea.slice(i, i + 11).map((b) => (b ? 1 : 0)).join("");
        if (t === "10111010000" || t === "00001011101") total += 40;
      }
    }
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) if (m[y]![x] === m[y]![x + 1] && m[y]![x] === m[y + 1]![x] && m[y]![x] === m[y + 1]![x + 1]) total += 3;
    const oscuros = m.reduce((a, fila) => a + fila.filter(Boolean).length, 0);
    const porcentaje = (oscuros * 100) / (n * n);
    total += Math.floor(Math.abs(porcentaje - 50) / 5) * 10;
    return total;
  }
}

/**
 * Codifica un texto (UTF-8) como un QR. Por omisión usa el nivel M (corrige hasta el 15 % de daño) y la versión más chica en la que cabe; si no cabe
 * en la versión 10, lanza `QrDemasiadoLargo`. DETERMINISTA: el mismo texto da siempre la misma matriz.
 */
export function crearQr(texto: string, nivel: NivelQr = "M"): Qr {
  const bytes = new TextEncoder().encode(texto);
  const version = versionMinima(bytes.length, nivel);
  const palabras = intercalar(palabrasDeDatos(bytes, version, nivel), version, nivel);
  let mejor: { matriz: Matriz; mascara: number; penalizacion: number } | null = null;
  for (let mascara = 0; mascara < 8; mascara++) {
    const matriz = new Matriz(version);
    matriz.dibujarPatronesDeFuncion(nivel);
    matriz.dibujarPalabras(palabras);
    matriz.aplicarMascara(mascara);
    matriz.dibujarFormato(nivel, mascara);
    const penalizacion = matriz.penalizacion();
    if (mejor === null || penalizacion < mejor.penalizacion) mejor = { matriz, mascara, penalizacion };
  }
  const elegida = mejor!;
  return { version, nivel, tamano: elegida.matriz.tamano, modulos: elegida.matriz.modulos, mascara: elegida.mascara };
}

/** Los módulos sobrantes al final del área de datos (0, 3, 4 o 7 según la versión): solo para las pruebas del estándar. */
export const bitsSobrantes = (version: number): number => modulosDeDatos(version) - CODEWORDS_TOTALES[version]! * 8;
