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

import { leerConfiguracion, type ConfiguracionOrganizacion } from "../configuracion/index.ts";
import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import { OPCIONES_BLOQUEO, transaccionConBloqueoDeTelefono } from "../datos/bloqueos.ts";
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

/**
 * Cuánto puede esperar un mensaje `pendiente` antes de que `despachar` lo dé por obsoleto
 * (`bloqueado`/`obsoleto`, sin tarea). Un pendiente se despacha segundos después de encolarse;
 * uno de hace más de esto quedó huérfano (EA-09). Configurable por proveedor.
 */
export const PENDIENTE_VIGENCIA_MS = 10 * 60 * 1000;

/** Plantilla aprobada que lleva el mensaje; con ella el mensaje puede salir fuera de la ventana. */
export interface PlantillaDeSaliente {
  id: string;
  variables: Record<string, string>;
}

/**
 * Lo que se encola. El `origen` es OBLIGATORIO y no tiene valor por defecto (EA-10): decide si
 * le aplican el horario de envío y el tope de frecuencia (invariante 14), así que quien encola
 * tiene que decir por qué existe el mensaje.
 *
 * - `automatizacion`: lo inicia el sistema (recordatorio, reenganche, campaña). Horario y frecuencia.
 * - `respuesta` / `confirmacion_baja`: contestan a un mensaje ENTRANTE. Solo el flujo que atiende
 *   ese mensaje puede crearlos: exigen `respondeA`, el id del entrante al que contestan, y
 *   `encolar` comprueba que sea el último entrante de esa conversación. Se construyen con
 *   `respuestaA()` y `confirmacionBajaA()`.
 * - Una nota interna no le llega al contacto: lleva su origen pero ninguna regla de envío al
 *   contacto la toca (solo la atención humana).
 */
export type Saliente = SalienteDelSistema | SalienteDeRespuesta | { tipo: "nota_interna"; origen: OrigenMensaje; cuerpo: string };

export interface SalienteDelSistema {
  tipo: "mensaje";
  origen: "automatizacion";
  cuerpo: string;
  plantilla?: PlantillaDeSaliente;
}

export interface SalienteDeRespuesta {
  tipo: "mensaje";
  origen: "respuesta" | "confirmacion_baja";
  respondeA: string;
  cuerpo: string;
  plantilla?: PlantillaDeSaliente;
}

/** Respuesta al mensaje entrante `entranteId` (el último de la conversación). */
export function respuestaA(entranteId: string, cuerpo: string, plantilla?: PlantillaDeSaliente): SalienteDeRespuesta {
  return { tipo: "mensaje", origen: "respuesta", respondeA: entranteId, cuerpo, ...(plantilla ? { plantilla } : {}) };
}

/** La confirmación de la baja, que contesta al mensaje entrante `entranteId` que la pidió. */
export function confirmacionBajaA(entranteId: string, cuerpo: string): SalienteDeRespuesta {
  return { tipo: "mensaje", origen: "confirmacion_baja", respondeA: entranteId, cuerpo };
}

/** Un saliente que dice contestar a un entrante que no existe, no es de esa conversación o no es el último. */
export class ErrorOrigenSaliente extends Error {}

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

/** Un mensaje pendiente tal como lo lee `despachar`. */
interface MensajePendiente {
  id: string;
  direccion: string;
  cuerpo: string;
  origen: OrigenMensaje;
  plantilla_id: string | null;
  variables_usadas: unknown;
  creado_en: Date;
}

export interface DepsMessagingProvider {
  transporte: TransporteConversaciones;
  reloj?: () => Date;
  /** Cuánto puede esperar un pendiente antes de ser obsoleto. Por defecto `PENDIENTE_VIGENCIA_MS`. */
  vigenciaPendienteMs?: number;
}

export class MessagingProvider {
  private readonly transporte: TransporteConversaciones;
  private readonly reloj: () => Date;
  private readonly vigenciaPendienteMs: number;

  constructor(deps: DepsMessagingProvider) {
    this.transporte = deps.transporte;
    this.reloj = deps.reloj ?? (() => new Date());
    this.vigenciaPendienteMs = deps.vigenciaPendienteMs ?? PENDIENTE_VIGENCIA_MS;
  }

  /** Registra salientes pendientes dentro de la transacción del llamador. Devuelve sus ids, en orden. */
  async encolar(tx: Consultas, conversacionId: string, salientes: Saliente[]): Promise<string[]> {
    const ids: string[] = [];
    for (const s of salientes) {
      if (s.tipo === "mensaje" && s.origen !== "automatizacion") await this.exigirEntranteAlQueContesta(tx, conversacionId, s.respondeA);
      const plantilla = s.tipo === "mensaje" ? s.plantilla : undefined;
      const creado = await tx.mensaje.create({
        data: altaConAlcance({
          conversacion_id: conversacionId,
          plantilla_id: plantilla?.id ?? null,
          variables_usadas: plantilla?.variables ?? undefined,
          direccion: s.tipo === "mensaje" ? ("saliente" as const) : ("nota_interna" as const),
          estatus: "pendiente" as const,
          // La edad del pendiente se mide con el reloj del provider (el de los tests también).
          creado_en: this.reloj(),
          origen: s.origen,
          cuerpo: s.cuerpo,
          proveedor: PROVEEDOR,
        }),
        select: { id: true },
      });
      ids.push(creado.id);
    }
    return ids;
  }

  /**
   * Una respuesta solo puede contestar al ÚLTIMO mensaje entrante de su conversación: así un
   * recordatorio que se disfrace de respuesta no puede apuntar a cualquier cosa (EA-10).
   */
  private async exigirEntranteAlQueContesta(tx: Consultas, conversacionId: string, entranteId: string): Promise<void> {
    const ultimo = await tx.mensaje.findFirst({
      where: { conversacion_id: conversacionId, direccion: "entrante" },
      orderBy: { secuencia: "desc" },
      select: { id: true },
    });
    if (!ultimo || ultimo.id !== entranteId) {
      throw new ErrorOrigenSaliente(
        `Una respuesta solo puede contestar al último mensaje entrante de su conversación (${entranteId} no lo es): lo que inicia el sistema es origen «automatizacion»`,
      );
    }
  }

  /** Manda los pendientes de la conversación, en orden, y si toca la pasa a un asesor. */
  async despachar(db: BaseDatos, conversacionId: string): Promise<ResumenDespacho> {
    const resumen: ResumenDespacho = { enviados: 0, bloqueados: 0, fallidos: 0, pasoAAsesor: false, resultados: [] };

    const pendientes = await db.mensaje.findMany({
      where: { conversacion_id: conversacionId, estatus: "pendiente" },
      orderBy: { secuencia: "asc" },
      select: { id: true, direccion: true, cuerpo: true, origen: true, plantilla_id: true, variables_usadas: true, creado_en: true },
    });

    // Los topes de frecuencia son de la organización (configuracion_organizacion): se leen una vez y solo si hacen falta.
    let configuracion: ConfiguracionOrganizacion | undefined;
    const config = async () => (configuracion ??= await leerConfiguracion(db));

    let falloPrevio = false;
    for (const m of pendientes) {
      // Reclamar y decidir son UNA sola cosa por teléfono (EA-11): el candado consultivo de
      // (organización, teléfono) va desde antes de contar lo ya enviado hasta que el mensaje queda
      // reclamado (`enviando`) o bloqueado. Quien llegue después ve ese `enviando` y lo cuenta. El
      // envío mismo (la red) va fuera de la transacción, sin el candado.
      const previa = await db.conversacion.findUniqueOrThrow({
        where: { id: conversacionId },
        include: { lead: { select: { telefono: true } } },
      });
      const decision = await this.reclamarYDecidir(db, previa.organizacion_id, previa.lead.telefono, conversacionId, m, falloPrevio, config);
      if (decision.estado === "tomado") continue; // otro proceso ya lo tomó
      const { conv, tipo, ahora, plantilla, motivo } = decision;

      if (motivo) {
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
        // Una NOTA interna fallida no es un mensaje que el contacto no recibió: no pasa la
        // conversación a un asesor (visible no es atendido, decisión 1) ni frena los mensajes que
        // siguen. Deja una tarea con causa propia para que una persona revise la conversación (EA-06).
        const esNota = tipo === "nota_interna";
        if (e instanceof EnvioIncierto) {
          // Se acabó el tiempo o la respuesta no se pudo leer: el mensaje pudo haber salido (F1-03).
          // NO se marca como un fallo simple ni se reenvía; queda como envío incierto con una tarea
          // para que una persona lo revise, y la conversación pasa a un asesor.
          await this.marcarEnvioIncierto(db, { id: m.id, direccion: m.direccion, cuerpo: m.cuerpo, conversacionId, leadId: conv.lead_id });
          if (!esNota) await this.pasarAAsesorPendiente(db, conversacionId);
          resumen.fallidos++;
          resumen.resultados.push({ mensajeId: m.id, resultado: "fallido", motivo: ENVIO_INCIERTO });
          if (!esNota) falloPrevio = true;
          continue;
        }
        // Fallo definitivo (no se pudo contactar al proveedor, o este respondió con un error): no
        // salió. No se reintenta sola; una persona retoma la conversación.
        await db.mensaje.update({ where: { id: m.id }, data: { estatus: "fallido", error: (e as Error).message } });
        if (esNota) await this.tareaDeNotaFallida(db, conversacionId, conv.lead_id, m.cuerpo);
        else await this.pasarAAsesorPendiente(db, conversacionId);
        resumen.fallidos++;
        resumen.resultados.push({ mensajeId: m.id, resultado: "fallido" });
        if (!esNota) falloPrevio = true;
        log.error("saliente_fallido", { conversacionId, mensajeId: m.id, tipo, error: (e as Error).message });
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

  /** Marca la conversación (si sigue con el bot) para pasarla a un asesor por una falla de envío al contacto. */
  private async pasarAAsesorPendiente(db: BaseDatos, conversacionId: string): Promise<void> {
    await db.conversacion.updateMany({
      where: { id: conversacionId, estado: "bot" },
      data: { pasar_a_asesor_pendiente: true, motivo_pase_asesor: "falla_envio" },
    });
  }

  /** Tarea con causa propia: una nota interna para los asesores no se pudo publicar (EA-06). Una pendiente por conversación. */
  private async tareaDeNotaFallida(db: Consultas, conversacionId: string, leadId: string, cuerpo: string): Promise<void> {
    await asegurarTareaAsesor(db, {
      leadId,
      conversacionId,
      tipo: "nota_fallida",
      descripcion: `No se pudo publicar una nota interna para los asesores en la conversación (Chatwoot no la aceptó o no respondió). La conversación sigue con el bot; revisa lo que el contacto dejó. Nota: «${resumirTexto(cuerpo)}»`,
    });
  }

  /**
   * Reclama el mensaje (pendiente → enviando) y decide si sale, todo dentro de la transacción que
   * tiene el candado del teléfono. Si una regla lo bloquea, queda `bloqueado` en la misma
   * transacción. Si puede salir, queda `enviando` (y desde que la transacción termina cuenta para
   * la frecuencia de quien llegue después).
   */
  private async reclamarYDecidir(
    db: BaseDatos,
    organizacionId: string,
    telefono: string | null,
    conversacionId: string,
    m: MensajePendiente,
    falloPrevio: boolean,
    config: () => Promise<ConfiguracionOrganizacion>,
  ) {
    const trabajo = async (tx: Consultas) => {
      // El reclamo deja la hora (del reloj del provider) en actualizado_en: con ella
      // recuperarEnviosInciertos distingue un envío en curso de uno que quedó a medias.
      const reclamadoEn = this.reloj();
      const reclamo = await tx.mensaje.updateMany({
        where: { id: m.id, estatus: "pendiente" },
        data: { estatus: "enviando", actualizado_en: reclamadoEn },
      });
      if (reclamo.count === 0) return { estado: "tomado" as const };

      // Se relee en cada mensaje: un asesor pudo tomar la conversación a la mitad.
      const conv = await this.leerConversacion(tx, conversacionId);
      const tipo: TipoSaliente = m.direccion === "nota_interna" ? "nota_interna" : "mensaje";
      const ahora = this.reloj();
      const plantilla = m.plantilla_id ? await this.leerPlantilla(tx, m.plantilla_id, conv.vertical_id) : null;
      // Horario y frecuencia aplican a todo lo que inicia el sistema, no a lo que una etiqueta diga.
      const iniciadoPorSistema =
        tipo === "mensaje" &&
        esIniciadoPorSistema({
          origen: m.origen,
          conLaPlantilla: m.plantilla_id !== null,
          ventanaAbierta: ventanaServicioAbierta(conv.ventana_servicio_hasta, ahora),
        });

      // Si uno anterior falló, los siguientes no salen: llegarían fuera de orden.
      let motivo: MotivoBloqueo | "envio_previo_fallido" | null;
      if (falloPrevio) motivo = "envio_previo_fallido";
      else {
        const esMarketing = plantilla?.enviable === true && plantilla.categoria === "marketing";
        const conteo = iniciadoPorSistema || esMarketing ? await config() : null;
        motivo = evaluarReglas({
          conv,
          tipo,
          origen: m.origen,
          ahora,
          edadMs: ahora.getTime() - m.creado_en.getTime(),
          vigenciaMs: this.vigenciaPendienteMs,
          plantilla: plantilla ? { enviable: plantilla.enviable, categoria: plantilla.categoria } : m.plantilla_id ? { enviable: false, categoria: "servicio" } : null,
          zonaHoraria: conv.zonaHoraria,
          automaticosRecientes: iniciadoPorSistema && conteo ? await this.enviadosAlTelefono(tx, conv.lead.telefono, m.id, new Date(ahora.getTime() - DIA_MS)) : 0,
          limiteFrecuencia: conteo?.maxAutomaticosPorDia ?? Number.POSITIVE_INFINITY,
          marketingRecientes:
            esMarketing && conteo
              ? await this.enviadosAlTelefono(tx, conv.lead.telefono, m.id, new Date(ahora.getTime() - conteo.ventanaMarketingDias * DIA_MS), true)
              : 0,
          limiteMarketing: conteo?.maxMarketingPorVentana ?? Number.POSITIVE_INFINITY,
        });
      }
      if (motivo) await tx.mensaje.update({ where: { id: m.id }, data: { estatus: "bloqueado", motivo_bloqueo: motivo } });
      return { estado: "reclamado" as const, conv, tipo, ahora, plantilla, motivo };
    };

    // Sin teléfono no hay frecuencia que proteger: la transacción corre sin candado.
    return telefono ? transaccionConBloqueoDeTelefono(db, organizacionId, telefono, trabajo) : db.$transaction(trabajo, OPCIONES_BLOQUEO);
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
  private async leerPlantilla(db: Consultas, plantillaId: string, verticalId: string) {
    const p = await db.plantilla_mensaje.findFirst({
      where: { id: plantillaId },
      select: { codigo: true, idioma: true, content_sid: true, categoria: true, estado_aprobacion: true, activo: true, vertical_id: true },
    });
    if (!p) return null; // borrada: no es enviable
    const enviable = p.estado_aprobacion === "aprobada" && p.activo && (p.vertical_id === null || p.vertical_id === verticalId);
    return { ...p, enviable, categoria: p.categoria as PlantillaParaReglas["categoria"] };
  }

  /**
   * Cuántos mensajes iniciados por el sistema se le mandaron a este teléfono desde `desde`, en
   * TODA la organización (cualquier conversación o vertical): los de automatización y cualquiera
   * que llevara plantilla. Con `soloMarketing`, solo los de plantillas de categoría marketing.
   * Cuentan también los envíos inciertos (pudieron haber salido) y los que están en curso
   * (`enviando`): lo conservador. El candado del teléfono hace que contar y reclamar sea una sola cosa.
   */
  private async enviadosAlTelefono(db: Consultas, telefono: string | null, excluirId: string, desde: Date, soloMarketing = false): Promise<number> {
    if (!telefono) return 0;
    return db.mensaje.count({
      where: {
        id: { not: excluirId },
        direccion: "saliente",
        ...(soloMarketing ? { plantilla: { categoria: "marketing" } } : { OR: [{ origen: "automatizacion" }, { plantilla_id: { not: null } }] }),
        AND: [
          {
            OR: [
              { estatus: { in: ["enviado", "entregado", "leido"] }, enviado_en: { gt: desde } },
              { estatus: "fallido", error: ENVIO_INCIERTO, actualizado_en: { gt: desde } },
              // Un envío en curso (reclamado, sin resultado) ya cuenta: si no, dos conversaciones del
              // mismo teléfono pasarían a la vez el tope (EA-11).
              { estatus: "enviando", actualizado_en: { gt: desde } },
            ],
          },
        ],
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
   * (solo si sigue en `enviando` sin id: idempotente) y deja una tarea con causa propia: para un
   * mensaje al contacto `envio_incierto`; para una nota interna `nota_fallida`. Lo comparten la recuperación de procesos muertos y el envío con tiempo
   * agotado. NUNCA reenvía. Devuelve true si lo marcó él.
   */
  private async marcarEnvioIncierto(
    db: BaseDatos,
    m: { id: string; direccion: string; cuerpo: string; conversacionId: string; leadId: string },
  ): Promise<boolean> {
    const marcado = await db.mensaje.updateMany({
      where: { id: m.id, estatus: "enviando", id_externo: null },
      data: { estatus: "fallido", error: ENVIO_INCIERTO, actualizado_en: this.reloj() },
    });
    if (marcado.count !== 1) return false; // otro proceso lo resolvió
    log.warn("envio_incierto", { conversacionId: m.conversacionId, mensajeId: m.id });
    if (m.direccion !== "saliente") {
      // Una nota interna perdida no le llega al contacto, pero el asesor se quedó sin su resumen.
      await this.tareaDeNotaFallida(db, m.conversacionId, m.leadId, m.cuerpo);
      return true;
    }
    await asegurarTareaAsesor(db, {
      leadId: m.leadId,
      conversacionId: m.conversacionId,
      tipo: "envio_incierto",
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

  private async leerConversacion(db: Consultas, conversacionId: string) {
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
