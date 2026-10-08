// Corre los tests de integración (*.itest.ts) contra una base de pruebas aparte.
// Crea la base si no existe y le aplica las migraciones. Cada test crea sus propias
// organizaciones, así que no hace falta limpiar entre corridas.
//
//   npm run test:int
//   DATABASE_URL_PRUEBAS=postgresql://… npm run test:int

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import pg from "pg";

if (existsSync(".env")) process.loadEnvFile(".env");

const url = new URL(
  process.env["DATABASE_URL_PRUEBAS"] ?? "postgresql://inscripciones:inscripciones@localhost:5432/inscripciones_pruebas",
);
const nombreBase = url.pathname.slice(1);
if (!/^[a-z_][a-z0-9_]*$/.test(nombreBase)) throw new Error(`Nombre de base inválido: ${nombreBase}`);
// EA-17: nunca contra la base de la demo. Los tests dejan organizaciones propias y los itests se
// niegan a conectarse a una base que no termine en _pruebas o _test (src/testutil/prisma-pruebas.ts).
if (!/(?:_pruebas|_test)$/.test(nombreBase)) {
  throw new Error(`DATABASE_URL_PRUEBAS apunta a «${nombreBase}»: la base de pruebas debe terminar en _pruebas o _test.`);
}

const mantenimiento = new URL(url);
mantenimiento.pathname = "/postgres";
const cliente = new pg.Client({ connectionString: mantenimiento.toString() });
await cliente.connect();
const existe = await cliente.query("SELECT 1 FROM pg_database WHERE datname = $1", [nombreBase]);
if (existe.rowCount === 0) await cliente.query(`CREATE DATABASE "${nombreBase}"`);
await cliente.end();

const env = { ...process.env, DATABASE_URL: url.toString() };
execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: ["ignore", "ignore", "inherit"] });

const r = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "src/**/*.itest.ts"], { env, stdio: "inherit" });
process.exit(r.status ?? 1);
