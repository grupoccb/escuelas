// Una cantidad dicha en palabras para la escuela: «1 grupo», «3 grupos». Nada de «grupo(s)» (eso es de un formulario, no de una persona).

/** `cantidad(1, "grupo", "grupos")` → «1 grupo»; `cantidad(3, "grupo", "grupos")` → «3 grupos» (0 también va en plural). */
export function cantidad(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Elige entre dos formas según la cantidad: `segun(1, "pásala", "pásalas")`. */
export function segun(n: number, uno: string, varios: string): string {
  return n === 1 ? uno : varios;
}
