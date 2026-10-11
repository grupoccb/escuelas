// El reparto de un pago entre los cargos de la familia (la propuesta la calcula el servidor; recepción puede ajustarla a mano) y la clave de idempotencia de cada
// envío. Puro y con pruebas: todo el dinero va en centavos exactos (`lib/dinero.ts`), nunca en flotantes.

import { aCentavos, comparar, deCentavos, formatear, normalizarCaptura, problemaDeImporte, restar, sumar, type ProblemaDeImporte } from "../../lib/dinero.ts";
import type { CargoDeCuenta, EstadoDeCuenta, HijoDeCuenta } from "./tipos.ts";

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

// ─── R4a: cargos por hijo, cuánto cubre el monto escrito, atajos y folio ──────────────────────────────────────────────────────────────────────────────

/** Los cargos con saldo de un hijo, el que venció antes primero (el orden en que el servidor los paga). */
const abiertosDe = (h: HijoDeCuenta): CargoDeCuenta[] =>
  h.cargos.filter((c) => c.estatus !== "cancelado" && aCentavos(c.saldo) > 0n).sort((a, b) => (a.fecha_vencimiento < b.fecha_vencimiento ? -1 : a.fecha_vencimiento > b.fecha_vencimiento ? 1 : 0));

export interface GrupoDeCargos {
  alumno: HijoDeCuenta["alumno"];
  cargos: CargoDeCuenta[];
}

/** Los cargos con saldo agrupados por hijo (solo los hijos que deben algo), en el orden de la API. */
export function cargosPorHijo(e: Pick<EstadoDeCuenta, "hijos">): GrupoDeCargos[] {
  return e.hijos.map((h) => ({ alumno: h.alumno, cargos: abiertosDe(h) })).filter((g) => g.cargos.length > 0);
}

/** Todos los cargos con saldo de la familia, con el nombre de su hijo, el que venció antes primero. */
export function cargosAbiertos(e: Pick<EstadoDeCuenta, "hijos">): { cargo: CargoDeCuenta; hijo: string }[] {
  return e.hijos
    .flatMap((h) => abiertosDe(h).map((cargo) => ({ cargo, hijo: h.alumno.nombre })))
    .sort((a, b) => (a.cargo.fecha_vencimiento < b.cargo.fecha_vencimiento ? -1 : a.cargo.fecha_vencimiento > b.cargo.fecha_vencimiento ? 1 : 0));
}

export interface CoberturaDeCargo {
  /** `total`: el pago lo liquida; `parcial`: abona y queda resto; `ninguna`: el pago no le toca. */
  estado: "total" | "parcial" | "ninguna";
  aplica: string;
  queda: string;
  /** Entero de 0 a 100 como texto («37»): lo que llena la barra. Un abono, por pequeño que sea, llena al menos 1. */
  porcentaje: string;
}

/** Cuánto de un cargo (su saldo) cubre lo que el pago le aplica. Todo en centavos exactos. */
export function coberturaDeCargo(saldo: string, aplica: string | undefined): CoberturaDeCargo {
  const s = aCentavos(saldo);
  const a = aplica ? aCentavos(aplica) : 0n;
  if (a <= 0n || s <= 0n) return { estado: "ninguna", aplica: "0.00", queda: deCentavos(s), porcentaje: "0" };
  if (a >= s) return { estado: "total", aplica: deCentavos(s), queda: "0.00", porcentaje: "100" };
  const crudo = (a * 100n) / s;
  return { estado: "parcial", aplica: deCentavos(a), queda: deCentavos(s - a), porcentaje: (crudo === 0n ? 1n : crudo).toString() };
}

/** Lo que dice el renglón de un cargo bajo su barra. */
export function textoDeCobertura(c: CoberturaDeCargo, cargo: Pick<CargoDeCuenta, "estatus_efectivo" | "dias_de_atraso">): string {
  if (c.estado === "total") return "Este pago lo cubre";
  if (c.estado === "parcial") return `Se abonan ${formatear(c.aplica)}; quedan ${formatear(c.queda)}`;
  return cargo.estatus_efectivo === "vencido" ? `Vencido ${cargo.dias_de_atraso} d` : "Pendiente";
}

export interface AtajoDeMonto {
  clave: "todo" | "vencido";
  texto: string;
  importe: string;
}

/** «Todo el saldo» y, solo si hay vencido y es distinto del saldo, «Solo lo vencido». Sin saldo no hay atajos. */
export function atajosDeMonto(saldo: string, vencido: string): AtajoDeMonto[] {
  if (aCentavos(saldo) <= 0n) return [];
  const atajos: AtajoDeMonto[] = [{ clave: "todo", texto: "Todo el saldo", importe: saldo }];
  if (aCentavos(vencido) > 0n && comparar(vencido, saldo) !== 0) atajos.push({ clave: "vencido", texto: "Solo lo vencido", importe: vencido });
  return atajos;
}

/** El aviso de un monto válido que pasa de lo que la familia adeuda (el servidor lo rechazaría igual: aquí se dice antes y con la cifra). */
export function mensajeDeExceso(monto: string | null, saldo: string): string | undefined {
  if (monto === null || comparar(monto, saldo) <= 0) return undefined;
  return `El monto es mayor que lo que adeuda (${formatear(saldo)}). Revisa la cantidad.`;
}

/**
 * El folio que se lee en el recibo: las primeras ocho cifras del identificador único del pago, en mayúsculas («P-3F9A12BC»). El servidor no numera los pagos de corrido; esto es el mismo
 * identificador, abreviado, así que siempre es el mismo para el mismo pago.
 */
export function folioDePago(id: string): string {
  return `P-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

/** «$300.00 en efectivo · ref. ABC · folio P-1234ABCD» (el detalle del recibo en pantalla). */
export function detalleDelRecibo(p: { monto: string; metodo: string; referencia: string | null; id: string }): string {
  return `${formatear(p.monto)} en ${p.metodo.toLowerCase()}${p.referencia ? ` · ref. ${p.referencia}` : ""} · folio ${folioDePago(p.id)}`;
}
