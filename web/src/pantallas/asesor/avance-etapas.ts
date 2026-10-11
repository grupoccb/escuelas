// La barra de avance de la ficha del lead (R5a, README «Ficha del lead»): una barra por etapa abierta del embudo, en su orden, con la actual marcada. Sin React: se prueba con `node --test`.

import type { Etapa } from "../../api/tipos.ts";

export type EstadoDePaso = "hecho" | "actual" | "pendiente" | "perdido";

export interface PasoDeAvance {
  id: string;
  nombre: string;
  estado: EstadoDePaso;
}

const esPerdida = (e: Pick<Etapa, "es_perdido" | "tipo_sistema">): boolean => e.es_perdido || e.tipo_sistema === "perdido";

/**
 * Las etapas por las que pasa un lead (las de perdido no son un paso: son una salida), en su orden. Las anteriores a la actual van «hecho», la actual «actual» y las que faltan «pendiente».
 * Si el lead está perdido, ninguna está en curso: todas van «perdido» (apagadas) y ninguna es la actual. Si la etapa actual no está en la lista, todas quedan «pendiente».
 */
export function pasosDeAvance(etapas: readonly Etapa[], actualId: string): PasoDeAvance[] {
  const actual = etapas.find((e) => e.id === actualId);
  const camino = etapas.filter((e) => !esPerdida(e)).sort((a, b) => a.orden - b.orden);
  if (actual && esPerdida(actual)) return camino.map((e) => ({ id: e.id, nombre: e.nombre, estado: "perdido" as const }));
  const indice = camino.findIndex((e) => e.id === actualId);
  return camino.map((e, i) => ({ id: e.id, nombre: e.nombre, estado: indice === -1 ? "pendiente" : i < indice ? "hecho" : i === indice ? "actual" : "pendiente" }));
}

/** «Una», «una y otra», «una, otra y otra»; sin repetidos y sin vacíos. */
export function listaConY(textos: readonly (string | null | undefined)[]): string {
  const unicos = [...new Set(textos.filter((t): t is string => typeof t === "string" && t.trim() !== ""))];
  if (unicos.length <= 1) return unicos[0] ?? "";
  return `${unicos.slice(0, -1).join(", ")} y ${unicos[unicos.length - 1]}`;
}
