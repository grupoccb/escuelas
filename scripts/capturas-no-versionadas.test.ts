// V13-fix EV-45: `npm run test:navegador` no debe reescribir las capturas versionadas (`docs/capturas/`). Las pruebas piden la carpeta a `carpetaDeCapturas()` (web/e2e/mundo.ts), que sin
// `CAPTURAS_ESCRIBIR=1` es la carpeta de la corrida. Este test falla si una prueba nueva escribe directo en `docs/capturas`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const E2E = join(fileURLToPath(new URL("..", import.meta.url)), "web", "e2e");

test("ninguna prueba de web/e2e nombra docs/capturas en código: todas piden la carpeta a carpetaDeCapturas()", () => {
  const infractores: string[] = [];
  for (const n of readdirSync(E2E).filter((x) => x.endsWith(".ts") && x !== "mundo.ts")) {
    const codigo = readFileSync(join(E2E, n), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (/docs\/capturas/.test(codigo.replace(/\/\/ .*$/gm, ""))) infractores.push(n);
  }
  assert.deepEqual(infractores, [], "usa carpetaDeCapturas() de ./mundo.ts (escribe en docs/capturas solo con CAPTURAS_ESCRIBIR=1)");
});

test("carpetaDeCapturas() va a la carpeta de la corrida por omisión y a docs/capturas solo con CAPTURAS_ESCRIBIR=1", async () => {
  const salida: string[] = [];
  for (const v of [undefined, "0", "1"]) {
    const env = { ...process.env, DIR_NAVEGADOR: ".tmp/prueba-capturas" } as Record<string, string | undefined>;
    if (v === undefined) delete env["CAPTURAS_ESCRIBIR"];
    else env["CAPTURAS_ESCRIBIR"] = v;
    const { execFileSync } = await import("node:child_process");
    salida.push(execFileSync(process.execPath, ["-e", 'import("./web/e2e/mundo.ts").then((m) => console.log(m.carpetaDeCapturas("v1")))'], { env: env as NodeJS.ProcessEnv, encoding: "utf8", cwd: join(E2E, "..", "..") }).trim());
  }
  assert.match(salida[0]!, /\.tmp\/prueba-capturas\/capturas\/v1$/);
  assert.match(salida[1]!, /\.tmp\/prueba-capturas\/capturas\/v1$/);
  assert.match(salida[2]!, /\/docs\/capturas\/v1$/);
});
