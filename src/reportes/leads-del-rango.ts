// Los leads de un rango de fechas con lo que necesitan el embudo y las fuentes del tablero. Una sola definición, para que las dos secciones cuenten los mismos leads.
//
//   · Un lead cuenta en el rango por el DÍA LOCAL de su `creado_en`, en la zona de su sucursal de interés (sin sucursal, la de la primera sucursal de la organización), `desde` y `hasta`
//     inclusive. Se pide una ventana UTC holgada (±1 día) y el filtro exacto se hace en memoria, como en el costo por campaña (I2).
//   · `dondeLead` es el alcance de quien pregunta (`condicionDeLead`: el asesor ve los de sus sucursales y los que aún no tienen sucursal). Los filtros de sucursal y de disciplina del tablero
//     se aplican sobre la sucursal y la disciplina DE INTERÉS del lead.
//   · La campaña del lead se lee con el scope (una campaña dada de baja no se ve: el lead cae a su otra fuente). Todo por el scope de organización y sin lo borrado.

import { aFecha, sumarDias, type FechaISO } from "../catalogo/precios.ts";
import type { BaseDatos } from "../datos/alcance.ts";
import { fechaLocal } from "../lib/horario.ts";
import { fuenteDe, type Fuente } from "./fuente.ts";

export interface FiltrosDeLeads {
  desde?: FechaISO | undefined;
  hasta?: FechaISO | undefined;
  /** El alcance de quien pregunta, ya armado (vacío = todos). */
  dondeLead?: Record<string, unknown>;
  sucursalId?: string | undefined;
  verticalId?: string | undefined;
}

export interface LeadDelRango {
  id: string;
  etapaId: string;
  motivoPerdidaId: string | null;
  campana: { id: string; nombre: string; origen: string; verticalId: string | null; sucursalId: string | null } | null;
  fuente: Fuente;
  /** ¿Cumple los filtros de sucursal y disciplina del tablero? Los leads que no los cumplen se devuelven igual (el gasto de una campaña se reparte entre todos sus leads). */
  enFiltro: boolean;
}

/** Trozos de a lo más `n` elementos: Postgres limita los parámetros de una consulta. */
export function enLotes<T>(xs: readonly T[], n = 5000): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < xs.length; i += n) lotes.push(xs.slice(i, i + n));
  return lotes;
}

export async function leadsDelRango(db: BaseDatos, f: FiltrosDeLeads): Promise<LeadDelRango[]> {
  const ventana = f.desde || f.hasta ? { creado_en: { ...(f.desde ? { gte: aFecha(sumarDias(f.desde, -1)) } : {}), ...(f.hasta ? { lt: aFecha(sumarDias(f.hasta, 2)) } : {}) } } : {};
  const [sucursales, campanas, leads] = await Promise.all([
    db.sucursal.findMany({ orderBy: [{ creado_en: "asc" }, { id: "asc" }], select: { id: true, zona_horaria: true } }),
    db.campana.findMany({ select: { id: true, nombre: true, origen: true, vertical_id: true, sucursal_id: true } }),
    db.lead.findMany({
      where: { ...(f.dondeLead ?? {}), ...ventana },
      select: { id: true, creado_en: true, etapa_id: true, motivo_perdida_id: true, campana_id: true, vertical_interes_id: true, sucursal_interes_id: true, anuncio_id: true, ctwa_clid: true, atribucion: true },
    }),
  ]);
  const zonas = new Map(sucursales.map((s) => [s.id, s.zona_horaria]));
  const zonaPorOmision = sucursales[0]?.zona_horaria ?? "UTC";
  const campanaPorId = new Map(campanas.map((c) => [c.id, c]));
  const resultado: LeadDelRango[] = [];
  for (const l of leads) {
    const dia = fechaLocal(l.creado_en, (l.sucursal_interes_id ? zonas.get(l.sucursal_interes_id) : undefined) ?? zonaPorOmision);
    if ((f.desde && dia < f.desde) || (f.hasta && dia > f.hasta)) continue;
    const c = l.campana_id ? (campanaPorId.get(l.campana_id) ?? null) : null;
    resultado.push({
      id: l.id,
      etapaId: l.etapa_id,
      motivoPerdidaId: l.motivo_perdida_id,
      campana: c ? { id: c.id, nombre: c.nombre, origen: c.origen, verticalId: c.vertical_id, sucursalId: c.sucursal_id } : null,
      fuente: fuenteDe({ campana: c ? { origen: c.origen } : null, anuncio_id: l.anuncio_id, ctwa_clid: l.ctwa_clid, atribucion: l.atribucion }),
      enFiltro: (!f.sucursalId || l.sucursal_interes_id === f.sucursalId) && (!f.verticalId || l.vertical_interes_id === f.verticalId),
    });
  }
  return resultado;
}
