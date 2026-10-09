// Los beneficios de una promoción en palabras de una persona. El servidor valida las combinaciones (tipo, modo, valor); esto solo las presenta y arma el cuerpo.

import { normalizarCaptura } from "../../lib/dinero.ts";

export type ValorSegun = "porcentaje" | "monto" | "meses" | "ninguno";

export interface OpcionDeBeneficio {
  clave: string;
  texto: string;
  tipo: string;
  modo: string;
  valor: ValorSegun;
}

export const OPCIONES_DE_BENEFICIO: readonly OpcionDeBeneficio[] = [
  { clave: "insc_pct", texto: "Descuento en la inscripción (porcentaje)", tipo: "descuento_inscripcion", modo: "porcentaje", valor: "porcentaje" },
  { clave: "insc_monto", texto: "Descuento en la inscripción (monto fijo)", tipo: "descuento_inscripcion", modo: "monto_fijo", valor: "monto" },
  { clave: "insc_gratis", texto: "Inscripción gratis", tipo: "descuento_inscripcion", modo: "total", valor: "ninguno" },
  { clave: "mens_pct", texto: "Descuento en la mensualidad (porcentaje)", tipo: "descuento_mensualidad", modo: "porcentaje", valor: "porcentaje" },
  { clave: "mens_monto", texto: "Descuento en la mensualidad (monto fijo)", tipo: "descuento_mensualidad", modo: "monto_fijo", valor: "monto" },
  { clave: "mens_gratis", texto: "Mensualidad gratis", tipo: "descuento_mensualidad", modo: "total", valor: "ninguno" },
  { clave: "meses", texto: "Meses gratis", tipo: "meses_gratis", modo: "total", valor: "meses" },
  { clave: "producto", texto: "Producto gratis (por ejemplo, un uniforme)", tipo: "producto_gratis", modo: "total", valor: "ninguno" },
];

export const CONDICIONES = [
  { valor: "sin_condicion", texto: "Sin condición (aplica al inscribirse)" },
  { valor: "al_pagar_primera_mensualidad", texto: "Al pagar la primera mensualidad" },
  { valor: "min_hermanos", texto: "Por hermanos inscritos" },
  { valor: "pago_anticipado", texto: "Por pago anticipado de meses" },
] as const;

export const MOMENTOS = [
  { valor: "inmediato", texto: "En el momento de inscribirse" },
  { valor: "al_cumplir_condicion", texto: "Al cumplirse la condición" },
] as const;

export function opcionDe(tipo: string, modo: string): OpcionDeBeneficio | undefined {
  return OPCIONES_DE_BENEFICIO.find((o) => o.tipo === tipo && o.modo === modo);
}

/** «15» → «15 %», «150.00» → «$150.00», «2» → «2 meses»: el texto del beneficio ya guardado. */
export function textoDeBeneficio(b: { tipo: string; modo: string; valor: string | null; descripcion: string | null }): string {
  const o = opcionDe(b.tipo, b.modo);
  const base = o?.texto.replace(/ \(.*\)$/, "") ?? `${b.tipo} ${b.modo}`;
  const valor = b.valor === null ? "" : o?.valor === "porcentaje" ? ` ${b.valor.replace(/\.00$/, "")} %` : o?.valor === "meses" ? ` ${b.valor.replace(/\.00$/, "")}` : o?.valor === "monto" ? ` $${b.valor}` : "";
  return `${base}${valor}${b.descripcion ? ` (${b.descripcion})` : ""}`;
}

/** El valor escrito → el que manda la API, o el error en palabras. `ninguno` no lleva valor. */
export function valorDeBeneficio(segun: ValorSegun, escrito: string): { valor: string | null } | { error: string } {
  if (segun === "ninguno") return { valor: null };
  const t = escrito.trim();
  if (segun === "meses") return /^([1-9]|1\d|2[0-4])$/.test(t) ? { valor: t } : { error: "Escribe cuántos meses (de 1 a 24)" };
  // Sin pasar por números: 0.01 a 100.00 con a lo más dos decimales.
  if (segun === "porcentaje") return /^(100(\.0{1,2})?|\d{1,2}(\.\d{1,2})?)$/.test(t) && !/^0+(\.0+)?$/.test(t) ? { valor: t } : { error: "Escribe un porcentaje de 0.01 a 100" };
  const m = normalizarCaptura(t);
  return m !== null && m !== "0.00" ? { valor: m } : { error: "Escribe un monto válido, por ejemplo 150 o 150.50" };
}
