// Cómo se ve una inscripción hacia afuera (API, expediente) y cómo se registra su cambio. Dinero siempre como TEXTO con dos decimales.

import type { Instantanea } from "../api/registro.ts";
import { deFecha, type FechaISO } from "../catalogo/precios.ts";
import { aTexto, deDecimal } from "../lib/dinero.ts";
import { fechaLocal } from "../lib/horario.ts";
import { proximoCorte } from "./corte.ts";
import type { InscripcionCreada } from "./inscribir.ts";

export const SELECCION_INSCRIPCION = {
  id: true,
  alumno_id: true,
  grupo_id: true,
  programa_id: true,
  lead_id: true,
  prospecto_id: true,
  cotizacion_id: true,
  promocion_id: true,
  fecha_inscripcion: true,
  fecha_inicio: true,
  fecha_baja: true,
  estatus: true,
  precio_inscripcion_aplicado: true,
  precio_mensualidad_aplicado: true,
  descuento_inscripcion_aplicado: true,
  descuento_mensualidad_aplicado: true,
  meses_gratis_aplicados: true,
  meses_pagados_por_adelantado: true,
  dia_corte_pago: true,
  creado_en: true,
  alumno: { select: { nombre: true, apellidos: true } },
  grupo: { select: { nombre: true, programa: { select: { nombre: true, sucursal_id: true, sucursal: { select: { nombre: true, zona_horaria: true } } } } } },
  aplicaciones: { where: { eliminado_en: null }, select: { id: true, promocion_id: true, beneficio_id: true, estatus: true, fecha_entrega: true, descuento: true, meses_gratis: true, beneficio: { select: { tipo: true, descripcion: true, momento_disparo: true } }, promocion: { select: { nombre: true } } } },
} as const;

type Dec = { toFixed(n: number): string };
/** Un Decimal de la base como texto con dos decimales, por su texto exacto (nunca por un flotante). */
const importeATexto = (d: Dec): string => aTexto(deDecimal(d));
export interface FilaDeInscripcion {
  id: string;
  alumno_id: string;
  grupo_id: string;
  programa_id: string;
  lead_id: string | null;
  prospecto_id: string | null;
  cotizacion_id: string | null;
  promocion_id: string | null;
  fecha_inscripcion: Date;
  fecha_inicio: Date;
  fecha_baja: Date | null;
  estatus: string;
  precio_inscripcion_aplicado: Dec;
  precio_mensualidad_aplicado: Dec;
  descuento_inscripcion_aplicado: Dec;
  descuento_mensualidad_aplicado: Dec;
  meses_gratis_aplicados: number;
  meses_pagados_por_adelantado: number;
  dia_corte_pago: number;
  creado_en: Date;
  alumno: { nombre: string; apellidos: string };
  grupo: { nombre: string; programa: { nombre: string; sucursal_id: string; sucursal: { nombre: string; zona_horaria: string } } };
  aplicaciones: { id: string; promocion_id: string; beneficio_id: string; estatus: string; fecha_entrega: Date | null; descuento: Dec; meses_gratis: number; beneficio: { tipo: string; descripcion: string | null; momento_disparo: string }; promocion: { nombre: string } }[];
  [extra: string]: unknown;
}

/**
 * La inscripción hacia afuera. EF-03: el MAESTRO lee quiénes están inscritos en sus grupos y desde cuándo, no lo que cada familia paga ni negoció:
 * sin importes, descuentos, meses, promociones, día de corte, cotización ni lead de origen.
 */
export function presentarInscripcion(f: FilaDeInscripcion, ahora: Date, rol: string = "administrador") {
  const hoy: FechaISO = fechaLocal(ahora, f.grupo.programa.sucursal.zona_horaria);
  const base = {
    id: f.id,
    alumno_id: f.alumno_id,
    alumno: `${f.alumno.nombre} ${f.alumno.apellidos}`,
    grupo_id: f.grupo_id,
    grupo: f.grupo.nombre,
    programa_id: f.programa_id,
    programa: f.grupo.programa.nombre,
    sucursal_id: f.grupo.programa.sucursal_id,
    sucursal: f.grupo.programa.sucursal.nombre,
    prospecto_id: f.prospecto_id,
    estatus: f.estatus,
    fecha_inscripcion: deFecha(f.fecha_inscripcion),
    fecha_inicio: deFecha(f.fecha_inicio),
    fecha_baja: f.fecha_baja ? deFecha(f.fecha_baja) : null,
    creado_en: f.creado_en,
  };
  if (rol === "maestro") return base;
  return {
    ...base,
    lead_id: f.lead_id,
    cotizacion_id: f.cotizacion_id,
    promocion_id: f.promocion_id,
    precio_inscripcion_aplicado: importeATexto(f.precio_inscripcion_aplicado),
    precio_mensualidad_aplicado: importeATexto(f.precio_mensualidad_aplicado),
    descuento_inscripcion_aplicado: importeATexto(f.descuento_inscripcion_aplicado),
    descuento_mensualidad_aplicado: importeATexto(f.descuento_mensualidad_aplicado),
    meses_gratis_aplicados: f.meses_gratis_aplicados,
    meses_pagados_por_adelantado: f.meses_pagados_por_adelantado,
    dia_corte_pago: f.dia_corte_pago,
    proximo_corte: f.estatus === "baja" ? null : proximoCorte(f.dia_corte_pago, hoy),
    promociones: f.aplicaciones.map((a) => ({
      id: a.id,
      promocion_id: a.promocion_id,
      promocion: a.promocion.nombre,
      beneficio_id: a.beneficio_id,
      tipo: a.beneficio.tipo,
      descripcion: a.beneficio.descripcion,
      estatus: a.estatus,
      fecha_entrega: a.fecha_entrega,
      descuento: importeATexto(a.descuento),
      meses_gratis: a.meses_gratis,
    })),
  };
}

/** Lo que se registra de una inscripción en `registro_cambio` (sin nada identificable de la familia). */
export function instantaneaDeCreada(i: InscripcionCreada): Instantanea {
  return {
    estatus: "activa",
    alumno_id: i.alumnoId,
    grupo_id: i.grupoId,
    programa_id: i.programaId,
    lead_id: i.leadId,
    promocion_id: i.promocionId,
    fecha_inicio: i.fechaInicio,
    dia_corte_pago: i.diaCortePago,
    precio_inscripcion_aplicado: i.precioInscripcion,
    precio_mensualidad_aplicado: i.precioMensualidad,
  };
}
