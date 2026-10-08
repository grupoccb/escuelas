// Capa de consulta del cotizador (C5): arma el `CatalogoCotizable` desde la base, siempre por el scope de la
// organización, y deja el cálculo al código puro de `cotizar.ts`.
//
// OCUPACIÓN (punto de enchufe para F4): los lugares ocupados vienen de una `FuenteOcupacion`
// (`src/catalogo/cupo.ts`). Por omisión es `InscripcionesActivas` (F4: las inscripciones activas del grupo).
// F4 escribe una fuente que cuente las inscripciones activas del grupo y se la pasa a `cargarCatalogoCotizable`
// (la API la recibe en `DepsApi.fuenteOcupacion` y el bot en `DepsCaptacion.fuenteOcupacion`); nada más cambia.

import type { BaseDatos, Consultas } from "../datos/alcance.ts";
import { InscripcionesActivas, type FuenteOcupacion } from "../catalogo/cupo.ts";
import { aFecha, deFecha, elegirVigente, precioDeFila, type FechaISO } from "../catalogo/precios.ts";
import { cargarPromociones } from "../promociones/cargar.ts";
import { cotizar } from "./cotizar.ts";
import type { CatalogoCotizable, Cotizacion, EntradaCotizador, GrupoCotizable, ProgramaCotizable } from "./tipos.ts";

export interface OpcionesDeCarga {
  verticalId: string;
  /** Solo los programas de estas sucursales. Sin él, todas las de la vertical. */
  sucursalIds?: readonly string[];
  /** La fecha de la consulta (calendario local de la sucursal). */
  fecha: FechaISO;
  /** De dónde salen los lugares ocupados. Por omisión, ninguno (no hay inscripciones aún). */
  fuente?: FuenteOcupacion;
}

/**
 * Programas ACTIVOS de la vertical en sucursales activas que la ofrecen (`sucursal_vertical` activa), con sus
 * grupos activos, horarios, cupo real y el precio vigente en la fecha, más todas las promociones vivas.
 */
export async function cargarCatalogoCotizable(db: Consultas | BaseDatos, o: OpcionesDeCarga): Promise<CatalogoCotizable> {
  const fuente = o.fuente ?? new InscripcionesActivas();
  const ofrecidas = await db.sucursal_vertical.findMany({
    where: { vertical_id: o.verticalId, activo: true, sucursal: { activo: true, eliminado_en: null } },
    select: { sucursal_id: true },
  });
  const sucursales = ofrecidas.map((s) => s.sucursal_id).filter((id) => !o.sucursalIds || o.sucursalIds.includes(id));

  const programas = await db.programa.findMany({
    where: { vertical_id: o.verticalId, activo: true, sucursal_id: { in: sucursales } },
    orderBy: [{ nombre: "asc" }, { id: "asc" }],
  });
  const programaIds = programas.map((p) => p.id);
  const grupos = await db.grupo.findMany({ where: { programa_id: { in: programaIds }, activo: true }, orderBy: [{ nombre: "asc" }, { id: "asc" }] });
  const horarios = await db.grupo_horario.findMany({ where: { grupo_id: { in: grupos.map((g) => g.id) } }, orderBy: [{ dia_semana: "asc" }, { hora_inicio_min: "asc" }] });
  const f = aFecha(o.fecha);
  const precios = await db.precio.findMany({
    where: { programa_id: { in: programaIds }, vigencia_desde: { lte: f }, OR: [{ vigencia_hasta: null }, { vigencia_hasta: { gte: f } }] },
  });

  const gruposDe = new Map<string, GrupoCotizable[]>();
  for (const g of grupos) {
    const lista = gruposDe.get(g.programa_id) ?? [];
    gruposDe.set(g.programa_id, lista);
    lista.push({
      id: g.id,
      nombre: g.nombre,
      cupoMaximo: g.cupo_maximo,
      permiteListaEspera: g.permite_lista_espera,
      ocupados: await fuente.ocupados(db as Consultas, g.id),
      horarios: horarios.filter((h) => h.grupo_id === g.id).map((h) => ({ dia: h.dia_semana, inicioMin: h.hora_inicio_min, finMin: h.hora_fin_min })),
    });
  }

  const cotizables: ProgramaCotizable[] = programas.map((p) => {
    const vigente = elegirVigente(precios.filter((x) => x.programa_id === p.id).map(precioDeFila), o.fecha);
    return {
      id: p.id,
      nombre: p.nombre,
      descripcionPublica: p.descripcion_publica,
      nivel: p.nivel,
      verticalId: p.vertical_id,
      sucursalId: p.sucursal_id,
      edadMin: p.edad_min,
      edadMax: p.edad_max,
      fechaCorteEdad: p.fecha_corte_edad ? deFecha(p.fecha_corte_edad) : null,
      permiteTraslape: p.permite_traslape,
      precio: vigente
        ? { id: vigente.id, costoInscripcion: vigente.costoInscripcion, costoMensualidad: vigente.costoMensualidad, moneda: vigente.moneda, desde: vigente.desde, hasta: vigente.hasta }
        : null,
      grupos: gruposDe.get(p.id) ?? [],
    };
  });

  return { fecha: o.fecha, programas: cotizables, promociones: await cargarPromociones(db) };
}

/** Carga y cotiza en una sola llamada: la que usan el endpoint y el asesor. */
export async function cotizarDesdeBase(db: Consultas | BaseDatos, entrada: EntradaCotizador, o: Omit<OpcionesDeCarga, "verticalId" | "sucursalIds">): Promise<Cotizacion> {
  const cat = await cargarCatalogoCotizable(db, { ...o, verticalId: entrada.verticalId, sucursalIds: [entrada.sucursalId] });
  return cotizar(cat, entrada);
}
