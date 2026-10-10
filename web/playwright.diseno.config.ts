import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

// Rediseño (PLAN-DISENO.md): captura cada fila de docs/diseno/INVENTARIO.md, en escritorio (1366) y celular (390), contra el mismo servidor de pruebas que `test:navegador`.
//   npm run diseno:capturas                                  (todas, fase «despues»)
//   DISENO_FASE=antes npm run diseno:capturas                (la línea de antes)
//   DISENO_FILTRO=asesor- npm run diseno:capturas            (solo las escenas cuyo id contiene el texto)
const PUERTO = Number(process.env["PUERTO"] ?? 4318);
const RAIZ = resolve(import.meta.dirname, "..");

export default defineConfig({
  testDir: "./e2e-diseno",
  outputDir: resolve(RAIZ, process.env["DIR_NAVEGADOR"] ?? ".tmp/navegador", "resultados-diseno"),
  reporter: [["list"]],
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  use: { baseURL: `http://127.0.0.1:${PUERTO}`, locale: "es-MX", testIdAttribute: "data-prueba", timezoneId: "America/Mexico_City", trace: "off", screenshot: "off" },
  globalSetup: "./e2e/preparar.ts",
  webServer: {
    command: "node scripts/navegador/servidor.ts",
    cwd: RAIZ,
    url: `http://127.0.0.1:${PUERTO}/salud`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { ...(process.env as Record<string, string>), PUERTO: String(PUERTO) },
  },
  projects: [{ name: "chromium", use: { viewport: { width: 1366, height: 768 } } }],
});
