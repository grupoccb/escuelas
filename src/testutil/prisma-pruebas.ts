// Cliente completo de Prisma, sin alcance, SOLO para seeds y tests (EA-12). El código de negocio
// recibe un `PrismaRaiz` opaco (src/datos/prisma.ts); aquí está la única forma de obtener el
// cliente con todos sus modelos. `npm run check:capas` prohíbe importar este archivo desde
// código de producción.
//
// EA-17: se niega a conectarse a una base cuyo nombre no termine en `_pruebas` o `_test`. Los tests
// dejan organizaciones y datos propios; ya ocurrió una vez que corrieron contra la base de la demo.

import { clienteSinAlcance, crearPrisma, type PrismaRaiz } from "../datos/prisma.ts";
import type { PrismaClient } from "../generated/prisma/client.ts";

/** El cliente completo, que además es un `PrismaRaiz` válido para pasarlo a los módulos. */
export type PrismaPruebas = PrismaClient & PrismaRaiz;

const SUFIJOS_DE_PRUEBA = ["_pruebas", "_test"] as const;

/** Nombre de la base de una URL de conexión, o null si no se puede leer. */
export function nombreDeBase(databaseUrl: string): string | null {
  try {
    return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, "")) || null;
  } catch {
    return null;
  }
}

/** Lanza si la URL no apunta a una base de pruebas (nombre terminado en `_pruebas` o `_test`). */
export function exigirBaseDePruebas(databaseUrl: string | undefined): string {
  if (!databaseUrl) throw new Error("Falta DATABASE_URL (la base de pruebas: su nombre debe terminar en _pruebas o _test)");
  const nombre = nombreDeBase(databaseUrl);
  if (!nombre || !SUFIJOS_DE_PRUEBA.some((s) => nombre.endsWith(s))) {
    throw new Error(
      `Los tests no corren contra la base «${nombre ?? "?"}»: su nombre debe terminar en _pruebas o _test. ` +
        "Usa `npm run test:int`, que prepara inscripciones_pruebas.",
    );
  }
  return databaseUrl;
}

export function crearPrismaDePruebas(databaseUrl = process.env["DATABASE_URL"], maxConexiones?: number): PrismaPruebas {
  const raiz = crearPrisma(exigirBaseDePruebas(databaseUrl), maxConexiones);
  return clienteSinAlcance(raiz) as PrismaPruebas;
}
