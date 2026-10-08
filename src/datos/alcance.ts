// Scope único por organización (invariante 1) y guarda de soft delete (invariante 3).
//
// conAlcance(prisma, organizacionId) devuelve un cliente que, en TODA operación de modelo:
// - agrega organizacion_id al where (la tabla organizacion se filtra por su id);
// - oculta las filas con eliminado_en;
// - pone organizacion_id en cada alta, y rechaza un alta que traiga otra organización;
// - rechaza delete y deleteMany: se borra con update de eliminado_en.
//
// Nadie filtra organizacion_id a mano: si una consulta no pasa por aquí, `check:capas` falla.
//
// Límite conocido: los `include` y las escrituras anidadas no pasan por la extensión. Las
// relaciones siempre apuntan dentro de la misma organización, así que un include no cruza
// organizaciones, pero sí puede traer filas hijas borradas. Una escritura anidada sin
// organizacion_id la rechaza la base (columna NOT NULL).

import type { PrismaClient } from "../generated/prisma/client.ts";

export class ErrorAlcance extends Error {}

const CON_WHERE = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
]);

const DE_ALTA = new Set(["create", "createMany", "createManyAndReturn"]);

type Datos = Record<string, unknown>;

export function conAlcance(prisma: PrismaClient, organizacionId: string) {
  if (!organizacionId) throw new ErrorAlcance("conAlcance requiere organizacionId");

  const conOrganizacion = (modelo: string, datos: Datos): Datos => {
    const actual = datos["organizacion_id"];
    if (actual !== undefined && actual !== organizacionId) {
      throw new ErrorAlcance(`Alta en ${modelo} con otra organización`);
    }
    return { ...datos, organizacion_id: organizacionId };
  };

  return prisma.$extends({
    name: "alcance-organizacion",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const a = { ...(args as Datos) };
          const llave = model === "organizacion" ? "id" : "organizacion_id";

          if (operation === "delete" || operation === "deleteMany") {
            throw new ErrorAlcance(`Borrado físico prohibido en ${model}: actualiza eliminado_en (invariante 3)`);
          }

          if (CON_WHERE.has(operation)) {
            a["where"] = { ...(a["where"] as Datos | undefined), [llave]: organizacionId, eliminado_en: null };
          } else if (DE_ALTA.has(operation)) {
            if (model === "organizacion") {
              throw new ErrorAlcance("Las organizaciones solo se crean por seed (invariante 1)");
            }
            const datos = a["data"];
            a["data"] = Array.isArray(datos)
              ? datos.map((d: Datos) => conOrganizacion(model, d))
              : conOrganizacion(model, datos as Datos);
          } else if (operation === "upsert") {
            if (model === "organizacion") {
              throw new ErrorAlcance("Las organizaciones solo se crean por seed (invariante 1)");
            }
            a["where"] = { ...(a["where"] as Datos), [llave]: organizacionId, eliminado_en: null };
            a["create"] = conOrganizacion(model, a["create"] as Datos);
          } else {
            throw new ErrorAlcance(`Operación ${operation} no contemplada por el scope de organización`);
          }

          return query(a as typeof args);
        },
      },
    },
  });
}

/** Cliente con scope de una organización. */
export type BaseDatos = ReturnType<typeof conAlcance>;

/** Lo que se puede usar dentro y fuera de una transacción. */
export type Consultas = Omit<BaseDatos, "$transaction" | "$connect" | "$disconnect" | "$extends" | "$on">;

/**
 * Marca un alta cuyo organizacion_id lo pone el scope. Solo cambia el tipo: el scope agrega el
 * valor en tiempo de ejecución. Evita que alguien lo escriba a mano.
 */
export function altaConAlcance<D extends object>(datos: D): D & { organizacion_id: string } {
  return datos as D & { organizacion_id: string };
}
