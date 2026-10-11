// Embudo de conversión del tablero (sección «¿Dónde se caen los leads?»): de los leads que llegaron en un rango, cuántos alcanzaron cada etapa, dónde se cae el embudo y por qué se pierden.
//
// DEFINICIONES (una sola vez, aquí)
//   · LLEGARON = los leads creados en el rango (día local, ver `leads-del-rango.ts`), con los filtros de sucursal y disciplina de interés. Es una COHORTE: se sigue a esos leads hasta hoy.
//   · El EMBUDO son las etapas que no son de pérdida (`es_perdido` falso), en el orden de la escuela. Un lead ALCANZÓ una etapa si en su historial entró a ella o a una posterior del embudo
//     (saltarse etapas es normal: un lead puede pasar directo a inscrito); así el embudo nunca sube. Los nombres de las etapas son de la escuela: salen de la tabla, no del código.
//   · CAÍDA de una etapa = alcanzaron(anterior) − alcanzaron(etapa); su porcentaje es sobre alcanzaron(anterior). La MAYOR CAÍDA es la primera de mayor valor (solo si hay alguna > 0).
//   · INSCRITOS = los leads de la cohorte que HOY están en una etapa ganada (incluye los marcados a mano, V10b); CONVERSIÓN = inscritos / llegaron.
//   · PERDIDOS = los de la cohorte que hoy están en una etapa de pérdida, agrupados por su motivo de pérdida actual. Sin motivo, o con un motivo que ya no está en el catálogo, van juntos (null).
// Porcentajes con un decimal en texto; «—» (null) cuando no hay base. Alcance: el de los leads del usuario (`dondeLead`).

import type { FechaISO } from "../catalogo/precios.ts";
import type { BaseDatos } from "../datos/alcance.ts";
import { porcentajeConUnDecimal } from "../lib/razon.ts";
import { enLotes, leadsDelRango, type FiltrosDeLeads } from "./leads-del-rango.ts";

export interface EtapaDelEmbudo {
  etapa: { id: string; nombre: string; tipo_sistema: string | null; es_ganado: boolean };
  orden: number;
  alcanzaron: number;
  /** alcanzaron / llegaron, con un decimal. */
  porcentaje: string | null;
  /** Cuántos de la etapa anterior no llegaron a esta (0 en la primera). */
  caida: number;
  /** caida / alcanzaron(anterior), con un decimal. */
  caida_porcentaje: string | null;
  es_mayor_caida: boolean;
}

export interface ReporteDeEmbudo {
  desde: FechaISO | null;
  hasta: FechaISO | null;
  llegaron: number;
  etapas: EtapaDelEmbudo[];
  inscritos: number;
  conversion: string | null;
  perdidos: { total: number; por_motivo: { motivo: { id: string; nombre: string } | null; leads: number }[] };
}

export async function reporteDeEmbudo(db: BaseDatos, f: FiltrosDeLeads): Promise<ReporteDeEmbudo> {
  const leads = (await leadsDelRango(db, f)).filter((l) => l.enFiltro);
  const etapasDb = await db.etapa_pipeline.findMany({ orderBy: [{ orden: "asc" }, { id: "asc" }], select: { id: true, nombre: true, orden: true, tipo_sistema: true, es_ganado: true, es_perdido: true } });
  const embudo = etapasDb.filter((e) => !e.es_perdido);
  const ordenDe = new Map(embudo.map((e) => [e.id, e.orden]));
  const porId = new Map(etapasDb.map((e) => [e.id, e]));

  // La etapa más avanzada del embudo que cada lead visitó (su etapa actual cuenta aunque falte la fila del historial).
  const masAvanzada = new Map<string, number>();
  const visita = (leadId: string, etapaId: string): void => {
    const orden = ordenDe.get(etapaId);
    if (orden !== undefined && orden > (masAvanzada.get(leadId) ?? Number.NEGATIVE_INFINITY)) masAvanzada.set(leadId, orden);
  };
  for (const l of leads) visita(l.id, l.etapaId);
  for (const lote of enLotes(leads.map((l) => l.id))) {
    for (const h of await db.lead_etapa_historial.findMany({ where: { lead_id: { in: lote } }, select: { lead_id: true, etapa_nueva_id: true } })) visita(h.lead_id, h.etapa_nueva_id);
  }

  const llegaron = leads.length;
  const etapas: EtapaDelEmbudo[] = [];
  embudo.forEach((e, i) => {
    const alcanzaron = leads.filter((l) => (masAvanzada.get(l.id) ?? Number.NEGATIVE_INFINITY) >= e.orden).length;
    const anterior = i === 0 ? alcanzaron : etapas[i - 1]!.alcanzaron;
    const caida = anterior - alcanzaron;
    etapas.push({
      etapa: { id: e.id, nombre: e.nombre, tipo_sistema: e.tipo_sistema, es_ganado: e.es_ganado },
      orden: e.orden,
      alcanzaron,
      porcentaje: porcentajeConUnDecimal(alcanzaron, llegaron),
      caida,
      caida_porcentaje: i === 0 ? null : porcentajeConUnDecimal(caida, anterior),
      es_mayor_caida: false,
    });
  });
  let mayor = -1;
  etapas.forEach((e, i) => {
    if (i > 0 && e.caida > 0 && (mayor === -1 || e.caida > etapas[mayor]!.caida)) mayor = i;
  });
  if (mayor !== -1) etapas[mayor]!.es_mayor_caida = true;

  const inscritos = leads.filter((l) => porId.get(l.etapaId)?.es_ganado === true).length;
  const perdidos = leads.filter((l) => porId.get(l.etapaId)?.es_perdido === true);
  const motivos = new Map((await db.motivo_perdida.findMany({ select: { id: true, nombre: true } })).map((m) => [m.id, m.nombre]));
  const porMotivo = new Map<string | null, number>();
  for (const l of perdidos) {
    const id = l.motivoPerdidaId !== null && motivos.has(l.motivoPerdidaId) ? l.motivoPerdidaId : null;
    porMotivo.set(id, (porMotivo.get(id) ?? 0) + 1);
  }
  const lista = [...porMotivo.entries()]
    .map(([id, n]) => ({ motivo: id === null ? null : { id, nombre: motivos.get(id)! }, leads: n }))
    .sort((a, b) => b.leads - a.leads || (a.motivo?.nombre ?? "￿").localeCompare(b.motivo?.nombre ?? "￿", "es-MX"));

  return { desde: f.desde ?? null, hasta: f.hasta ?? null, llegaron, etapas, inscritos, conversion: porcentajeConUnDecimal(inscritos, llegaron), perdidos: { total: perdidos.length, por_motivo: lista } };
}
