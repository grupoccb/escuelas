// Cliente base de Prisma. Solo src/datos/ lo usa directamente: el resto del código consulta a
// través de conAlcance() (invariante 1). `npm run check:capas` lo verifica.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";

export type { PrismaClient };

export function crearPrisma(databaseUrl = process.env["DATABASE_URL"]): PrismaClient {
  if (!databaseUrl) throw new Error("Falta DATABASE_URL");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

/** Código de Prisma para violación de índice único. */
export function esViolacionUnica(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}
