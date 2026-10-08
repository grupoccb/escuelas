// Log en una línea JSON. Nunca recibe contenido de mensajes ni teléfonos completos.

type Nivel = "info" | "warn" | "error";

function escribir(nivel: Nivel, evento: string, datos: Record<string, unknown> = {}): void {
  const linea = JSON.stringify({ t: new Date().toISOString(), nivel, evento, ...datos });
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
