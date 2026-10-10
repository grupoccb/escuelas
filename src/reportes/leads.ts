// Reporte mínimo de Fase 1 (bloque 1.7): cuántos leads hay por campaña, sucursal y etapa. Es lo
// que hoy no existe. Consulta solo a través del scope de organización (invariante 1) y no cuenta
// lo borrado (invariante 3).

import type { BaseDatos } from "../datos/alcance.ts";
import { inscritosAMano } from "../embudo/inscrito-a-mano.ts";

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
  /** Todos los leads de la fila, sea cual sea la forma en que llegaron a su etapa. */
  leads: number;
  /** V10b: de ellos, los que una persona marcó como inscritos a mano (siempre 0 fuera de la etapa de inscrito). Los demás de esa etapa se inscribieron de verdad. */
  aMano: number;
}

export interface ReporteLeads {
  filas: FilaReporteLeads[];
  /** Total de leads por etapa, en el orden del embudo. */
  porEtapa: { etapa: string; ordenEtapa: number; leads: number; aMano: number }[];
  total: number;
  /**
   * V10b: los leads en una etapa de inscrito, contados UNA vez cada uno: `total` = `porInscripcion` + `aMano`. Un lead marcado a mano que después se inscribió de verdad cuenta como
   * «por inscripción» (ya tiene su inscripción; el historial conserva los dos hechos).
   */
  inscritos: { total: number; porInscripcion: number; aMano: number };
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

  const filtroDeLeads = {
    ...(verticalId ? { vertical_interes_id: verticalId } : {}),
    ...(filtros.desde || filtros.hasta
      ? { creado_en: { ...(filtros.desde ? { gte: filtros.desde } : {}), ...(filtros.hasta ? { lt: filtros.hasta } : {}) } }
      : {}),
  };
  const grupos = await db.lead.groupBy({ by: ["campana_id", "sucursal_interes_id", "etapa_id"], where: filtroDeLeads, _count: { _all: true } });
  // V10b: de esos mismos leads, los inscritos a mano (con los mismos filtros), por la misma combinación.
  const manos = await inscritosAMano(db);
  const gruposAMano = manos.size === 0 ? [] : await db.lead.groupBy({ by: ["campana_id", "sucursal_interes_id", "etapa_id"], where: { ...filtroDeLeads, id: { in: [...manos.keys()] } }, _count: { _all: true } });
  const clave = (g: { campana_id: string | null; sucursal_interes_id: string | null; etapa_id: string }): string => `${g.campana_id ?? ""}|${g.sucursal_interes_id ?? ""}|${g.etapa_id}`;
  const aManoPor = new Map(gruposAMano.map((g) => [clave(g), g._count._all]));

  const ids = <K extends "campana_id" | "sucursal_interes_id" | "etapa_id">(k: K): string[] => [
    ...new Set(grupos.map((g) => g[k]).filter((x): x is string => x !== null)),
  ];
  const [campanas, sucursales, etapas] = await Promise.all([
    db.campana.findMany({ where: { id: { in: ids("campana_id") } }, select: { id: true, nombre: true } }),
    db.sucursal.findMany({ where: { id: { in: ids("sucursal_interes_id") } }, select: { id: true, nombre: true } }),
    db.etapa_pipeline.findMany({ where: { id: { in: ids("etapa_id") } }, select: { id: true, nombre: true, orden: true, es_ganado: true, tipo_sistema: true } }),
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
    aMano: aManoPor.get(clave(g)) ?? 0,
  }));
  const texto = (a: string, b: string): number => a.localeCompare(b, "es-MX");
  filas.sort((a, b) => texto(a.campana, b.campana) || texto(a.sucursal, b.sucursal) || a.ordenEtapa - b.ordenEtapa);

  const porEtapa = new Map<string, { etapa: string; ordenEtapa: number; leads: number; aMano: number }>();
  for (const f of filas) {
    const actual = porEtapa.get(f.etapa) ?? { etapa: f.etapa, ordenEtapa: f.ordenEtapa, leads: 0, aMano: 0 };
    actual.leads += f.leads;
    actual.aMano += f.aMano;
    porEtapa.set(f.etapa, actual);
  }
  const esDeInscrito = new Set(etapas.filter((e) => e.es_ganado || e.tipo_sistema === "inscrito").map((e) => e.id));
  const inscritosTotal = grupos.filter((g) => esDeInscrito.has(g.etapa_id)).reduce((n, g) => n + g._count._all, 0);
  const totalAMano = filas.reduce((n, f) => n + f.aMano, 0);
  return {
    filas,
    porEtapa: [...porEtapa.values()].sort((a, b) => a.ordenEtapa - b.ordenEtapa),
    total: filas.reduce((suma, f) => suma + f.leads, 0),
    inscritos: { total: inscritosTotal, porInscripcion: inscritosTotal - totalAMano, aMano: totalAMano },
  };
}

/** Texto para la terminal: tabla alineada, resumen por etapa y total. Si hay inscritos a mano (V10b) agrega la columna «A mano» y el desglose; si no, queda como siempre. */
export function formatearReporteLeads(r: ReporteLeads): string {
  if (r.total === 0) return "Sin leads para los filtros dados.";
  const conMano = r.inscritos.aMano > 0;
  const encabezado = ["Campaña", "Sucursal", "Etapa", "Leads", ...(conMano ? ["A mano"] : [])];
  const filas = r.filas.map((f) => [f.campana, f.sucursal, f.etapa, String(f.leads), ...(conMano ? [f.aMano > 0 ? String(f.aMano) : ""] : [])]);
  const ancho = encabezado.map((h, i) => Math.max(h.length, ...filas.map((f) => f[i]!.length)));
  const linea = (celdas: string[]): string =>
    celdas.map((c, i) => (i >= 3 ? c.padStart(ancho[i]!) : c.padEnd(ancho[i]!))).join("  ");
  const resumenAncho = Math.max(...r.porEtapa.map((e) => e.etapa.length));
  return [
    linea(encabezado),
    linea(ancho.map((a) => "─".repeat(a))),
    ...filas.map(linea),
    "",
    "Por etapa:",
    ...r.porEtapa.map((e) => `  ${e.etapa.padEnd(resumenAncho)}  ${String(e.leads).padStart(5)}${e.aMano > 0 ? `  (${e.aMano} inscritos a mano)` : ""}`),
    "",
    `Total: ${r.total}`,
    ...(conMano ? [`Inscritos: ${r.inscritos.total} (${r.inscritos.porInscripcion} por inscripción, ${r.inscritos.aMano} a mano)`] : []),
  ].join("\n");
}
