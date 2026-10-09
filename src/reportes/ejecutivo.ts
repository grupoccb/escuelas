// Reporte ejecutivo (I3): el estado de la escuela en una sola respuesta. Dinero en centavos exactos (texto con dos decimales); conteos enteros; porcentajes con un decimal en texto.
//
// DEFINICIONES
//   · ACTIVOS: alumnos distintos con al menos una inscripción ACTIVA, por vertical y sucursal (un alumno en dos verticales cuenta en cada una y UNA vez en el total). Las congeladas no cuentan.
//   · ALTAS del mes: inscripciones con `fecha_inscripcion` dentro del mes. BAJAS del mes: inscripciones dadas de baja con `fecha_baja` dentro del mes.
//   · DESERCIÓN (churn) = bajas del mes / inscripciones vigentes al inicio del mes (inscritas antes del día 1 y sin baja antes del día 1, congeladas incluidas). «—» si no había base.
//   · INGRESO MENSUAL RECURRENTE = Σ de la mensualidad CONGELADA de las inscripciones activas (precio de lista − descuento fijo de mensualidad, ambos congelados al inscribir).
//   · CARTERA VENCIDA = Σ del saldo de los cargos abiertos cuyo vencimiento ya pasó (calendario de su sucursal), con la antigüedad del estado de cuenta (de 0 a 30, 31 a 60, 61 a 90 y más de 90 días).
//   · OCUPACIÓN por grupo = ocupados / cupo máximo, con los ocupados de la FUENTE REAL (`FuenteOcupacion`: las inscripciones activas del grupo; la misma que usan el cotizador, la
//     inscripción y la lista de espera). `a_reventar` (ocupación >= 90 %: abrir otro grupo) y `vacio` (<= 25 %: promoverlo o cerrarlo) son umbrales `[SUPUESTO]` de este archivo.
// «Activos», ingreso recurrente, cartera y ocupación son LA FOTO DE HOY (cuando se consulta); altas, bajas y deserción son del MES pedido (`AAAA-MM`, por omisión el mes en curso en la zona
// de la primera sucursal). Alcance: el administrador ve todo; el asesor, lo de SUS sucursales (inscripciones, cargos y grupos). El maestro NO ve este reporte (trae dinero): ve solo
// `reporteDeOcupacion`, sin importes, de SUS grupos.

import { deFecha, type FechaISO } from "../catalogo/precios.ts";
import type { FuenteOcupacion } from "../catalogo/cupo.ts";
import type { BaseDatos } from "../datos/alcance.ts";
import { antiguedadDe, antiguedadATexto, atrasoEn, totalDeAntiguedad } from "../finanzas/estado-cuenta.ts";
import { fechaDeCorte } from "../inscripciones/corte.ts";
import { aTexto, deDecimal, restar, sumar, type Centavos } from "../lib/dinero.ts";
import { fechaLocal } from "../lib/horario.ts";
import { partesDePeriodo, periodoDe, type Periodo } from "../lib/periodo.ts";
import { porcentajeConUnDecimal } from "../lib/razon.ts";

/** `[SUPUESTO]` Ocupación a partir de la cual un grupo está «a reventar» (abrir otro) y hasta la cual está «vacío» (promoverlo o cerrarlo). En porcentaje entero. */
export const UMBRAL_A_REVENTAR = 90;
export const UMBRAL_VACIO = 25;

export interface FilaDeActivos {
  vertical: { id: string; nombre: string };
  sucursal: { id: string; nombre: string };
  alumnos: number;
  inscripciones: number;
  ingreso_mensual_recurrente: string;
}

export interface FilaDeOcupacion {
  grupo: { id: string; nombre: string };
  programa: string;
  vertical: { id: string; nombre: string };
  sucursal: { id: string; nombre: string };
  ocupados: number;
  cupo_maximo: number;
  /** Porcentaje con un decimal («87.5»). */
  ocupacion: string;
  estado: "a_reventar" | "vacio" | "normal";
}

export interface ReporteEjecutivo {
  mes: Periodo;
  activos: { total_alumnos: number; total_inscripciones: number; por_vertical_y_sucursal: FilaDeActivos[] };
  altas_del_mes: number;
  bajas_del_mes: number;
  base_al_inicio_del_mes: number;
  desercion: string | null;
  desercion_texto: string;
  ingreso_mensual_recurrente: string;
  cartera_vencida: { total: string; antiguedad: ReturnType<typeof antiguedadATexto> };
  ocupacion_por_grupo: FilaDeOcupacion[];
}

/** El estado de una ocupación (porcentaje entero de `ocupados * 100 / cupo`). PURA. */
export function estadoDeOcupacion(ocupados: number, cupo: number): "a_reventar" | "vacio" | "normal" {
  if (cupo > 0 && ocupados * 100 >= UMBRAL_A_REVENTAR * cupo) return "a_reventar";
  if (ocupados * 100 <= UMBRAL_VACIO * cupo) return "vacio";
  return "normal";
}

/** Filtro de Prisma sobre una columna de sucursal para lo que quien pregunta puede ver (`undefined` = todo). */
const porSucursal = (visibles: string[] | null | undefined): { in: string[] } | undefined => (visibles ? { in: visibles } : undefined);

export async function reporteEjecutivo(db: BaseDatos, o: { mes?: Periodo; ahora: Date; fuente: FuenteOcupacion; sucursalesVisibles?: string[] | null }): Promise<ReporteEjecutivo> {
  const visibles = porSucursal(o.sucursalesVisibles);
  const primera = await db.sucursal.findFirst({ orderBy: [{ creado_en: "asc" }, { id: "asc" }], select: { zona_horaria: true } });
  const mes = o.mes ?? periodoDe(fechaLocal(o.ahora, primera?.zona_horaria ?? "UTC"));
  const { anio, mes: numero } = partesDePeriodo(mes);
  const inicio: FechaISO = `${mes}-01`;
  const fin: FechaISO = fechaDeCorte(31, anio, numero);

  const inscripciones = await db.inscripcion.findMany({
    where: visibles ? { grupo: { programa: { sucursal_id: visibles } } } : {},
    select: {
      alumno_id: true,
      estatus: true,
      fecha_inscripcion: true,
      fecha_baja: true,
      precio_mensualidad_aplicado: true,
      descuento_mensualidad_aplicado: true,
      grupo: { select: { programa: { select: { vertical: { select: { id: true, nombre: true } }, sucursal: { select: { id: true, nombre: true } } } } } },
    },
  });
  const activas = inscripciones.filter((i) => i.estatus === "activa");
  const mensualidad = (i: (typeof activas)[number]): Centavos => restar(deDecimal(i.precio_mensualidad_aplicado), deDecimal(i.descuento_mensualidad_aplicado));
  const cubetas = new Map<string, { vertical: { id: string; nombre: string }; sucursal: { id: string; nombre: string }; alumnos: Set<string>; inscripciones: number; ingreso: Centavos }>();
  for (const i of activas) {
    const { vertical, sucursal } = i.grupo.programa;
    const llave = `${vertical.id}|${sucursal.id}`;
    const c = cubetas.get(llave) ?? cubetas.set(llave, { vertical, sucursal, alumnos: new Set(), inscripciones: 0, ingreso: 0n }).get(llave)!;
    c.alumnos.add(i.alumno_id);
    c.inscripciones++;
    c.ingreso += mensualidad(i);
  }
  const porVerticalYSucursal: FilaDeActivos[] = [...cubetas.values()]
    .sort((a, b) => (a.vertical.nombre < b.vertical.nombre ? -1 : a.vertical.nombre > b.vertical.nombre ? 1 : a.sucursal.nombre < b.sucursal.nombre ? -1 : 1))
    .map((c) => ({ vertical: c.vertical, sucursal: c.sucursal, alumnos: c.alumnos.size, inscripciones: c.inscripciones, ingreso_mensual_recurrente: aTexto(c.ingreso) }));

  const dentro = (d: Date | null): boolean => {
    if (!d) return false;
    const f = deFecha(d);
    return f >= inicio && f <= fin;
  };
  const altas = inscripciones.filter((i) => dentro(i.fecha_inscripcion)).length;
  const bajas = inscripciones.filter((i) => i.estatus === "baja" && dentro(i.fecha_baja)).length;
  const base = inscripciones.filter((i) => deFecha(i.fecha_inscripcion) < inicio && !(i.estatus === "baja" && i.fecha_baja && deFecha(i.fecha_baja) < inicio)).length;
  const desercion = porcentajeConUnDecimal(bajas, base);

  // Cartera vencida.
  const abiertos = await db.cargo.findMany({ where: { estatus: { in: ["pendiente", "vencido"] }, ...(visibles ? { sucursal_id: visibles } : {}) }, select: { monto_final: true, monto_pagado: true, fecha_vencimiento: true, sucursal: { select: { zona_horaria: true } } } });
  const antiguedad = antiguedadDe(abiertos.map((c) => ({ saldo: restar(deDecimal(c.monto_final), deDecimal(c.monto_pagado)), diasDeAtraso: atrasoEn(deFecha(c.fecha_vencimiento), fechaLocal(o.ahora, c.sucursal.zona_horaria)) })));

  const ocupacion = await ocupacionPorGrupo(db, o.fuente, visibles ? { programa: { sucursal_id: visibles } } : {});

  return {
    mes,
    activos: { total_alumnos: new Set(activas.map((i) => i.alumno_id)).size, total_inscripciones: activas.length, por_vertical_y_sucursal: porVerticalYSucursal },
    altas_del_mes: altas,
    bajas_del_mes: bajas,
    base_al_inicio_del_mes: base,
    desercion,
    desercion_texto: desercion === null ? "—" : `${desercion} %`,
    ingreso_mensual_recurrente: aTexto(sumar(...activas.map(mensualidad))),
    cartera_vencida: { total: aTexto(totalDeAntiguedad(antiguedad)), antiguedad: antiguedadATexto(antiguedad) },
    ocupacion_por_grupo: ocupacion,
  };
}

/**
 * La ocupación de cada grupo con la FUENTE REAL (`FuenteOcupacion`: las inscripciones activas, la misma que usan el cotizador, la inscripción y la lista de espera). `dondeGrupo` es la
 * condición de alcance sobre `grupo` (el administrador `{}`; el asesor y recepción, sus sucursales; el maestro, sus grupos). Sin importes: es lo que ve el maestro.
 */
export async function ocupacionPorGrupo(db: BaseDatos, fuente: FuenteOcupacion, dondeGrupo: Record<string, unknown> = {}): Promise<FilaDeOcupacion[]> {
  const grupos = await db.grupo.findMany({
    where: { ...dondeGrupo, activo: true, programa: { ...((dondeGrupo["programa"] as Record<string, unknown> | undefined) ?? {}), activo: true } },
    orderBy: [{ nombre: "asc" }, { id: "asc" }],
    select: { id: true, nombre: true, cupo_maximo: true, programa: { select: { nombre: true, vertical: { select: { id: true, nombre: true } }, sucursal: { select: { id: true, nombre: true } } } } },
  });
  const filas: FilaDeOcupacion[] = [];
  for (const g of grupos) {
    const ocupados = await fuente.ocupados(db, g.id);
    filas.push({ grupo: { id: g.id, nombre: g.nombre }, programa: g.programa.nombre, vertical: g.programa.vertical, sucursal: g.programa.sucursal, ocupados, cupo_maximo: g.cupo_maximo, ocupacion: porcentajeConUnDecimal(ocupados, g.cupo_maximo) ?? "0.0", estado: estadoDeOcupacion(ocupados, g.cupo_maximo) });
  }
  // Los más llenos primero (comparación cruzada con enteros: ocupados/cupo sin flotantes).
  return filas.sort((a, b) => b.ocupados * a.cupo_maximo - a.ocupados * b.cupo_maximo || (a.grupo.nombre < b.grupo.nombre ? -1 : a.grupo.nombre > b.grupo.nombre ? 1 : a.grupo.id < b.grupo.id ? -1 : 1));
}
