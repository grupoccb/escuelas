// V10 / EK-27: las conexiones seriales ponen en fila las consultas de una misma conexión (el aviso de `pg` 8 que en `pg` 9 será un fallo), y Prisma, que lanza hermanas a la
// vez dentro de una transacción, ya no lo provoca.

import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { crearPoolSerial } from "./cliente-serial.ts";
import { crearPrismaDePruebas } from "../testutil/prisma-pruebas.ts";
import { clienteSinAlcance } from "./prisma.ts";

const AVISO = /Calling client\.query\(\) when the client is already executing a query/;
const avisos: string[] = [];
process.on("warning", (a) => {
  if (a.name === "DeprecationWarning" && AVISO.test(a.message)) avisos.push(a.message);
});
const esperarAvisos = () => new Promise<void>((resolver) => setTimeout(resolver, 50));

test("un pool serial atiende varias consultas pedidas a la vez sobre la misma conexión, en orden y SIN el aviso de pg", async () => {
  const pool = crearPoolSerial({ connectionString: process.env["DATABASE_URL"]! });
  const c = await pool.connect();
  try {
    const orden: number[] = [];
    const lanzadas = [1, 2, 3, 4, 5].map((n) => c.query(`SELECT ${n}::int AS n, pg_sleep(${(6 - n) / 100})`).then((r) => (orden.push(r.rows[0].n), r.rows[0].n as number)));
    assert.deepEqual(await Promise.all(lanzadas), [1, 2, 3, 4, 5]);
    assert.deepEqual(orden, [1, 2, 3, 4, 5], "terminan en el orden en que se pidieron (una espera a la anterior)");
    // Un error no rompe la fila: la siguiente consulta corre.
    const mala = c.query("SELECT * FROM tabla_que_no_existe_xyz");
    const buena = c.query("SELECT 7::int AS n");
    await assert.rejects(mala, /tabla_que_no_existe_xyz/);
    assert.equal((await buena).rows[0].n, 7);
    // La forma con callback (la de `pool.query`) y los parámetros siguen funcionando.
    assert.equal((await pool.query("SELECT $1::text AS t", ["hola"])).rows[0].t, "hola");
    await esperarAvisos();
    assert.deepEqual(avisos, [], "ningún aviso de pg");
  } finally {
    c.release();
    await pool.end();
  }
});

test("Prisma: un `select` con relaciones anidadas dentro de una transacción (consultas hermanas a la vez) ya no provoca el aviso de pg", async () => {
  const prisma = crearPrismaDePruebas();
  try {
    const db = clienteSinAlcance(prisma);
    await db.$transaction(async (tx) => {
      // Una organización cualquiera con su vertical y su sucursal: tres consultas hermanas que Prisma lanza a la vez.
      await tx.organizacion.findMany({ take: 3, select: { id: true, verticales: { select: { id: true, nombre: true } }, sucursales: { select: { id: true, nombre: true } }, usuarios: { select: { id: true } } } });
    });
    await esperarAvisos();
    assert.deepEqual(avisos, []);
  } finally {
    await prisma.$disconnect();
  }
});

test("CONTROL: sin la fila, tres consultas pedidas a la vez a una conexión de pg SÍ provocan el aviso (la prueba de arriba detecta lo que dice detectar)", async () => {
  const pool = new pg.Pool({ connectionString: process.env["DATABASE_URL"]! });
  const c = await pool.connect();
  // Provocar el aviso a propósito: la guarda de `prisma-pruebas.ts` (que hace fallar el archivo ante este mismo aviso) no debe contarlo.
  const codigoDeSalida = process.exitCode;
  try {
    await Promise.all([c.query("SELECT 1"), c.query("SELECT 2"), c.query("SELECT 3")]);
    await esperarAvisos();
    assert.equal(avisos.length, 1, "pg avisa");
  } finally {
    process.exitCode = codigoDeSalida;
    c.release();
    await pool.end();
  }
});
