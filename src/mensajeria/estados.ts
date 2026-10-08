// Estados de entrega de lo que el sistema mandó: enviado, entregado, leído, fallido. La FUENTE
// de esos estados es una interfaz (docs/DECISION-ATRIBUCION.md, P3): hoy Chatwoot los entrega al
// Agent Bot como `message_updated`; mañana pueden venir del callback de Twilio directo, y solo
// cambia el adaptador.
//
// Los estados solo avanzan (enviado → entregado → leído). `fallido` es aparte: lo ignora un
// mensaje que ya se entregó, y un estado de entrega posterior lo reemplaza (la entrega real
// manda sobre un fallo anterior).
//
// Un estado puede llegar ANTES de que MessagingProvider guarde el id del mensaje (F1-03): se
// guarda en `evento_entrega_pendiente` y se concilia cuando el provider guarda el id. Un estado
// `fallido` deja una tarea para el asesor con el código de error, una por mensaje (A5).

import { altaConAlcance, conAlcance, type Consultas } from "../datos/alcance.ts";
import { esViolacionUnica, type PrismaClient } from "../datos/prisma.ts";
import { resolverBandejaChatwoot } from "../datos/sistema.ts";
import type { EstatusMensaje } from "../datos/tipos.ts";
import { log } from "../lib/log.ts";
import { asegurarTareaDeMensaje, resumirTexto } from "./tareas.ts";

export type EstadoDeEntrega = "enviado" | "entregado" | "leido" | "fallido";

export interface CambioDeEstado {
  /** Quién dio `idExterno` (hoy "chatwoot"). */
  proveedor: string;
  /** Id del mensaje en ese sistema: el que MessagingProvider guardó al mandarlo. */
  idExterno: string;
  /** Id del proveedor de mensajería (MessageSid) si el evento lo trae. */
  idProveedor: string | null;
  estado: EstadoDeEntrega;
  /** Cuándo cambió, si la fuente lo dice. Si no, se usa la hora de recepción. */
  ocurrioEn: Date | null;
  errorCodigo: number | null;
  errorTexto: string | null;
  /** Dónde ocurrió, para encontrar la organización. Depende de la fuente. */
  bandeja: { chatwootAccountId: number; chatwootInboxId: number } | null;
}

export interface FuenteEstadosEntrega {
  /** Cambio de estado contenido en el evento, o null si el evento no es uno. No lanza. */
  interpretar(payload: unknown): CambioDeEstado | null;
}

/**
 * - actualizado / sin_cambio: el mensaje se encontró.
 * - guardado_para_conciliar: todavía no hay mensaje con ese id (el evento llegó antes de que se
 *   guardara, o es de un mensaje que no mandó el sistema): el evento queda guardado y no se pierde.
 */
export type ResultadoEstado = "actualizado" | "sin_cambio" | "guardado_para_conciliar" | "bandeja_desconocida";

/** Cuánto se guarda un evento que no encuentra mensaje antes de descartarlo (soft delete). */
export const EVENTO_ENTREGA_VIGENCIA_MS = 60 * 60 * 1000;

const ORDEN: Partial<Record<EstatusMensaje, number>> = { pendiente: 0, enviando: 1, enviado: 2, entregado: 3, leido: 4 };

/** Estatus al que pasa el mensaje, o null si el cambio no procede. Pura. */
export function siguienteEstatus(actual: EstatusMensaje, estado: EstadoDeEntrega): EstatusMensaje | null {
  if (actual === "recibido" || actual === "bloqueado") return null; // nunca salió
  if (estado === "fallido") {
    return actual === "entregado" || actual === "leido" ? null : "fallido";
  }
  if (actual === "fallido") return estado;
  return (ORDEN[estado] ?? 0) > (ORDEN[actual] ?? 0) ? estado : null;
}

export interface DepsEstados {
  prisma: PrismaClient;
  reloj?: () => Date;
}

/** Lo del cambio que se aplica a un mensaje ya encontrado. */
interface DatosDeEstado {
  estado: EstadoDeEntrega;
  idProveedor: string | null;
  errorCodigo: number | null;
  errorTexto: string | null;
}

const SELECCION_MENSAJE = {
  id: true,
  estatus: true,
  id_proveedor: true,
  entregado_en: true,
  leido_en: true,
  cuerpo: true,
  conversacion_id: true,
  conversacion: { select: { lead_id: true } },
} as const;

function buscarMensaje(db: Consultas, proveedor: string, idExterno: string, idProveedor: string | null) {
  return db.mensaje.findFirst({
    where: {
      direccion: "saliente",
      OR: [{ proveedor, id_externo: idExterno }, ...(idProveedor ? [{ id_proveedor: idProveedor }] : [])],
    },
    select: SELECCION_MENSAJE,
  });
}

type MensajeParaEstado = NonNullable<Awaited<ReturnType<typeof buscarMensaje>>>;

/**
 * Aplica un cambio a un mensaje ya encontrado. Idempotente y sin retrocesos. La escritura es
 * condicional al estatus leído: si otro proceso lo cambió en medio (el evento y la conciliación
 * pueden correr a la vez) se relee y se decide de nuevo, nunca se retrocede un estado.
 */
async function aplicarEstado(db: Consultas, mensajeLeido: MensajeParaEstado, c: DatosDeEstado, cuando: Date): Promise<"actualizado" | "sin_cambio"> {
  let mensaje = mensajeLeido;
  for (let intento = 0; intento < 5; intento++) {
    const idProveedor = c.idProveedor && !mensaje.id_proveedor ? c.idProveedor : undefined;
    const nuevo = siguienteEstatus(mensaje.estatus, c.estado);
    // El fallo se atiende aunque el mensaje ya estuviera fallido (el primer evento pudo cortarse
    // antes de dejar la tarea): la tarea es única por mensaje, repetirla no hace nada.
    if (c.estado === "fallido" && (nuevo === "fallido" || mensaje.estatus === "fallido")) await tareaDeEntregaFallida(db, mensaje, c);
    if (!nuevo || (nuevo === "fallido" && mensaje.estatus === "fallido")) {
      if (idProveedor) await db.mensaje.update({ where: { id: mensaje.id }, data: { id_proveedor: idProveedor } });
      return idProveedor ? "actualizado" : "sin_cambio";
    }

    const r = await db.mensaje.updateMany({
      where: { id: mensaje.id, estatus: mensaje.estatus },
      data: {
        estatus: nuevo,
        ...(idProveedor ? { id_proveedor: idProveedor } : {}),
        // Un "leído" implica entregado aunque no haya llegado el evento intermedio.
        ...(nuevo === "entregado" || nuevo === "leido" ? { entregado_en: mensaje.entregado_en ?? cuando } : {}),
        ...(nuevo === "leido" ? { leido_en: cuando } : {}),
        ...(nuevo === "fallido"
          ? { error: c.errorTexto ?? "Falló la entrega", error_codigo: c.errorCodigo }
          : { error: null, error_codigo: null }),
      },
    });
    if (r.count === 1) {
      if (nuevo === "fallido") {
        log.warn("entrega_fallida", { conversacionId: mensaje.conversacion_id, mensajeId: mensaje.id, codigo: c.errorCodigo });
      }
      return "actualizado";
    }
    const releido = await db.mensaje.findFirst({ where: { id: mensaje.id }, select: SELECCION_MENSAJE });
    if (!releido) return "sin_cambio";
    mensaje = releido;
  }
  return "sin_cambio";
}

/** Tarea para el asesor por un mensaje que no se pudo entregar: lleva el código de error. Una por mensaje. */
async function tareaDeEntregaFallida(db: Consultas, mensaje: MensajeParaEstado, c: DatosDeEstado): Promise<void> {
  const codigo = c.errorCodigo !== null ? `código de error ${c.errorCodigo}` : "sin código de error";
  const detalle = c.errorTexto ? ` Detalle del proveedor: «${resumirTexto(c.errorTexto)}».` : "";
  const creada = await asegurarTareaDeMensaje(db, {
    leadId: mensaje.conversacion.lead_id,
    conversacionId: mensaje.conversacion_id,
    mensajeId: mensaje.id,
    tipo: "entrega_fallida",
    codigoError: c.errorCodigo,
    descripcion: `No se pudo entregar un mensaje al contacto (${codigo}).${detalle} Revisa la conversación y, si hace falta, escríbele tú. Mensaje: «${resumirTexto(mensaje.cuerpo)}»`,
  });
  if (creada) log.warn("entrega_fallida_tarea", { conversacionId: mensaje.conversacion_id, mensajeId: mensaje.id, codigo: c.errorCodigo });
}

/**
 * Guarda el cambio en el mensaje. Idempotente: repetir el mismo evento no cambia nada.
 * Si todavía no existe el mensaje con ese id, el evento se guarda para conciliarlo después.
 */
export async function registrarEstadoEntrega(deps: DepsEstados, cambio: CambioDeEstado): Promise<ResultadoEstado> {
  if (!cambio.bandeja) return "bandeja_desconocida";
  const bandeja = await resolverBandejaChatwoot(deps.prisma, cambio.bandeja.chatwootAccountId, cambio.bandeja.chatwootInboxId);
  if (!bandeja) return "bandeja_desconocida";

  const db = conAlcance(deps.prisma, bandeja.organizacion_id);
  const ahora = deps.reloj?.() ?? new Date();
  const mensaje = await buscarMensaje(db, cambio.proveedor, cambio.idExterno, cambio.idProveedor);
  if (mensaje) return aplicarEstado(db, mensaje, cambio, cambio.ocurrioEn ?? ahora);

  await guardarEventoPendiente(db, cambio, ahora);
  log.info("estado_entrega_guardado_para_conciliar", { idExterno: cambio.idExterno, estado: cambio.estado });
  // Cierra la carrera: si el provider guardó el id entre la búsqueda y el guardado del evento, su
  // conciliación ya había pasado y no lo vio. Se vuelve a buscar y, si ya existe, se concilia aquí.
  if (await buscarMensaje(db, cambio.proveedor, cambio.idExterno, cambio.idProveedor)) {
    await conciliarEventosPendientes(db, { proveedor: cambio.proveedor, idExterno: cambio.idExterno, ahora });
    return "actualizado";
  }
  return "guardado_para_conciliar";
}

async function guardarEventoPendiente(db: Consultas, c: CambioDeEstado, ahora: Date): Promise<void> {
  const ya = await db.evento_entrega_pendiente.findFirst({
    where: { proveedor: c.proveedor, id_externo: c.idExterno, estado: c.estado },
    select: { id: true },
  });
  if (ya) return;
  try {
    await db.evento_entrega_pendiente.create({
      data: altaConAlcance({
        proveedor: c.proveedor,
        id_externo: c.idExterno,
        id_proveedor: c.idProveedor,
        estado: c.estado,
        ocurrio_en: c.ocurrioEn,
        error_codigo: c.errorCodigo,
        error_texto: c.errorTexto,
        creado_en: ahora,
      }),
    });
  } catch (e) {
    if (!esViolacionUnica(e)) throw e; // el mismo evento llegó dos veces a la vez: ya está guardado
  }
}

/**
 * Aplica, en orden, los estados de entrega que llegaron antes de que se guardara el id del
 * mensaje. Lo llama MessagingProvider al guardar el id (y el barrido, por si algo se cortó).
 * Idempotente y seguro si dos procesos concilian a la vez. Devuelve cuántos aplicó.
 */
export async function conciliarEventosPendientes(
  db: Consultas,
  { proveedor, idExterno, ahora = new Date() }: { proveedor: string; idExterno: string; ahora?: Date },
): Promise<number> {
  const eventos = await db.evento_entrega_pendiente.findMany({
    where: { proveedor, id_externo: idExterno, conciliado_en: null },
    orderBy: { creado_en: "asc" },
  });
  if (eventos.length === 0) return 0;
  const cuando = (e: (typeof eventos)[number]) => (e.ocurrio_en ?? e.creado_en).getTime();
  eventos.sort((a, b) => cuando(a) - cuando(b));

  let aplicados = 0;
  for (const e of eventos) {
    const mensaje = await buscarMensaje(db, proveedor, idExterno, e.id_proveedor);
    if (!mensaje) return aplicados; // todavía no se guardó el id: se intenta de nuevo luego
    await aplicarEstado(
      db,
      mensaje,
      { estado: e.estado, idProveedor: e.id_proveedor, errorCodigo: e.error_codigo, errorTexto: e.error_texto },
      e.ocurrio_en ?? e.creado_en,
    );
    await db.evento_entrega_pendiente.updateMany({ where: { id: e.id, conciliado_en: null }, data: { conciliado_en: ahora } });
    aplicados++;
  }
  return aplicados;
}

/**
 * Barrido de los eventos guardados: concilia los que ya tienen mensaje (por si la conciliación
 * del provider se cortó) y descarta, con soft delete, los que llevan más de EVENTO_ENTREGA_VIGENCIA_MS
 * sin encontrarlo (por ejemplo, los de mensajes que escribió un asesor).
 */
export async function barrerEventosEntrega(db: Consultas, ahora: Date, vigenciaMs: number = EVENTO_ENTREGA_VIGENCIA_MS): Promise<{ conciliados: number; descartados: number }> {
  const sinConciliar = await db.evento_entrega_pendiente.findMany({
    where: { conciliado_en: null },
    distinct: ["proveedor", "id_externo"],
    select: { proveedor: true, id_externo: true },
    take: 200,
  });
  let conciliados = 0;
  for (const e of sinConciliar) conciliados += await conciliarEventosPendientes(db, { proveedor: e.proveedor, idExterno: e.id_externo, ahora });
  const descartados = await db.evento_entrega_pendiente.updateMany({
    where: { conciliado_en: null, creado_en: { lt: new Date(ahora.getTime() - vigenciaMs) } },
    data: { eliminado_en: ahora },
  });
  return { conciliados, descartados: descartados.count };
}
