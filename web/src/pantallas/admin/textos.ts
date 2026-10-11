// Lógica pura de la pantalla «Textos del asistente» (V5): cómo se ve un mensaje con datos de ejemplo y qué huecos le faltan o le sobran, antes de mandarlo al servidor
// (que repite la validación: es la que manda). Sin React ni red.

export interface HuecoDeTexto {
  nombre: string;
  descripcion: string;
}

/** Lo que se pone en cada hueco para enseñar cómo se vería el mensaje. */
export const EJEMPLO_DE_HUECO: Record<string, string> = {
  nombre: "Sofía",
  edad: "8",
  disciplina: "la escuela",
  sucursal: "Centro",
  otra_sucursal: "Norte (Calle 5 #20)",
  programa: "Infantil",
  grupo: "Grupo de la tarde",
  horario: "lunes de 16:00 a 17:00",
  fecha: "lunes 12 de octubre a las 16:00",
  lista: "1. Primera opción\n2. Segunda opción",
};

/** El mensaje con datos de ejemplo. Una sola pasada, como el servidor. */
export function vistaPrevia(plantilla: string): string {
  return plantilla.replace(/\{([^{}]*)\}/g, (_t, n: string) => EJEMPLO_DE_HUECO[n] ?? "");
}

/** Los huecos escritos que este mensaje no admite, y los obligatorios que faltan. */
export function revisarHuecos(plantilla: string, admitidos: readonly string[], obligatorios: readonly string[]): { sobran: string[]; faltan: string[] } {
  const usados = new Set([...plantilla.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1] ?? ""));
  return { sobran: [...usados].filter((u) => !admitidos.includes(u)), faltan: obligatorios.filter((o) => !usados.has(o)) };
}

/** Las claves no llevan acentos; estas dos palabras sí los piden cuando se leen como título. */
const CON_ACENTO: Record<string, string> = { cotizacion: "cotización", pidio: "pidió" };

/** El nombre de un paso del asistente para la lista («pregunta_edad» → «Pregunta edad»): la clave ya está escrita en español y es lo único que el servidor da como nombre. */
export function tituloDeTexto(clave: string): string {
  const palabras = clave.replace(/_/g, " ").trim().split(" ").map((p) => CON_ACENTO[p] ?? p).join(" ");
  return palabras === "" ? clave : `${palabras.charAt(0).toUpperCase()}${palabras.slice(1)}`;
}

/** El mensaje en una sola línea para la lista, recortado a `largo` caracteres (con «…»); la lista ya lo corta con CSS, esto es para quien no ve el CSS (lectores, pruebas). */
export function resumenDeTexto(texto: string, largo = 90): string {
  const una = texto.replace(/\s+/g, " ").trim();
  return una.length <= largo ? una : `${una.slice(0, largo - 1).trimEnd()}…`;
}

/** ¿Lo escrito cambió lo que está guardado? (el espacio de más al principio o al final no cuenta: el servidor lo quita). */
export const hayCambioDeTexto = (escrito: string, guardado: string): boolean => escrito.trim() !== guardado.trim();
