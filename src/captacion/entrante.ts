// Procesa un mensaje entrante del contacto: lo registra una sola vez (invariante 8), crea o
// reutiliza lead y conversación, avanza el bot y deja los salientes a MessagingProvider.
//
// Concurrencia: todo ocurre en una transacción que actualiza la conversación con control de
// versión. Si dos mensajes de la misma conversación llegan juntos, uno gana y el otro se
// repite con el estado nuevo.

import { SinInscripciones, type FuenteOcupacion } from "../catalogo/cupo.ts";
import { cargarCatalogoCotizable } from "../cotizador/cargar.ts";
import { fechaLocal } from "../lib/horario.ts";
import { altaConAlcance, conAlcance, type Consultas } from "../datos/alcance.ts";
import { esViolacionUnica, type PrismaRaiz } from "../datos/prisma.ts";
import type { ValorJson } from "../datos/tipos.ts";
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
import { avanzar, esPalabraDeBaja, textos, type ContextoCaptacion, type EstadoCaptacion, type OpcionSucursal } from "./maquina.ts";

const MAX_REINTENTOS = 3;

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

export async function procesarEntrante(
  deps: DepsCaptacion,
  evento: EventoEntrante,
): Promise<{ resultado: ResultadoEntrante; conversacionId?: string }> {
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

  let r: { resultado: ResultadoEntrante; conversacionId: string } | undefined;
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
): Promise<{ resultado: ResultadoEntrante; conversacionId: string }> {
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

  const ctx = await contextoCaptacion(tx, bandeja.vertical_id, { paso: conv.paso_captacion, sucursalDelLead: conv.lead.sucursal_interes_id, fuente, ahora: recibidoEn });
  const prospecto = await tx.prospecto.findFirst({ where: { lead_id: conv.lead.id, origen: "bot" } });
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
  });
  await tx.lead.update({
    where: { id: conv.lead.id },
    data: { sucursal_interes_id: r.estado.sucursalId, ultima_interaccion_en: recibidoEn },
  });
  // El bot captura un solo prospecto por lead (índice único parcial); los demás los agrega el asesor.
  if (r.estado.nombre !== null || r.estado.edad !== null) {
    const datos = {
      nombre: r.estado.nombre,
      edad_declarada: r.estado.edad,
      // El programa que el cotizador anotó o que el contacto eligió (C6). Sin cotizador no se toca.
      ...(r.estado.programaId !== undefined ? { programa_sugerido_id: r.estado.programaId } : {}),
    };
    if (prospecto) await tx.prospecto.update({ where: { id: prospecto.id }, data: datos });
    else {
      await tx.prospecto.create({
        data: altaConAlcance({ lead_id: conv.lead.id, vertical_interes_id: bandeja.vertical_id, origen: "bot" as const, ...datos }),
      });
    }
  }

  const salientes: Saliente[] = r.respuestas.map((cuerpo) => respuestaA(entrante.id, cuerpo));
  if (r.pasarAAsesor && r.respuestas.length > 0) {
    salientes.push({ tipo: "nota_interna", origen: "respuesta", cuerpo: await resumenParaAsesor(tx, conv.lead.id, r.pasarAAsesor) });
  }
  await mensajeria.encolar(tx, conv.id, salientes);
  return { resultado: "procesado", conversacionId: conv.id };
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
const PASOS_CON_CATALOGO: readonly EstadoCaptacion["paso"][] = ["edad", "sucursal", "programa"];

async function contextoCaptacion(
  tx: Consultas,
  verticalId: string,
  o: { paso: EstadoCaptacion["paso"]; sucursalDelLead: string | null; fuente: FuenteOcupacion; ahora: Date },
): Promise<ContextoCaptacion> {
  const vertical = await tx.vertical.findUniqueOrThrow({ where: { id: verticalId }, select: { nombre: true, cotizador_whatsapp_activo: true } });
  const filas = await tx.sucursal_vertical.findMany({
    where: { vertical_id: verticalId, activo: true, sucursal: { activo: true, eliminado_en: null } },
    select: { sucursal: { select: { id: true, nombre: true, direccion: true, zona_horaria: true } } },
  });
  const ordenadas = filas.map((f) => f.sucursal).sort((a, b) => a.nombre.localeCompare(b.nombre, "es-MX"));
  const sucursales: OpcionSucursal[] = ordenadas.map((s) => ({ id: s.id, nombre: s.nombre, direccion: s.direccion }));
  if (!vertical.cotizador_whatsapp_activo || !PASOS_CON_CATALOGO.includes(o.paso)) return { nombreVertical: vertical.nombre, sucursales };

  // La fecha de la consulta (precio y promociones vigentes hoy) es la local de la sucursal del contacto; si aún no
  // eligió, la de la primera que ofrece la vertical.
  const zona = (ordenadas.find((s) => s.id === o.sucursalDelLead) ?? ordenadas[0])?.zona_horaria;
  if (!zona) return { nombreVertical: vertical.nombre, sucursales };
  const catalogo = await cargarCatalogoCotizable(tx, { verticalId, fecha: fechaLocal(o.ahora, zona), fuente: o.fuente });
  return { nombreVertical: vertical.nombre, sucursales, cotizador: { verticalId, catalogo } };
}
