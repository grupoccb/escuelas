// Pagos (H2): registro MANUAL (decisión 10: sin pasarela). Un pago es de un tutor (la familia) y se REPARTE entre varios cargos, de varios hijos. Dinero en centavos.
//
// EL DINERO SE PROTEGE EN LA BASE, DENTRO DE LA MISMA TRANSACCIÓN (regla de Eduardo). Registrar es: tomar la fila de la familia (`bloquearFamilia`, un UPDATE: dos pagos
// de la misma familia se forman en fila), leer los saldos YA con ese candado, repartir, insertar el pago y sus aplicaciones. Pero la garantía no depende de eso:
//   · `pago_aplicacion` (disparadores de la migración) suma en `cargo.monto_pagado` y en `pago.monto_aplicado` con UN UPDATE atómico cada uno, y los CHECK de la base
//     (`monto_pagado ≤ monto_final`, `monto_aplicado ≤ monto`) FALLAN CERRADO: dos pagos simultáneos al mismo cargo no pueden sobrepagarlo aunque el código se salte el candado;
//   · un pago aplicado cubre EXACTAMENTE su monto (disparador diferido): no existe «saldo a favor»;
//   · un pago NUNCA se borra ni se edita: cancelar = estatus `cancelado` y cada aplicación pasa a `revertida` (fila de solo anexar), y los cargos recalculan su saldo.
//
// IDEMPOTENCIA: la clave del cliente (`clave_idempotencia`) es única por organización. Un reintento del mismo POST devuelve el pago que ya se registró (`repetido`); la misma
// clave con otro contenido es un conflicto.

import { aFecha, deFecha, type FechaISO } from "../catalogo/precios.ts";
import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import { esViolacionUnica } from "../datos/prisma.ts";
import { aTexto, deDecimal, sumar, type Centavos } from "../lib/dinero.ts";
import { fechaLocal } from "../lib/horario.ts";
import { proponerDistribucion, validarDistribucion, type AplicacionPropuesta, type CargoAbierto, type ProblemaDeDistribucion } from "./distribucion.ts";

export type MetodoDePago = "efectivo" | "tarjeta" | "transferencia";
export const METODOS_DE_PAGO = ["efectivo", "tarjeta", "transferencia"] as const;

export type MotivoDeRechazoDePago =
  | "tutor_inexistente"
  | "monto_invalido"
  | "excedente_sin_cargo"
  | "reparto_invalido"
  | "saldo_cambio"
  | "clave_reutilizada"
  | "fecha_futura"
  | "pago_inexistente"
  | "ya_cancelado";

/** Un rechazo de negocio: se LANZA para que la transacción de quien llama se revierta entera. */
export class RechazoDePago extends Error {
  readonly motivo: MotivoDeRechazoDePago;
  readonly datos: Record<string, unknown>;
  constructor(motivo: MotivoDeRechazoDePago, mensaje: string, datos: Record<string, unknown> = {}) {
    super(mensaje);
    this.motivo = motivo;
    this.datos = datos;
  }
}

export interface ContextoDePago {
  ahora: Date;
  usuarioId: string | null;
}

export interface EntradaDePago {
  tutorId: string;
  monto: Centavos;
  metodo: MetodoDePago;
  referencia?: string | null;
  fecha?: FechaISO | null;
  clave?: string | null;
  /** Reparto a mano (recepción lo ajusta). Sin él, el sistema propone: el cargo más antiguo primero. */
  aplicaciones?: AplicacionPropuesta[] | null;
}

export interface PagoRegistrado {
  id: string;
  /** true si la clave de idempotencia ya existía: no se registró nada nuevo. */
  repetido: boolean;
  tutorId: string;
  aplicaciones: { cargoId: string; monto: Centavos }[];
  /** Los cargos que este pago dejó saldados (para beneficios diferidos y cobranza, H4 y H6). */
  cargosSaldados: string[];
}

/** El candado de la familia: un UPDATE de la fila del tutor. Quien reparte dinero de esa familia lo toma primero; false si el tutor no existe. */
export async function bloquearFamilia(tx: Consultas, tutorId: string): Promise<boolean> {
  const r = await tx.tutor.updateMany({ where: { id: tutorId }, data: { actualizado_en: new Date() } });
  return r.count === 1;
}

/** Los cargos abiertos (con saldo) de un tutor, listos para repartir. */
export async function cargosAbiertosDe(tx: Consultas, tutorId: string): Promise<(CargoAbierto & { sucursalId: string })[]> {
  const filas = await tx.cargo.findMany({
    where: { tutor_id: tutorId, estatus: { in: ["pendiente", "vencido"] } },
    select: { id: true, monto_final: true, monto_pagado: true, fecha_vencimiento: true, creado_en: true, sucursal_id: true },
    orderBy: [{ fecha_vencimiento: "asc" }, { creado_en: "asc" }, { id: "asc" }],
  });
  return filas
    .map((f) => ({ id: f.id, saldo: deDecimal(f.monto_final) - deDecimal(f.monto_pagado), fechaVencimiento: deFecha(f.fecha_vencimiento), creadoEn: f.creado_en.getTime(), sucursalId: f.sucursal_id }))
    .filter((c) => c.saldo > 0n);
}

const mensajeDeProblema = (p: ProblemaDeDistribucion): string => {
  switch (p.motivo) {
    case "monto_invalido":
      return "Cada parte del pago debe ser mayor que cero";
    case "cargo_repetido":
      return "Un cargo aparece dos veces en el reparto";
    case "cargo_ajeno":
      return "Un cargo del reparto no es de esta familia o ya no tiene saldo";
    case "excede_el_saldo":
      return `Una parte del reparto pasa del saldo del cargo (${aTexto(p.saldo)})`;
    case "no_suma_el_monto":
      return `El reparto suma ${aTexto(p.suma)} y el pago es de ${aTexto(p.monto)}: tiene que aplicarse completo`;
  }
};

const esDefensaDeLaBase = (e: unknown): boolean => e instanceof Error && /cargo_importes_check|pago_importes_check|cargo_no_aplicable|pago_no_aplicable|cargo_estatus_saldo_check/.test(e.message);

/** Registra un pago y lo reparte. Corre DENTRO de la transacción de quien llama (para que registrar el cambio y liberar beneficios sean una sola cosa). Lanza `RechazoDePago`. */
export async function registrarPago(tx: Consultas, ctx: ContextoDePago, e: EntradaDePago): Promise<PagoRegistrado> {
  if (e.monto <= 0n) throw new RechazoDePago("monto_invalido", "El monto del pago debe ser mayor que cero");
  if (!(await bloquearFamilia(tx, e.tutorId))) throw new RechazoDePago("tutor_inexistente", "No se encontró a la familia");

  // Idempotencia: lo que ya se registró con esta clave (ya con el candado de la familia, así que un reintento simultáneo ya espera a que el primero termine).
  if (e.clave) {
    const previo = await tx.pago.findFirst({ where: { clave_idempotencia: e.clave }, select: { id: true, tutor_id: true, monto: true, metodo: true, aplicaciones: { select: { cargo_id: true, monto_aplicado: true }, orderBy: { creado_en: "asc" } } } });
    if (previo) {
      if (previo.tutor_id !== e.tutorId || deDecimal(previo.monto) !== e.monto || previo.metodo !== e.metodo) {
        throw new RechazoDePago("clave_reutilizada", "Esa clave de idempotencia ya se usó con otro pago");
      }
      return { id: previo.id, repetido: true, tutorId: previo.tutor_id, aplicaciones: previo.aplicaciones.map((a) => ({ cargoId: a.cargo_id, monto: deDecimal(a.monto_aplicado) })), cargosSaldados: [] };
    }
  }

  const abiertos = await cargosAbiertosDe(tx, e.tutorId);
  let reparto: AplicacionPropuesta[];
  if (e.aplicaciones && e.aplicaciones.length > 0) {
    const problemas = validarDistribucion(e.monto, e.aplicaciones, abiertos);
    if (problemas.length > 0) {
      const sobra = problemas.find((p) => p.motivo === "no_suma_el_monto" && p.suma < e.monto);
      throw new RechazoDePago(sobra ? "excedente_sin_cargo" : "reparto_invalido", mensajeDeProblema(problemas[0]!), { problemas: problemas.map((p) => p.motivo) });
    }
    reparto = [...e.aplicaciones];
  } else {
    const p = proponerDistribucion(e.monto, abiertos);
    if (!p.ok) {
      if (p.motivo === "excedente_sin_cargo") {
        throw new RechazoDePago("excedente_sin_cargo", `El pago pasa de lo que se debe por ${aTexto(p.excedente)}: registra solo lo adeudado (no hay saldo a favor)`, { excedente: aTexto(p.excedente), adeudado: aTexto(sumar(...abiertos.map((c) => c.saldo))) });
      }
      throw new RechazoDePago("monto_invalido", "El monto del pago debe ser mayor que cero");
    }
    reparto = p.aplicaciones;
  }

  // La fecha del pago: por omisión, hoy en el calendario de la sucursal del primer cargo que cubre; nunca futura.
  const primero = abiertos.find((c) => c.id === reparto[0]!.cargoId)!;
  const zona = (await tx.sucursal.findFirst({ where: { id: primero.sucursalId }, select: { zona_horaria: true } }))?.zona_horaria ?? "America/Mexico_City";
  const hoy = fechaLocal(ctx.ahora, zona);
  const fecha = e.fecha ?? hoy;
  if (fecha > hoy) throw new RechazoDePago("fecha_futura", "La fecha del pago no puede ser futura");

  try {
    const pago = await tx.pago
      .create({
        data: altaConAlcance({
          tutor_id: e.tutorId,
          monto: aTexto(e.monto),
          monto_aplicado: "0.00",
          metodo: e.metodo,
          referencia: e.referencia ?? null,
          fecha: aFecha(fecha),
          clave_idempotencia: e.clave ?? null,
          registrado_por_usuario_id: ctx.usuarioId,
        }),
        select: { id: true },
      })
      .catch((error: unknown) => {
        // EH-04: el candado de la familia no ordena a DOS familias que usan la misma clave a la vez; el único de la base (`pago_clave_idempotencia_key`) decide quién gana y la otra
        // recibe el mismo conflicto que si hubiera llegado después, en lugar de un 500.
        if (e.clave && esViolacionUnica(error)) throw new RechazoDePago("clave_reutilizada", "Esa clave de idempotencia ya se usó con otro pago");
        throw error;
      });
    for (const a of reparto) {
      await tx.pago_aplicacion.create({ data: altaConAlcance({ pago_id: pago.id, cargo_id: a.cargoId, monto_aplicado: aTexto(a.monto) }), select: { id: true } });
    }
    const saldados = await tx.cargo.findMany({ where: { id: { in: reparto.map((a) => a.cargoId) }, estatus: "pagado" }, select: { id: true } });
    return { id: pago.id, repetido: false, tutorId: e.tutorId, aplicaciones: reparto.map((a) => ({ cargoId: a.cargoId, monto: a.monto })), cargosSaldados: saldados.map((s) => s.id) };
  } catch (error) {
    // La base fue la última defensa: alguien más movió el saldo entre que se leyó y que se aplicó (solo pasa fuera del candado de la familia).
    if (esDefensaDeLaBase(error)) throw new RechazoDePago("saldo_cambio", "El saldo de un cargo cambió mientras se registraba el pago: vuelve a intentarlo");
    throw error;
  }
}

export interface PagoCancelado {
  id: string;
  tutorId: string;
  /** Los cargos que dejaron de estar pagados (volvieron a tener saldo). */
  cargosReabiertos: string[];
  aplicacionesRevertidas: number;
}

/**
 * Cancela un pago SIN borrarlo: sus aplicaciones pasan a `revertida` (cada una resta de su cargo y del pago, por disparador) y el pago a `cancelado`. Los cargos recalculan su
 * saldo. Dos cancelaciones simultáneas: gana una, la otra recibe `ya_cancelado`.
 */
export async function cancelarPago(tx: Consultas, ctx: ContextoDePago, e: { pagoId: string; motivo: string }): Promise<PagoCancelado> {
  const pago = await tx.pago.findFirst({ where: { id: e.pagoId }, select: { id: true, tutor_id: true, estatus: true } });
  if (!pago) throw new RechazoDePago("pago_inexistente", "No se encontró el pago");
  await bloquearFamilia(tx, pago.tutor_id);
  const aplicaciones = await tx.pago_aplicacion.findMany({ where: { pago_id: pago.id, estatus: "aplicada" }, select: { id: true, cargo_id: true } });
  const revertidas = await tx.pago_aplicacion.updateMany({ where: { pago_id: pago.id, estatus: "aplicada" }, data: { estatus: "revertida", revertida_en: ctx.ahora } });
  const r = await tx.pago.updateMany({ where: { id: pago.id, estatus: "aplicado" }, data: { estatus: "cancelado", cancelado_en: ctx.ahora, cancelado_por_usuario_id: ctx.usuarioId, motivo_cancelacion: e.motivo } });
  if (r.count !== 1) throw new RechazoDePago("ya_cancelado", "El pago ya estaba cancelado");
  const reabiertos = await tx.cargo.findMany({ where: { id: { in: aplicaciones.map((a) => a.cargo_id) }, estatus: { in: ["pendiente", "vencido"] } }, select: { id: true } });
  return { id: pago.id, tutorId: pago.tutor_id, cargosReabiertos: reabiertos.map((c) => c.id), aplicacionesRevertidas: revertidas.count };
}
