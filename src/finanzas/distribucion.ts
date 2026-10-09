// Cómo se reparte un pago entre los cargos de una familia (H2). PURO: sin base de datos ni reloj; dinero en centavos `bigint`.
//
// ORDEN PROPUESTO: el cargo que venció primero se paga primero (más antiguo primero); a igual vencimiento, el que se creó antes; a igual, por id. Es determinista:
// el mismo conjunto de cargos da siempre el mismo orden. Recepción puede ajustar el reparto a mano (`validarDistribucion`).
//
// PAGO PARCIAL: si el pago no alcanza para todo, se cubre en ese orden hasta agotarse; el último cargo alcanzado queda con saldo (sigue pendiente).
// EXCEDENTE (decisión conservadora, documentada): un pago mayor que lo adeudado se RECHAZA (`excedente_sin_cargo`); no existe «saldo a favor». Quien cobra
// registra lo que se debe y devuelve el cambio. La base lo exige también: un pago aplicado cubre exactamente su monto (disparador diferido).

import type { FechaISO } from "../catalogo/precios.ts";
import { sumar, type Centavos } from "../lib/dinero.ts";

export interface CargoAbierto {
  id: string;
  saldo: Centavos;
  fechaVencimiento: FechaISO;
  /** Orden de creación (instante en ms, o cualquier número creciente). */
  creadoEn: number;
}

export interface AplicacionPropuesta {
  cargoId: string;
  monto: Centavos;
}

/** Los cargos con saldo, del más antiguo al más nuevo (vencimiento, creación, id). */
export function ordenDeAplicacion(cargos: readonly CargoAbierto[]): CargoAbierto[] {
  return cargos
    .filter((c) => c.saldo > 0n)
    .sort((a, b) => (a.fechaVencimiento < b.fechaVencimiento ? -1 : a.fechaVencimiento > b.fechaVencimiento ? 1 : a.creadoEn - b.creadoEn || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
}

export type Propuesta = { ok: true; aplicaciones: AplicacionPropuesta[] } | { ok: false; motivo: "excedente_sin_cargo"; excedente: Centavos } | { ok: false; motivo: "monto_invalido" };

/** Reparte `monto` en el orden de antigüedad. Rechaza (y dice cuánto sobra) si el monto pasa de lo adeudado. */
export function proponerDistribucion(monto: Centavos, cargos: readonly CargoAbierto[]): Propuesta {
  if (monto <= 0n) return { ok: false, motivo: "monto_invalido" };
  const aplicaciones: AplicacionPropuesta[] = [];
  let resta = monto;
  for (const c of ordenDeAplicacion(cargos)) {
    if (resta === 0n) break;
    const aplicar = c.saldo < resta ? c.saldo : resta;
    aplicaciones.push({ cargoId: c.id, monto: aplicar });
    resta -= aplicar;
  }
  if (resta > 0n) return { ok: false, motivo: "excedente_sin_cargo", excedente: resta };
  return { ok: true, aplicaciones };
}

export type ProblemaDeDistribucion =
  | { motivo: "monto_invalido"; cargoId?: string }
  | { motivo: "cargo_repetido"; cargoId: string }
  | { motivo: "cargo_ajeno"; cargoId: string }
  | { motivo: "excede_el_saldo"; cargoId: string; saldo: Centavos }
  | { motivo: "no_suma_el_monto"; suma: Centavos; monto: Centavos };

/** Valida un reparto hecho a mano: cada cargo es de la familia, sin repetir, cada parte positiva y sin pasar del saldo, y TODO el pago aplicado. */
export function validarDistribucion(monto: Centavos, aplicaciones: readonly AplicacionPropuesta[], cargos: readonly CargoAbierto[]): ProblemaDeDistribucion[] {
  const problemas: ProblemaDeDistribucion[] = [];
  const saldos = new Map(cargos.map((c) => [c.id, c.saldo]));
  const vistos = new Set<string>();
  if (monto <= 0n) problemas.push({ motivo: "monto_invalido" });
  for (const a of aplicaciones) {
    if (vistos.has(a.cargoId)) {
      problemas.push({ motivo: "cargo_repetido", cargoId: a.cargoId });
      continue;
    }
    vistos.add(a.cargoId);
    const saldo = saldos.get(a.cargoId);
    if (saldo === undefined) problemas.push({ motivo: "cargo_ajeno", cargoId: a.cargoId });
    else if (a.monto <= 0n) problemas.push({ motivo: "monto_invalido", cargoId: a.cargoId });
    else if (a.monto > saldo) problemas.push({ motivo: "excede_el_saldo", cargoId: a.cargoId, saldo });
  }
  const suma = sumar(...aplicaciones.map((a) => a.monto));
  if (suma !== monto) problemas.push({ motivo: "no_suma_el_monto", suma, monto });
  return problemas;
}
