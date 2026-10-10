// Log en una línea JSON. Nunca recibe contenido de mensajes ni teléfonos completos.
//
// Teléfonos (K4): el log NUNCA los lleva completos. Quien loguea debe pasar `enmascararTelefono()`, pero además toda cadena que salga por aquí pasa por
// `enmascararTelefonosEnTexto`: un número de 10 a 15 dígitos (con o sin «+», con «whatsapp:» delante o no) se enmascara aunque venga en un mensaje de error,
// en un detalle de la base o en un campo que nadie pensó. Es una red de seguridad, no el mecanismo principal.
//
// Redacción automática (decisión 12): cualquier CLAVE sensible (datos de salud) o secreta
// (contraseñas, tokens, cookies) sale como `[REDACTADO]`, a cualquier profundidad, y cualquier valor
// envuelto en `Sensible` también. Es una red de seguridad: lo correcto es no pasar esos datos al log.

import { esClaveSecreta, esClaveSensible } from "../sensibles/campos.ts";
import { REDACTADO, esSensible } from "../sensibles/marca.ts";

type Nivel = "info" | "warn" | "error";

const PROFUNDIDAD_MAXIMA = 6;

/** Un número de teléfono dentro de un texto: 10 a 15 dígitos seguidos, sin letras, dígitos ni guiones pegados (así no toca UUID ni identificadores hexadecimales). */
const TELEFONO_EN_TEXTO = /(?<![A-Za-z0-9_-])\+?\d{10,15}(?![A-Za-z0-9_-])/g;

/**
 * V10 (EK-21): un teléfono escrito con separadores («55 1234 5678», «(55) 1234-5678», «+52 55 1234 5678», «55-1234-5678»). Reglas para no tocar lo que no lo es: grupos de dígitos
 * separados por UN espacio, punto o guion (con el primer grupo opcionalmente entre paréntesis), el ÚLTIMO grupo de exactamente cuatro dígitos, de 10 a 15 dígitos en total, sin
 * letras, dígitos, dos puntos ni guiones pegados a los lados. No son teléfonos: una fecha con hora («2026-10-09 03:18:02»), una dirección IP, un UUID, una lista de números
 * («10 20 30 40 50») ni un importe.
 */
const TELEFONO_CON_SEPARADORES = /(?<![A-Za-z0-9_.+-])(?:\+\d{1,3}[\s.-](?:\d[\s.-])?)?(?:\(\d{2,3}\)|\d{2,3})(?:[\s.-]\d{1,4}){1,4}[\s.-]\d{4}(?![A-Za-z0-9_:-]|[\s.-]\d)/g;

function esTelefonoConSeparadores(candidato: string): boolean {
  const digitos = candidato.replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 15) return false;
  if (/^\d{4}-\d{2}-\d{2}\b/.test(candidato)) return false; // fecha ISO
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(candidato)) return false; // IPv4
  return true;
}

/** "Falló el envío a +525512345678 (whatsapp:5512345678)" → "Falló el envío a +52******5678 (whatsapp:551***5678)"; «55 1234 5678» → «551***5678» (siempre se muestra solo el principio y los últimos cuatro). */
export function enmascararTelefonosEnTexto(texto: string): string {
  const sinSeparadores = texto.replace(TELEFONO_EN_TEXTO, (t) => enmascararTelefono(t) ?? "***");
  return sinSeparadores.replace(TELEFONO_CON_SEPARADORES, (t) => (esTelefonoConSeparadores(t) ? (enmascararTelefono(t.replace(/[^\d+]/g, "")) ?? "***") : t));
}

/** Copia del valor sin lo sensible. No muta el original. */
export function redactar(valor: unknown, profundidad = 0, vistos: WeakSet<object> = new WeakSet()): unknown {
  if (esSensible(valor)) return REDACTADO;
  if (typeof valor === "string") return enmascararTelefonosEnTexto(valor);
  if (valor === null || typeof valor !== "object") return typeof valor === "bigint" ? valor.toString() : valor;
  if (valor instanceof Date) return valor;
  if (valor instanceof Error) return { name: valor.name, message: enmascararTelefonosEnTexto(valor.message) };
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
