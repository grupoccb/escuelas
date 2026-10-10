// Choques de ocupación (C1): dos grupos activos que usan el mismo salón, o tienen al mismo instructor,
// en franjas que se traslapan. Determinista (invariante 10): lo calcula código.
//
//   - `detectarChoques(grupos)`: PURA. Todos los choques entre los grupos dados.
//   - `choquesDe(candidato, otros)`: PURA. Solo los del candidato contra los demás.
//   - `choquesDeGrupo(db, candidato)`: consulta los grupos que comparten salón o instructor y aplica lo anterior.
//
// Regla de traslape: mismo día, `inicio < fin del otro` y `fin > inicio del otro`. Terminar justo cuando
// empieza la otra clase NO es choque. El mismo salón implica la misma sucursal (el salón es de una
// sucursal); el mismo instructor choca entre sucursales (una persona no está en dos lugares).
//
// La base lo impone también (disparadores `grupo_choques_trg` / `grupo_horario_choques_trg`, migración
// de C1): esta función existe para dar el detalle al usuario (409 `conflicto`) y para reportar.

import type { Consultas } from "../datos/alcance.ts";

/**
 * Candado (por organización) que toma toda escritura que mueve salones, instructores u horarios de grupos:
 * así dos asignaciones que compiten se serializan y la segunda ve a la primera (y se rechaza con detalle).
 * Los disparadores de la base son la red de seguridad por si algo escribe sin pasar por la API.
 */
export const CANDADO_OCUPACION = "catalogo:ocupacion";

export interface Franja {
  /** 0 = domingo … 6 = sábado. */
  dia: number;
  /** Minutos desde la medianoche local de la sucursal. */
  inicioMin: number;
  finMin: number;
}

export interface OcupacionDeGrupo {
  grupoId: string;
  grupoNombre: string;
  salonId: string | null;
  instructorId: string | null;
  franjas: Franja[];
}

export type TipoDeChoque = "salon" | "instructor";

export interface Choque {
  tipo: TipoDeChoque;
  /** El salón o el instructor en disputa. */
  recursoId: string;
  grupoId: string;
  grupoNombre: string;
  otroGrupoId: string;
  otroGrupoNombre: string;
  dia: number;
  franja: Franja;
  otraFranja: Franja;
}

export function franjasSeTraslapan(a: Franja, b: Franja): boolean {
  return a.dia === b.dia && a.inicioMin < b.finMin && b.inicioMin < a.finMin;
}

const porId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function choquesEntre(a: OcupacionDeGrupo, b: OcupacionDeGrupo): Choque[] {
  const salida: Choque[] = [];
  const recursos: [TipoDeChoque, string | null, string | null][] = [
    ["salon", a.salonId, b.salonId],
    ["instructor", a.instructorId, b.instructorId],
  ];
  for (const [tipo, ra, rb] of recursos) {
    if (ra === null || rb === null || ra !== rb) continue;
    for (const fa of a.franjas) {
      for (const fb of b.franjas) {
        if (franjasSeTraslapan(fa, fb)) {
          salida.push({ tipo, recursoId: ra, grupoId: a.grupoId, grupoNombre: a.grupoNombre, otroGrupoId: b.grupoId, otroGrupoNombre: b.grupoNombre, dia: fa.dia, franja: fa, otraFranja: fb });
        }
      }
    }
  }
  return salida;
}

/** Orden estable: tipo, día, inicio, luego los ids de los grupos. */
function ordenar(choques: Choque[]): Choque[] {
  return choques.sort(
    (x, y) =>
      porId(x.tipo, y.tipo) || x.dia - y.dia || x.franja.inicioMin - y.franja.inicioMin || porId(x.grupoId, y.grupoId) || porId(x.otroGrupoId, y.otroGrupoId) || x.otraFranja.inicioMin - y.otraFranja.inicioMin,
  );
}

/** Todos los choques entre los grupos dados (cada par una vez; `grupoId` es el de menor id). */
export function detectarChoques(grupos: readonly OcupacionDeGrupo[]): Choque[] {
  const salida: Choque[] = [];
  for (let i = 0; i < grupos.length; i++) {
    for (let j = i + 1; j < grupos.length; j++) {
      const a = grupos[i]!;
      const b = grupos[j]!;
      if (a.grupoId === b.grupoId) continue;
      salida.push(...(a.grupoId < b.grupoId ? choquesEntre(a, b) : choquesEntre(b, a)));
    }
  }
  return ordenar(salida);
}

/** Los choques del candidato contra los demás grupos (el candidato siempre aparece como `grupo`). */
export function choquesDe(candidato: OcupacionDeGrupo, otros: readonly OcupacionDeGrupo[]): Choque[] {
  const salida: Choque[] = [];
  for (const o of otros) if (o.grupoId !== candidato.grupoId) salida.push(...choquesEntre(candidato, o));
  return ordenar(salida);
}

// ── Consulta ────────────────────────────────────────────────────────────────────────────

/** Grupos activos y vivos con sus franjas, que comparten alguno de los salones o instructores dados. */
export async function cargarOcupaciones(db: Consultas, filtro: { salonIds?: string[]; instructorIds?: string[]; excluirGrupoId?: string }): Promise<OcupacionDeGrupo[]> {
  const o: Record<string, unknown>[] = [];
  if (filtro.salonIds && filtro.salonIds.length > 0) o.push({ salon_id: { in: filtro.salonIds } });
  if (filtro.instructorIds && filtro.instructorIds.length > 0) o.push({ instructor_id: { in: filtro.instructorIds } });
  if (o.length === 0) return [];
  const grupos = await db.grupo.findMany({
    where: { activo: true, OR: o, ...(filtro.excluirGrupoId ? { id: { not: filtro.excluirGrupoId } } : {}) },
    select: {
      id: true,
      nombre: true,
      salon_id: true,
      instructor_id: true,
      horarios: { where: { eliminado_en: null }, select: { dia_semana: true, hora_inicio_min: true, hora_fin_min: true } },
    },
    orderBy: { id: "asc" },
  });
  return grupos.map((g) => ({
    grupoId: g.id,
    grupoNombre: g.nombre,
    salonId: g.salon_id,
    instructorId: g.instructor_id,
    franjas: g.horarios.map((h) => ({ dia: h.dia_semana, inicioMin: h.hora_inicio_min, finMin: h.hora_fin_min })),
  }));
}

/** Los choques que tendría el candidato (con el salón, instructor y franjas que PROPONE) contra lo ya guardado. */
export async function choquesDeGrupo(db: Consultas, candidato: OcupacionDeGrupo): Promise<Choque[]> {
  const otros = await cargarOcupaciones(db, {
    salonIds: candidato.salonId ? [candidato.salonId] : [],
    instructorIds: candidato.instructorId ? [candidato.instructorId] : [],
    excluirGrupoId: candidato.grupoId,
  });
  return choquesDe(candidato, otros);
}

// ── Para personas ───────────────────────────────────────────────────────────────────────

export const NOMBRES_DE_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

export function horaTexto(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export const franjaTexto = (f: Franja): string => `${NOMBRES_DE_DIA[f.dia] ?? f.dia} de ${horaTexto(f.inicioMin)} a ${horaTexto(f.finMin)}`;

/** Un renglón para el detalle de un 409: qué se pisa con qué. */
export function describirChoque(c: Choque): string {
  const recurso = c.tipo === "salon" ? "El salón" : "El instructor";
  // V7: dice qué se pisa con qué y qué hacer (antes: «(se traslapa con 16:00–17:00)», repetido y sin salida).
  const salida = c.tipo === "salon" ? "elige otro salón" : "elige otro instructor";
  return `${recurso} ya está ocupado por el grupo «${c.otroGrupoNombre}» el ${franjaTexto(c.otraFranja)}, y este grupo tendría clase de ${horaTexto(c.franja.inicioMin)} a ${horaTexto(c.franja.finMin)} ese mismo día. Cambia el horario o ${salida}.`;
}
