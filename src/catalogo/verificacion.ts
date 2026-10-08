// Las tres consultas de verificación de docs/insumos/seed-sucursales-horarios.sql, hechas sobre el
// catálogo cargado por el scope de organización (nunca SQL crudo fuera de src/datos/):
//   1. traslapes de edad dentro de una misma vertical y sucursal (debe dar CERO);
//   2. resumen de capacidad por sucursal y vertical;
//   3. choques de salón (debe dar CERO).
// Las consultas son puras: reciben el catálogo ya cargado.

import type { Consultas } from "../datos/alcance.ts";

export interface ProgramaCatalogo {
  id: string;
  nombre: string;
  verticalId: string;
  sucursalId: string;
  edadMin: number;
  edadMax: number;
}
export interface GrupoCatalogo {
  id: string;
  nombre: string;
  programaId: string;
  salon: string | null;
  cupoMaximo: number;
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
  sucursales: Map<string, string>;
  verticales: Map<string, string>;
}

export async function cargarCatalogo(db: Consultas): Promise<Catalogo> {
  const [programas, grupos, horarios, sucursales, verticales] = await Promise.all([
    db.programa.findMany(),
    db.grupo.findMany(),
    db.grupo_horario.findMany(),
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
    })),
    grupos: grupos.map((g) => ({ id: g.id, nombre: g.nombre, programaId: g.programa_id, salon: g.salon, cupoMaximo: g.cupo_maximo })),
    horarios: horarios.map((h) => ({ grupoId: h.grupo_id, dia: h.dia_semana, inicioMin: h.hora_inicio_min, finMin: h.hora_fin_min })),
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

/** Dos programas de la misma vertical y sucursal que aceptan la misma edad. Debe ser vacío. */
export function traslapesDeEdad(c: Catalogo): TraslapeDeEdad[] {
  const salida: TraslapeDeEdad[] = [];
  for (const a of c.programas) {
    for (const b of c.programas) {
      if (a.id >= b.id) continue;
      if (a.verticalId !== b.verticalId || a.sucursalId !== b.sucursalId) continue;
      if (a.edadMin <= b.edadMax && b.edadMin <= a.edadMax) {
        salida.push({
          sucursal: c.sucursales.get(a.sucursalId) ?? a.sucursalId,
          vertical: c.verticales.get(a.verticalId) ?? a.verticalId,
          programaA: a.nombre,
          programaB: b.nombre,
        });
      }
    }
  }
  return salida.sort((x, y) => alfabetico(x.sucursal, y.sucursal) || alfabetico(x.programaA, y.programaA));
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

// ── 3. Choques de salón ─────────────────────────────────────────────────────────────────

export interface ChoqueDeSalon {
  sucursal: string;
  salon: string;
  dia: number;
  grupoA: string;
  grupoB: string;
}

/** Dos grupos distintos en el mismo salón de la misma sucursal, el mismo día y a horas que se pisan. */
export function choquesDeSalon(c: Catalogo): ChoqueDeSalon[] {
  const programa = new Map(c.programas.map((p) => [p.id, p]));
  const grupos = new Map(c.grupos.map((g) => [g.id, g]));
  const salida: ChoqueDeSalon[] = [];
  for (const h1 of c.horarios) {
    for (const h2 of c.horarios) {
      if (h1.grupoId >= h2.grupoId || h1.dia !== h2.dia) continue;
      const a = grupos.get(h1.grupoId);
      const b = grupos.get(h2.grupoId);
      if (!a || !b || a.salon === null || a.salon !== b.salon) continue;
      const pa = programa.get(a.programaId);
      const pb = programa.get(b.programaId);
      if (!pa || !pb || pa.sucursalId !== pb.sucursalId) continue;
      if (h1.inicioMin < h2.finMin && h2.inicioMin < h1.finMin) {
        salida.push({ sucursal: c.sucursales.get(pa.sucursalId) ?? pa.sucursalId, salon: a.salon, dia: h1.dia, grupoA: a.nombre, grupoB: b.nombre });
      }
    }
  }
  return salida.sort((x, y) => alfabetico(x.sucursal, y.sucursal) || x.dia - y.dia || alfabetico(x.grupoA, y.grupoA));
}
