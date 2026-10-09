// Azar DETERMINISTA con semilla (mulberry32): la misma semilla produce siempre la misma secuencia. Lo usan los datos de demo (I4) y las pruebas de propiedad; NO es criptográfico y nunca
// decide nada de producción (invariante 10: sin azar en cupo, precios ni cálculos). Vive en `lib/` y no en `demo/` porque `check:dinero` vigila `demo/` y aquí solo hay conteos y probabilidades.

export interface Azar {
  /** Un entero en [min, max], ambos incluidos. */
  entre(min: number, max: number): number;
  /** Un elemento de una lista no vacía. */
  elegir<T>(xs: readonly T[]): T;
  /** Verdadero con probabilidad `p` (0 a 1). */
  chance(p: number): boolean;
  /** Presente, justificada o falta: «presente» con probabilidad `porcentajeDeAsistencia` (0 a 100) y, del resto, una de cada cuatro es justificada. */
  pase(porcentajeDeAsistencia: number): "presente" | "justificada" | "falta";
  /** Cuántos números se han consumido (para comparar dos corridas). */
  consumidos(): number;
}

function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function crearAzar(semilla: number): Azar {
  const generar = mulberry32(semilla);
  let consumidos = 0;
  const siguiente = (): number => {
    consumidos++;
    return generar();
  };
  const entre = (min: number, max: number): number => min + Math.floor(siguiente() * (max - min + 1));
  return {
    entre,
    elegir: <T>(xs: readonly T[]): T => {
      if (xs.length === 0) throw new Error("No hay de dónde elegir");
      return xs[entre(0, xs.length - 1)]!;
    },
    chance: (p) => siguiente() < p,
    consumidos: () => consumidos,
    pase: (porcentaje) => {
      const tirada = entre(0, 99);
      if (tirada < porcentaje) return "presente";
      return tirada < porcentaje + (100 - porcentaje) / 4 ? "justificada" : "falta";
    },
  };
}
