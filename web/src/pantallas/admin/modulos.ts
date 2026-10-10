// Lo puro de la pantalla de módulos: por qué un interruptor no se puede mover todavía y qué cambia al moverlo. El servidor decide (y rechaza con 409); esto solo lo adelanta para que la
// persona vea qué hacer primero en vez de toparse con un error, y para que sepa, antes de apagar algo, qué pierde cada quien.

import type { ModuloId } from "../../api/tipos.ts";

export interface ModuloDeLista {
  id: ModuloId;
  nombre: string;
  incluye: string;
  requiere: ModuloId[];
  obligatorio: boolean;
  encendido: boolean;
}

/** Qué cambia, dicho para la escuela, al encender y al apagar cada módulo (la captación no se apaga). */
export const QUE_CAMBIA: Record<Exclude<ModuloId, "captacion">, { enciende: string; apaga: string }> = {
  cotizador: {
    enciende: "El asistente de WhatsApp ofrece horarios, lugares y precio según la edad; el asesor puede cotizar y funciona la lista de espera.",
    apaga: "El asistente de WhatsApp ya no ofrece horarios ni precios y pasa directo al asesor; el asesor ya no puede cotizar y la lista de espera se pausa.",
  },
  clase_muestra: {
    enciende: "Aparece «Hoy» para el maestro, el asesor puede agendar clases muestra y las familias reciben sus recordatorios.",
    apaga: "El maestro pierde «Hoy»; ya no se agendan clases muestra y dejan de salir los avisos y recordatorios de la clase muestra.",
  },
  inscripcion: {
    enciende: "El asesor puede convertir un lead en familia y alumno; aparecen «Alumnos» y «Familias»; sale el mensaje de bienvenida.",
    apaga: "El asesor ya no puede inscribir a un lead; desaparecen «Alumnos» y «Familias» y no sale el mensaje de bienvenida.",
  },
  operacion: {
    enciende: "El maestro pasa lista y se registran niveles y eventos.",
    apaga: "El maestro pierde «Pase de lista»; ya no se registran asistencias, niveles ni eventos.",
  },
  finanzas: {
    enciende: "Recepción cobra, ve estados de cuenta, entrega uniformes y vende productos; salen los recordatorios de pago.",
    apaga: "Recepción pierde «Registrar pago», «Estado de cuenta», «Uniformes», «Ventas» y «Cierre del día»; dejan de salir los recordatorios de pago.",
  },
  tableros: {
    enciende: "Aparece «Tableros» para quien lo ve: clases muestra, costo por campaña y el ejecutivo.",
    apaga: "Desaparece «Tableros»: ya no se ven los reportes.",
  },
};

/** Lo que cambia al mover el interruptor de ese módulo (vacío para la captación, que no se mueve). */
export function queCambia(id: ModuloId, encender: boolean): string {
  if (id === "captacion") return "";
  return encender ? QUE_CAMBIA[id].enciende : QUE_CAMBIA[id].apaga;
}

/** Los que hay que APAGAR antes de apagar `id`: todos los encendidos que lo necesitan, directa o indirectamente, empezando por los de más arriba (el orden en que hay que apagarlos). */
export function porApagarAntes(id: ModuloId, todos: readonly ModuloDeLista[]): ModuloDeLista[] {
  const dependientes = new Set<ModuloId>();
  for (let cambio = true; cambio; ) {
    cambio = false;
    for (const m of todos) {
      if (!m.encendido || dependientes.has(m.id)) continue;
      if (m.requiere.some((r) => r === id || dependientes.has(r))) {
        dependientes.add(m.id);
        cambio = true;
      }
    }
  }
  // La lista llega en orden de dependencia (cada módulo después de lo que necesita): al revés, los de más arriba primero.
  return todos.filter((m) => dependientes.has(m.id)).reverse();
}

/** Los que hay que ENCENDER antes de encender `id`: lo que le falta, directa o indirectamente, en el orden en que hay que encenderlos. */
export function porEncenderAntes(id: ModuloId, todos: readonly ModuloDeLista[]): ModuloDeLista[] {
  const faltan = new Set<ModuloId>();
  const buscar = (de: ModuloId): void => {
    const m = todos.find((x) => x.id === de);
    for (const r of m?.requiere ?? []) {
      const base = todos.find((x) => x.id === r);
      if (base && !base.encendido && !faltan.has(r)) {
        faltan.add(r);
        buscar(r);
      }
    }
  };
  buscar(id);
  return todos.filter((m) => faltan.has(m.id));
}

/** El texto de por qué NO se puede mover el interruptor de `modulo` (o null si se puede). */
export function explicarCambioDeModulo(modulo: ModuloDeLista, todos: readonly ModuloDeLista[]): string | null {
  if (modulo.obligatorio) return null;
  if (!modulo.encendido) {
    const faltan = porEncenderAntes(modulo.id, todos);
    return faltan.length > 0 ? `Para encenderlo, primero enciende: ${faltan.map((m) => m.nombre).join(", ")}.` : null;
  }
  const dependientes = porApagarAntes(modulo.id, todos);
  return dependientes.length > 0 ? `Para apagarlo, primero apaga: ${dependientes.map((m) => m.nombre).join(", ")}.` : null;
}
