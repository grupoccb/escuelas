// Lo que el motor necesita de un cargo para cobrarlo (H6): sus datos, a quién se le escribe y por qué conversación. Solo lee.

import { deFecha, type FechaISO } from "../catalogo/precios.ts";
import type { BaseDatos } from "../datos/alcance.ts";
import { deDecimal, type Centavos } from "../lib/dinero.ts";
import { fechaLocal } from "../lib/horario.ts";

const SELECCION_COBRO = {
  id: true,
  estatus: true,
  concepto: true,
  periodo: true,
  descripcion: true,
  fecha_vencimiento: true,
  monto_final: true,
  monto_pagado: true,
  inscripcion_id: true,
  tutor: { select: { telefono: true } },
  alumno: { select: { nombre: true } },
  sucursal: { select: { nombre: true, zona_horaria: true } },
  inscripcion: { select: { estatus: true, lead_id: true, grupo: { select: { programa: { select: { vertical_id: true } } } } } },
  venta: { select: { producto: { select: { vertical_id: true } } } },
} as const;

export interface CobroCargado {
  id: string;
  estatus: "pendiente" | "pagado" | "vencido" | "cancelado";
  concepto: string;
  periodo: string | null;
  descripcion: string | null;
  vencimiento: FechaISO;
  saldo: Centavos;
  inscripcionId: string | null;
  inscripcionEstatus: "activa" | "congelada" | "baja" | null;
  leadId: string | null;
  verticalId: string | null;
  alumnoNombre: string;
  sucursalNombre: string;
  zona: string;
  telefono: string;
}

export async function cargarCobro(db: BaseDatos, cargoId: string): Promise<CobroCargado | null> {
  const c = await db.cargo.findFirst({ where: { id: cargoId }, select: SELECCION_COBRO });
  if (!c) return null;
  return {
    id: c.id,
    estatus: c.estatus,
    concepto: c.concepto,
    periodo: c.periodo,
    descripcion: c.descripcion,
    vencimiento: deFecha(c.fecha_vencimiento),
    saldo: deDecimal(c.monto_final) - deDecimal(c.monto_pagado),
    inscripcionId: c.inscripcion_id,
    inscripcionEstatus: c.inscripcion?.estatus ?? null,
    leadId: c.inscripcion?.lead_id ?? null,
    verticalId: c.inscripcion?.grupo.programa.vertical_id ?? c.venta?.producto.vertical_id ?? null,
    alumnoNombre: c.alumno.nombre,
    sucursalNombre: c.sucursal.nombre,
    zona: c.sucursal.zona_horaria,
    telefono: c.tutor.telefono,
  };
}

export const hoyDelCobro = (cobro: Pick<CobroCargado, "zona">, ahora: Date): FechaISO => fechaLocal(ahora, cobro.zona);

const INCLUIR_CONVERSACION = { lead: true, bandeja_chatwoot: { include: { canal_whatsapp: { include: { vertical: true } } } } } as const;

/**
 * La conversación de WhatsApp del RESPONSABLE de pago (la del lead que lleva su teléfono) en la vertical del cargo; si el cargo no tiene vertical (un cargo suelto), la más
 * reciente de ese teléfono. Nunca la de otra vertical (cada vertical tiene su canal). Null si no hay: una persona decide.
 */
export async function conversacionDeCobro(db: BaseDatos, cobro: Pick<CobroCargado, "telefono" | "verticalId">) {
  return db.conversacion.findFirst({
    where: { lead: { telefono: cobro.telefono, eliminado_en: null, ...(cobro.verticalId ? { vertical_interes_id: cobro.verticalId } : {}) } },
    orderBy: [{ creado_en: "desc" }, { id: "asc" }],
    include: INCLUIR_CONVERSACION,
  });
}
