// Carga de las promociones de una organización desde la base al formato del resolutor (C3).

import type { BaseDatos, Consultas } from "../datos/alcance.ts";
import { deFecha } from "../catalogo/precios.ts";
import { aTexto, deDecimal } from "../lib/dinero.ts";
import { condicionDe } from "./condicion.ts";
import { resolverPromociones, type ContextoPromocion, type PromocionDef, type ResultadoPromociones } from "./resolver.ts";
import type { CondicionTipo, ModoDeBeneficio, MomentoDeDisparo, TipoDeBeneficio } from "./tipos.ts";

/** Todas las promociones vivas de la organización (activas o no: el resolutor decide), con alcance y beneficios. `soloId` carga solo una. */
export async function cargarPromociones(db: Consultas | BaseDatos, soloId?: string): Promise<PromocionDef[]> {
  const filas = await db.promocion.findMany({
    ...(soloId ? { where: { id: soloId } } : {}),
    select: {
      id: true,
      nombre: true,
      codigo: true,
      activo: true,
      vigencia_desde: true,
      vigencia_hasta: true,
      condicion_tipo: true,
      condicion_valor: true,
      cupo_maximo: true,
      cupo_usado: true,
      acumulable: true,
      prioridad: true,
      verticales: { where: { eliminado_en: null }, select: { vertical_id: true } },
      sucursales: { where: { eliminado_en: null }, select: { sucursal_id: true } },
      programas: { where: { eliminado_en: null }, select: { programa_id: true } },
      beneficios: { where: { eliminado_en: null }, select: { id: true, tipo: true, modo: true, valor: true, producto_id: true, descripcion: true, momento_disparo: true } },
    },
    orderBy: { id: "asc" },
  });
  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    codigo: f.codigo,
    activa: f.activo,
    vigenciaDesde: deFecha(f.vigencia_desde),
    vigenciaHasta: f.vigencia_hasta ? deFecha(f.vigencia_hasta) : null,
    condicion: condicionDe(f.condicion_tipo as CondicionTipo, f.condicion_valor),
    cupoMaximo: f.cupo_maximo,
    cupoUsado: f.cupo_usado,
    acumulable: f.acumulable,
    prioridad: f.prioridad,
    alcance: { verticales: f.verticales.map((v) => v.vertical_id), sucursales: f.sucursales.map((s) => s.sucursal_id), programas: f.programas.map((p) => p.programa_id) },
    beneficios: f.beneficios.map((b) => ({
      id: b.id,
      tipo: b.tipo as TipoDeBeneficio,
      modo: b.modo as ModoDeBeneficio,
      valor: b.valor === null ? null : aTexto(deDecimal(b.valor)),
      productoId: b.producto_id,
      descripcion: b.descripcion,
      momento: b.momento_disparo as MomentoDeDisparo,
    })),
  }));
}

/** Las promociones que aplican en ese contexto y su desglose (carga + resolutor puro). */
export async function promocionesAplicables(db: Consultas | BaseDatos, ctx: ContextoPromocion): Promise<ResultadoPromociones> {
  return resolverPromociones(await cargarPromociones(db), ctx);
}
