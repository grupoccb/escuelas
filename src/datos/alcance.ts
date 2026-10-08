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
// El cliente con alcance NO ofrece SQL crudo ($queryRaw*, $executeRaw*): vería todas las
// organizaciones (F1-14). Falta en el tipo y, si alguien lo fuerza con un cast, lanza en tiempo
// de ejecución. El SQL crudo que haga falta vive en src/datos/, con el cliente sin alcance y
// filtrando a mano, justificado en la bitácora.
//
// Límite conocido: los `include` y las escrituras anidadas no pasan por la extensión. Las
// relaciones siempre apuntan dentro de la misma organización, así que un include no cruza
// organizaciones, pero sí puede traer filas hijas borradas. Una escritura anidada sin
// organizacion_id la rechaza la base (columna NOT NULL).

import type { PrismaClient } from "../generated/prisma/client.ts";
import { clienteSinAlcance, type PrismaRaiz } from "./prisma.ts";

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

/** SQL crudo: no pasa por el alcance y por eso no existe en el cliente con alcance. */
const SQL_CRUDO = ["$queryRaw", "$queryRawUnsafe", "$executeRaw", "$executeRawUnsafe"] as const;
type SqlCrudo = (typeof SQL_CRUDO)[number];

const sqlCrudoProhibido = (nombre: string) => () => {
  throw new ErrorAlcance(`${nombre} no existe en el cliente con alcance: vería todas las organizaciones (invariante 1)`);
};

const llaveDe = (modelo: string): string => (modelo === "organizacion" ? "id" : "organizacion_id");

/**
 * El corazón del alcance: dados el modelo, la operación y sus argumentos, devuelve los argumentos
 * con la organización puesta y lo borrado oculto, o lanza. Lo comparten el cliente extendido
 * (`conAlcance`) y la transacción con bloqueo (`$conBloqueoDeClave`), para que no puedan divergir.
 */
function aplicarAlcance(model: string, operation: string, argumentos: unknown, organizacionId: string): Datos {
  const conOrganizacion = (modelo: string, datos: Datos): Datos => {
    const actual = datos["organizacion_id"];
    if (actual !== undefined && actual !== organizacionId) {
      throw new ErrorAlcance(`Alta en ${modelo} con otra organización`);
    }
    return { ...datos, organizacion_id: organizacionId };
  };

  const a = { ...(argumentos as Datos) };
  const llave = llaveDe(model);

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
    a["data"] = Array.isArray(datos) ? datos.map((d: Datos) => conOrganizacion(model, d)) : conOrganizacion(model, datos as Datos);
  } else if (operation === "upsert") {
    if (model === "organizacion") {
      throw new ErrorAlcance("Las organizaciones solo se crean por seed (invariante 1)");
    }
    a["where"] = { ...(a["where"] as Datos), [llave]: organizacionId, eliminado_en: null };
    a["create"] = conOrganizacion(model, a["create"] as Datos);
  } else {
    throw new ErrorAlcance(`Operación ${operation} no contemplada por el scope de organización`);
  }
  return a;
}

/** Lo mínimo de un cliente de transacción de Prisma que usa el bloqueo: SQL crudo y modelos. */
interface TransaccionCruda {
  $executeRaw(strings: TemplateStringsArray, ...valores: unknown[]): Promise<number>;
}

/**
 * Presenta una transacción de Prisma SIN extender (la extensión no existe en transacciones) con el
 * mismo alcance que `conAlcance`: cada operación de un modelo pasa por `aplicarAlcance`, y el SQL
 * crudo sigue prohibido.
 */
function alcanceSobreTransaccion(tx: TransaccionCruda, organizacionId: string): Consultas {
  const delegados = new Map<string, unknown>();
  return new Proxy(tx as object, {
    get(destino, propiedad) {
      if (typeof propiedad === "string" && (SQL_CRUDO as readonly string[]).includes(propiedad)) return sqlCrudoProhibido(propiedad);
      const valor = Reflect.get(destino, propiedad, destino) as unknown;
      if (typeof propiedad !== "string" || propiedad.startsWith("$") || typeof valor !== "object" || valor === null) return valor;
      let envuelto = delegados.get(propiedad);
      if (!envuelto) {
        envuelto = new Proxy(valor, {
          get(delegado, operacion) {
            const f = Reflect.get(delegado, operacion, delegado) as unknown;
            if (typeof operacion !== "string" || typeof f !== "function") return f;
            return (args?: unknown) => (f as (a: Datos) => unknown).call(delegado, aplicarAlcance(propiedad, operacion, args ?? {}, organizacionId));
          },
        });
        delegados.set(propiedad, envuelto);
      }
      return envuelto;
    },
  }) as unknown as Consultas;
}

/** El único SQL crudo permitido: el candado consultivo de transacción (pg_advisory_xact_lock). */
function bloquearClave(tx: TransaccionCruda, organizacionId: string, clave: string): Promise<number> {
  return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${organizacionId}|${clave}`}, 0))`;
}

function crearCliente(prisma: PrismaClient, organizacionId: string) {
  if (!organizacionId) throw new ErrorAlcance("conAlcance requiere organizacionId");

  return prisma.$extends({
    name: "alcance-organizacion",
    client: {
      $queryRaw: sqlCrudoProhibido("$queryRaw"),
      $queryRawUnsafe: sqlCrudoProhibido("$queryRawUnsafe"),
      $executeRaw: sqlCrudoProhibido("$executeRaw"),
      $executeRawUnsafe: sqlCrudoProhibido("$executeRawUnsafe"),
      /**
       * Transacción que, antes de nada, toma un candado consultivo por (organización, clave): las
       * demás transacciones que pidan el mismo se esperan hasta que ésta termine (EA-11). Dentro de
       * `fn` todo sigue con alcance. El SQL crudo vive aquí, en src/datos/, con la organización
       * explícita; el resto del código usa `transaccionConBloqueo()` de bloqueos.ts.
       */
      async $conBloqueoDeClave(
        organizacionPedida: string,
        clave: string,
        fn: (tx: Consultas) => Promise<unknown>,
        opciones?: OpcionesTransaccion,
      ): Promise<unknown> {
        if (organizacionPedida !== organizacionId) {
          throw new ErrorAlcance("El bloqueo pide otra organización distinta del alcance (invariante 1)");
        }
        return prisma.$transaction(async (tx) => {
          await bloquearClave(tx as unknown as TransaccionCruda, organizacionId, clave);
          return fn(alcanceSobreTransaccion(tx as unknown as TransaccionCruda, organizacionId));
        }, opciones);
      },
    },
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return query(aplicarAlcance(model, operation, args, organizacionId) as typeof args);
        },
      },
    },
  });
}

type Cliente = ReturnType<typeof crearCliente>;

/** Lo que se puede usar dentro y fuera de una transacción. */
export type Consultas = Omit<Cliente, "$transaction" | "$connect" | "$disconnect" | "$extends" | "$on" | "$conBloqueoDeClave" | SqlCrudo>;

export interface OpcionesTransaccion {
  maxWait?: number;
  timeout?: number;
}

/** Cliente con scope de una organización, sin SQL crudo (tampoco dentro de la transacción). */
export type BaseDatos = Omit<Cliente, "$transaction" | "$conBloqueoDeClave" | SqlCrudo> & {
  $transaction<R>(fn: (tx: Consultas) => Promise<R>, opciones?: OpcionesTransaccion): Promise<R>;
  /** Transacción con candado consultivo por (organización, clave). Ver `transaccionConBloqueo` en bloqueos.ts. */
  $conBloqueoDeClave<R>(organizacionId: string, clave: string, fn: (tx: Consultas) => Promise<R>, opciones?: OpcionesTransaccion): Promise<R>;
};

export function conAlcance(raiz: PrismaRaiz, organizacionId: string): BaseDatos {
  return crearCliente(clienteSinAlcance(raiz), organizacionId) as unknown as BaseDatos;
}

/**
 * Marca un alta cuyo organizacion_id lo pone el scope. Solo cambia el tipo: el scope agrega el
 * valor en tiempo de ejecución. Evita que alguien lo escriba a mano.
 */
export function altaConAlcance<D extends object>(datos: D): D & { organizacion_id: string } {
  return datos as D & { organizacion_id: string };
}
