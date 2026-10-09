// Lo puro de la pantalla de módulos: por qué un interruptor no se puede mover todavía. El servidor decide (y rechaza con 409); esto solo lo adelanta para que la persona vea
// qué hacer primero en vez de toparse con un error.

import type { ModuloId } from "../../api/tipos.ts";

export interface ModuloDeLista {
  id: ModuloId;
  nombre: string;
  incluye: string;
  requiere: ModuloId[];
  obligatorio: boolean;
  encendido: boolean;
}

/** El texto de por qué NO se puede mover el interruptor de `modulo` (o null si se puede). */
export function explicarCambioDeModulo(modulo: ModuloDeLista, todos: readonly ModuloDeLista[]): string | null {
  const nombre = (id: ModuloId): string => todos.find((m) => m.id === id)?.nombre ?? id;
  if (modulo.obligatorio) return null;
  if (!modulo.encendido) {
    const faltan = modulo.requiere.filter((r) => !todos.find((m) => m.id === r)?.encendido);
    return faltan.length > 0 ? `Para encenderlo, primero enciende: ${faltan.map(nombre).join(", ")}.` : null;
  }
  const dependientes = todos.filter((m) => m.encendido && m.requiere.includes(modulo.id));
  return dependientes.length > 0 ? `Para apagarlo, primero apaga: ${dependientes.map((m) => nombre(m.id)).join(", ")}.` : null;
}
