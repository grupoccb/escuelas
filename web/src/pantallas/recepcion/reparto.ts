// El reparto de un pago entre los cargos de la familia (la propuesta la calcula el servidor; recepción puede ajustarla a mano) y la clave de idempotencia de cada
// envío. Puro y con pruebas: todo el dinero va en centavos exactos (`lib/dinero.ts`), nunca en flotantes.

import { aCentavos, comparar, normalizarCaptura, problemaDeImporte, restar, sumar, type ProblemaDeImporte } from "../../lib/dinero.ts";

export interface CargoAbierto {
  id: string;
  saldo: string;
}

export interface ResultadoDelReparto {
  ok: boolean;
  /** Solo los cargos con un importe mayor que cero. */
  aplicaciones: { cargo_id: string; monto: string }[];
  suma: string;
  /** Lo que falta (positivo) o sobra (negativo) para igualar el monto del pago. */
  diferencia: string;
  errores: Record<string, string>;
}

/** Valida un reparto escrito a mano: cada importe es un importe real, ninguno pasa del saldo de su cargo y todos suman EXACTAMENTE el pago. */
export function validarReparto(monto: string, cargos: readonly CargoAbierto[], ajuste: Readonly<Record<string, string>>): ResultadoDelReparto {
  const errores: Record<string, string> = {};
  const aplicaciones: { cargo_id: string; monto: string }[] = [];
  for (const c of cargos) {
    const escrito = (ajuste[c.id] ?? "").trim();
    if (escrito === "") continue;
    const valor = normalizarCaptura(escrito);
    if (valor === null) {
      errores[c.id] = mensajeDeCaptura(escrito) ?? "Escribe un importe válido (hasta dos decimales)";
      continue;
    }
    if (aCentavos(valor) === 0n) continue;
    if (comparar(valor, c.saldo) > 0) {
      errores[c.id] = "Pasa del saldo de este cargo";
      continue;
    }
    aplicaciones.push({ cargo_id: c.id, monto: valor });
  }
  const suma = sumar("0.00", ...aplicaciones.map((a) => a.monto));
  const diferencia = restar(monto, suma);
  return { ok: Object.keys(errores).length === 0 && aplicaciones.length > 0 && aCentavos(diferencia) === 0n, aplicaciones, suma, diferencia, errores };
}

/** Lo que identifica un pago: si cambia cualquier parte, es OTRO pago y necesita otra clave; si no cambia, un reintento lleva la misma. */
export function firmaDelPago(p: { tutor_id: string; monto: string; metodo: string; referencia: string; fecha: string; aplicaciones: readonly { cargo_id: string; monto: string }[] | null }): string {
  return JSON.stringify([p.tutor_id, p.monto, p.metodo, p.referencia.trim(), p.fecha, p.aplicaciones ? [...p.aplicaciones].sort((a, b) => (a.cargo_id < b.cargo_id ? -1 : 1)).map((a) => [a.cargo_id, a.monto]) : null]);
}

/** Lo que se le dice a Rita cuando el importe que tecleó no sirve: qué pasa y QUÉ hacer (V7). */
export function mensajeDeImporte(problema: ProblemaDeImporte | null): string | undefined {
  switch (problema) {
    case null:
      return undefined;
    case "negativo":
      return "Escribe un importe válido: no puede ser negativo. Anota cuánto te entregaron, por ejemplo 1500.";
    case "cero":
      return "El importe debe ser mayor que cero: anota cuánto te entregaron, por ejemplo 1500.";
    case "letras":
      return "Escribe un importe válido: solo números, por ejemplo 1500 o 1,250.50 (sin letras ni símbolos).";
    case "decimales":
      return "Escribe un importe válido: los centavos van con punto y a lo más dos decimales, por ejemplo 1250.50.";
    case "comas":
      return "Escribe un importe válido: la coma solo separa los miles (1,250); para los centavos usa punto, por ejemplo 1250.50.";
    case "enorme":
      return "Escribe un importe válido: es demasiado grande. Revisa que no sobren dígitos.";
  }
}

/** El mensaje de lo que se tecleó como importe (o `undefined` si está vacío o es un importe bueno). */
export const mensajeDeCaptura = (entrada: string): string | undefined => mensajeDeImporte(problemaDeImporte(entrada));

/** Una clave de idempotencia nueva (8 a 120 caracteres de `A-Za-z0-9._:-`, como pide la API). */
export function claveNueva(prefijo = "pago"): string {
  // `crypto.randomUUID()` solo existe en contexto seguro (HTTPS o localhost): por HTTP desde la red local (la demo en un celular) se arma con `getRandomValues` (UI-07).
  const uuid = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${prefijo}-${uuid}`;
}

/** Misma firma → misma clave (un doble clic o un reintento no duplica el pago); otra firma → clave nueva. */
export function claveParaEnvio(anterior: { firma: string; clave: string } | null, firma: string, prefijo = "pago"): { firma: string; clave: string } {
  return anterior && anterior.firma === firma ? anterior : { firma, clave: claveNueva(prefijo) };
}
