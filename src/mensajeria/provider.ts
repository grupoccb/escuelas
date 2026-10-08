// MessagingProvider: el único camino de salida hacia el contacto o el asesor (invariante 4).
// Aquí viven las reglas de envío, la verificación de atención humana (invariante 6) y la
// idempotencia de los salientes (invariante 8). Nadie más llama al transporte.
//
// Flujo:
// 1. encolar(): dentro de la transacción del llamador, registra los salientes como
//    "pendiente". Si la transacción se revierte, no queda nada por mandar.
// 2. despachar(): fuera de la transacción, reclama cada pendiente (pendiente → enviando) antes
//    de mandarlo. Solo quien gana el reclamo envía, así que un reintento nunca manda dos veces.
//    Si una regla bloquea, el mensaje queda "bloqueado" con su motivo. Si el envío falla,
//    queda "fallido" y la conversación pasa a un asesor.
// 3. Si la conversación tiene pasar_a_asesor_pendiente, la abre en Chatwoot y la marca
//    en_atencion_humana. Desde ahí ninguna automatización manda nada.

import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import { log } from "../lib/log.ts";
import { motivoBloqueo, type TipoSaliente } from "./reglas.ts";
import type { DestinoConversacion, TransporteConversaciones } from "./transporte.ts";

const PROVEEDOR = "chatwoot";

export interface Saliente {
  tipo: TipoSaliente;
  cuerpo: string;
}

export interface ResumenDespacho {
  enviados: number;
  bloqueados: number;
  fallidos: number;
  pasoAAsesor: boolean;
}

export interface DepsMessagingProvider {
  transporte: TransporteConversaciones;
  reloj?: () => Date;
}

export class MessagingProvider {
  private readonly transporte: TransporteConversaciones;
  private readonly reloj: () => Date;

  constructor(deps: DepsMessagingProvider) {
    this.transporte = deps.transporte;
    this.reloj = deps.reloj ?? (() => new Date());
  }

  /** Registra salientes pendientes dentro de la transacción del llamador. */
  async encolar(tx: Consultas, conversacionId: string, salientes: Saliente[]): Promise<void> {
    for (const s of salientes) {
      await tx.mensaje.create({
        data: altaConAlcance({
          conversacion_id: conversacionId,
          direccion: s.tipo === "mensaje" ? ("saliente" as const) : ("nota_interna" as const),
          estatus: "pendiente" as const,
          cuerpo: s.cuerpo,
          proveedor: PROVEEDOR,
        }),
      });
    }
  }

  /** Manda los pendientes de la conversación, en orden, y si toca la pasa a un asesor. */
  async despachar(db: BaseDatos, conversacionId: string): Promise<ResumenDespacho> {
    const resumen: ResumenDespacho = { enviados: 0, bloqueados: 0, fallidos: 0, pasoAAsesor: false };

    const pendientes = await db.mensaje.findMany({
      where: { conversacion_id: conversacionId, estatus: "pendiente" },
      orderBy: { secuencia: "asc" },
      select: { id: true, direccion: true, cuerpo: true },
    });

    let falloPrevio = false;
    for (const m of pendientes) {
      const reclamo = await db.mensaje.updateMany({
        where: { id: m.id, estatus: "pendiente" },
        data: { estatus: "enviando" },
      });
      if (reclamo.count === 0) continue; // otro proceso ya lo tomó

      // Se relee en cada mensaje: un asesor pudo tomar la conversación a la mitad.
      const conv = await this.leerConversacion(db, conversacionId);
      const tipo: TipoSaliente = m.direccion === "nota_interna" ? "nota_interna" : "mensaje";
      const ahora = this.reloj();
      // Si uno anterior falló, los siguientes no salen: llegarían fuera de orden.
      const motivo = falloPrevio ? "envio_previo_fallido" : motivoBloqueo(conv, tipo, ahora);

      if (motivo) {
        await db.mensaje.update({ where: { id: m.id }, data: { estatus: "bloqueado", motivo_bloqueo: motivo } });
        resumen.bloqueados++;
        log.info("saliente_bloqueado", { conversacionId, mensajeId: m.id, motivo });
        continue;
      }

      let idExterno: string;
      try {
        ({ idExterno } =
          tipo === "mensaje"
            ? await this.transporte.enviarMensaje(conv.destino, m.cuerpo)
            : await this.transporte.enviarNotaInterna(conv.destino, m.cuerpo));
      } catch (e) {
        // No se reintenta: el proveedor pudo haberlo recibido y un reintento duplicaría.
        // Una persona retoma la conversación.
        await db.mensaje.update({ where: { id: m.id }, data: { estatus: "fallido", error: (e as Error).message } });
        await db.conversacion.updateMany({
          where: { id: conversacionId, estado: "bot" },
          data: { pasar_a_asesor_pendiente: true, motivo_pase_asesor: "falla_envio" },
        });
        resumen.fallidos++;
        falloPrevio = true;
        log.error("saliente_fallido", { conversacionId, mensajeId: m.id, error: (e as Error).message });
        continue;
      }

      // Ya salió. Si esto falla, el mensaje se queda en "enviando" y no se vuelve a mandar.
      await db.mensaje.update({
        where: { id: m.id },
        data: { estatus: "enviado", id_externo: idExterno, enviado_en: ahora },
      });
      if (tipo === "mensaje") {
        await db.conversacion.updateMany({ where: { id: conversacionId }, data: { ultimo_mensaje_saliente_en: ahora } });
      }
      resumen.enviados++;
    }

    resumen.pasoAAsesor = await this.pasarAAsesorSiToca(db, conversacionId);
    return resumen;
  }

  private async pasarAAsesorSiToca(db: BaseDatos, conversacionId: string): Promise<boolean> {
    const conv = await this.leerConversacion(db, conversacionId);
    if (!conv.pasar_a_asesor_pendiente || conv.estado !== "bot") return false;

    try {
      await this.transporte.abrirConversacion(conv.destino);
    } catch (e) {
      // Queda pendiente; el siguiente evento de la conversación lo vuelve a intentar.
      log.error("pase_a_asesor_fallido", { conversacionId, error: (e as Error).message });
      return false;
    }

    // Sube la versión para que una captura concurrente se repita y vea el nuevo estado.
    await db.conversacion.updateMany({
      where: { id: conversacionId, estado: "bot" },
      data: { estado: "en_atencion_humana", pasar_a_asesor_pendiente: false, version: { increment: 1 } },
    });
    log.info("pase_a_asesor", { conversacionId, motivo: conv.motivo_pase_asesor });
    return true;
  }

  private async leerConversacion(db: BaseDatos, conversacionId: string) {
    const conv = await db.conversacion.findUniqueOrThrow({
      where: { id: conversacionId },
      select: {
        estado: true,
        ventana_servicio_hasta: true,
        pasar_a_asesor_pendiente: true,
        motivo_pase_asesor: true,
        chatwoot_conversacion_id: true,
        bandeja_chatwoot: { select: { chatwoot_account_id: true } },
      },
    });
    const cuenta = conv.bandeja_chatwoot.chatwoot_account_id;
    if (cuenta === null) throw new Error(`La bandeja de la conversación ${conversacionId} no está aprovisionada`);
    const destino: DestinoConversacion = {
      chatwootAccountId: cuenta,
      chatwootConversacionId: conv.chatwoot_conversacion_id,
    };
    return { ...conv, destino };
  }
}
