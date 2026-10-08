// Cupo por grupo. Determinista (invariante 10): lo calcula código, no un modelo de lenguaje.
//
//   disponibles = max(0, cupo_maximo − ocupados)
//
// De dónde sale `ocupados` es una interfaz: el insumo lo define como las inscripciones activas del
// grupo, pero la tabla `inscripcion` no existe hasta su fase (CLAUDE.md: no se construyen tablas
// de fases futuras por adelantado). Mientras tanto la fuente por defecto no tiene inscripciones y
// el cupo es el máximo; cuando exista la tabla, solo se agrega una fuente que cuente las activas.

import type { Consultas } from "../datos/alcance.ts";

export type OfertaDeLugar = "lugar" | "lista_de_espera" | "sin_lugar";

export interface Cupo {
  cupoMaximo: number;
  ocupados: number;
  disponibles: number;
  lleno: boolean;
  /** Qué se le puede ofrecer a quien quiere entrar hoy. */
  oferta: OfertaDeLugar;
}

/** Cuántos lugares tiene ocupados un grupo. */
export interface FuenteOcupacion {
  ocupados(db: Consultas, grupoId: string): Promise<number>;
}

/** Hasta que exista la tabla de inscripciones: ningún lugar está ocupado. */
export class SinInscripciones implements FuenteOcupacion {
  async ocupados(): Promise<number> {
    return 0;
  }
}

/** Cálculo puro. Rechaza datos imposibles en vez de adivinar. */
export function calcularCupo(cupoMaximo: number, ocupados: number, permiteListaEspera: boolean): Cupo {
  if (!Number.isInteger(cupoMaximo) || cupoMaximo < 1) throw new RangeError(`cupo_maximo inválido: ${cupoMaximo}`);
  if (!Number.isInteger(ocupados) || ocupados < 0) throw new RangeError(`ocupados inválido: ${ocupados}`);
  // Más ocupados que cupo (se bajó el cupo después de inscribir) no da cupo negativo.
  const disponibles = Math.max(0, cupoMaximo - ocupados);
  const lleno = disponibles === 0;
  return {
    cupoMaximo,
    ocupados,
    disponibles,
    lleno,
    oferta: !lleno ? "lugar" : permiteListaEspera ? "lista_de_espera" : "sin_lugar",
  };
}

/** Cupo de un grupo vivo y activo. Devuelve null si el grupo no existe, está borrado o inactivo. */
export async function cupoPorGrupo(db: Consultas, grupoId: string, fuente: FuenteOcupacion = new SinInscripciones()): Promise<Cupo | null> {
  const grupo = await db.grupo.findFirst({
    where: { id: grupoId, activo: true },
    select: { cupo_maximo: true, permite_lista_espera: true },
  });
  if (!grupo) return null;
  return calcularCupo(grupo.cupo_maximo, await fuente.ocupados(db, grupoId), grupo.permite_lista_espera);
}
