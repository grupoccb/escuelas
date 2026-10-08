// Alerta de lead estancado (D7): una CONSULTA, no envía nada. Cada etapa puede tener un umbral en días (`dias_alerta_sin_movimiento`); un lead
// está estancado si lleva en su etapa sin movimiento (su última interacción, o su creación si nunca hubo) al menos esos días. Las etapas de
// cierre (ganada, perdida) nunca alertan. Usa el índice `lead(etapa_id, ultima_interaccion_en)`. Qué se hace con ellos (tarea, reenganche)
// lo decide D8.

import type { BaseDatos } from "../datos/alcance.ts";
import { diasSinMovimiento } from "./transiciones.ts";

const DIA_MS = 24 * 60 * 60 * 1000;

export interface LeadEstancado {
  id: string;
  nombreContacto: string | null;
  telefono: string | null;
  sucursalInteresId: string | null;
  etapa: { id: string; nombre: string; diasAlerta: number };
  ultimaInteraccionEn: Date | null;
  creadoEn: Date;
  diasSinMovimiento: number;
}

/** Las condiciones de Prisma para «estancado ahora» (una por etapa con umbral). Vacío si ninguna etapa tiene umbral. */
export async function condicionDeEstancado(db: BaseDatos, ahora: Date, etapaId?: string): Promise<{ OR: Record<string, unknown>[] } | null> {
  const etapas = await db.etapa_pipeline.findMany({
    where: { dias_alerta_sin_movimiento: { not: null }, es_ganado: false, es_perdido: false, OR: [{ tipo_sistema: null }, { tipo_sistema: { notIn: ["inscrito", "perdido"] } }], ...(etapaId ? { id: etapaId } : {}) },
    select: { id: true, dias_alerta_sin_movimiento: true },
  });
  if (etapas.length === 0) return null;
  return {
    OR: etapas.map((e) => {
      const corte = new Date(ahora.getTime() - e.dias_alerta_sin_movimiento! * DIA_MS);
      return { etapa_id: e.id, OR: [{ ultima_interaccion_en: { lte: corte } }, { ultima_interaccion_en: null, creado_en: { lte: corte } }] };
    }),
  };
}

export async function leadsEstancados(db: BaseDatos, ahora: Date, o: { dondeLead: Record<string, unknown>; etapaId?: string; saltar: number; tomar: number }): Promise<{ total: number; filas: LeadEstancado[] }> {
  const estancado = await condicionDeEstancado(db, ahora, o.etapaId);
  if (!estancado) return { total: 0, filas: [] };
  const where = { AND: [o.dondeLead, estancado] };
  const [total, leads] = await Promise.all([
    db.lead.count({ where }),
    db.lead.findMany({
      where,
      select: { id: true, nombre_contacto: true, telefono: true, sucursal_interes_id: true, ultima_interaccion_en: true, creado_en: true, etapa: { select: { id: true, nombre: true, dias_alerta_sin_movimiento: true } } },
      // Los más viejos primero (los que nunca tuvieron una interacción, antes).
      orderBy: [{ ultima_interaccion_en: { sort: "asc", nulls: "first" } }, { creado_en: "asc" }, { id: "asc" }],
      skip: o.saltar,
      take: o.tomar,
    }),
  ]);
  return {
    total,
    filas: leads.map((l) => ({
      id: l.id,
      nombreContacto: l.nombre_contacto,
      telefono: l.telefono,
      sucursalInteresId: l.sucursal_interes_id,
      etapa: { id: l.etapa.id, nombre: l.etapa.nombre, diasAlerta: l.etapa.dias_alerta_sin_movimiento! },
      ultimaInteraccionEn: l.ultima_interaccion_en,
      creadoEn: l.creado_en,
      diasSinMovimiento: diasSinMovimiento({ ultimaInteraccionEn: l.ultima_interaccion_en, creadoEn: l.creado_en }, ahora),
    })),
  };
}
