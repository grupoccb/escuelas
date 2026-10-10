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
// conexión: dos lecturas lanzadas a la vez con `Promise.all` sobre la misma transacción hacen justo eso. Cualquier prueba de integración que lo provoque FALLA (el proceso de su
// archivo sale con 1) en lugar de dejar el aviso perdido en la salida, y el mensaje dice QUÉ dos consultas chocaron. Lo que corre dentro de una transacción pide sus consultas una
// tras otra.
//
// V13-fix (EV-38): la guarda ya NO lee `Client.activeQuery` (obsoleto en pg 8.23: imprimía un aviso de depreciación por proceso de prueba, y en pg 9 desaparece, dejando la guarda
// inerte sin avisar) NI espera el aviso de pg (que solo sale con la tercera consulta simultánea). Cuenta, por conexión, las consultas EN VUELO a partir de la API pública de
// `Client.query` (la promesa o el callback que devuelve): si llega otra mientras hay una en vuelo, es un choque y se falla en ese momento. `prisma-pruebas.itest.ts` lo comprueba con
// un choque de verdad contra la versión de pg instalada.
const choques: string[] = [];
const enVuelo = new WeakMap<object, { cuantas: number; texto: string }>();
const textoDe = (a: unknown): string => (typeof a === "string" ? a : ((a as { text?: string } | undefined)?.text ?? "?"));
function registrarChoque(detalle: string): void {
  if (choques.includes(detalle)) return;
  choques.push(detalle);
  console.error(`\n✗ EK-27: se pidió una consulta a una conexión de pg ocupada (dos consultas a la vez en una misma transacción). Pídelas una tras otra.\n  ${detalle}`);
  process.exitCode = 1;
}
const consultaOriginal = pg.Client.prototype.query as (...a: unknown[]) => unknown;
(pg.Client.prototype as unknown as { query: (...a: unknown[]) => unknown }).query = function (this: object, ...args: unknown[]) {
  const estado = enVuelo.get(this) ?? { cuantas: 0, texto: "" };
  if (estado.cuantas > 0) registrarChoque(`ocupada con: ${estado.texto.slice(0, 160)}\n  se pidió: ${textoDe(args[0]).slice(0, 160)}`);
  const terminar = (): void => {
    const actual = enVuelo.get(this);
    if (actual) actual.cuantas = Math.max(0, actual.cuantas - 1);
  };
  // La forma con callback: se envuelve para saber cuándo termina.
  const ultimo = args.length - 1;
  if (typeof args[ultimo] === "function") {
    const original = args[ultimo] as (...x: unknown[]) => unknown;
    args[ultimo] = (...x: unknown[]) => {
      terminar();
      return original(...x);
    };
  }
  estado.cuantas++;
  estado.texto = textoDe(args[0]);
  enVuelo.set(this, estado);
  const resultado = consultaOriginal.apply(this, args);
  if (resultado instanceof Promise) resultado.then(terminar, terminar);
  else if (typeof args[ultimo] !== "function") terminar(); // una consulta con cursor u otra forma sin promesa ni callback: no se rastrea
  return resultado;
};
process.on("warning", (aviso) => {
  // Lo que pg avisa por su cuenta (cola de consultas): si ya se registró el choque con su detalle, no se repite.
  if (aviso.name === "DeprecationWarning" && /Calling client\.query\(\) when the client is already executing a query/.test(aviso.message) && choques.length === 0) registrarChoque("(el aviso de pg no trae detalle)");
});
