import { defineConfig } from "@playwright/test";

// V12: recorre una demo YA levantada (`npm run demo:todo`) con los cuatro usuarios y deja capturas. NO levanta servidor ni siembra nada: la URL viene de DEMO_URL.
//   DEMO_URL=http://localhost:3300 npm run demo:capturas
const URL = process.env["DEMO_URL"] ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e-demo",
  outputDir: "../.tmp/demo-capturas/resultados",
  reporter: [["list"]],
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { baseURL: URL, locale: "es-MX", testIdAttribute: "data-prueba", timezoneId: "America/Mexico_City", trace: "off", screenshot: "off" },
  projects: [{ name: "chromium", use: { viewport: { width: 1366, height: 768 } } }],
});
