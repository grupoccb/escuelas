// El cotizador en JSON (C5): la forma que usan la API y la cotización guardada (C8). Los importes salen como
// TEXTO decimal («1234.50»), nunca como número (invariante de dinero); las fechas, `AAAA-MM-DD`.

import { aTexto } from "../lib/dinero.ts";
import type { ResultadoPromociones, TotalesDeImporte } from "../promociones/resolver.ts";
import type { Cotizacion, ProgramaCotizado } from "./tipos.ts";

const totales = (t: TotalesDeImporte) => ({
  original: aTexto(t.original),
  descuento_ahora: aTexto(t.descuentoAhora),
  descuento_diferido: aTexto(t.descuentoDiferido),
  final_ahora: aTexto(t.finalAhora),
  final_con_diferidos: aTexto(t.finalConDiferidos),
});

function promociones(r: ResultadoPromociones) {
  return {
    aplicadas: r.aplicadas.map((a) => ({ promocion_id: a.promocionId, nombre: a.nombre, codigo: a.codigo, prioridad: a.prioridad, acumulable: a.acumulable })),
    descartadas: r.descartadas.map((d) => ({ promocion_id: d.promocionId, nombre: d.nombre, motivo: d.motivo })),
    lineas: r.lineas.map((l) => ({
      promocion_id: l.promocionId,
      promocion_nombre: l.promocionNombre,
      beneficio_id: l.beneficioId,
      tipo: l.tipo,
      modo: l.modo,
      estado: l.estado,
      descuento: aTexto(l.descuento),
      meses: l.meses,
      descripcion: l.descripcion,
    })),
    inscripcion: totales(r.inscripcion),
    mensualidad: totales(r.mensualidad),
    meses_gratis_ahora: r.mesesGratisAhora,
    meses_gratis_diferidos: r.mesesGratisDiferidos,
  };
}

export function programaAJson(p: ProgramaCotizado) {
  return {
    programa_id: p.programaId,
    nombre: p.nombre,
    descripcion_publica: p.descripcionPublica,
    nivel: p.nivel,
    permite_traslape: p.permiteTraslape,
    edad: p.edad,
    fuente_edad: p.fuenteEdad,
    fecha_corte_edad: p.fechaCorteEdad,
    precio: p.precio
      ? {
          precio_id: p.precio.precioId,
          costo_inscripcion: aTexto(p.precio.costoInscripcion),
          costo_mensualidad: aTexto(p.precio.costoMensualidad),
          moneda: p.precio.moneda,
          vigente_desde: p.precio.vigenteDesde,
          vigente_hasta: p.precio.vigenteHasta,
        }
      : null,
    sin_precio: p.precio === null,
    grupos: p.grupos.map((g) => ({
      grupo_id: g.grupoId,
      nombre: g.nombre,
      horarios: g.horarios.map((h) => ({ dia_semana: h.dia, hora_inicio_min: h.inicioMin, hora_fin_min: h.finMin })),
      horario_texto: g.horarioTexto,
      cupo_maximo: g.cupo.cupoMaximo,
      ocupados: g.cupo.ocupados,
      lugares_disponibles: g.cupo.disponibles,
      lleno: g.cupo.lleno,
      oferta: g.cupo.oferta,
    })),
    promociones: p.promociones ? promociones(p.promociones) : null,
  };
}

export function cotizacionAJson(c: Cotizacion) {
  return {
    fecha: c.fecha,
    vertical_id: c.verticalId,
    sucursal_id: c.sucursalId,
    /** Más de un programa = alternativas entre las que el contacto elige. */
    alternativas: c.programas.length > 1,
    programas: c.programas.map(programaAJson),
  };
}

export type CotizacionJson = ReturnType<typeof cotizacionAJson>;
