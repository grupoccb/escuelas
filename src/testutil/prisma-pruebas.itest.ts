// V13-fix EV-38: la guarda de EK-27 (dos consultas a la vez sobre una conexión de pg ocupada FALLAN la prueba) sigue viva con la versión de pg instalada, y no imprime avisos de depreciación
// por cada consulta. Se prueba con un choque de verdad en un proceso aparte: si una versión nueva de pg dejara la guarda inerte, esta prueba falla en lugar de dejar pasar el defecto.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

function correr(codigo: string) {
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", codigo], { cwd: RAIZ, env: { ...process.env }, encoding: "utf8", timeout: 30_000 });
  return { codigo: r.status, salida: `${r.stdout}${r.stderr}` };
}

const PREAMBULO = `
import pg from "pg";
await import("./src/testutil/prisma-pruebas.ts");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
`;

test("EV-38: dos consultas a la vez sobre la misma conexión de pg hacen que el proceso salga con 1 y dicen QUÉ dos chocaron", () => {
  const r = correr(`${PREAMBULO}
    await Promise.all([c.query("SELECT pg_sleep(0.2), 1 AS primera"), c.query("SELECT 2 AS segunda")]);
    await c.end();
    await new Promise((r) => setTimeout(r, 50));`);
  assert.equal(r.codigo, 1, r.salida);
  assert.match(r.salida, /EK-27/);
  assert.match(r.salida, /ocupada con: SELECT pg_sleep/);
  assert.match(r.salida, /se pidió: SELECT 2 AS segunda/);
});

test("EV-38: una consulta tras otra no falla ni imprime NINGÚN aviso de depreciación (antes: «Client.activeQuery is deprecated» por cada consulta)", () => {
  const r = correr(`${PREAMBULO}
    await c.query("SELECT 1");
    await c.query("SELECT 2");
    await c.end();
    await new Promise((r) => setTimeout(r, 50));`);
  assert.equal(r.codigo, 0, r.salida);
  assert.ok(!/Deprecat/i.test(r.salida), r.salida);
});
