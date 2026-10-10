// Pruebas en navegador real (J): compila la interfaz, prepara una base PROPIA (`inscripciones_navegador_pruebas`, nunca la de la demo: se borra y se
// recrea en cada corrida) y corre Playwright (Chromium) contra el backend real con datos de prueba.
//
//   npm run test:navegador                       (todo)
//   npm run test:navegador -- e2e/acceso.spec.ts (un archivo; lo que sigue a `--` va a Playwright)
//   DATABASE_URL_NAVEGADOR=postgresql://…/otra_navegador_pruebas npm run test:navegador
//   npm run capturas:escribir                    (V13-fix, EV-45: igual, pero las capturas se escriben en docs/capturas/; sin esto quedan en .tmp/navegador/capturas y el árbol no cambia)
//
//   PRUEBAS_AHORA=2026-10-10T06:30:00Z npm run test:navegador   (todo el mundo de pruebas vive en ese «ahora»: servidor, siembra, specs y navegador; ver scripts/lib/reloj-simulado.ts)
//
// Primera vez: `npm run web:instalar` y `npx --prefix web playwright install chromium` (la única descarga de navegador).

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";
import { entornoConRelojSimulado } from "./lib/reloj-simulado.ts";

if (existsSync(".env")) process.loadEnvFile(".env");

const url = new URL(process.env["DATABASE_URL_NAVEGADOR"] ?? "postgresql://inscripciones:inscripciones@localhost:5432/inscripciones_navegador_pruebas");
const nombreBase = url.pathname.slice(1);
if (!/^[a-z_][a-z0-9_]*inscripciones_navegador_pruebas$|^inscripciones_navegador_pruebas$/.test(nombreBase)) {
  throw new Error(`La base del navegador debe llamarse «inscripciones_navegador_pruebas» (recibí «${nombreBase}»): nunca la de la demo ni la de test:int.`);
}

// 1. La interfaz compilada: es lo que sirve el backend real.
// WEB_DIST (opcional) compila a otra carpeta: varias corridas a la vez no se pisan.
const destino = process.env["WEB_DIST"];
execFileSync("npm", ["--prefix", "web", "run", "build", ...(destino ? ["--", "--outDir", resolve(destino), "--emptyOutDir"] : [])], { stdio: "inherit" });

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
// V10b-fix: con PRUEBAS_AHORA, el servidor de pruebas, la siembra, los specs y (por la fixtura) el navegador viven en ese «ahora». Solo Playwright y lo que él lanza: ni npm ni prisma.
const r = spawnSync("npx", ["playwright", "test", ...extra], { cwd: "web", env: entornoConRelojSimulado(env, resolve("scripts/lib/reloj-simulado-import.ts")), stdio: "inherit" });
process.exit(r.status ?? 1);
