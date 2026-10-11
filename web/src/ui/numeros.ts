// Números que NO son dinero: píxeles, conteos y partes de una fecha. Viven fuera de las zonas de dinero (`scripts/check-dinero.ts`)
// para que la guarda de importes siga mirando solo lo que sí es dinero. Un importe nunca pasa por aquí: va en centavos (`lib/dinero.ts`).

/** Un texto de dígitos (año, mes, conteo) como número. */
export const enteroDeTexto = (texto: string): number => Number(texto);

/** Al píxel entero más cercano (.5 sube). */
export const pixelEntero = (valor: number): number => Math.round(valor);

/** Al píxel entero hacia abajo. */
export const pixelAbajo = (valor: number): number => Math.floor(valor);

/** `valor × porcentaje / 100`, en píxeles enteros. */
export const pixelesDelPorcentaje = (valor: number, porcentaje: number): number => pixelEntero((valor * porcentaje) / 100);
