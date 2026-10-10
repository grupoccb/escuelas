// Constantes de la demo que comparten el generador de datos vivos (src/demo/vivos.ts) y el comando `demo:todo` (scripts/lib/demo-todo.ts). Sin dependencias.

/** Prefijo del bloque de teléfonos reservado a la demo viva (el de la historia es `+52559900`, ver generador.ts). */
export const MARCA_DE_DEMO_VIVA = "+52559901";

/** La familia que recepción encuentra con la primera mensualidad y un uniforme por cobrar (para decirlo en el resumen del comando). Nombres de ejemplo. */
export const FAMILIA_CON_COBRO = { tutor: "Marisol", apellidos: "Vivanco Lozano", telefonoNacional: "55 9901 0009" } as const;
