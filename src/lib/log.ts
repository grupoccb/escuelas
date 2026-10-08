// Log en una línea JSON. Nunca recibe contenido de mensajes ni teléfonos completos.
//
// Redacción automática (decisión 12): cualquier CLAVE sensible (datos de salud) o secreta
// (contraseñas, tokens, cookies) sale como `[REDACTADO]`, a cualquier profundidad, y cualquier valor
// envuelto en `Sensible` también. Es una red de seguridad: lo correcto es no pasar esos datos al log.

import { esClaveSecreta, esClaveSensible } from "../sensibles/campos.ts";
import { REDACTADO, esSensible } from "../sensibles/marca.ts";

type Nivel = "info" | "warn" | "error";

const PROFUNDIDAD_MAXIMA = 6;

/** Copia del valor sin lo sensible. No muta el original. */
export function redactar(valor: unknown, profundidad = 0, vistos: WeakSet<object> = new WeakSet()): unknown {
  if (esSensible(valor)) return REDACTADO;
  if (valor === null || typeof valor !== "object") return typeof valor === "bigint" ? valor.toString() : valor;
  if (valor instanceof Date) return valor;
  if (valor instanceof Error) return { name: valor.name, message: valor.message };
  if (vistos.has(valor)) return "[CICLO]";
  if (profundidad >= PROFUNDIDAD_MAXIMA) return "[PROFUNDO]";
  vistos.add(valor);
  try {
    if (Array.isArray(valor)) return valor.map((v) => redactar(v, profundidad + 1, vistos));
    const salida: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor)) {
      salida[clave] = esClaveSensible(clave) || esClaveSecreta(clave) ? REDACTADO : redactar(v, profundidad + 1, vistos);
    }
    return salida;
  } finally {
    vistos.delete(valor);
  }
}

function escribir(nivel: Nivel, evento: string, datos: Record<string, unknown> = {}): void {
  const linea = JSON.stringify({ t: new Date().toISOString(), nivel, evento, ...(redactar(datos) as Record<string, unknown>) });
  if (nivel === "error") console.error(linea);
  else console.log(linea);
}

export const log = {
  info: (evento: string, datos?: Record<string, unknown>) => escribir("info", evento, datos),
  warn: (evento: string, datos?: Record<string, unknown>) => escribir("warn", evento, datos),
  error: (evento: string, datos?: Record<string, unknown>) => escribir("error", evento, datos),
};

/** "+525512345678" → "+52******5678". */
export function enmascararTelefono(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  return telefono.length <= 7 ? "***" : `${telefono.slice(0, 3)}${"*".repeat(telefono.length - 7)}${telefono.slice(-4)}`;
}
