// Geometría de las gráficas, sin números flotantes: el largo de una barra es un porcentaje con un decimal calculado con enteros (`bigint`), también para los importes.

/** Cuánto mide `valor` frente a `maximo`, de 0 a 100 con un decimal, como texto («37.5»). Sin máximo (o máximo cero) no hay barra: «0.0». */
export function porcentajeDeBarra(valor: bigint, maximo: bigint): string {
  if (maximo <= 0n || valor <= 0n) return "0.0";
  const p = valor >= maximo ? 1000n : (valor * 1000n) / maximo;
  return `${p / 10n}.${p % 10n}`;
}

/** El mayor de una lista de bigint (0 si está vacía). */
export function maximoDe(valores: readonly bigint[]): bigint {
  return valores.reduce((m, v) => (v > m ? v : m), 0n);
}

export interface FilaDeBarra {
  clave: string;
  etiqueta: string;
  valor: bigint;
  /** Lo que se escribe junto a la barra («$1,200.00», «12 de 15»). */
  texto: string;
  /** Un segundo valor dibujado detrás (por ejemplo, las agendadas detrás de las asistidas). */
  fondo?: bigint;
  nota?: string;
}
