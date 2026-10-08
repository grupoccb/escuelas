// Procesa un mensaje entrante del contacto: lo registra una sola vez (invariante 8), crea o
// reutiliza lead y conversación, avanza el bot y deja los salientes a MessagingProvider.
//
// Concurrencia: todo ocurre en una transacción que actualiza la conversación con control de
// versión. Si dos mensajes de la misma conversación llegan juntos, uno gana y el otro se
// repite con el estado nuevo.

import { SinInscripciones, cupoPorGrupo, type FuenteOcupacion } from "../catalogo/cupo.ts";
import { agendarClaseMuestra, proximasSesionesConLugar } from "../clases-muestra/agenda.ts";
import { describirSesion } from "../clases-muestra/sesiones.ts";
import { leerConfiguracion } from "../configuracion/index.ts";
import { cargarCatalogoCotizable } from "../cotizador/cargar.ts";
import { snapshotDeCotizacion } from "../cotizador/cotizacion.ts";
import { elegirHorario, guardarCotizacion, horariosCotizadosAlContacto } from "../cotizador/guardar.ts";
import { altaListaEspera } from "../lista-espera/lista-espera.ts";
import { fechaLocal } from "../lib/horario.ts";
import { altaConAlcance, conAlcance, type Consultas } from "../datos/alcance.ts";
import { esViolacionUnica, type PrismaRaiz } from "../datos/prisma.ts";
import { JSON_NULO_SQL, type ValorJson } from "../datos/tipos.ts";
import { resolverBandejaChatwoot, resolverBandejaPorNumero, type BandejaResuelta } from "../datos/sistema.ts";
import { enmascararTelefono, log } from "../lib/log.ts";
import { normalizarTelefono } from "../lib/telefono.ts";
import { estaDadoDeBaja, registrarBaja } from "../mensajeria/consentimiento.ts";
import {
  SinAtribucion,
  asegurarTareaEnTransaccion,
  resumirTexto,
  ventanaGratisDesde,
  ventanaServicioDesde,
  confirmacionBajaA,
  respuestaA,
  type Atribucion,
  type EventoEntrante,
  type FuenteAtribucion,
  type MessagingProvider,
  type Saliente,
} from "../mensajeria/index.ts";
import { resumenParaAsesor } from "./resumen.ts";
import { avanzar, esPalabraDeBaja, textos, type ContextoCaptacion, type EfectoCaptacion, type EstadoCaptacion, type OpcionFechaMuestra, type OpcionSucursal } from "./maquina.ts";

// Un conflicto de versión o de unicidad vuelve a correr la transacción con el estado nuevo. Con varias familias entrando a la
// lista de espera del mismo grupo a la vez (C9), cada intento fallido significa que OTRA ganó la posición; el tope deja pasar a
// un puñado de ellas antes de rendirse (el webhook se reintenta solo y es idempotente).
const MAX_REINTENTOS = 8;

export type ResultadoEntrante =
  | "bandeja_desconocida"
  | "duplicado"
  | "ignorado"
  | "sin_automatizacion"
  | "asesor_tomo_conversacion"
  | "baja"
  | "baja_volvio_a_escribir"
  | "procesado";

export interface DepsCaptacion {
  prisma: PrismaRaiz;
  mensajeria: MessagingProvider;
  /** De dónde sale la atribución a un anuncio. Por defecto, ninguna. */
  atribucion?: FuenteAtribucion;
  /** Lugares ocupados por grupo (cotizador del bot). Por omisión ninguno: no hay inscripciones aún (F4 inyecta la real). */
  fuenteOcupacion?: FuenteOcupacion;
  reloj?: () => Date;
}

class ConflictoVersion extends Error {}

/** Postgres no guarda el carácter NUL en un texto: un mensaje con uno hacía fallar la transacción entera (EC-12). */
const sinNul = (t: string): string => t.replaceAll("\u0000", "");

export async function procesarEntrante(
  deps: DepsCaptacion,
  eventoCrudo: EventoEntrante,
): Promise<{ resultado: ResultadoEntrante; conversacionId?: string }> {
  const evento: EventoEntrante = {
    ...eventoCrudo,
    contenido: sinNul(eventoCrudo.contenido),
    contacto: { ...eventoCrudo.contacto, nombre: eventoCrudo.contacto.nombre === null ? null : sinNul(eventoCrudo.contacto.nombre) },
  };
  const bandeja =
    (await resolverBandejaChatwoot(deps.prisma, evento.chatwootAccountId, evento.chatwootInboxId)) ??
    (evento.numeroReceptor ? await resolverBandejaPorNumero(deps.prisma, evento.numeroReceptor) : null);
  if (!bandeja) {
    log.warn("entrante_bandeja_desconocida", { cuenta: evento.chatwootAccountId, bandeja: evento.chatwootInboxId });
    return { resultado: "bandeja_desconocida" };
  }

  const db = conAlcance(deps.prisma, bandeja.organizacion_id);
  const ahora = deps.reloj?.() ?? new Date();
  // La ventana cuenta desde que el contacto escribió, nunca desde el futuro.
  const recibidoEn = evento.creadoEn && evento.creadoEn < ahora ? evento.creadoEn : ahora;

  // Fuera de la transacción: la fuente puede ser externa (otras vías consultan a un tercero).
  const atribucion = await (deps.atribucion ?? new SinAtribucion()).obtener(evento);

  let r: { resultado: ResultadoEntrante; conversacionId: string; abrirParaAsesores?: boolean } | undefined;
  for (let intento = 1; !r; intento++) {
    try {
      r = await db.$transaction((tx) => registrarYAvanzar(tx, deps.mensajeria, bandeja, evento, recibidoEn, atribucion, deps.fuenteOcupacion ?? new SinInscripciones()));
    } catch (e) {
      const repetible = e instanceof ConflictoVersion || esViolacionUnica(e);
      if (!repetible || intento >= MAX_REINTENTOS) throw e;
    }
  }

  // También en duplicados: si un intento anterior se cortó, termina de despachar lo que quedó.
  // Un lead borrado no recibe nada.
  if (r.resultado !== "ignorado") await deps.mensajeria.despachar(db, r.conversacionId);
  // D1: el bot agendó una clase muestra y sigue atendiendo; la conversación se hace visible para los asesores (la nota sale
  // antes). Si Chatwoot no la abre, `visible_a_asesores_en` sin `abierta_para_asesores_en` hace que el barrido de espera lo reintente.
  if (r.abrirParaAsesores) await deps.mensajeria.abrirParaAsesores(db, r.conversacionId);
  log.info("entrante_procesado", { resultado: r.resultado, conversacionId: r.conversacionId });
  return r;
}

async function registrarYAvanzar(
  tx: Consultas,
  mensajeria: MessagingProvider,
  bandeja: BandejaResuelta,
  evento: EventoEntrante,
  recibidoEn: Date,
  atribucion: Atribucion | null,
  fuente: FuenteOcupacion,
): Promise<{ resultado: ResultadoEntrante; conversacionId: string; abrirParaAsesores?: boolean }> {
  const previo = await tx.mensaje.findFirst({
    where: { proveedor: evento.llave.proveedor, id_externo: evento.llave.id },
    select: { conversacion_id: true },
  });
  if (previo) return { resultado: "duplicado", conversacionId: previo.conversacion_id };

  const conv = await obtenerConversacion(tx, bandeja, evento, recibidoEn, atribucion);
  // Un lead borrado (eliminado_en) ya no existe para el sistema: no se registra ni se contesta.
  // Se responde 200 para que Chatwoot no reintente sin fin (F1-05).
  if (conv.lead.eliminado_en) {
    log.info("entrante_lead_eliminado", { conversacionId: conv.id });
    return { resultado: "ignorado", conversacionId: conv.id };
  }
  // Las respuestas de este flujo contestan a ESTE mensaje (EA-10): el provider lo exige.
  const entrante = await tx.mensaje.create({
    data: altaConAlcance({
      conversacion_id: conv.id,
      direccion: "entrante" as const,
      estatus: "recibido" as const,
      cuerpo: evento.contenido,
      proveedor: evento.llave.proveedor,
      id_externo: evento.llave.id,
    }),
    select: { id: true },
  });

  const actualizar = async (datos: Parameters<Consultas["conversacion"]["updateMany"]>[0]["data"]) => {
    const r = await tx.conversacion.updateMany({
      where: { id: conv.id, version: conv.version },
      data: { ...datos, version: conv.version + 1 },
    });
    if (r.count !== 1) throw new ConflictoVersion();
  };
  // Un entrante tardío (reintento de un mensaje anterior) nunca acorta la ventana: se queda el máximo (F1-13).
  const ultimoEntrante = conv.ultimo_mensaje_entrante_en && conv.ultimo_mensaje_entrante_en > recibidoEn ? conv.ultimo_mensaje_entrante_en : recibidoEn;
  const ventana = { ventana_servicio_hasta: ventanaServicioDesde(ultimoEntrante), ultimo_mensaje_entrante_en: ultimoEntrante };

  // Una baja se atiende antes que todo lo demás y en cualquier estado.
  if (esPalabraDeBaja(evento.contenido)) {
    return darDeBaja(tx, mensajeria, conv, evento, entrante.id, recibidoEn, actualizar, ventana);
  }

  // Alguien dado de baja que vuelve a escribir (decisión 2 del plan): el sistema calla y una
  // persona decide. La baja es de toda la organización, así que vale también para otra vertical.
  if (conv.estado === "opt_out" || (conv.lead.telefono && (await estaDadoDeBaja(tx, conv.lead.telefono, "todo")))) {
    return bajaVolvioAEscribir(tx, conv, evento, actualizar, ventana);
  }

  // Invariante 6: con una persona atendiendo, solo se registra el mensaje.
  if (conv.estado !== "bot") {
    await actualizar(ventana);
    return { resultado: "sin_automatizacion", conversacionId: conv.id };
  }
  // Una persona ya tiene la conversación asignada en Chatwoot y el backend no se enteró (se perdió
  // el evento de asignación): respaldo de la señal. NO se usa el estado `open` de Chatwoot: el
  // propio sistema la deja abierta (a los 30 min o al terminar la captura) sin que nadie la atienda.
  if (evento.asignadaAPersona) {
    await actualizar({ ...ventana, estado: "en_atencion_humana", pasar_a_asesor_pendiente: false });
    return { resultado: "asesor_tomo_conversacion", conversacionId: conv.id };
  }

  const prospecto = await tx.prospecto.findFirst({ where: { lead_id: conv.lead.id, origen: "bot" } });
  const ctx = await contextoCaptacion(tx, bandeja.vertical_id, {
    paso: conv.paso_captacion,
    sucursalDelLead: conv.lead.sucursal_interes_id,
    fuente,
    ahora: recibidoEn,
    conversacionId: conv.id,
    prospectoId: prospecto?.id ?? null,
    muestraOfrecida: conv.muestra_ofrecida,
  });
  const estado: EstadoCaptacion = {
    paso: conv.paso_captacion,
    intentosFallidos: conv.intentos_fallidos,
    nombre: prospecto?.nombre ?? null,
    edad: prospecto?.edad_declarada ?? null,
    sucursalId: conv.lead.sucursal_interes_id,
    ...(ctx.cotizador ? { programaId: prospecto?.programa_sugerido_id ?? null } : {}),
  };
  const r = avanzar(estado, evento.contenido, ctx);

  await actualizar({
    ...ventana,
    paso_captacion: r.estado.paso,
    intentos_fallidos: r.estado.intentosFallidos,
    ...(r.pasarAAsesor ? { pasar_a_asesor_pendiente: true, motivo_pase_asesor: r.pasarAAsesor } : {}),
    // D1: visible para los asesores (la apertura la hace procesarEntrante) sin pasarles la conversación.
    ...(r.notaAAsesores && !conv.visible_a_asesores_en ? { visible_a_asesores_en: recibidoEn } : {}),
  });
  await tx.lead.update({
    where: { id: conv.lead.id },
    data: { sucursal_interes_id: r.estado.sucursalId, ultima_interaccion_en: recibidoEn },
  });
  // El bot captura un solo prospecto por lead (índice único parcial); los demás los agrega el asesor.
  let prospectoId = prospecto?.id ?? null;
  if (r.estado.nombre !== null || r.estado.edad !== null) {
    const datos = {
      nombre: r.estado.nombre,
      edad_declarada: r.estado.edad,
      // El programa que el cotizador anotó o que el contacto eligió (C6). Sin cotizador no se toca.
      ...(r.estado.programaId !== undefined ? { programa_sugerido_id: r.estado.programaId } : {}),
    };
    if (prospecto) await tx.prospecto.update({ where: { id: prospecto.id }, data: datos });
    else {
      prospectoId = (
        await tx.prospecto.create({
          data: altaConAlcance({ lead_id: conv.lead.id, vertical_interes_id: bandeja.vertical_id, origen: "bot" as const, ...datos }),
          select: { id: true },
        })
      ).id;
    }
  }
  // Lo que la máquina pidió guardar (la cotización que mandó, el horario que eligió el contacto).
  if (prospectoId) await aplicarEfectos(tx, r.efectos ?? [], { leadId: conv.lead.id, conversacionId: conv.id, prospectoId, sucursalId: r.estado.sucursalId, fuente, ahora: recibidoEn });

  const salientes: Saliente[] = r.respuestas.map((cuerpo) => respuestaA(entrante.id, cuerpo));
  if (r.pasarAAsesor && r.respuestas.length > 0) {
    salientes.push({ tipo: "nota_interna", origen: "respuesta", cuerpo: await resumenParaAsesor(tx, conv.lead.id, r.pasarAAsesor) });
  } else if (r.notaAAsesores) {
    salientes.push({ tipo: "nota_interna", origen: "respuesta", cuerpo: await resumenParaAsesor(tx, conv.lead.id, r.notaAAsesores) });
  }
  await mensajeria.encolar(tx, conv.id, salientes);
  return { resultado: "procesado", conversacionId: conv.id, ...(r.notaAAsesores ? { abrirParaAsesores: true } : {}) };
}

/**
 * El contacto aceptó la lista de espera de un grupo lleno (C9): lo apunta al final de la fila y deja UNA tarea para el
 * asesor. Si el grupo ya no permite lista de espera (se apagó entre la pregunta y la respuesta) no se apunta a nadie y
 * la tarea lo dice, para que una persona lo atienda. Si el grupo ya tiene lugar libre (se liberó mientras contestaba),
 * la tarea lo avisa: es un lugar para ofrecerle de inmediato.
 */
async function entrarAListaDeEspera(tx: Consultas, grupoId: string, c: { leadId: string; conversacionId: string; prospectoId: string; fuente: FuenteOcupacion }): Promise<void> {
  const grupo = await tx.grupo.findFirst({ where: { id: grupoId }, select: { nombre: true } });
  const nombre = grupo?.nombre ?? "el grupo";
  const alta = await altaListaEspera(tx, { grupoId, prospectoId: c.prospectoId, leadId: c.leadId });
  if (!alta.ok) {
    await asegurarTareaEnTransaccion(tx, {
      leadId: c.leadId,
      conversacionId: c.conversacionId,
      tipo: "lista_espera_nueva",
      descripcion: `El contacto quiso entrar a la lista de espera de «${nombre}», pero no se pudo apuntar (${alta.motivo === "sin_lista_de_espera" ? "el grupo ya no permite lista de espera" : "el grupo ya no está disponible"}). Atiéndelo para ofrecerle otra opción.`,
    });
    return;
  }
  if (!alta.creada) return; // ya estaba en la fila: un reintento no la duplica ni repite la tarea
  const cupo = await cupoPorGrupo(tx, grupoId, c.fuente);
  const aviso = cupo && cupo.disponibles > 0 ? ` Ojo: al apuntarlo el grupo ya tenía ${cupo.disponibles} ${cupo.disponibles === 1 ? "lugar libre" : "lugares libres"}; ofrécele el lugar.` : "";
  await asegurarTareaEnTransaccion(tx, {
    leadId: c.leadId,
    conversacionId: c.conversacionId,
    tipo: "lista_espera_nueva",
    descripcion: `Entró a la lista de espera de «${nombre}» (posición ${alta.entrada.posicion}). Avísale cuando se libere un lugar.${aviso}`,
  });
}

/** Ejecuta, en la transacción del mensaje, los efectos que pidió la máquina de captación. */
async function aplicarEfectos(
  tx: Consultas,
  efectos: readonly EfectoCaptacion[],
  c: { leadId: string; conversacionId: string; prospectoId: string; sucursalId: string | null; fuente: FuenteOcupacion; ahora: Date },
): Promise<void> {
  for (const e of efectos) {
    if (e.tipo === "guardar_cotizacion") {
      if (!c.sucursalId) throw new Error("No se puede guardar una cotización sin sucursal");
      await guardarCotizacion(tx, {
        leadId: c.leadId,
        prospectoId: c.prospectoId,
        programaId: e.programaId,
        sucursalId: c.sucursalId,
        origen: "bot",
        conversacionId: c.conversacionId,
        fecha: e.fecha,
        vigenteHasta: e.vigenteHasta,
        snapshot: snapshotDeCotizacion(e.cotizado, e.fecha),
      });
    } else if (e.tipo === "elegir_grupo") {
      await elegirHorario(tx, { conversacionId: c.conversacionId, prospectoId: c.prospectoId, grupoId: e.grupoId });
    } else if (e.tipo === "entrar_lista_espera") {
      await entrarAListaDeEspera(tx, e.grupoId, c);
    } else if (e.tipo === "ofrecer_fechas_muestra") {
      await tx.conversacion.updateMany({ where: { id: c.conversacionId }, data: { muestra_ofrecida: { grupo_id: e.grupoId, fechas: e.fechas } } });
    } else if (e.tipo === "agendar_muestra") {
      // Bajo el candado del cupo del grupo (lo toma `agendarClaseMuestra`): la última plaza la gana una persona. Si ya no cabe
      // (otra familia o un asesor la tomó entre el cálculo del contexto y aquí), se repite el mensaje entero: el contexto nuevo
      // ya no ofrece esa fecha y el bot le manda las que quedan.
      const r = await agendarClaseMuestra(tx, { ahora: c.ahora, fuente: c.fuente, origen: { tipo: "bot", conversacionId: c.conversacionId } }, { prospectoId: c.prospectoId, grupoId: e.grupoId, fechaHora: new Date(e.fechaHora) });
      if (!r.ok) throw new ConflictoVersion();
      await tx.conversacion.updateMany({ where: { id: c.conversacionId }, data: { muestra_ofrecida: JSON_NULO_SQL } });
    }
    // `programa_sugerido` ya viajó en el estado y se guardó con el prospecto.
  }
}

type ConversacionConLead = Awaited<ReturnType<typeof obtenerConversacion>>;

/**
 * Quien pidió la baja volvió a escribir (con algo que no es una palabra de baja). Se registra su
 * mensaje y se deja UNA tarea pendiente por conversación para el asesor. El sistema no contesta
 * nada (ni repite la confirmación de baja), no corre el bot y la conversación deja de ser
 * candidata a automatizaciones. La baja solo se levanta con un opt_in explícito, no con esto.
 */
async function bajaVolvioAEscribir(
  tx: Consultas,
  conv: ConversacionConLead,
  evento: EventoEntrante,
  actualizar: (datos: Parameters<Consultas["conversacion"]["updateMany"]>[0]["data"]) => Promise<void>,
  ventana: { ventana_servicio_hasta: Date; ultimo_mensaje_entrante_en: Date },
): Promise<{ resultado: ResultadoEntrante; conversacionId: string }> {
  // Una conversación en `bot` de un teléfono dado de baja (otra vertical) pasa a `opt_out`: ya no
  // la toman ni el bot ni las automatizaciones. Una atendida por una persona se queda como está.
  await actualizar(conv.estado === "bot" ? { ...ventana, estado: "opt_out", pasar_a_asesor_pendiente: false } : ventana);
  await asegurarTareaEnTransaccion(tx, {
    leadId: conv.lead.id,
    conversacionId: conv.id,
    tipo: "baja_volvio_a_escribir",
    descripcion: `El contacto pidió la baja de los mensajes y volvió a escribir. No se le contestó nada: está dado de baja. Revisa la conversación y decide si le escribes tú. Su mensaje: «${resumirTexto(evento.contenido)}»`,
  });
  return { resultado: "baja_volvio_a_escribir", conversacionId: conv.id };
}

/**
 * Baja ("BAJA", "STOP", "CANCELAR", "NO MOLESTAR"). Se registra de inmediato, sin pedir otra
 * confirmación, en el consentimiento de toda la organización, y el sistema responde UNA sola
 * vez para confirmarla. Una baja repetida, o la de un teléfono que ya estaba dado de baja, no
 * vuelve a contestar.
 */
async function darDeBaja(
  tx: Consultas,
  mensajeria: MessagingProvider,
  conv: ConversacionConLead,
  evento: EventoEntrante,
  entranteId: string,
  recibidoEn: Date,
  actualizar: (datos: Parameters<Consultas["conversacion"]["updateMany"]>[0]["data"]) => Promise<void>,
  ventana: { ventana_servicio_hasta: Date; ultimo_mensaje_entrante_en: Date },
): Promise<{ resultado: ResultadoEntrante; conversacionId: string }> {
  const telefono = conv.lead.telefono;
  const nueva = telefono
    ? await registrarBaja(tx, telefono, "palabra_clave", { mensaje_id: evento.llave.id, palabra: evento.contenido.trim() }, recibidoEn)
    : false;

  if (nueva) {
    await tx.interaccion.create({
      data: altaConAlcance({
        lead_id: conv.lead.id,
        conversacion_id: conv.id,
        tipo: "baja" as const,
        contenido: "El contacto pidió la baja de los mensajes.",
        datos: { palabra: evento.contenido.trim() },
      }),
    });
  }

  if (conv.estado === "bot" || conv.estado === "cerrada") {
    await actualizar({ ...ventana, estado: "opt_out", pasar_a_asesor_pendiente: false });
    // La confirmación es la única respuesta; solo se encola si la baja es nueva o la
    // conversación aún no estaba en baja (cubre el caso sin teléfono).
    if (nueva || !telefono) {
      await mensajeria.encolar(tx, conv.id, [confirmacionBajaA(entranteId, textos.confirmacionBaja)]);
    }
  } else {
    await actualizar(ventana);
    // Con una persona atendiendo el sistema no contesta (invariante 6): se le avisa por tarea.
    if (conv.estado === "en_atencion_humana") {
      const pendiente = await tx.tarea_asesor.findFirst({
        where: { conversacion_id: conv.id, tipo: "baja_solicitada", estado: "pendiente" },
        select: { id: true },
      });
      // Si dos bajas llegan juntas, el índice único parcial rechaza la segunda y el reintento
      // de procesarEntrante la ve como ya registrada.
      if (!pendiente) {
        await tx.tarea_asesor.create({
          data: altaConAlcance({
            lead_id: conv.lead.id,
            conversacion_id: conv.id,
            tipo: "baja_solicitada" as const,
            descripcion: "El contacto pidió la baja de los mensajes. Ya quedó registrada; confirma con él si hace falta.",
          }),
        });
      }
    }
  }
  return { resultado: "baja", conversacionId: conv.id };
}

async function obtenerConversacion(
  tx: Consultas,
  bandeja: BandejaResuelta,
  evento: EventoEntrante,
  recibidoEn: Date,
  atribucion: Atribucion | null,
) {
  const existente = await tx.conversacion.findFirst({
    where: { bandeja_chatwoot_id: bandeja.id, chatwoot_conversacion_id: evento.chatwootConversacionId },
    include: { lead: true },
  });
  if (existente) return existente;

  // Invariante 7: el teléfono solo se toca con normalizarTelefono().
  const telefono = evento.contacto.telefono ? normalizarTelefono(evento.contacto.telefono) : null;
  if (evento.contacto.telefono && !telefono) {
    log.warn("entrante_telefono_invalido", { telefono: enmascararTelefono(evento.contacto.telefono) });
  }

  const etapaInicial = await tx.etapa_pipeline.findFirst({
    where: { es_ganado: false, es_perdido: false },
    orderBy: { orden: "asc" },
    select: { id: true },
  });
  if (!etapaInicial) throw new Error("La organización no tiene etapas de pipeline: falta el seed");

  // La atribución es del primer contacto: un lead que ya existe conserva la suya.
  const campana = atribucion
    ? await tx.campana.findFirst({ where: { anuncio_id: atribucion.anuncioId }, select: { id: true } })
    : null;

  const lead =
    (telefono ? await tx.lead.findFirst({ where: { vertical_interes_id: bandeja.vertical_id, telefono } }) : null) ??
    (await tx.lead.create({
      data: altaConAlcance({
        vertical_interes_id: bandeja.vertical_id,
        sucursal_interes_id: bandeja.sucursal_id,
        etapa_id: etapaInicial.id,
        telefono,
        nombre_contacto: evento.contacto.nombre,
        ultima_interaccion_en: recibidoEn,
        ...(atribucion
          ? {
              campana_id: campana?.id ?? null,
              ctwa_clid: atribucion.ctwaClid,
              anuncio_id: atribucion.anuncioId,
              anuncio_titulo: atribucion.anuncioTitulo,
              atribucion: atribucion.crudo as ValorJson,
            }
          : {}),
      }),
    }));

  return tx.conversacion.create({
    data: altaConAlcance({
      bandeja_chatwoot_id: bandeja.id,
      lead_id: lead.id,
      chatwoot_conversacion_id: evento.chatwootConversacionId,
      // Entrada por anuncio: 72 h de conversación gratis. Solo afecta el costo (invariante 5).
      ...(atribucion ? { ventana_gratis_hasta: ventanaGratisDesde(recibidoEn) } : {}),
    }),
    include: { lead: true },
  });
}

/** Pasos en los que el bot consulta el catálogo: solo ahí se carga (cuesta unas cuantas consultas). */
const PASOS_CON_CATALOGO: readonly EstadoCaptacion["paso"][] = ["edad", "sucursal", "programa", "otra_sucursal", "horario", "lista_espera", "fecha_muestra"];

async function contextoCaptacion(
  tx: Consultas,
  verticalId: string,
  o: { paso: EstadoCaptacion["paso"]; sucursalDelLead: string | null; fuente: FuenteOcupacion; ahora: Date; conversacionId: string; prospectoId: string | null; muestraOfrecida: unknown },
): Promise<ContextoCaptacion> {
  const vertical = await tx.vertical.findUniqueOrThrow({ where: { id: verticalId }, select: { nombre: true, cotizador_whatsapp_activo: true, clase_muestra_whatsapp_activo: true } });
  const filas = await tx.sucursal_vertical.findMany({
    where: { vertical_id: verticalId, activo: true, sucursal: { activo: true, eliminado_en: null } },
    select: { sucursal: { select: { id: true, nombre: true, direccion: true, zona_horaria: true } } },
  });
  const ordenadas = filas.map((f) => f.sucursal).sort((a, b) => a.nombre.localeCompare(b.nombre, "es-MX"));
  const sucursales: OpcionSucursal[] = ordenadas.map((s) => ({ id: s.id, nombre: s.nombre, direccion: s.direccion }));
  // Con la clase muestra encendida, un «gracias» después de agendar no pasa la conversación a una persona.
  const claseAgendada = vertical.clase_muestra_whatsapp_activo && vertical.cotizador_whatsapp_activo && o.paso === "completo" && o.prospectoId ? await claseAgendadaDe(tx, o.prospectoId) : null;
  if (!vertical.cotizador_whatsapp_activo || !PASOS_CON_CATALOGO.includes(o.paso)) return { nombreVertical: vertical.nombre, sucursales, ...(claseAgendada ? { claseAgendada } : {}) };

  // La fecha de la consulta (precio y promociones vigentes hoy) es la local de la sucursal del contacto; si aún no
  // eligió, la de la primera que ofrece la vertical.
  const zona = (ordenadas.find((s) => s.id === o.sucursalDelLead) ?? ordenadas[0])?.zona_horaria;
  if (!zona) return { nombreVertical: vertical.nombre, sucursales };
  const catalogo = await cargarCatalogoCotizable(tx, { verticalId, fecha: fechaLocal(o.ahora, zona), fuente: o.fuente });
  const { sucursalSinPrograma, cotizacionVigenciaDias } = await leerConfiguracion(tx);
  // En el paso del horario, los que se le numeraron al contacto: los de la cotización guardada, no los de hoy.
  const esperaHorario = o.paso === "horario" || o.paso === "lista_espera";
  const guardada = esperaHorario && o.prospectoId ? await horariosCotizadosAlContacto(tx, o.conversacionId, o.prospectoId, catalogo.fecha) : null;
  const cotizacionGuardada = guardada && guardada.opciones.length > 0 ? guardada : null;
  const claseMuestra = vertical.clase_muestra_whatsapp_activo && (o.paso === "horario" || o.paso === "fecha_muestra") && o.prospectoId
    ? await contextoClaseMuestra(tx, { ...o, prospectoId: o.prospectoId, zona, opcionesDeHorario: cotizacionGuardada?.opciones.map((x) => x.grupoId) ?? [], grupoElegidoId: cotizacionGuardada?.grupoElegidoId ?? null })
    : null;
  return {
    nombreVertical: vertical.nombre,
    sucursales,
    // EC-02: si espera un horario y su cotización ya no vale (venció o no tiene opciones), la máquina manda una nueva.
    cotizador: { verticalId, catalogo, sucursalSinPrograma, vigenciaDias: cotizacionVigenciaDias, cotizacionGuardada, ...(esperaHorario && !cotizacionGuardada ? { cotizacionVencida: true } : {}) },
    ...(claseMuestra ? { claseMuestra } : {}),
  };
}

/** Cuántas fechas se le proponen al contacto a lo más. */
const FECHAS_PROPUESTAS = 5;

const aOpcion = (fechaHora: Date, lugares: number, zona: string): OpcionFechaMuestra => ({ fechaHora: fechaHora.toISOString(), nombre: describirSesion(fechaHora, zona).completa, lugares });

/** La clase muestra vigente del prospecto, como texto («lunes 12 de octubre a las 16:00»), o null. */
async function claseAgendadaDe(tx: Consultas, prospectoId: string): Promise<{ texto: string } | null> {
  const c = await tx.clase_muestra.findFirst({
    where: { prospecto_id: prospectoId, estatus: "agendada" },
    orderBy: { fecha_hora: "asc" },
    select: { fecha_hora: true, grupo: { select: { programa: { select: { sucursal: { select: { zona_horaria: true } } } } } } },
  });
  return c ? { texto: describirSesion(c.fecha_hora, c.grupo.programa.sucursal.zona_horaria).completa } : null;
}

/**
 * D1: lo que el bot necesita para proponer y agendar la clase muestra. Las próximas sesiones con lugar de cada grupo que se le
 * cotizó (para cuando elija uno), la propuesta que ya se le hizo (con los lugares de HOY, como la lista que vio) y las clases que
 * el prospecto ya tiene agendadas. Las sesiones y sus lugares los calcula código (`proximasSesionesConLugar`), no el bot.
 */
async function contextoClaseMuestra(
  tx: Consultas,
  o: { ahora: Date; fuente: FuenteOcupacion; prospectoId: string; muestraOfrecida: unknown; zona: string; opcionesDeHorario: string[]; grupoElegidoId: string | null },
): Promise<NonNullable<ContextoCaptacion["claseMuestra"]>> {
  const ofrecida = leerPropuesta(o.muestraOfrecida);
  const grupos = new Set([...o.opcionesDeHorario, ...(ofrecida ? [ofrecida.grupoId] : []), ...(o.grupoElegidoId ? [o.grupoElegidoId] : [])]);
  const proximasPorGrupo: Record<string, OpcionFechaMuestra[]> = {};
  const todasPorGrupo = new Map<string, Map<number, number>>();
  for (const grupoId of grupos) {
    const sesiones = await proximasSesionesConLugar(tx, o.fuente, grupoId, o.ahora, { maximo: 60, incluirLlenas: true });
    todasPorGrupo.set(grupoId, new Map(sesiones.map((s) => [s.fechaHora.getTime(), s.lugares])));
    proximasPorGrupo[grupoId] = sesiones.filter((s) => s.lugares > 0).slice(0, FECHAS_PROPUESTAS).map((s) => aOpcion(s.fechaHora, s.lugares, o.zona));
  }
  const opciones = ofrecida
    ? ofrecida.fechas.map((iso) => aOpcion(new Date(iso), todasPorGrupo.get(ofrecida.grupoId)?.get(new Date(iso).getTime()) ?? 0, o.zona))
    : [];
  const yaAgendada: Record<string, OpcionFechaMuestra> = {};
  const vigentes = await tx.clase_muestra.findMany({ where: { prospecto_id: o.prospectoId, estatus: "agendada" }, select: { grupo_id: true, fecha_hora: true } });
  for (const v of vigentes) yaAgendada[v.grupo_id] = aOpcion(v.fecha_hora, 0, o.zona);
  const nombresDeGrupo: Record<string, string> = {};
  for (const g of await tx.grupo.findMany({ where: { id: { in: [...grupos] } }, select: { id: true, nombre: true } })) nombresDeGrupo[g.id] = g.nombre;
  return { proximasPorGrupo, ofrecida: ofrecida ? { grupoId: ofrecida.grupoId, opciones } : null, yaAgendada, nombresDeGrupo };
}

/** `conversacion.muestra_ofrecida` tal como lo guardó el efecto `ofrecer_fechas_muestra`; null si no hay o no tiene la forma. */
function leerPropuesta(valor: unknown): { grupoId: string; fechas: string[] } | null {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  const fechas = v["fechas"];
  if (typeof v["grupo_id"] !== "string" || !Array.isArray(fechas) || !fechas.every((f) => typeof f === "string" && !Number.isNaN(new Date(f).getTime()))) return null;
  return { grupoId: v["grupo_id"], fechas: fechas as string[] };
}
