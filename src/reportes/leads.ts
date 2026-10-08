// Reporte mínimo de Fase 1 (bloque 1.7): cuántos leads hay por campaña, sucursal y etapa. Es lo
// que hoy no existe. Consulta solo a través del scope de organización (invariante 1) y no cuenta
// lo borrado (invariante 3).

import type { BaseDatos } from "../datos/alcance.ts";

export interface FiltrosReporteLeads {
  /** Leads creados desde esta fecha (inclusive). */
  desde?: Date;
  /** Leads creados hasta esta fecha (exclusive). */
  hasta?: Date;
  /** Solo leads que preguntan por esta vertical (slug). */
  verticalSlug?: string;
}

export interface FilaReporteLeads {
  campana: string;
  sucursal: string;
  etapa: string;
  /** Orden de la etapa en el embudo; sirve para ordenar y para el resumen por etapa. */
  ordenEtapa: number;
  leads: number;
}

export interface ReporteLeads {
  filas: FilaReporteLeads[];
  /** Total de leads por etapa, en el orden del embudo. */
  porEtapa: { etapa: string; ordenEtapa: number; leads: number }[];
  total: number;
}

export const SIN_CAMPANA = "(sin campaña)";
export const SIN_SUCURSAL = "(sin sucursal)";
const BORRADA = (que: string): string => `(${que} eliminada)`;

export async function reporteLeads(db: BaseDatos, filtros: FiltrosReporteLeads = {}): Promise<ReporteLeads> {
  let verticalId: string | undefined;
  if (filtros.verticalSlug) {
    const v = await db.vertical.findFirst({ where: { slug: filtros.verticalSlug }, select: { id: true } });
    if (!v) throw new Error(`No existe la vertical "${filtros.verticalSlug}"`);
    verticalId = v.id;
  }

  const grupos = await db.lead.groupBy({
    by: ["campana_id", "sucursal_interes_id", "etapa_id"],
    where: {
      ...(verticalId ? { vertical_interes_id: verticalId } : {}),
      ...(filtros.desde || filtros.hasta
        ? { creado_en: { ...(filtros.desde ? { gte: filtros.desde } : {}), ...(filtros.hasta ? { lt: filtros.hasta } : {}) } }
        : {}),
    },
    _count: { _all: true },
  });

  const ids = <K extends "campana_id" | "sucursal_interes_id" | "etapa_id">(k: K): string[] => [
    ...new Set(grupos.map((g) => g[k]).filter((x): x is string => x !== null)),
  ];
  const [campanas, sucursales, etapas] = await Promise.all([
    db.campana.findMany({ where: { id: { in: ids("campana_id") } }, select: { id: true, nombre: true } }),
    db.sucursal.findMany({ where: { id: { in: ids("sucursal_interes_id") } }, select: { id: true, nombre: true } }),
    db.etapa_pipeline.findMany({ where: { id: { in: ids("etapa_id") } }, select: { id: true, nombre: true, orden: true } }),
  ]);
  const nombreCampana = new Map(campanas.map((c) => [c.id, c.nombre]));
  const nombreSucursal = new Map(sucursales.map((s) => [s.id, s.nombre]));
  const etapa = new Map(etapas.map((e) => [e.id, e]));

  const filas: FilaReporteLeads[] = grupos.map((g) => ({
    campana: g.campana_id === null ? SIN_CAMPANA : (nombreCampana.get(g.campana_id) ?? BORRADA("campaña")),
    sucursal: g.sucursal_interes_id === null ? SIN_SUCURSAL : (nombreSucursal.get(g.sucursal_interes_id) ?? BORRADA("sucursal")),
    etapa: etapa.get(g.etapa_id)?.nombre ?? BORRADA("etapa"),
    ordenEtapa: etapa.get(g.etapa_id)?.orden ?? Number.MAX_SAFE_INTEGER,
    leads: g._count._all,
  }));
  const texto = (a: string, b: string): number => a.localeCompare(b, "es-MX");
  filas.sort((a, b) => texto(a.campana, b.campana) || texto(a.sucursal, b.sucursal) || a.ordenEtapa - b.ordenEtapa);

  const porEtapa = new Map<string, { etapa: string; ordenEtapa: number; leads: number }>();
  for (const f of filas) {
    const actual = porEtapa.get(f.etapa) ?? { etapa: f.etapa, ordenEtapa: f.ordenEtapa, leads: 0 };
    actual.leads += f.leads;
    porEtapa.set(f.etapa, actual);
  }
  return {
    filas,
    porEtapa: [...porEtapa.values()].sort((a, b) => a.ordenEtapa - b.ordenEtapa),
    total: filas.reduce((suma, f) => suma + f.leads, 0),
  };
}

/** Texto para la terminal: tabla alineada, resumen por etapa y total. */
export function formatearReporteLeads(r: ReporteLeads): string {
  if (r.total === 0) return "Sin leads para los filtros dados.";
  const encabezado = ["Campaña", "Sucursal", "Etapa", "Leads"];
  const filas = r.filas.map((f) => [f.campana, f.sucursal, f.etapa, String(f.leads)]);
  const ancho = encabezado.map((h, i) => Math.max(h.length, ...filas.map((f) => f[i]!.length)));
  const linea = (celdas: string[]): string =>
    celdas.map((c, i) => (i === 3 ? c.padStart(ancho[i]!) : c.padEnd(ancho[i]!))).join("  ");
  const resumenAncho = Math.max(...r.porEtapa.map((e) => e.etapa.length));
  return [
    linea(encabezado),
    linea(ancho.map((a) => "─".repeat(a))),
    ...filas.map(linea),
    "",
    "Por etapa:",
    ...r.porEtapa.map((e) => `  ${e.etapa.padEnd(resumenAncho)}  ${String(e.leads).padStart(5)}`),
    "",
    `Total: ${r.total}`,
  ].join("\n");
}
