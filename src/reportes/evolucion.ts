// Evolución de la escuela en 12 meses (tablero, secciones «Altas, bajas y alumnos activos», «Retención» e «Ingreso recurrente»): una serie mensual y la retención por cohortes.
//
// DEFINICIONES (una sola vez, aquí)
//   · La ventana son los 12 meses que terminan en `mes` (por omisión el mes en curso en la zona de la primera sucursal). Dinero en centavos exactos (texto con dos decimales); conteos enteros.
//   · CORTE de un mes = su último día; el del mes en curso (o uno futuro) es HOY. Nunca se mira más allá de hoy.
//   · ALTAS del mes = inscripciones con `fecha_inscripcion` en el mes; BAJAS del mes = inscripciones dadas de baja con `fecha_baja` en el mes (las mismas del reporte ejecutivo).
//   · ACTIVA AL CORTE = inscrita a esa fecha, sin baja a esa fecha y no congelada a esa fecha (la última congelación/reactivación a esa fecha manda; `inscripcion_movimiento`). Las congeladas no
//     cuentan, como en el reporte ejecutivo; el último punto de la serie coincide con el ejecutivo de hoy.
//   · ACTIVOS = alumnos distintos con al menos una inscripción activa al corte; INGRESO MENSUAL RECURRENTE = Σ de la mensualidad congelada (precio de lista − descuento fijo de mensualidad) de
//     las inscripciones activas al corte. Es el ingreso que el negocio tendría si todas pagaran: no es lo cobrado.
//   · COHORTE = las inscripciones con `fecha_inscripcion` en un mes. SIGUEN al mes k = las que no se dieron de baja a más tardar en el corte del mes M+k (congeladas siguen). El mes k solo se
//     calcula si M+k no pasa de `mes` (si no, null: «todavía no pasa ese tiempo»). El PROMEDIO de cada k es ponderado: Σ siguen / Σ altas de las cohortes que ya llegaron a k.
//   · Los filtros de sucursal y disciplina acotan todo por el programa del grupo de cada inscripción, y se intersectan con el alcance de quien pregunta.

import { deFecha, type FechaISO } from "../catalogo/precios.ts";
import type { BaseDatos } from "../datos/alcance.ts";
import { fechaDeCorte } from "../inscripciones/corte.ts";
import { aTexto, deDecimal, restar, sumar, type Centavos } from "../lib/dinero.ts";
import { fechaLocal } from "../lib/horario.ts";
import { partesDePeriodo, periodoDe, sumarMeses, type Periodo } from "../lib/periodo.ts";
import { porcentajeConUnDecimal } from "../lib/razon.ts";
import { dondePrograma, sucursalesEfectivas } from "./ejecutivo.ts";
import { enLotes } from "./leads-del-rango.ts";

/** Cuántos meses de seguimiento tiene una cohorte. */
export const MESES_DE_SEGUIMIENTO = 6;
const MESES_DE_LA_SERIE = 12;

export interface PuntoMensual {
  mes: Periodo;
  altas: number;
  bajas: number;
  /** Alumnos distintos con una inscripción activa al corte del mes. */
  activos: number;
  inscripciones_activas: number;
  ingreso_mensual_recurrente: string;
}

export interface SeguimientoDeCohorte {
  /** 1 a 6: meses después del mes de inscripción. */
  mes_n: number;
  /** null: todavía no pasa ese tiempo. */
  siguen: number | null;
  porcentaje: string | null;
}

export interface CohorteDeInscripcion {
  mes: Periodo;
  altas: number;
  seguimiento: SeguimientoDeCohorte[];
}

export interface ReporteDeEvolucion {
  mes: Periodo;
  hasta: FechaISO;
  meses: PuntoMensual[];
  cohortes: CohorteDeInscripcion[];
  promedio: { mes_n: number; siguen: number; altas: number; porcentaje: string | null }[];
}

export async function reporteDeEvolucion(db: BaseDatos, o: { mes?: Periodo; ahora: Date; sucursalesVisibles?: string[] | null; sucursalId?: string; verticalId?: string }): Promise<ReporteDeEvolucion> {
  const primera = await db.sucursal.findFirst({ orderBy: [{ creado_en: "asc" }, { id: "asc" }], select: { zona_horaria: true } });
  const hoy: FechaISO = fechaLocal(o.ahora, primera?.zona_horaria ?? "UTC");
  const mes = o.mes ?? periodoDe(hoy);
  const programa = dondePrograma(sucursalesEfectivas(o.sucursalesVisibles, o.sucursalId), o.verticalId);

  const inscripciones = await db.inscripcion.findMany({
    where: Object.keys(programa).length > 0 ? { grupo: { programa } } : {},
    select: { id: true, alumno_id: true, estatus: true, fecha_inscripcion: true, fecha_baja: true, precio_mensualidad_aplicado: true, descuento_mensualidad_aplicado: true },
  });
  const filas = inscripciones.map((i) => ({
    id: i.id,
    alumnoId: i.alumno_id,
    alta: deFecha(i.fecha_inscripcion),
    baja: i.estatus === "baja" ? (i.fecha_baja ? deFecha(i.fecha_baja) : "0000-01-01") : null,
    mensualidad: restar(deDecimal(i.precio_mensualidad_aplicado), deDecimal(i.descuento_mensualidad_aplicado)),
  }));

  // Congelaciones y reactivaciones, en orden, por inscripción.
  const movimientos = new Map<string, { fecha: FechaISO; congela: boolean }[]>();
  for (const lote of enLotes(filas.map((f) => f.id))) {
    const ms = await db.inscripcion_movimiento.findMany({ where: { inscripcion_id: { in: lote }, tipo: { in: ["congelacion", "reactivacion"] } }, orderBy: [{ fecha: "asc" }, { secuencia: "asc" }], select: { inscripcion_id: true, tipo: true, fecha: true } });
    for (const m of ms) (movimientos.get(m.inscripcion_id) ?? movimientos.set(m.inscripcion_id, []).get(m.inscripcion_id)!).push({ fecha: deFecha(m.fecha), congela: m.tipo === "congelacion" });
  }
  const congeladaEn = (id: string, corte: FechaISO): boolean => {
    let congelada = false;
    for (const m of movimientos.get(id) ?? []) if (m.fecha <= corte) congelada = m.congela;
    return congelada;
  };
  const activaEn = (f: (typeof filas)[number], corte: FechaISO): boolean => f.alta <= corte && !(f.baja !== null && f.baja <= corte) && !congeladaEn(f.id, corte);

  const corteDe = (periodo: Periodo): FechaISO => {
    const { anio, mes: numero } = partesDePeriodo(periodo);
    const fin = fechaDeCorte(31, anio, numero);
    return fin < hoy ? fin : hoy;
  };
  const delMes = (fecha: FechaISO | null, periodo: Periodo): boolean => fecha !== null && fecha.slice(0, 7) === periodo;

  const periodos = Array.from({ length: MESES_DE_LA_SERIE }, (_, i) => sumarMeses(mes, i - (MESES_DE_LA_SERIE - 1)));
  const meses: PuntoMensual[] = periodos.map((p) => {
    const corte = corteDe(p);
    const activas = filas.filter((f) => activaEn(f, corte));
    const ingreso: Centavos = sumar(...activas.map((f) => f.mensualidad));
    return {
      mes: p,
      altas: filas.filter((f) => delMes(f.alta, p)).length,
      bajas: filas.filter((f) => delMes(f.baja, p)).length,
      activos: new Set(activas.map((f) => f.alumnoId)).size,
      inscripciones_activas: activas.length,
      ingreso_mensual_recurrente: aTexto(ingreso),
    };
  });

  const acumulado = Array.from({ length: MESES_DE_SEGUIMIENTO }, () => ({ siguen: 0, altas: 0 }));
  const cohortes: CohorteDeInscripcion[] = periodos.map((p) => {
    const cohorte = filas.filter((f) => delMes(f.alta, p));
    const seguimiento: SeguimientoDeCohorte[] = Array.from({ length: MESES_DE_SEGUIMIENTO }, (_, i) => {
      const k = i + 1;
      const destino = sumarMeses(p, k);
      if (destino > mes) return { mes_n: k, siguen: null, porcentaje: null };
      const corte = corteDe(destino);
      const siguen = cohorte.filter((f) => !(f.baja !== null && f.baja <= corte)).length;
      acumulado[i]!.siguen += siguen;
      acumulado[i]!.altas += cohorte.length;
      return { mes_n: k, siguen, porcentaje: porcentajeConUnDecimal(siguen, cohorte.length) };
    });
    return { mes: p, altas: cohorte.length, seguimiento };
  });
  const promedio = acumulado.map((a, i) => ({ mes_n: i + 1, siguen: a.siguen, altas: a.altas, porcentaje: porcentajeConUnDecimal(a.siguen, a.altas) }));

  return { mes, hasta: corteDe(mes), meses, cohortes, promedio };
}
