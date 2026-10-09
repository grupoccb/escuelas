// Pruebas en navegador real (J): compila la interfaz, prepara una base PROPIA (`inscripciones_navegador_pruebas`, nunca la de la demo: se borra y se
// recrea en cada corrida) y corre Playwright (Chromium) contra el backend real con datos de prueba.
//
//   npm run test:navegador                       (todo)
//   npm run test:navegador -- e2e/acceso.spec.ts (un archivo; lo que sigue a `--` va a Playwright)
//   DATABASE_URL_NAVEGADOR=postgresql://…/otra_navegador_pruebas npm run test:navegador
//
// Primera vez: `npm run web:instalar` y `npx --prefix web playwright install chromium` (la única descarga de navegador).

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import pg from "pg";

if (existsSync(".env")) process.loadEnvFile(".env");

const url = new URL(process.env["DATABASE_URL_NAVEGADOR"] ?? "postgresql://inscripciones:inscripciones@localhost:5432/inscripciones_navegador_pruebas");
const nombreBase = url.pathname.slice(1);
if (!/^[a-z_][a-z0-9_]*inscripciones_navegador_pruebas$|^inscripciones_navegador_pruebas$/.test(nombreBase)) {
  throw new Error(`La base del navegador debe llamarse «inscripciones_navegador_pruebas» (recibí «${nombreBase}»): nunca la de la demo ni la de test:int.`);
}

// 1. La interfaz compilada: es lo que sirve el backend real.
execFileSync("npm", ["--prefix", "web", "run", "build"], { stdio: "inherit" });

// 2. Base limpia y migrada.
const mantenimiento = new URL(url);
mantenimiento.pathname = "/postgres";
const cliente = new pg.Client({ connectionString: mantenimiento.toString() });
await cliente.connect();
await cliente.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [nombreBase]);
await cliente.query(`DROP DATABASE IF EXISTS "${nombreBase}"`);
await cliente.query(`CREATE DATABASE "${nombreBase}"`);
await cliente.end();
const env = { ...process.env, DATABASE_URL: url.toString() };
execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: ["ignore", "ignore", "inherit"] });

// 3. Playwright.
const extra = process.argv.slice(2).filter((a) => a !== "--");
const r = spawnSync("npx", ["playwright", "test", ...extra], { cwd: "web", env, stdio: "inherit" });
process.exit(r.status ?? 1);
