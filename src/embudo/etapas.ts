// Etapas del embudo por su papel en el sistema (D1). El código NUNCA busca una etapa por su nombre (son de la escuela y
// cambian): busca por `tipo_sistema`. D7 amplía este módulo con el historial completo, los motivos de pérdida y la
// recuperación; aquí vive lo mínimo que necesita la clase muestra: encontrar la etapa de un tipo y mover al lead.

import { altaConAlcance, type Consultas } from "../datos/alcance.ts";

export type TipoSistemaEtapa = "nuevo" | "contactado" | "muestra_agendada" | "muestra_asistida" | "negociacion" | "inscrito" | "perdido";

export interface EtapaDeSistema {
  id: string;
  nombre: string;
  orden: number;
  esGanado: boolean;
  esPerdido: boolean;
}

/** La etapa viva de ese tipo, o null si la organización no la configuró (entonces el movimiento no se hace). */
export async function etapaDeSistema(tx: Consultas, tipo: TipoSistemaEtapa): Promise<EtapaDeSistema | null> {
  const e = await tx.etapa_pipeline.findFirst({ where: { tipo_sistema: tipo }, select: { id: true, nombre: true, orden: true, es_ganado: true, es_perdido: true } });
  return e ? { id: e.id, nombre: e.nombre, orden: e.orden, esGanado: e.es_ganado, esPerdido: e.es_perdido } : null;
}

export interface OpcionesDeMovimiento {
  /** Por qué se mueve (queda en la interacción `cambio_etapa` y en el historial). */
  motivo: string;
  /** El instante del movimiento (el reloj de quien llama); por omisión, el de la base. */
  ahora?: Date;
  /** Permite mover a una etapa de menor orden (corregir un error). Por omisión el lead solo avanza. */
  permitirRetroceso?: boolean;
}

export interface ResultadoDeMovimiento {
  movido: boolean;
  desdeEtapaId?: string;
  haciaEtapaId?: string;
}

/**
 * Mueve al lead a la etapa de ese tipo y deja una interacción `cambio_etapa` y una fila en el historial (`lead_etapa_historial`,
 * origen «sistema»; D7). Reglas: sin etapa de ese tipo, o ya en ella, no hace nada; un lead ganado (inscrito) no se mueve; el lead solo
 * AVANZA (orden mayor) salvo que esté perdido (reaparecer después de perderse es RECUPERARLO: suma una recuperación, limpia el motivo de
 * pérdida y queda marcado en el historial) o se pida `permitirRetroceso`. El cambio es condicional a la etapa que se leyó: si otra operación
 * movió al lead mientras tanto, no pisa. (Las personas mueven etapas con `moverEtapaDeLead`, src/embudo/historial.ts.)
 */
export async function moverLeadAEtapa(tx: Consultas, leadId: string, tipo: TipoSistemaEtapa, o: OpcionesDeMovimiento): Promise<ResultadoDeMovimiento> {
  const destino = await etapaDeSistema(tx, tipo);
  if (!destino) return { movido: false };
  const lead = await tx.lead.findFirst({ where: { id: leadId }, select: { etapa_id: true, etapa: { select: { orden: true, es_ganado: true, es_perdido: true, tipo_sistema: true } } } });
  // Una etapa de cierre lo es por su bandera o por su papel (ED-12: igual que en `aEtapaParaTransicion`, la ruta de las personas).
  if (!lead || lead.etapa_id === destino.id || lead.etapa.es_ganado || lead.etapa.tipo_sistema === "inscrito") return { movido: false };
  const avanza = destino.orden > lead.etapa.orden;
  if (!avanza && !(lead.etapa.es_perdido || lead.etapa.tipo_sistema === "perdido") && !o.permitirRetroceso) return { movido: false };
  const recupera = lead.etapa.es_perdido || lead.etapa.tipo_sistema === "perdido";
  const cambio = await tx.lead.updateMany({
    where: { id: leadId, etapa_id: lead.etapa_id },
    data: { etapa_id: destino.id, ...(recupera ? { motivo_perdida_id: null, recuperaciones: { increment: 1 } } : {}) },
  });
  if (cambio.count !== 1) return { movido: false };
  await tx.lead_etapa_historial.create({
    data: altaConAlcance({
      lead_id: leadId,
      etapa_anterior_id: lead.etapa_id,
      etapa_nueva_id: destino.id,
      origen: "sistema" as const,
      motivo: o.motivo,
      es_recuperacion: recupera,
      ...(recupera ? { nota: `Recuperado por el sistema: ${o.motivo}` } : {}),
      ...(o.ahora ? { creado_en: o.ahora } : {}),
    }),
  });
  await tx.interaccion.create({
    data: altaConAlcance({
      lead_id: leadId,
      tipo: "cambio_etapa" as const,
      contenido: `Etapa: ${destino.nombre}`,
      datos: { desde_etapa_id: lead.etapa_id, hacia_etapa_id: destino.id, tipo_sistema: tipo, motivo: o.motivo },
    }),
  });
  return { movido: true, desdeEtapaId: lead.etapa_id, haciaEtapaId: destino.id };
}

/** El tipo de sistema de la etapa actual del lead (null si la etapa es propia de la escuela). */
/**
 * Orden de candados de la casa: LEAD → GRUPO → CLASE (ED-08). El bot toma el lead al registrar el mensaje del contacto y después el grupo al agendar; la API, la
 * inscripción, la asistencia y el «listo para cerrar» tocan esas mismas filas. Si alguien las toma en otro orden, dos transacciones sobre el MISMO lead se esperan
 * en cruz y Postgres aborta una (40P01). Quien vaya a tocar un grupo o una clase de un lead toma ANTES la fila del lead con esta función (una actualización sin
 * efecto de `actualizado_en`: el candado dura hasta que termina la transacción).
 */
export async function bloquearLead(tx: Consultas, leadId: string): Promise<void> {
  await tx.lead.updateMany({ where: { id: leadId }, data: { actualizado_en: new Date() } });
}

export async function tipoDeEtapaDelLead(tx: Consultas, leadId: string): Promise<TipoSistemaEtapa | null> {
  const lead = await tx.lead.findFirst({ where: { id: leadId }, select: { etapa: { select: { tipo_sistema: true } } } });
  return lead?.etapa.tipo_sistema ?? null;
}
