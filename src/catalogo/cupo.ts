// Cupo por grupo. Determinista (invariante 10): lo calcula código, no un modelo de lenguaje.
//
//   disponibles = max(0, cupo_maximo − ocupados)
//
// De dónde sale `ocupados` es una interfaz (`FuenteOcupacion`). La fuente REAL es `InscripcionesActivas` (F4): cuenta las inscripciones
// con estatus `activa` del grupo (índice parcial `inscripcion_cupo_idx`). Las congeladas y las bajas NO ocupan lugar (decisión de F4) y
// la lista de espera tampoco. Es el valor por omisión de TODO lo que reparte o muestra lugares (cotizador, clase muestra, bot, API, lista
// de espera, inscripción). `SinInscripciones` queda solo para pruebas que quieren un grupo vacío sin sembrar inscripciones.

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
  /** Los ocupados de VARIOS grupos en una sola consulta (EC-23). Opcional: sin ella `ocupadosDeVarios` pregunta grupo por grupo. */
  ocupadosPorGrupo?(db: Consultas, grupoIds: readonly string[]): Promise<Map<string, number>>;
}

/** Los ocupados de varios grupos: en una consulta si la fuente sabe, y si no, uno por uno (mismo resultado). */
export async function ocupadosDeVarios(fuente: FuenteOcupacion, db: Consultas, grupoIds: readonly string[]): Promise<Map<string, number>> {
  if (fuente.ocupadosPorGrupo) return fuente.ocupadosPorGrupo(db, grupoIds);
  const salida = new Map<string, number>();
  for (const id of grupoIds) salida.set(id, await fuente.ocupados(db, id));
  return salida;
}

/** Ningún lugar está ocupado (solo pruebas). */
export class SinInscripciones implements FuenteOcupacion {
  async ocupados(): Promise<number> {
    return 0;
  }
}

/**
 * La fuente real (F4): las inscripciones ACTIVAS del grupo. Una inscripción congelada o dada de baja libera su lugar; quien espera en la lista
 * de espera no lo ocupa. Para repartir un lugar hay que tomar antes `bloquearCupoDeGrupo` y contar DESPUÉS, en la misma transacción.
 */
export class InscripcionesActivas implements FuenteOcupacion {
  async ocupados(db: Consultas, grupoId: string): Promise<number> {
    return db.inscripcion.count({ where: { grupo_id: grupoId, estatus: "activa" } });
  }

  /** EC-23: una sola consulta para todos los grupos del catálogo (antes, una por grupo en cada mensaje del bot). */
  async ocupadosPorGrupo(db: Consultas, grupoIds: readonly string[]): Promise<Map<string, number>> {
    const salida = new Map<string, number>(grupoIds.map((id) => [id, 0]));
    if (grupoIds.length === 0) return salida;
    for (const f of await db.inscripcion.groupBy({ by: ["grupo_id"], where: { grupo_id: { in: [...grupoIds] }, estatus: "activa" }, _count: { _all: true } })) salida.set(f.grupo_id, f._count._all);
    return salida;
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
export async function cupoPorGrupo(db: Consultas, grupoId: string, fuente: FuenteOcupacion = new InscripcionesActivas()): Promise<Cupo | null> {
  const grupo = await db.grupo.findFirst({
    where: { id: grupoId, activo: true },
    select: { cupo_maximo: true, permite_lista_espera: true },
  });
  if (!grupo) return null;
  return calcularCupo(grupo.cupo_maximo, await fuente.ocupados(db, grupoId), grupo.permite_lista_espera);
}

/**
 * CANDADO DEL CUPO de un grupo: lo toma, dentro de la transacción en curso, todo el que vaya a REPARTIR lugares del grupo
 * (agendar una clase muestra, inscribir —F4—, cambiar de grupo —F5—). Es un `UPDATE` de la fila del grupo: Postgres deja
 * esperar a la segunda transacción hasta que la primera termina, y en READ COMMITTED lo que lee después ya ve lo que la
 * primera confirmó. Así «contar los lugares y tomar uno» es una sola cosa y la última plaza la gana una persona.
 *
 * Por qué una fila y no un candado consultivo (`transaccionConBloqueo`): éste abre su PROPIA transacción, y quien reparte
 * lugares casi siempre ya está dentro de otra (el mensaje del bot, la escritura de la API con su registro de cambios).
 * La fila se puede tomar desde cualquiera. Todos los que repartan lugares del grupo tienen que pasar por aquí: dos
 * mecanismos distintos no se estorban entre sí. Devuelve false si el grupo no existe (o es de otra organización).
 */
export async function bloquearCupoDeGrupo(tx: Consultas, grupoId: string): Promise<boolean> {
  const r = await tx.grupo.updateMany({ where: { id: grupoId }, data: { actualizado_en: new Date() } });
  return r.count === 1;
}
