// Un valor MARCADO como sensible. Envuelve el dato para que, si por descuido llega a un log, a
// `JSON.stringify`, a una plantilla de texto o a `console.log`, salga `[REDACTADO]` y no el valor.
// La única forma de verlo es llamar a `revelar()`, a propósito (p. ej. al armar la respuesta de la
// API de salud, que ya pasó por el permiso y el registro de accesos).

export const REDACTADO = "[REDACTADO]";

const INSPECCION = Symbol.for("nodejs.util.inspect.custom");

export class Sensible<T = unknown> {
  readonly #valor: T;

  constructor(valor: T) {
    this.#valor = valor;
  }

  /** El valor real. Llamarlo es una decisión explícita. */
  revelar(): T {
    return this.#valor;
  }

  toJSON(): string {
    return REDACTADO;
  }

  toString(): string {
    return REDACTADO;
  }

  [Symbol.toPrimitive](): string {
    return REDACTADO;
  }

  [INSPECCION](): string {
    return REDACTADO;
  }
}

export function esSensible(valor: unknown): valor is Sensible {
  return valor instanceof Sensible;
}
