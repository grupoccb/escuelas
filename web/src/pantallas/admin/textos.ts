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
