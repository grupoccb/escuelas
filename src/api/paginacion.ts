// Paginación estándar (B3): `?limite=&pagina=` y respuesta `{ datos, paginacion: { pagina, limite, total } }`.
//
// - `limite`: por defecto 25, TOPE DURO de 100 (si piden más, se usa 100 y la respuesta lo dice).
// - `pagina`: desde 1, hasta 10 000.
// - El ORDEN es responsabilidad de quien consulta y tiene que ser ESTABLE: siempre un criterio
//   seguido de `id` (`orderBy: [{ creado_en: "desc" }, { id: "desc" }]`), si no, dos filas con el mismo
//   valor pueden repetirse o saltarse entre páginas.
//
//   const q = parsearQuery(objeto({ ...esquemaPaginacion, estado: opcional(...) }), req.query);
//   const pag = leerPaginacion(q);
//   res.json(await paginar(pag, () => db.x.count({ where }), (saltar, tomar) => db.x.findMany({ where, skip: saltar, take: tomar, orderBy })));

import { enteroDeTexto, opcional } from "./validar.ts";

export const LIMITE_POR_DEFECTO = 25;
export const LIMITE_MAXIMO = 100;
export const PAGINA_MAXIMA = 10_000;

/** Campos de query para mezclar en el esquema de cada lista. */
export const esquemaPaginacion = {
  limite: opcional(enteroDeTexto({ min: 1 })),
  pagina: opcional(enteroDeTexto({ min: 1, max: PAGINA_MAXIMA })),
};

export interface Paginacion {
  pagina: number;
  limite: number;
  saltar: number;
}

export function leerPaginacion(q: { limite?: number | undefined; pagina?: number | undefined }): Paginacion {
  const limite = Math.min(q.limite ?? LIMITE_POR_DEFECTO, LIMITE_MAXIMO);
  const pagina = q.pagina ?? 1;
  return { pagina, limite, saltar: (pagina - 1) * limite };
}

export interface RespuestaPaginada<T> {
  datos: T[];
  paginacion: { pagina: number; limite: number; total: number };
}

export async function paginar<T>(
  pag: Paginacion,
  contar: () => Promise<number>,
  buscar: (saltar: number, tomar: number) => Promise<T[]>,
): Promise<RespuestaPaginada<T>> {
  const [total, datos] = await Promise.all([contar(), buscar(pag.saltar, pag.limite)]);
  return { datos, paginacion: { pagina: pag.pagina, limite: pag.limite, total } };
}
