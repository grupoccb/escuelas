// Beneficios diferidos (H4): «uniforme gratis al pagar la primera mensualidad». Al inscribir (F3), el beneficio queda `pendiente` en `promocion_aplicacion`; cuando el pago que
// SALDA la primera mensualidad se registra, pasa a `liberado` EN LA MISMA TRANSACCIÓN DEL PAGO (`alRegistrarPago`); recepción lo ve en la lista de «por entregar» y, al
// dárselo a la familia, lo marca `entregado` (para un producto: la venta promocional de precio 0 que descuenta el stock, H5).
//
// REGLAS
//   · LA CONDICIÓN: se cumple cuando la PRIMERA mensualidad de la inscripción queda saldada (pagada por completo). «Primera» = la mensualidad no cancelada de menor periodo
//     que tiene importe (una condonada por meses gratis no cuenta). Un pago parcial no libera; el pago de la inscripción no libera.
//   · UNA INSCRIPCIÓN DADA DE BAJA NO LIBERA NADA (bloqueo de F5): lo pendiente se queda pendiente. La base lo exige también (disparador).
//   · IDEMPOTENTE: la liberación es un UPDATE condicionado a `estatus = pendiente`; repetirla o correr dos pagos a la vez libera una sola vez.
//   · CANCELAR EL PAGO que dejó de cumplir la condición: lo liberado y no entregado regresa a `pendiente`; lo ya ENTREGADO no se puede recoger: queda marcado para revisión
//     (`revision_en`) y se le deja una tarea al asesor.
//   · TRANSICIONES (disparador en la base): pendiente → liberado → entregado, y liberado → pendiente. Liberar exige un pago aplicado, la primera mensualidad pagada y una
//     inscripción que no esté de baja. (pendiente → entregado sigue permitido en la base como entrega administrativa anterior a H4; la API solo entrega lo liberado.)

import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import { esViolacionUnica } from "../datos/prisma.ts";
import type { PagoCancelado, PagoRegistrado } from "./pagos.ts";

export interface ContextoDeBeneficio {
  ahora: Date;
  usuarioId: string | null;
}

/** La primera mensualidad de una inscripción (la no cancelada de menor periodo que tiene importe), o null. */
export async function primeraMensualidadDe(tx: Consultas, inscripcionId: string): Promise<{ id: string; estatus: string } | null> {
  return tx.cargo.findFirst({
    where: { inscripcion_id: inscripcionId, concepto: "mensualidad", estatus: { not: "cancelado" }, monto_final: { gt: "0.00" } },
    orderBy: [{ periodo: "asc" }, { id: "asc" }],
    select: { id: true, estatus: true },
  });
}

/** Libera los beneficios diferidos de las inscripciones cuya primera mensualidad quedó saldada con este pago. Devuelve los ids liberados. */
export async function liberarBeneficiosDelPago(tx: Consultas, ctx: ContextoDeBeneficio, pago: Pick<PagoRegistrado, "id" | "cargosSaldados">): Promise<string[]> {
  if (pago.cargosSaldados.length === 0) return [];
  const mensualidades = await tx.cargo.findMany({ where: { id: { in: pago.cargosSaldados }, concepto: "mensualidad", inscripcion_id: { not: null } }, select: { id: true, inscripcion_id: true } });
  const liberados: string[] = [];
  for (const c of mensualidades) {
    if (!c.inscripcion_id) continue;
    const primera = await primeraMensualidadDe(tx, c.inscripcion_id);
    if (!primera || primera.id !== c.id) continue;
    const filas = await tx.promocion_aplicacion.updateManyAndReturn({
      where: {
        inscripcion_id: c.inscripcion_id,
        estatus: "pendiente",
        beneficio: { momento_disparo: "al_cumplir_condicion" },
        promocion: { condicion_tipo: "al_pagar_primera_mensualidad" },
        inscripcion: { estatus: { not: "baja" } },
      },
      data: { estatus: "liberado", liberado_en: ctx.ahora, liberado_por_pago_id: pago.id },
      select: { id: true },
    });
    liberados.push(...filas.map((f) => f.id));
  }
  return liberados;
}

export interface ResultadoDeCancelacionDeBeneficios {
  regresadosAPendiente: string[];
  enRevision: string[];
}

/** Al cancelar un pago: la primera mensualidad que deja de estar pagada devuelve a `pendiente` lo liberado y marca para revisión lo ya entregado. */
export async function revisarBeneficiosAlCancelar(tx: Consultas, ctx: ContextoDeBeneficio, cancelado: Pick<PagoCancelado, "id" | "cargosReabiertos">): Promise<ResultadoDeCancelacionDeBeneficios> {
  const r: ResultadoDeCancelacionDeBeneficios = { regresadosAPendiente: [], enRevision: [] };
  if (cancelado.cargosReabiertos.length === 0) return r;
  const mensualidades = await tx.cargo.findMany({ where: { id: { in: cancelado.cargosReabiertos }, concepto: "mensualidad", inscripcion_id: { not: null } }, select: { id: true, inscripcion_id: true } });
  for (const c of mensualidades) {
    if (!c.inscripcion_id) continue;
    const primera = await primeraMensualidadDe(tx, c.inscripcion_id);
    if (!primera || primera.id !== c.id || primera.estatus === "pagado") continue;
    const devueltos = await tx.promocion_aplicacion.updateManyAndReturn({
      where: { inscripcion_id: c.inscripcion_id, estatus: "liberado", promocion: { condicion_tipo: "al_pagar_primera_mensualidad" } },
      data: { estatus: "pendiente", liberado_en: null, liberado_por_pago_id: null },
      select: { id: true },
    });
    r.regresadosAPendiente.push(...devueltos.map((d) => d.id));
    const entregados = await tx.promocion_aplicacion.updateManyAndReturn({
      where: { inscripcion_id: c.inscripcion_id, estatus: "entregado", revision_en: null, liberado_por_pago_id: { not: null }, promocion: { condicion_tipo: "al_pagar_primera_mensualidad" } },
      data: { revision_en: ctx.ahora },
      select: { id: true },
    });
    r.enRevision.push(...entregados.map((d) => d.id));
    if (entregados.length > 0) {
      const insc = await tx.inscripcion.findFirst({ where: { id: c.inscripcion_id }, select: { lead_id: true, alumno: { select: { nombre: true } } } });
      const existente = await tx.tarea_asesor.findFirst({ where: { inscripcion_id: c.inscripcion_id, tipo: "beneficio_en_revision", estado: "pendiente" }, select: { id: true } });
      if (!existente) {
        try {
          await tx.tarea_asesor.create({
            data: altaConAlcance({
              lead_id: insc?.lead_id ?? null,
              inscripcion_id: c.inscripcion_id,
              tipo: "beneficio_en_revision" as const,
              descripcion: `Se canceló el pago que cumplió la condición de un beneficio de ${insc?.alumno.nombre ?? "un alumno"} y ya se le había entregado. Revisa si se cobra de nuevo o se deja pasar.`,
            }),
          });
        } catch (e) {
          if (!esViolacionUnica(e)) throw e;
        }
      }
    }
  }
  return r;
}

export type ResultadoDeEntrega = { ok: true; aplicacionId: string } | { ok: false; motivo: "inexistente" | "no_liberado" | "ya_entregado" | "requiere_producto" | "producto_inexistente" | "sin_stock" | "producto_de_otra_vertical" };

/** Marca como entregado un beneficio liberado que no es un producto (un descuento o meses se aplicaron con el cargo). El de producto lo cubre H5 (`entregarProducto`). */
export async function marcarEntregado(tx: Consultas, ctx: ContextoDeBeneficio, aplicacionId: string): Promise<ResultadoDeEntrega> {
  const r = await tx.promocion_aplicacion.updateMany({
    where: { id: aplicacionId, estatus: "liberado", inscripcion: { estatus: { not: "baja" } } },
    data: { estatus: "entregado", fecha_entrega: ctx.ahora, entregado_por_usuario_id: ctx.usuarioId },
  });
  if (r.count === 1) return { ok: true, aplicacionId };
  const a = await tx.promocion_aplicacion.findFirst({ where: { id: aplicacionId }, select: { estatus: true } });
  if (!a) return { ok: false, motivo: "inexistente" };
  return { ok: false, motivo: a.estatus === "entregado" ? "ya_entregado" : "no_liberado" };
}
