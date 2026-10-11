// Fuentes y campañas del tablero (sección «¿Qué fuente trae alumnos y a qué costo?»): leads, inscritos, conversión, gasto y costo por alumno inscrito de cada fuente.
//
// DEFINICIONES (una sola vez, aquí)
//   · Una FILA es una campaña (la de los leads que la traen) o, para los leads sin campaña, una fuente (`landing`, `codigo`, `anuncio` o `directo`; ver `fuente.ts`). El nombre y el origen de la
//     campaña son de la escuela: salen de la tabla.
//   · LEADS = los creados en el rango (día local, ver `leads-del-rango.ts`) que cumplen los filtros de sucursal y disciplina de interés. INSCRITOS = de esos leads, los que HOY están en una etapa
//     ganada (incluye los marcados a mano, V10b): la misma cohorte y la misma regla que el embudo, así que `conversion` = inscritos / leads nunca pasa de 100 %.
//     Ojo: el «costo por alumno» del reporte de costo por campaña (I2) divide entre las inscripciones ACTIVAS con fecha de inscripción en el rango, sin importar cuándo llegó el lead; aquí
//     el divisor son los inscritos de la cohorte de leads. Los dos son correctos para su pregunta y pueden diferir.
//   · GASTO = Σ de los gastos de la campaña con fecha en el rango (lo captura el administrador a mano). Solo lo ve quien tiene el permiso de costos (`incluye_gasto`): para los demás, `gasto` y
//     `costo_por_alumno` son null. Las fuentes sin campaña no tienen gasto («Sin gasto», no «—»: `gasto` es "0.00").
//   · CON FILTRO (sucursal o disciplina), el gasto de una campaña se REPARTE: le toca la parte de sus leads del rango que cumplen el filtro (gasto × leads en el filtro / leads de la campaña en el
//     rango, al centavo). Si la campaña no tuvo leads en el rango, su gasto cuenta completo solo si es compatible con el filtro (su sucursal y su disciplina son las pedidas o no tiene). Sin filtro,
//     el gasto va completo.
//   · COSTO POR ALUMNO = gasto / inscritos de la fila (al centavo); null sin gasto o sin inscritos. `es_mas_barato`: la(s) fila(s) con gasto de menor costo. El TOTAL trae el costo por alumno de
//     lo que vino de campañas con gasto (`inscritos_con_gasto`) y cuántos inscritos no costaron (`inscritos_sin_costo`).

import { aFecha, type FechaISO } from "../catalogo/precios.ts";
import type { BaseDatos } from "../datos/alcance.ts";
import { aTexto, deDecimal, dividir, proporcion, sumar, type Centavos } from "../lib/dinero.ts";
import { porcentajeConUnDecimal } from "../lib/razon.ts";
import { leadsDelRango, type FiltrosDeLeads } from "./leads-del-rango.ts";

export interface FilaDeFuente {
  clave: string;
  fuente: string;
  campana: { id: string; nombre: string } | null;
  leads: number;
  inscritos: number;
  conversion: string | null;
  /** null si quien pregunta no ve los costos. */
  gasto: string | null;
  costo_por_alumno: string | null;
  es_mas_barato: boolean;
}

export interface ReporteDeFuentes {
  desde: FechaISO | null;
  hasta: FechaISO | null;
  incluye_gasto: boolean;
  filas: FilaDeFuente[];
  total: { leads: number; inscritos: number; conversion: string | null; gasto: string | null; inscritos_con_gasto: number | null; inscritos_sin_costo: number | null; costo_por_alumno: string | null };
}

export async function reporteDeFuentes(db: BaseDatos, f: FiltrosDeLeads & { conGasto: boolean }): Promise<ReporteDeFuentes> {
  const todos = await leadsDelRango(db, f);
  const etapas = await db.etapa_pipeline.findMany({ select: { id: true, es_ganado: true } });
  const ganadas = new Set(etapas.filter((e) => e.es_ganado).map((e) => e.id));
  const hayFiltro = Boolean(f.sucursalId || f.verticalId);

  interface Cubeta {
    clave: string;
    fuente: string;
    campana: { id: string; nombre: string } | null;
    leadsDeCampana: number;
    leads: number;
    inscritos: number;
    gasto: Centavos;
  }
  const cubetas = new Map<string, Cubeta>();
  const cubeta = (clave: string, fuente: string, campana: Cubeta["campana"]): Cubeta => cubetas.get(clave) ?? cubetas.set(clave, { clave, fuente, campana, leadsDeCampana: 0, leads: 0, inscritos: 0, gasto: 0n }).get(clave)!;
  for (const l of todos) {
    const c = cubeta(l.campana ? `campana:${l.campana.id}` : `fuente:${l.fuente}`, l.fuente, l.campana ? { id: l.campana.id, nombre: l.campana.nombre } : null);
    c.leadsDeCampana++;
    if (!l.enFiltro) continue;
    c.leads++;
    if (ganadas.has(l.etapaId)) c.inscritos++;
  }

  if (f.conGasto) {
    const campanas = await db.campana.findMany({ select: { id: true, nombre: true, origen: true, vertical_id: true, sucursal_id: true } });
    const gastos = await db.gasto_campana.findMany({ where: f.desde || f.hasta ? { fecha: { ...(f.desde ? { gte: aFecha(f.desde) } : {}), ...(f.hasta ? { lte: aFecha(f.hasta) } : {}) } } : {}, select: { campana_id: true, monto: true } });
    for (const c of campanas) {
      const total = sumar(...gastos.filter((g) => g.campana_id === c.id).map((g) => deDecimal(g.monto)));
      if (total === 0n) continue;
      const existente = cubetas.get(`campana:${c.id}`);
      if (existente && existente.leadsDeCampana > 0) {
        existente.gasto = hayFiltro ? proporcion(total, existente.leads, existente.leadsDeCampana) : total;
      } else {
        const compatible = (!f.verticalId || c.vertical_id === null || c.vertical_id === f.verticalId) && (!f.sucursalId || c.sucursal_id === null || c.sucursal_id === f.sucursalId);
        if (!compatible) continue;
        cubeta(`campana:${c.id}`, c.origen, { id: c.id, nombre: c.nombre }).gasto = total;
      }
    }
  }

  const visibles = [...cubetas.values()].filter((c) => c.leads > 0 || c.gasto > 0n);
  const costo = (c: Cubeta): Centavos | null => (f.conGasto && c.gasto > 0n && c.inscritos > 0 ? dividir(c.gasto, c.inscritos) : null);
  const costos = visibles.map(costo).filter((x): x is Centavos => x !== null);
  const minimo = costos.length === 0 ? null : costos.reduce((a, b) => (a < b ? a : b));
  const filas: FilaDeFuente[] = visibles
    .sort((a, b) => b.leads - a.leads || (a.campana?.nombre ?? a.fuente).localeCompare(b.campana?.nombre ?? b.fuente, "es-MX") || a.clave.localeCompare(b.clave))
    .map((c) => {
      const k = costo(c);
      return {
        clave: c.clave,
        fuente: c.fuente,
        campana: c.campana,
        leads: c.leads,
        inscritos: c.inscritos,
        conversion: porcentajeConUnDecimal(c.inscritos, c.leads),
        gasto: f.conGasto ? aTexto(c.gasto) : null,
        costo_por_alumno: k === null ? null : aTexto(k),
        es_mas_barato: k !== null && minimo !== null && k === minimo,
      };
    });

  const leads = visibles.reduce((n, c) => n + c.leads, 0);
  const inscritos = visibles.reduce((n, c) => n + c.inscritos, 0);
  const gastoTotal = sumar(...visibles.map((c) => c.gasto));
  const conGasto = visibles.filter((c) => c.gasto > 0n);
  const inscritosConGasto = conGasto.reduce((n, c) => n + c.inscritos, 0);
  return {
    desde: f.desde ?? null,
    hasta: f.hasta ?? null,
    incluye_gasto: f.conGasto,
    filas,
    total: {
      leads,
      inscritos,
      conversion: porcentajeConUnDecimal(inscritos, leads),
      gasto: f.conGasto ? aTexto(gastoTotal) : null,
      inscritos_con_gasto: f.conGasto ? inscritosConGasto : null,
      inscritos_sin_costo: f.conGasto ? inscritos - inscritosConGasto : null,
      costo_por_alumno: f.conGasto && inscritosConGasto > 0 ? aTexto(dividir(gastoTotal, inscritosConGasto)) : null,
    },
  };
}
