// Validación de lo que se guarda en una promoción (C3), pura. La misma lógica la usan la API y el resolver.
//
//   condicion_valor según condicion_tipo:
//     sin_condicion, al_pagar_primera_mensualidad   → nulo
//     min_hermanos      → { "hermanos": n }  n ≥ 2: hijos de la familia inscritos CONTANDO al que se inscribe
//                         (2 = este y al menos un hermano ya inscrito)
//     pago_anticipado   → { "meses": n }     n ≥ 1: meses pagados por adelantado al inscribirse
//
//   beneficio (tipo, modo, valor):
//     descuento_inscripcion | descuento_mensualidad: modo porcentaje (valor 0.01–100), monto_fijo (valor > 0) o total (sin valor)
//     producto_gratis: modo total, sin valor
//     meses_gratis:    modo total, valor = número de meses (entero 1–24)

import { cabeEnDecimal, cantidadEntera, deTexto, ErrorDeDinero, porcentajeABasisPoints } from "../lib/dinero.ts";
import { type Condicion, type CondicionTipo, type ModoDeBeneficio, type TipoDeBeneficio } from "./tipos.ts";

export type Validacion<T> = { ok: true; valor: T } | { ok: false; errores: { campo: string; mensaje: string }[] };

const mal = (campo: string, mensaje: string): { ok: false; errores: { campo: string; mensaje: string }[] } => ({ ok: false, errores: [{ campo, mensaje }] });

const esEnteroEn = (x: unknown, min: number, max: number): x is number => typeof x === "number" && Number.isInteger(x) && x >= min && x <= max;

/** Valida `condicion_valor` contra su tipo. Devuelve el JSON normalizado a guardar (o null). */
export function validarCondicion(tipo: CondicionTipo, valor: unknown): Validacion<Record<string, number> | null> {
  if (tipo === "sin_condicion" || tipo === "al_pagar_primera_mensualidad") {
    return valor === undefined || valor === null ? { ok: true, valor: null } : mal("condicion_valor", `La condición «${tipo}» no lleva valor`);
  }
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return mal("condicion_valor", `La condición «${tipo}» necesita un objeto`);
  const o = valor as Record<string, unknown>;
  const clave = tipo === "min_hermanos" ? "hermanos" : "meses";
  const extra = Object.keys(o).filter((k) => k !== clave);
  if (extra.length > 0) return mal(`condicion_valor.${extra[0]}`, "Campo desconocido");
  const [min, max] = tipo === "min_hermanos" ? [2, 20] : [1, 24];
  if (!esEnteroEn(o[clave], min, max)) return mal(`condicion_valor.${clave}`, `Debe ser un entero de ${min} a ${max}`);
  return { ok: true, valor: { [clave]: o[clave] } };
}

/** La condición lista para el resolver, a partir de lo guardado. Lanza si lo guardado es incoherente. */
export function condicionDe(tipo: CondicionTipo, valor: unknown): Condicion {
  const v = validarCondicion(tipo, valor);
  if (!v.ok) throw new Error(`Condición guardada inválida (${tipo}): ${v.errores[0]!.mensaje}`);
  if (tipo === "min_hermanos") return { tipo, hermanos: v.valor!["hermanos"]! };
  if (tipo === "pago_anticipado") return { tipo, meses: v.valor!["meses"]! };
  return { tipo };
}

/** Valida tipo, modo y valor de un beneficio. `valor` va como texto («15», «150.00», «2»). Devuelve el valor normalizado («15.00») o null. */
export function validarBeneficio(tipo: TipoDeBeneficio, modo: ModoDeBeneficio, valor: string | null | undefined): Validacion<string | null> {
  const sinValor = valor === undefined || valor === null;
  if (tipo === "producto_gratis") {
    if (modo !== "total") return mal("modo", "Un producto gratis es de modo «total»");
    return sinValor ? { ok: true, valor: null } : mal("valor", "Un producto gratis no lleva valor");
  }
  if (tipo === "meses_gratis") {
    if (modo !== "total") return mal("modo", "Los meses gratis son de modo «total»");
    if (sinValor) return mal("valor", "Indica cuántos meses (entero de 1 a 24)");
    if (!/^\d{1,2}$/.test(valor)) return mal("valor", "Debe ser un entero de 1 a 24");
    const meses = cantidadEntera(`${valor}.00`);
    return meses >= 1 && meses <= 24 ? { ok: true, valor: `${meses}.00` } : mal("valor", "Debe ser un entero de 1 a 24");
  }
  // descuento_inscripcion | descuento_mensualidad
  if (modo === "total") return sinValor ? { ok: true, valor: null } : mal("valor", "Un descuento «total» (gratis) no lleva valor");
  if (sinValor) return mal("valor", modo === "porcentaje" ? "Indica el porcentaje (0.01 a 100)" : "Indica el monto");
  try {
    if (modo === "porcentaje") {
      const bp = porcentajeABasisPoints(valor);
      if (bp < 1n || bp > 10_000n) return mal("valor", "El porcentaje debe estar entre 0.01 y 100");
      return { ok: true, valor: `${bp / 100n}.${(bp % 100n).toString().padStart(2, "0")}` };
    }
    const c = deTexto(valor);
    if (c < 1n || !cabeEnDecimal(c)) return mal("valor", "El monto debe ser mayor que 0 y caber en 9 999 999 999.99");
    return { ok: true, valor: `${c / 100n}.${(c % 100n).toString().padStart(2, "0")}` };
  } catch (e) {
    if (e instanceof ErrorDeDinero) return mal("valor", "Valor inválido: dígitos con a lo más dos decimales, sin comas ni símbolos");
    throw e;
  }
}
