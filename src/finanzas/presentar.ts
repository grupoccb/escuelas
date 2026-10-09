// Cómo se muestra un cargo (H1). Dinero SIEMPRE como texto con dos decimales («1234.50»), nunca un número JSON.

import { deFecha, type FechaISO } from "../catalogo/precios.ts";
import type { BaseDatos, Consultas } from "../datos/alcance.ts";
import { aTexto, deDecimal } from "../lib/dinero.ts";
import { fechaLocal } from "../lib/horario.ts";
import { diasDeAtraso, estatusEfectivo, saldoDe, type EstatusDeCargo } from "./cargos.ts";

export const SELECCION_CARGO = {
  id: true,
  tutor_id: true,
  inscripcion_id: true,
  sucursal_id: true,
  concepto: true,
  periodo: true,
  descripcion: true,
  monto: true,
  descuento: true,
  monto_final: true,
  monto_pagado: true,
  fecha_vencimiento: true,
  estatus: true,
  cancelado_en: true,
  motivo_cancelacion: true,
  creado_en: true,
  alumno: { select: { id: true, nombre: true, apellidos: true } },
} as const;

export interface FilaDeCargo {
  id: string;
  tutor_id: string;
  inscripcion_id: string | null;
  sucursal_id: string;
  concepto: string;
  periodo: string | null;
  descripcion: string | null;
  monto: { toFixed(decimales: number): string };
  descuento: { toFixed(decimales: number): string };
  monto_final: { toFixed(decimales: number): string };
  monto_pagado: { toFixed(decimales: number): string };
  fecha_vencimiento: Date;
  estatus: EstatusDeCargo;
  cancelado_en: Date | null;
  motivo_cancelacion: string | null;
  creado_en: Date;
  alumno: { id: string; nombre: string; apellidos: string };
}

/** «Hoy» (calendario local) de cada sucursal de la organización, para derivar el vencimiento de cada cargo con SU zona. */
export async function hoyPorSucursal(db: BaseDatos | Consultas, ahora: Date): Promise<Map<string, FechaISO>> {
  const m = new Map<string, FechaISO>();
  for (const s of await db.sucursal.findMany({ select: { id: true, zona_horaria: true } })) m.set(s.id, fechaLocal(ahora, s.zona_horaria));
  return m;
}

export function presentarCargo(f: FilaDeCargo, hoy: Map<string, FechaISO>) {
  const vence = deFecha(f.fecha_vencimiento);
  const hoyDeLaSucursal = hoy.get(f.sucursal_id) ?? vence;
  const montoFinal = deDecimal(f.monto_final);
  const pagado = deDecimal(f.monto_pagado);
  const saldo = f.estatus === "cancelado" ? 0n : saldoDe(montoFinal, pagado);
  const efectivo = estatusEfectivo(f.estatus, vence, hoyDeLaSucursal);
  return {
    id: f.id,
    tutor_id: f.tutor_id,
    alumno: { id: f.alumno.id, nombre: f.alumno.nombre, apellidos: f.alumno.apellidos },
    inscripcion_id: f.inscripcion_id,
    sucursal_id: f.sucursal_id,
    concepto: f.concepto,
    periodo: f.periodo,
    descripcion: f.descripcion,
    monto: aTexto(deDecimal(f.monto)),
    descuento: aTexto(deDecimal(f.descuento)),
    monto_final: aTexto(montoFinal),
    monto_pagado: aTexto(pagado),
    saldo: aTexto(saldo),
    fecha_vencimiento: vence,
    estatus: f.estatus,
    estatus_efectivo: efectivo,
    dias_de_atraso: saldo > 0n && efectivo === "vencido" ? diasDeAtraso(vence, hoyDeLaSucursal) : 0,
    cancelado_en: f.cancelado_en,
    motivo_cancelacion: f.motivo_cancelacion,
    creado_en: f.creado_en,
  };
}

export type CargoPresentado = ReturnType<typeof presentarCargo>;

// ── Pagos (H2) ──────────────────────────────────────────────────────────────────────────────────────

export const SELECCION_PAGO = {
  id: true,
  tutor_id: true,
  monto: true,
  monto_aplicado: true,
  metodo: true,
  referencia: true,
  fecha: true,
  estatus: true,
  cancelado_en: true,
  motivo_cancelacion: true,
  creado_en: true,
  registrado_por: { select: { id: true, nombre: true } },
  aplicaciones: {
    orderBy: { creado_en: "asc" },
    select: { id: true, cargo_id: true, monto_aplicado: true, estatus: true, revertida_en: true, cargo: { select: { concepto: true, periodo: true, descripcion: true, alumno: { select: { id: true, nombre: true } } } } },
  },
} as const;

type Decimal2 = { toFixed(decimales: number): string };

export interface FilaDePago {
  id: string;
  tutor_id: string;
  monto: Decimal2;
  monto_aplicado: Decimal2;
  metodo: string;
  referencia: string | null;
  fecha: Date;
  estatus: string;
  cancelado_en: Date | null;
  motivo_cancelacion: string | null;
  creado_en: Date;
  registrado_por: { id: string; nombre: string } | null;
  aplicaciones: {
    id: string;
    cargo_id: string;
    monto_aplicado: Decimal2;
    estatus: string;
    revertida_en: Date | null;
    cargo: { concepto: string; periodo: string | null; descripcion: string | null; alumno: { id: string; nombre: string } };
  }[];
}

export function presentarPago(f: FilaDePago) {
  return {
    id: f.id,
    tutor_id: f.tutor_id,
    monto: aTexto(deDecimal(f.monto)),
    monto_aplicado: aTexto(deDecimal(f.monto_aplicado)),
    metodo: f.metodo,
    referencia: f.referencia,
    fecha: deFecha(f.fecha),
    estatus: f.estatus,
    registrado_por: f.registrado_por,
    cancelado_en: f.cancelado_en,
    motivo_cancelacion: f.motivo_cancelacion,
    creado_en: f.creado_en,
    aplicaciones: f.aplicaciones.map((a) => ({
      id: a.id,
      cargo_id: a.cargo_id,
      monto: aTexto(deDecimal(a.monto_aplicado)),
      estatus: a.estatus,
      revertida_en: a.revertida_en,
      concepto: a.cargo.concepto,
      periodo: a.cargo.periodo,
      descripcion: a.cargo.descripcion,
      alumno: a.cargo.alumno,
    })),
  };
}
