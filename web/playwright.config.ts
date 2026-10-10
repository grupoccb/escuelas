import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

// Pruebas en navegador real (Chromium). Las lanza `npm run test:navegador` desde la raíz, que antes compila la interfaz y prepara la base
// `inscripciones_navegador_pruebas` (nunca la de la demo). El servidor es el backend real con datos de prueba: scripts/navegador/servidor.ts.
const PUERTO = Number(process.env["PUERTO"] ?? 4318);
const RAIZ = resolve(import.meta.dirname, "..");

export default defineConfig({
  testDir: "./e2e",
  outputDir: resolve(RAIZ, process.env["DIR_NAVEGADOR"] ?? ".tmp/navegador", "resultados"),
  reporter: [["list"]],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${PUERTO}`,
    locale: "es-MX",
    testIdAttribute: "data-prueba",
    timezoneId: "America/Mexico_City",
    trace: "off",
    screenshot: "off",
  },
  globalSetup: "./e2e/preparar.ts",
  webServer: {
    command: "node scripts/navegador/servidor.ts",
    cwd: RAIZ,
    // `/salud` responde apenas arranca el proceso: que el mundo de pruebas ya esté sembrado lo espera `e2e/preparar.ts` (hasta que aparece `mundo.json`).
    url: `http://127.0.0.1:${PUERTO}/salud`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { ...(process.env as Record<string, string>), PUERTO: String(PUERTO) },
  },
  projects: [{ name: "chromium", use: { viewport: { width: 1280, height: 800 } } }],
});
