// MessagingProvider: el único camino de salida hacia el contacto o el asesor (invariante 4).
// Aquí viven TODAS las reglas de envío: ventana de servicio, plantilla, horario, baja, frecuencia
// y atención humana (invariante 6). Nadie más llama al transporte. La idempotencia de los
// salientes (invariante 8) también vive aquí.
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
import type { OrigenMensaje } from "../datos/tipos.ts";
import { log } from "../lib/log.ts";
import { estaDadoDeBaja } from "./consentimiento.ts";
import { barrerEventosEntrega, conciliarEventosPendientes } from "./estados.ts";
import { zonaHorariaDeContacto } from "./zona-horaria.ts";
import { esIniciadoPorSistema, evaluarReglas, ventanaServicioAbierta, type MotivoBloqueo, type PlantillaParaReglas, type TipoSaliente } from "./reglas.ts";
import { asegurarTareaAsesor, resumirTexto } from "./tareas.ts";
import { EnvioIncierto, type DestinoConversacion, type PlantillaAEnviar, type TransporteConversaciones } from "./transporte.ts";

const PROVEEDOR = "chatwoot";
/** Valor de `mensaje.error` cuando no se sabe si el envío salió. */
export const ENVIO_INCIERTO = "envio_incierto";
const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Cuánto puede quedarse un mensaje en `enviando` sin id del proveedor antes de darlo por
 * "envío incierto". Un envío normal tarda segundos (el transporte corta a los 4 s).
 */
export const ENVIO_INCIERTO_MS = 5 * 60 * 1000;

/** Mensajes iniciados por el sistema que se le pueden mandar a un teléfono dentro de la ventana de frecuencia. */
export const LIMITE_FRECUENCIA_POR_DEFECTO = { maximo: 1, ventanaMs: DIA_MS };

export interface Saliente {
  tipo: TipoSaliente;
  cuerpo: string;
  /** Por qué existe. Por defecto, una respuesta al contacto. */
  origen?: OrigenMensaje;
  /** Plantilla aprobada que lleva el mensaje; con ella el mensaje puede salir fuera de la ventana. */
  plantilla?: { id: string; variables: Record<string, string> };
}

/** Qué pasó con cada mensaje que se intentó mandar. */
export interface ResultadoSaliente {
  mensajeId: string;
  resultado: "enviado" | "bloqueado" | "fallido";
  motivo?: MotivoBloqueo | "envio_previo_fallido" | typeof ENVIO_INCIERTO;
}

export interface ResumenDespacho {
  enviados: number;
  bloqueados: number;
  fallidos: number;
  pasoAAsesor: boolean;
  resultados: ResultadoSaliente[];
}

export interface DepsMessagingProvider {
  transporte: TransporteConversaciones;
  reloj?: () => Date;
  /** Tope de mensajes automáticos por teléfono. */
  limiteFrecuencia?: { maximo: number; ventanaMs: number };
}

export class MessagingProvider {
  private readonly transporte: TransporteConversaciones;
  private readonly reloj: () => Date;
  private readonly limiteFrecuencia: { maximo: number; ventanaMs: number };

  constructor(deps: DepsMessagingProvider) {
    this.transporte = deps.transporte;
    this.reloj = deps.reloj ?? (() => new Date());
    this.limiteFrecuencia = deps.limiteFrecuencia ?? LIMITE_FRECUENCIA_POR_DEFECTO;
  }

  /** Registra salientes pendientes dentro de la transacción del llamador. Devuelve sus ids, en orden. */
  async encolar(tx: Consultas, conversacionId: string, salientes: Saliente[]): Promise<string[]> {
    const ids: string[] = [];
    for (const s of salientes) {
      const creado = await tx.mensaje.create({
        data: altaConAlcance({
          conversacion_id: conversacionId,
          plantilla_id: s.plantilla?.id ?? null,
          variables_usadas: s.plantilla?.variables ?? undefined,
          direccion: s.tipo === "mensaje" ? ("saliente" as const) : ("nota_interna" as const),
          estatus: "pendiente" as const,
          origen: s.origen ?? ("respuesta" as const),
          cuerpo: s.cuerpo,
          proveedor: PROVEEDOR,
        }),
        select: { id: true },
      });
      ids.push(creado.id);
    }
    return ids;
  }

  /** Manda los pendientes de la conversación, en orden, y si toca la pasa a un asesor. */
  async despachar(db: BaseDatos, conversacionId: string): Promise<ResumenDespacho> {
    const resumen: ResumenDespacho = { enviados: 0, bloqueados: 0, fallidos: 0, pasoAAsesor: false, resultados: [] };

    const pendientes = await db.mensaje.findMany({
      where: { conversacion_id: conversacionId, estatus: "pendiente" },
      orderBy: { secuencia: "asc" },
      select: { id: true, direccion: true, cuerpo: true, origen: true, plantilla_id: true, variables_usadas: true },
    });

    let falloPrevio = false;
    for (const m of pendientes) {
      // El reclamo deja la hora (del reloj del provider) en actualizado_en: con ella
      // recuperarEnviosInciertos distingue un envío en curso de uno que quedó a medias.
      const reclamo = await db.mensaje.updateMany({
        where: { id: m.id, estatus: "pendiente" },
        data: { estatus: "enviando", actualizado_en: this.reloj() },
      });
      if (reclamo.count === 0) continue; // otro proceso ya lo tomó

      // Se relee en cada mensaje: un asesor pudo tomar la conversación a la mitad.
      const conv = await this.leerConversacion(db, conversacionId);
      const tipo: TipoSaliente = m.direccion === "nota_interna" ? "nota_interna" : "mensaje";
      const ahora = this.reloj();
      const plantilla = m.plantilla_id ? await this.leerPlantilla(db, m.plantilla_id, conv.vertical_id) : null;
      // Horario y frecuencia aplican a todo lo que inicia el sistema, no a lo que una etiqueta diga.
      const iniciadoPorSistema =
        tipo === "mensaje" &&
        esIniciadoPorSistema({
          origen: m.origen,
          conLaPlantilla: m.plantilla_id !== null,
          ventanaAbierta: ventanaServicioAbierta(conv.ventana_servicio_hasta, ahora),
        });

      // Si uno anterior falló, los siguientes no salen: llegarían fuera de orden.
      const motivo: MotivoBloqueo | "envio_previo_fallido" | null = falloPrevio
        ? "envio_previo_fallido"
        : evaluarReglas({
            conv,
            tipo,
            origen: m.origen,
            ahora,
            plantilla: plantilla ? { enviable: plantilla.enviable, categoria: plantilla.categoria } : m.plantilla_id ? { enviable: false, categoria: "servicio" } : null,
            zonaHoraria: conv.zonaHoraria,
            automaticosRecientes: iniciadoPorSistema ? await this.automaticosRecientes(db, conv.lead.telefono, m.id, ahora) : 0,
            limiteFrecuencia: this.limiteFrecuencia.maximo,
          });

      if (motivo) {
        await db.mensaje.update({ where: { id: m.id }, data: { estatus: "bloqueado", motivo_bloqueo: motivo } });
        resumen.bloqueados++;
        resumen.resultados.push({ mensajeId: m.id, resultado: "bloqueado", motivo });
        log.info("saliente_bloqueado", { conversacionId, mensajeId: m.id, motivo });
        // Fuera de la ventana de servicio solo cabe una plantilla aprobada. Si no la hay, no se
        // manda y una persona decide qué hacer (invariante 5).
        if ((motivo === "fuera_de_ventana" || motivo === "plantilla_no_apta") && tipo === "mensaje") {
          await this.crearTareaSinPlantilla(db, conversacionId, conv.lead_id, m.cuerpo);
        }
        continue;
      }

      let idExterno: string;
      try {
        ({ idExterno } =
          tipo === "nota_interna"
            ? await this.transporte.enviarNotaInterna(conv.destino, m.cuerpo)
            : plantilla
              ? await this.transporte.enviarPlantilla(conv.destino, this.plantillaAEnviar(plantilla, m.variables_usadas, m.cuerpo))
              : await this.transporte.enviarMensaje(conv.destino, m.cuerpo));
      } catch (e) {
        if (e instanceof EnvioIncierto) {
          // Se acabó el tiempo o la respuesta no se pudo leer: el mensaje pudo haber salido (F1-03).
          // NO se marca como un fallo simple ni se reenvía; queda como envío incierto con una tarea
          // para que una persona lo revise, y la conversación pasa a un asesor.
          await this.marcarEnvioIncierto(db, { id: m.id, direccion: m.direccion, cuerpo: m.cuerpo, conversacionId, leadId: conv.lead_id });
          await db.conversacion.updateMany({
            where: { id: conversacionId, estado: "bot" },
            data: { pasar_a_asesor_pendiente: true, motivo_pase_asesor: "falla_envio" },
          });
          resumen.fallidos++;
          resumen.resultados.push({ mensajeId: m.id, resultado: "fallido", motivo: ENVIO_INCIERTO });
          falloPrevio = true;
          continue;
        }
        // Fallo definitivo (no se pudo contactar al proveedor, o este respondió con un error): no
        // salió. No se reintenta sola; una persona retoma la conversación.
        await db.mensaje.update({ where: { id: m.id }, data: { estatus: "fallido", error: (e as Error).message } });
        await db.conversacion.updateMany({
          where: { id: conversacionId, estado: "bot" },
          data: { pasar_a_asesor_pendiente: true, motivo_pase_asesor: "falla_envio" },
        });
        resumen.fallidos++;
        resumen.resultados.push({ mensajeId: m.id, resultado: "fallido" });
        falloPrevio = true;
        log.error("saliente_fallido", { conversacionId, mensajeId: m.id, error: (e as Error).message });
        continue;
      }

      // Ya salió. Si esto falla, el mensaje se queda en "enviando" y no se vuelve a mandar.
      // Condicional: si un evento de entrega ya lo adelantó, no se retrocede el estado.
      const marcado = await db.mensaje.updateMany({
        where: { id: m.id, estatus: "enviando" },
        data: { estatus: "enviado", id_externo: idExterno, enviado_en: ahora },
      });
      if (marcado.count === 0) await db.mensaje.update({ where: { id: m.id }, data: { id_externo: idExterno, enviado_en: ahora } });
      // Un estado de entrega pudo llegar antes de que se guardara el id (F1-03): ahora se aplica.
      // Si esto falla, el barrido de eventos lo repite; no puede romper un envío que ya salió.
      await conciliarEventosPendientes(db, { proveedor: PROVEEDOR, idExterno, ahora }).catch((err: unknown) =>
        log.error("conciliar_eventos_fallido", { conversacionId, mensajeId: m.id, error: (err as Error).message }),
      );
      if (tipo === "mensaje") {
        await db.conversacion.updateMany({ where: { id: conversacionId }, data: { ultimo_mensaje_saliente_en: ahora } });
      }
      resumen.enviados++;
      resumen.resultados.push({ mensajeId: m.id, resultado: "enviado" });
    }

    resumen.pasoAAsesor = await this.pasarAAsesorSiToca(db, conversacionId);
    return resumen;
  }

  private plantillaAEnviar(
    p: { codigo: string; idioma: string; content_sid: string },
    variables: unknown,
    cuerpo: string,
  ): PlantillaAEnviar {
    const vars: Record<string, string> = {};
    if (typeof variables === "object" && variables !== null && !Array.isArray(variables)) {
      for (const [k, v] of Object.entries(variables)) vars[k] = String(v);
    }
    return { codigo: p.codigo, idioma: p.idioma, contentSid: p.content_sid, variables: vars, cuerpo };
  }

  /** La plantilla del mensaje y si hoy se puede enviar: aprobada, activa, viva y de esa vertical. */
  private async leerPlantilla(db: BaseDatos, plantillaId: string, verticalId: string) {
    const p = await db.plantilla_mensaje.findFirst({
      where: { id: plantillaId },
      select: { codigo: true, idioma: true, content_sid: true, categoria: true, estado_aprobacion: true, activo: true, vertical_id: true },
    });
    if (!p) return null; // borrada: no es enviable
    const enviable = p.estado_aprobacion === "aprobada" && p.activo && (p.vertical_id === null || p.vertical_id === verticalId);
    return { ...p, enviable, categoria: p.categoria as PlantillaParaReglas["categoria"] };
  }

  /**
   * Mensajes iniciados por el sistema ya enviados a este teléfono, en toda la organización,
   * dentro de la ventana de frecuencia: los de automatización y cualquiera que llevara plantilla.
   */
  private async automaticosRecientes(db: BaseDatos, telefono: string | null, excluirId: string, ahora: Date): Promise<number> {
    if (!telefono) return 0;
    return db.mensaje.count({
      where: {
        id: { not: excluirId },
        direccion: "saliente",
        OR: [{ origen: "automatizacion" }, { plantilla_id: { not: null } }],
        estatus: { in: ["enviado", "entregado", "leido"] },
        enviado_en: { gt: new Date(ahora.getTime() - this.limiteFrecuencia.ventanaMs) },
        conversacion: { lead: { telefono } },
      },
    });
  }

  /**
   * Deja una tarea para el asesor: se quiso escribir fuera de la ventana de servicio y no hay
   * plantilla aprobada aplicable. Una sola pendiente por conversación: reintentar no llena la
   * bandeja.
   */
  private async crearTareaSinPlantilla(db: BaseDatos, conversacionId: string, leadId: string, cuerpo: string): Promise<void> {
    await asegurarTareaAsesor(db, {
      leadId,
      conversacionId,
      tipo: "sin_plantilla_apta",
      descripcion: `No se le escribió al contacto: la ventana de servicio de 24 h está cerrada y no hay plantilla aprobada aplicable. Mensaje que no salió: «${resumirTexto(cuerpo)}»`,
    });
  }

  /**
   * Recuperación de envíos inciertos (F1-01). Un mensaje que lleva más de ENVIO_INCIERTO_MS en
   * `enviando` sin id del proveedor pudo haber salido o no: el proceso murió entre mandarlo y
   * guardar el id. NUNCA se reenvía (a lo sumo una vez, invariante 8): se marca `fallido` con
   * error `envio_incierto` y, si era para el contacto, se deja una tarea al asesor para que lo
   * revise. Devuelve cuántos recuperó. Idempotente.
   */
  async recuperarEnviosInciertos(
    db: BaseDatos,
    { desde = new Date(this.reloj().getTime() - ENVIO_INCIERTO_MS), mensajeId }: { desde?: Date; mensajeId?: string } = {},
  ): Promise<number> {
    // Aprovecha el barrido: eventos de entrega que quedaron sin conciliar y los que ya caducaron (F1-03).
    if (!mensajeId) {
      await barrerEventosEntrega(db, this.reloj()).catch((err: unknown) =>
        log.error("barrer_eventos_entrega_fallido", { error: (err as Error).message }),
      );
    }
    const inciertos = await db.mensaje.findMany({
      where: { estatus: "enviando", id_externo: null, actualizado_en: { lt: desde }, ...(mensajeId ? { id: mensajeId } : {}) },
      select: { id: true, direccion: true, cuerpo: true, conversacion: { select: { id: true, lead_id: true } } },
    });
    let recuperados = 0;
    for (const m of inciertos) {
      const marcado = await this.marcarEnvioIncierto(db, {
        id: m.id,
        direccion: m.direccion,
        cuerpo: m.cuerpo,
        conversacionId: m.conversacion.id,
        leadId: m.conversacion.lead_id,
      });
      if (marcado) recuperados++;
    }
    return recuperados;
  }

  /**
   * Un mensaje reclamado cuyo resultado se ignora: lo marca `fallido` con error `envio_incierto`
   * (solo si sigue en `enviando` sin id: idempotente) y, si era para el contacto, deja una tarea
   * `revision_manual`. Lo comparten la recuperación de procesos muertos y el envío con tiempo
   * agotado. NUNCA reenvía. Devuelve true si lo marcó él.
   */
  private async marcarEnvioIncierto(
    db: BaseDatos,
    m: { id: string; direccion: string; cuerpo: string; conversacionId: string; leadId: string },
  ): Promise<boolean> {
    const marcado = await db.mensaje.updateMany({
      where: { id: m.id, estatus: "enviando", id_externo: null },
      data: { estatus: "fallido", error: ENVIO_INCIERTO },
    });
    if (marcado.count !== 1) return false; // otro proceso lo resolvió
    log.warn("envio_incierto", { conversacionId: m.conversacionId, mensajeId: m.id });
    if (m.direccion !== "saliente") return true; // una nota interna perdida no llega al contacto
    await asegurarTareaAsesor(db, {
      leadId: m.leadId,
      conversacionId: m.conversacionId,
      tipo: "revision_manual",
      descripcion: `Un mensaje al contacto quedó a medias y no se sabe si salió. No se reenvió para no duplicarlo: revisa la conversación y, si hace falta, escríbele tú. Mensaje: «${resumirTexto(m.cuerpo)}»`,
    });
    return true;
  }

  /**
   * Hace visible la conversación para los asesores (la abre en Chatwoot) SIN marcarla
   * `en_atencion_humana`: visible no es atendido. El bot sigue si el contacto vuelve y el
   * reenganche puede salir. Solo aplica a una conversación en `bot`: con una persona atendiendo,
   * dada de baja o cerrada no hay nada que mostrar. Deja `abierta_para_asesores_en`; si Chatwoot
   * falla devuelve false y se reintenta en el siguiente barrido.
   */
  async abrirParaAsesores(db: BaseDatos, conversacionId: string): Promise<boolean> {
    const conv = await this.leerConversacion(db, conversacionId);
    if (conv.estado !== "bot") return false;
    try {
      await this.transporte.abrirConversacion(conv.destino);
    } catch (e) {
      log.error("abrir_para_asesores_fallido", { conversacionId, error: (e as Error).message });
      return false;
    }
    await db.conversacion.updateMany({ where: { id: conversacionId, abierta_para_asesores_en: null }, data: { abierta_para_asesores_en: this.reloj() } });
    log.info("abierta_para_asesores", { conversacionId });
    return true;
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
    // Un solo lugar registra todo pase a asesor, sea cual sea el motivo.
    await db.interaccion.create({
      data: altaConAlcance({
        lead_id: conv.lead_id,
        conversacion_id: conversacionId,
        tipo: "pase_a_asesor" as const,
        contenido: "La conversación pasó a un asesor.",
        datos: { motivo: conv.motivo_pase_asesor },
      }),
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
        bandeja_chatwoot: { select: { chatwoot_account_id: true, canal_whatsapp: { select: { sucursal_id: true } } } },
        lead_id: true,
        lead: { select: { telefono: true, vertical_interes_id: true, sucursal_interes_id: true } },
      },
    });
    const cuenta = conv.bandeja_chatwoot.chatwoot_account_id;
    if (cuenta === null) throw new Error(`La bandeja de la conversación ${conversacionId} no está aprovisionada`);
    const destino: DestinoConversacion = {
      chatwootAccountId: cuenta,
      chatwootConversacionId: conv.chatwoot_conversacion_id,
    };
    // La baja se consulta por teléfono en toda la organización, no por conversación.
    const telefono = conv.lead.telefono;
    const dado_de_baja = telefono ? await estaDadoDeBaja(db, telefono, "todo") : false;
    const dado_de_baja_marketing = telefono ? await estaDadoDeBaja(db, telefono, "marketing") : false;
    const zonaHoraria = await zonaHorariaDeContacto(db, conv.lead.sucursal_interes_id, conv.bandeja_chatwoot.canal_whatsapp.sucursal_id, conv.lead.vertical_interes_id);
    return { ...conv, destino, dado_de_baja, dado_de_baja_marketing, vertical_id: conv.lead.vertical_interes_id, zonaHoraria };
  }
}
