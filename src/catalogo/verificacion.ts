// Las tres consultas de verificación de docs/insumos/seed-sucursales-horarios.sql, hechas sobre el
// catálogo cargado por el scope de organización (nunca SQL crudo fuera de src/datos/):
//   1. traslapes de edad dentro de una misma vertical y sucursal (debe dar CERO errores). Dos programas marcados
//      `permite_traslape` son ALTERNATIVAS (un estilo, no un rango de edad: el caso conocido de REVISION-INSUMOS C9,
//      decisión 9 del plan) y no son error: salen aparte en `alternativasPorEdad`, «varios programas para una misma
//      edad», que el cotizador (C6) resuelve preguntando cuál;
//   2. resumen de capacidad por sucursal y vertical;
//   3. choques de salón (debe dar CERO) —ahora con la tabla `salon` (C1), no con texto— y, de paso,
//      choques de instructor.
// Las consultas son puras: reciben el catálogo ya cargado.

import type { Consultas } from "../datos/alcance.ts";
import { detectarChoques, type OcupacionDeGrupo } from "./choques.ts";
import { salonesRepetidosPorForma } from "./salones.ts";

export interface ProgramaCatalogo {
  id: string;
  nombre: string;
  verticalId: string;
  sucursalId: string;
  edadMin: number;
  edadMax: number;
  /** Alternativa: puede convivir con otros programas para una misma edad. Por omisión, no. */
  permiteTraslape?: boolean;
}
export interface GrupoCatalogo {
  id: string;
  nombre: string;
  programaId: string;
  salonId: string | null;
  instructorId: string | null;
  cupoMaximo: number;
  /** Solo los grupos activos ocupan salón e instructor; por omisión se supone activo. */
  activo?: boolean;
}
export interface SalonCatalogo {
  nombre: string;
  sucursalId: string;
}
export interface HorarioCatalogo {
  grupoId: string;
  dia: number;
  inicioMin: number;
  finMin: number;
}
export interface Catalogo {
  programas: ProgramaCatalogo[];
  grupos: GrupoCatalogo[];
  horarios: HorarioCatalogo[];
  salones: Map<string, SalonCatalogo>;
  sucursales: Map<string, string>;
  verticales: Map<string, string>;
}

export async function cargarCatalogo(db: Consultas): Promise<Catalogo> {
  const [programas, grupos, horarios, salones, sucursales, verticales] = await Promise.all([
    db.programa.findMany(),
    db.grupo.findMany(),
    db.grupo_horario.findMany(),
    db.salon.findMany({ select: { id: true, nombre: true, sucursal_id: true } }),
    db.sucursal.findMany({ select: { id: true, nombre: true } }),
    db.vertical.findMany({ select: { id: true, nombre: true } }),
  ]);
  return {
    programas: programas.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      verticalId: p.vertical_id,
      sucursalId: p.sucursal_id,
      edadMin: p.edad_min,
      edadMax: p.edad_max,
      permiteTraslape: p.permite_traslape,
    })),
    grupos: grupos.map((g) => ({ id: g.id, nombre: g.nombre, programaId: g.programa_id, salonId: g.salon_id, instructorId: g.instructor_id, cupoMaximo: g.cupo_maximo, activo: g.activo })),
    horarios: horarios.map((h) => ({ grupoId: h.grupo_id, dia: h.dia_semana, inicioMin: h.hora_inicio_min, finMin: h.hora_fin_min })),
    salones: new Map(salones.map((s) => [s.id, { nombre: s.nombre, sucursalId: s.sucursal_id }])),
    sucursales: new Map(sucursales.map((s) => [s.id, s.nombre])),
    verticales: new Map(verticales.map((v) => [v.id, v.nombre])),
  };
}

const alfabetico = (a: string, b: string): number => a.localeCompare(b, "es-MX");

// ── 1. Traslapes de edad ────────────────────────────────────────────────────────────────

export interface TraslapeDeEdad {
  sucursal: string;
  vertical: string;
  programaA: string;
  programaB: string;
}

export interface AlternativaPorEdad extends TraslapeDeEdad {
  /** Las edades en las que los dos programas son opciones a la vez (ambos extremos incluidos). */
  edadDesde: number;
  edadHasta: number;
}

/** Los pares de programas de la misma vertical y sucursal que aceptan al menos una misma edad. */
function paresQueSeTraslapan(c: Catalogo): [ProgramaCatalogo, ProgramaCatalogo][] {
  const pares: [ProgramaCatalogo, ProgramaCatalogo][] = [];
  for (const a of c.programas) {
    for (const b of c.programas) {
      if (a.id >= b.id) continue;
      if (a.verticalId !== b.verticalId || a.sucursalId !== b.sucursalId) continue;
      if (a.edadMin <= b.edadMax && b.edadMin <= a.edadMax) pares.push([a, b]);
    }
  }
  return pares;
}

const filaDeTraslape = (c: Catalogo, a: ProgramaCatalogo, b: ProgramaCatalogo): TraslapeDeEdad => ({
  sucursal: c.sucursales.get(a.sucursalId) ?? a.sucursalId,
  vertical: c.verticales.get(a.verticalId) ?? a.verticalId,
  programaA: a.nombre,
  programaB: b.nombre,
});

/**
 * Dos programas de la misma vertical y sucursal que aceptan la misma edad SIN estar los dos marcados como
 * alternativas (`permite_traslape`). Debe ser vacío.
 */
export function traslapesDeEdad(c: Catalogo): TraslapeDeEdad[] {
  return paresQueSeTraslapan(c)
    .filter(([a, b]) => !(a.permiteTraslape === true && b.permiteTraslape === true))
    .map(([a, b]) => filaDeTraslape(c, a, b))
    .sort((x, y) => alfabetico(x.sucursal, y.sucursal) || alfabetico(x.programaA, y.programaA));
}

/** Los traslapes de edad que SÍ son intencionales (los dos programas permiten el traslape): varios programas para una misma edad. */
export function alternativasPorEdad(c: Catalogo): AlternativaPorEdad[] {
  return paresQueSeTraslapan(c)
    .filter(([a, b]) => a.permiteTraslape === true && b.permiteTraslape === true)
    .map(([a, b]) => ({ ...filaDeTraslape(c, a, b), edadDesde: Math.max(a.edadMin, b.edadMin), edadHasta: Math.min(a.edadMax, b.edadMax) }))
    .sort((x, y) => alfabetico(x.sucursal, y.sucursal) || alfabetico(x.programaA, y.programaA));
}

// ── 2. Resumen de capacidad ─────────────────────────────────────────────────────────────

export interface ResumenCapacidad {
  sucursal: string;
  vertical: string;
  programas: number;
  grupos: number;
  capacidad: number;
}

export function resumenDeCapacidad(c: Catalogo): ResumenCapacidad[] {
  const porPrograma = new Map(c.programas.map((p) => [p.id, p]));
  const acumulado = new Map<string, ResumenCapacidad & { ids: Set<string> }>();
  for (const p of c.programas) {
    const clave = `${p.sucursalId}|${p.verticalId}`;
    const fila = acumulado.get(clave) ?? {
      sucursal: c.sucursales.get(p.sucursalId) ?? p.sucursalId,
      vertical: c.verticales.get(p.verticalId) ?? p.verticalId,
      programas: 0,
      grupos: 0,
      capacidad: 0,
      ids: new Set<string>(),
    };
    fila.ids.add(p.id);
    fila.programas = fila.ids.size;
    acumulado.set(clave, fila);
  }
  for (const g of c.grupos) {
    const p = porPrograma.get(g.programaId);
    if (!p) continue;
    const fila = acumulado.get(`${p.sucursalId}|${p.verticalId}`)!;
    fila.grupos += 1;
    fila.capacidad += g.cupoMaximo;
  }
  return [...acumulado.values()]
    .map(({ ids: _ids, ...fila }) => fila)
    .sort((a, b) => alfabetico(a.sucursal, b.sucursal) || alfabetico(a.vertical, b.vertical));
}

// ── 3. Choques de salón (y de instructor) ─────────────────────────────────────────────

export interface ChoqueDeSalon {
  sucursal: string;
  salon: string;
  dia: number;
  grupoA: string;
  grupoB: string;
}

export interface ChoqueDeInstructor {
  instructorId: string;
  dia: number;
  grupoA: string;
  grupoB: string;
}

function ocupaciones(c: Catalogo): OcupacionDeGrupo[] {
  const franjas = new Map<string, { dia: number; inicioMin: number; finMin: number }[]>();
  for (const h of c.horarios) (franjas.get(h.grupoId) ?? franjas.set(h.grupoId, []).get(h.grupoId)!).push({ dia: h.dia, inicioMin: h.inicioMin, finMin: h.finMin });
  return c.grupos
    .filter((g) => g.activo !== false)
    .map((g) => ({ grupoId: g.id, grupoNombre: g.nombre, salonId: g.salonId, instructorId: g.instructorId, franjas: franjas.get(g.id) ?? [] }));
}

/** Dos grupos distintos en el mismo salón, el mismo día y a horas que se pisan (sobre la tabla `salon`). */
export function choquesDeSalon(c: Catalogo): ChoqueDeSalon[] {
  return detectarChoques(ocupaciones(c))
    .filter((x) => x.tipo === "salon")
    .map((x) => {
      const salon = c.salones.get(x.recursoId);
      return { sucursal: salon ? (c.sucursales.get(salon.sucursalId) ?? salon.sucursalId) : "", salon: salon?.nombre ?? x.recursoId, dia: x.dia, grupoA: x.grupoNombre, grupoB: x.otroGrupoNombre };
    })
    .sort((x, y) => alfabetico(x.sucursal, y.sucursal) || x.dia - y.dia || alfabetico(x.grupoA, y.grupoA));
}

/** Un mismo instructor en dos grupos a la vez (aunque sean de sucursales distintas). */
export function choquesDeInstructor(c: Catalogo): ChoqueDeInstructor[] {
  return detectarChoques(ocupaciones(c))
    .filter((x) => x.tipo === "instructor")
    .map((x) => ({ instructorId: x.recursoId, dia: x.dia, grupoA: x.grupoNombre, grupoB: x.otroGrupoNombre }))
    .sort((x, y) => x.dia - y.dia || alfabetico(x.grupoA, y.grupoA));
}

// ── 4. Salones que son «el mismo» con otro nombre (EC-05) ─────────────────────────────────

export interface SalonesParecidos {
  sucursal: string;
  nombres: string[];
}

/**
 * Salones de una misma sucursal cuyo nombre solo difiere en mayúsculas, acentos o espacios. Son el mismo cuarto
 * escrito distinto: los choques se calculan por `salon_id`, así que mientras estén separados no se ven. La API ya no
 * deja crearlos; esto reporta los que vienen de datos heredados (la migración de `grupo.salon` de texto), para que el
 * administrador los junte.
 */
export function salonesConNombreParecido(c: Catalogo): SalonesParecidos[] {
  const lista = [...c.salones.entries()].map(([id, s]) => ({ id, sucursalId: s.sucursalId, nombre: s.nombre }));
  return salonesRepetidosPorForma(lista)
    .map((g) => ({ sucursal: c.sucursales.get(g.sucursalId) ?? g.sucursalId, nombres: g.ids.map((id) => c.salones.get(id)!.nombre).sort(alfabetico) }))
    .sort((a, b) => alfabetico(a.sucursal, b.sucursal) || alfabetico(a.nombres[0] ?? "", b.nombres[0] ?? ""));
}
