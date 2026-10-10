// `npm run demo:capturas` (V12): entra a una demo YA levantada con los cuatro usuarios y deja capturas de su pantalla de inicio (escritorio y celular) en docs/capturas/v1/v12-*.
//
//   npm run demo:capturas                                  # contra http://localhost:3000
//   npm run demo:capturas -- --url http://localhost:3300 --prefijo v12
//
// No levanta nada ni cambia datos. Primera vez: `npx --prefix web playwright install chromium`.

import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const { values: o } = parseArgs({ options: { url: { type: "string", default: "http://localhost:3000" }, prefijo: { type: "string", default: "v12" }, carpeta: { type: "string", default: "docs/capturas/v1" } } });
const r = spawnSync("npx", ["playwright", "test", "-c", "playwright.demo.config.ts"], { cwd: "web", stdio: "inherit", env: { ...process.env, DEMO_URL: o.url!, DEMO_PREFIJO: o.prefijo!, DEMO_CAPTURAS: o.carpeta! } });
process.exit(r.status ?? 1);
