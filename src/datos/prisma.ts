// Cliente base de Prisma, oculto a propósito (invariante 1, EA-12).
//
// Los módulos de negocio NO reciben un PrismaClient: reciben un `PrismaRaiz`, un tipo opaco que solo
// sirve para tres cosas: abrir un alcance de organización (`conAlcance`), llamar a las funciones de
// `sistema.ts` (las únicas consultas sin alcance) y cerrar la conexión. No tiene `.lead`, `.mensaje`
// ni `$transaction`: un `deps.prisma.lead.findMany()`, un alias, una desestructuración o un
// `deps["prisma"]` no compilan. El cliente completo solo se puede obtener con `clienteSinAlcance()`
// (para src/datos/) o con `crearPrismaDePruebas()` de src/testutil/ (seeds y tests).
// `npm run check:capas` prohíbe esos dos nombres fuera de donde corresponde.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

declare const marcaRaiz: unique symbol;

/**
 * El cliente de base de datos, sin acceso a ningún modelo. Opaco: no se puede construir ni
 * convertir fuera de src/datos/ y src/testutil/.
 */
export interface PrismaRaiz {
  readonly [marcaRaiz]: true;
  $disconnect(): Promise<void>;
}

export function crearPrisma(databaseUrl = process.env["DATABASE_URL"]): PrismaRaiz {
  if (!databaseUrl) throw new Error("Falta DATABASE_URL");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) }) as unknown as PrismaRaiz;
}

/**
 * El cliente completo, SIN alcance. Solo para src/datos/ (conAlcance y sistema.ts) y para
 * src/testutil/. `check:capas` prohíbe usarlo en cualquier otro lugar.
 */
export function clienteSinAlcance(raiz: PrismaRaiz): PrismaClient {
  return raiz as unknown as PrismaClient;
}

/** Código de Prisma para violación de índice único. */
export function esViolacionUnica(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}
