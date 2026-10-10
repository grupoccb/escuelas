// Cliente completo de Prisma, sin alcance, SOLO para seeds y tests (EA-12). El código de negocio
// recibe un `PrismaRaiz` opaco (src/datos/prisma.ts); aquí está la única forma de obtener el
// cliente con todos sus modelos. `npm run check:capas` prohíbe importar este archivo desde
// código de producción.
//
// EA-17: se niega a conectarse a una base cuyo nombre no termine en `_pruebas` o `_test`. Los tests
// dejan organizaciones y datos propios; ya ocurrió una vez que corrieron contra la base de la demo.

import pg from "pg";
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

// V10 / EK-27: `pg` avisa (y en la versión 9 romperá) cuando se le pide una consulta a una conexión que todavía atiende otra. Dentro de una transacción de Prisma hay UNA sola
// conexión: dos lecturas lanzadas a la vez con `Promise.all` sobre la misma transacción hacen justo eso. Cualquier prueba de integración que lo provoque ahora FALLA (el proceso
// de su archivo sale con 1) en lugar de dejar el aviso perdido en la salida, y el mensaje dice QUÉ dos consultas chocaron. Lo que corre dentro de una transacción pide sus
// consultas una tras otra.
const choques: string[] = [];
const consultaOriginal = pg.Client.prototype.query as (...a: unknown[]) => unknown;
(pg.Client.prototype as unknown as { query: (...a: unknown[]) => unknown }).query = function (this: { activeQuery?: { text?: string } | null }, ...args: unknown[]) {
  if (this.activeQuery) {
    const nueva = typeof args[0] === "string" ? args[0] : ((args[0] as { text?: string } | undefined)?.text ?? "?");
    choques.push(`ocupada con: ${(this.activeQuery.text ?? "?").slice(0, 160)}\n  se pidió: ${nueva.slice(0, 160)}`);
  }
  return consultaOriginal.apply(this, args);
};
process.on("warning", (aviso) => {
  if (aviso.name === "DeprecationWarning" && /Calling client\.query\(\) when the client is already executing a query/.test(aviso.message)) {
    console.error(`\n✗ EK-27: se pidió una consulta a una conexión de pg ocupada (dos consultas a la vez en una misma transacción). Pídelas una tras otra.\n  ${choques.at(-1) ?? "(sin detalle)"}`);
    process.exitCode = 1;
  }
});
