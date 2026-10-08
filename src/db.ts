// Cliente único de Prisma. En Fase 1, el scope por organización (invariante 1) se monta
// sobre este cliente; ningún otro módulo debe instanciar PrismaClient.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.ts";

export function crearPrisma(databaseUrl = process.env["DATABASE_URL"]): PrismaClient {
  if (!databaseUrl) throw new Error("Falta DATABASE_URL");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
