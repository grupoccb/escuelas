// Una base de Postgres propia, recreada desde cero, con las migraciones y los datos de ejemplo de la demo (los mismos archivos que usa `docker compose` en `demo-preparar`).
// La usan `demo:guiada` y las pruebas de la demo (V12). Nunca toca otra base: quien la llama dice qué nombres son suyos.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import pg from "pg";

/** El mismo orden que `demo-preparar` en docker-compose.yml. */
export const SEEDS_DE_LA_DEMO = ["demo.sql", "catalogo.sql", "catalogo-completo.sql", "clase-muestra.sql", "seguimiento.sql", "progresion.sql"] as const;

/** Recrea `base` en el servidor de `urlServidor` (la base se cambia por la suya), migra y siembra. Devuelve la URL de la base nueva. `esDeAqui` dice si el nombre es de quien llama. */
export async function recrearBaseDeDemo(urlServidor: string, base: string, esDeAqui: RegExp): Promise<string> {
  if (!esDeAqui.test(base) || !/^[a-z_][a-z0-9_]*$/.test(base)) throw new Error(`Nombre de base no permitido: «${base}»`);
  const u = new URL(urlServidor);
  u.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: u.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${base}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${base}"`);
  await admin.end();
  u.pathname = `/${base}`;
  const url = u.toString();
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env: { ...process.env, DATABASE_URL: url }, stdio: ["ignore", "ignore", "inherit"] });
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  for (const s of SEEDS_DE_LA_DEMO) await c.query(readFileSync(new URL(`../../prisma/seed/${s}`, import.meta.url), "utf8"));
  // Las bandejas de Chatwoot no existen fuera de compose: se les da una cuenta y una bandeja de mentira para que los webhooks las reconozcan.
  await c.query("UPDATE bandeja_chatwoot SET chatwoot_account_id = 1, chatwoot_inbox_id = 100 + (SELECT count(*) FROM bandeja_chatwoot b2 WHERE b2.creado_en < bandeja_chatwoot.creado_en OR (b2.creado_en = bandeja_chatwoot.creado_en AND b2.id < bandeja_chatwoot.id))");
  await c.end();
  return url;
}

/** Borra una base propia (al terminar una prueba). */
export async function borrarBaseDeDemo(urlServidor: string, base: string): Promise<void> {
  const u = new URL(urlServidor);
  u.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: u.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${base}" WITH (FORCE)`);
  await admin.end();
}
