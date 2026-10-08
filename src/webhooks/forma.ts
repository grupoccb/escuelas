// WH: la «forma» de un evento, para dejar constancia SIN guardar su contenido. Un webhook o un formulario trae nombres, teléfonos y, a veces, texto libre de
// una familia (puede mencionar salud): nada de eso se copia a la constancia. Se guarda la estructura: qué claves venían, de qué tipo y de qué largo.
// Solo unas pocas claves de control (el nombre del evento, el tipo de mensaje…) conservan su valor cuando es una palabra corta y segura.

import { createHash } from "node:crypto";

const MAX_CLAVES = 40;
const MAX_PROFUNDIDAD = 5;
const MAX_ELEMENTOS_DE_LISTA = 3;
const MAX_BYTES = 3000;

/** Claves cuyo valor es una palabra de control (no un dato de la persona) y se conserva tal cual si es corta y de letras. */
const CLAVES_DE_CONTROL = new Set(["event", "message_type", "status", "channel", "content_type", "MessageStatus", "SmsStatus", "MessageType", "NumMedia"]);
const PALABRA_SEGURA = /^[A-Za-z0-9_.:-]{1,40}$/;

const limpiarClave = (k: string): string => k.replace(/[^\p{L}\p{N}_.:@-]/gu, "?").slice(0, 40);

function describir(valor: unknown, clave: string | null, profundidad: number): unknown {
  if (valor === null) return null;
  if (typeof valor === "string") {
    if (clave !== null && CLAVES_DE_CONTROL.has(clave) && PALABRA_SEGURA.test(valor)) return valor;
    return `texto(${[...valor].length})`;
  }
  if (typeof valor === "number") return Number.isSafeInteger(valor) ? "entero" : Number.isFinite(valor) ? "decimal" : "no_finito";
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "bigint") return "bigint";
  if (profundidad >= MAX_PROFUNDIDAD) return "…";
  if (Array.isArray(valor)) return { lista: valor.length, elementos: valor.slice(0, MAX_ELEMENTOS_DE_LISTA).map((v) => describir(v, null, profundidad + 1)) };
  if (typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    const claves = Object.keys(valor as object);
    for (const k of claves.slice(0, MAX_CLAVES)) salida[limpiarClave(k)] = describir((valor as Record<string, unknown>)[k], k, profundidad + 1);
    if (claves.length > MAX_CLAVES) salida["…"] = `${claves.length - MAX_CLAVES} claves más`;
    return salida;
  }
  return typeof valor;
}

/** La estructura del valor (tipos y largos, sin contenido), acotada a unos 3 KB. */
export function formaDe(valor: unknown): Record<string, unknown> {
  const forma = describir(valor, null, 0);
  const resultado = typeof forma === "object" && forma !== null && !Array.isArray(forma) ? (forma as Record<string, unknown>) : { valor: forma };
  return JSON.stringify(resultado).length > MAX_BYTES ? { truncado: true, claves: Object.keys(resultado).slice(0, MAX_CLAVES).map(limpiarClave) } : resultado;
}

/** La forma de un cuerpo que no es JSON legible: solo su tamaño y de qué tipo de caracteres está hecho. */
export function formaDeBytes(cuerpo: Buffer): Record<string, unknown> {
  return { bytes: cuerpo.length, vacio: cuerpo.length === 0, empieza_con: cuerpo.length === 0 ? null : cuerpo[0] === 0x7b ? "{" : cuerpo[0] === 0x5b ? "[" : "otro" };
}

/** SHA-256 recortado del cuerpo: la llave de idempotencia cuando el evento no trae un identificador del proveedor. */
export function huella(cuerpo: Buffer | string): string {
  return createHash("sha256").update(cuerpo).digest("hex").slice(0, 32);
}

/** Un identificador del proveedor apto para usarse como llave: sin NUL ni caracteres de control, de a lo más 120 caracteres. */
export function idSeguro(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isSafeInteger(valor)) return String(valor);
  if (typeof valor !== "string") return null;
  const limpio = [...valor].filter((c) => c.charCodeAt(0) > 31 && c.charCodeAt(0) !== 127).join("").trim().slice(0, 120);
  return limpio === "" ? null : limpio;
}
