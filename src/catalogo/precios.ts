// Precios versionados por fecha (C2). Determinista (invariante 10).
//
// Una vigencia es un rango de fechas de calendario [desde, hasta] (ambas inclusivas; `hasta` nulo = abierta).
// Las vigencias de un programa no se traslapan (restricción de exclusión en la base). Las fechas son TEXTO
// `AAAA-MM-DD` (la fecha local de la escuela, sin horas ni zonas); el dinero, centavos `bigint`.
//
//   precioVigente(db, programaId, "2026-10-15")  →  el precio que rige ese día, o null si no hay.

import type { Consultas, BaseDatos } from "../datos/alcance.ts";
import { deDecimal, type Centavos } from "../lib/dinero.ts";

export type FechaISO = string;

export const aFecha = (f: FechaISO): Date => new Date(`${f}T00:00:00.000Z`);
export const deFecha = (d: Date): FechaISO => d.toISOString().slice(0, 10);

/** El día siguiente (n = 1) o anterior (n = -1) de una fecha. */
export function sumarDias(f: FechaISO, n: number): FechaISO {
  const d = aFecha(f);
  d.setUTCDate(d.getUTCDate() + n);
  return deFecha(d);
}

export interface VigenciaDePrecio {
  id: string;
  desde: FechaISO;
  /** null = abierta. */
  hasta: FechaISO | null;
}

export interface PrecioVigente extends VigenciaDePrecio {
  programaId: string;
  costoInscripcion: Centavos;
  costoMensualidad: Centavos;
  moneda: string;
}

/** ¿Rige esta vigencia ese día? Desde y hasta inclusivos. */
export const rigeEn = (v: Pick<VigenciaDePrecio, "desde" | "hasta">, fecha: FechaISO): boolean => v.desde <= fecha && (v.hasta === null || fecha <= v.hasta);

/**
 * Entre varias vigencias, la que rige ese día. Con datos sanos hay a lo más una; si hubiera más (datos
 * heredados), gana la de `desde` más reciente y, a igualdad, la de menor id: siempre la misma.
 */
export function elegirVigente<T extends VigenciaDePrecio>(vigencias: readonly T[], fecha: FechaISO): T | null {
  const candidatas = vigencias.filter((v) => rigeEn(v, fecha));
  candidatas.sort((a, b) => (a.desde < b.desde ? 1 : a.desde > b.desde ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return candidatas[0] ?? null;
}

export type PlanDeAlta =
  | { ok: true; cerrar: { id: string; hasta: FechaISO } | null }
  | { ok: false; motivo: string; conflictoConId: string };

/**
 * Qué hay que hacer para dar de alta una vigencia nueva que empieza el `desde` y queda ABIERTA: no puede haber
 * ya una que empiece ese día o después (el historial solo crece hacia delante); la última anterior, si sigue
 * abierta o llega hasta `desde`, se cierra el día previo. PURA.
 */
export function planDeAlta(existentes: readonly VigenciaDePrecio[], desde: FechaISO): PlanDeAlta {
  const posterior = existentes.filter((v) => v.desde >= desde).sort((a, b) => (a.desde < b.desde ? -1 : 1))[0];
  if (posterior) return { ok: false, motivo: `Ya hay un precio que rige desde el ${posterior.desde.slice(8, 10)}/${posterior.desde.slice(5, 7)}/${posterior.desde.slice(0, 4)}. Elige una fecha posterior para el precio nuevo.`, conflictoConId: posterior.id };
  const anterior = existentes.filter((v) => v.desde < desde).sort((a, b) => (a.desde < b.desde ? 1 : -1))[0];
  if (anterior && (anterior.hasta === null || anterior.hasta >= desde)) return { ok: true, cerrar: { id: anterior.id, hasta: sumarDias(desde, -1) } };
  return { ok: true, cerrar: null };
}

interface FilaPrecio {
  id: string;
  programa_id: string;
  costo_inscripcion: { toFixed(n: number): string };
  costo_mensualidad: { toFixed(n: number): string };
  moneda: string;
  vigencia_desde: Date;
  vigencia_hasta: Date | null;
}

export function precioDeFila(f: FilaPrecio): PrecioVigente {
  return {
    id: f.id,
    programaId: f.programa_id,
    costoInscripcion: deDecimal(f.costo_inscripcion),
    costoMensualidad: deDecimal(f.costo_mensualidad),
    moneda: f.moneda,
    desde: deFecha(f.vigencia_desde),
    hasta: f.vigencia_hasta ? deFecha(f.vigencia_hasta) : null,
  };
}

/** El precio de un programa que rige en esa fecha (o null). Sólo precios vivos. */
export async function precioVigente(db: Consultas | BaseDatos, programaId: string, fecha: FechaISO): Promise<PrecioVigente | null> {
  const f = aFecha(fecha);
  const filas = await db.precio.findMany({
    where: { programa_id: programaId, vigencia_desde: { lte: f }, OR: [{ vigencia_hasta: null }, { vigencia_hasta: { gte: f } }] },
    orderBy: [{ vigencia_desde: "desc" }, { id: "asc" }],
    take: 1,
  });
  return filas[0] ? precioDeFila(filas[0]) : null;
}
