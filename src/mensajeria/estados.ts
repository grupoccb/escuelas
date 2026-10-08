// Estados de entrega de lo que el sistema mandó: enviado, entregado, leído, fallido. La FUENTE
// de esos estados es una interfaz (docs/DECISION-ATRIBUCION.md, P3): hoy Chatwoot los entrega al
// Agent Bot como `message_updated`; mañana pueden venir del callback de Twilio directo, y solo
// cambia el adaptador.
//
// Los estados solo avanzan (enviado → entregado → leído). `fallido` es aparte: lo ignora un
// mensaje que ya se entregó, y un estado de entrega posterior lo reemplaza (la entrega real
// manda sobre un fallo anterior).

import { conAlcance } from "../datos/alcance.ts";
import type { PrismaClient } from "../datos/prisma.ts";
import { resolverBandejaChatwoot } from "../datos/sistema.ts";
import type { EstatusMensaje } from "../datos/tipos.ts";
import { log } from "../lib/log.ts";

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

export type ResultadoEstado = "actualizado" | "sin_cambio" | "mensaje_desconocido" | "bandeja_desconocida";

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

/** Guarda el cambio en el mensaje. Idempotente: repetir el mismo evento no cambia nada. */
export async function registrarEstadoEntrega(deps: DepsEstados, cambio: CambioDeEstado): Promise<ResultadoEstado> {
  if (!cambio.bandeja) return "bandeja_desconocida";
  const bandeja = await resolverBandejaChatwoot(deps.prisma, cambio.bandeja.chatwootAccountId, cambio.bandeja.chatwootInboxId);
  if (!bandeja) return "bandeja_desconocida";

  const db = conAlcance(deps.prisma, bandeja.organizacion_id);
  const mensaje = await db.mensaje.findFirst({
    where: {
      direccion: "saliente",
      OR: [
        { proveedor: cambio.proveedor, id_externo: cambio.idExterno },
        ...(cambio.idProveedor ? [{ id_proveedor: cambio.idProveedor }] : []),
      ],
    },
    select: { id: true, estatus: true, id_proveedor: true, entregado_en: true, leido_en: true, conversacion_id: true },
  });
  if (!mensaje) {
    log.info("estado_entrega_mensaje_desconocido", { idExterno: cambio.idExterno, estado: cambio.estado });
    return "mensaje_desconocido";
  }

  const cuando = cambio.ocurrioEn ?? deps.reloj?.() ?? new Date();
  const nuevo = siguienteEstatus(mensaje.estatus, cambio.estado);
  const idProveedor = cambio.idProveedor && !mensaje.id_proveedor ? cambio.idProveedor : undefined;
  if (!nuevo) {
    if (idProveedor) await db.mensaje.update({ where: { id: mensaje.id }, data: { id_proveedor: idProveedor } });
    return idProveedor ? "actualizado" : "sin_cambio";
  }

  await db.mensaje.update({
    where: { id: mensaje.id },
    data: {
      estatus: nuevo,
      ...(idProveedor ? { id_proveedor: idProveedor } : {}),
      // Un "leído" implica entregado aunque no haya llegado el evento intermedio.
      ...(nuevo === "entregado" || nuevo === "leido" ? { entregado_en: mensaje.entregado_en ?? cuando } : {}),
      ...(nuevo === "leido" ? { leido_en: cuando } : {}),
      ...(nuevo === "fallido"
        ? { error: cambio.errorTexto ?? "Falló la entrega", error_codigo: cambio.errorCodigo }
        : { error: null, error_codigo: null }),
    },
  });
  if (nuevo === "fallido") {
    log.warn("entrega_fallida", { conversacionId: mensaje.conversacion_id, mensajeId: mensaje.id, codigo: cambio.errorCodigo });
  }
  return "actualizado";
}
