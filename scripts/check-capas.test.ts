import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { escanearCapas } from "./check-capas.ts";

const SCRIPT = fileURLToPath(new URL("./check-capas.ts", import.meta.url));

function hallazgos(archivos: Record<string, string>): string[] {
  const raiz = mkdtempSync(join(tmpdir(), "check-capas-"));
  try {
    for (const [ruta, contenido] of Object.entries(archivos)) {
      mkdirSync(join(raiz, ruta, ".."), { recursive: true });
      writeFileSync(join(raiz, ruta), contenido);
    }
    return escanearCapas(raiz).hallazgos.map((h) => `${h.archivo}:${h.invariante}`);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

test("invariante 1: Prisma crudo, SQL crudo y organizacion_id a mano solo dentro de src/datos", () => {
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import { PrismaClient } from "../generated/prisma/client.ts";` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": "await db.$queryRaw`SELECT 1`;" }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `db.lead.findMany({ where: { organizacion_id: id } });` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/datos/a.ts": "await db.$queryRaw`SELECT 1`; const x = { organizacion_id: id };" }), []);
});

test("invariante 4: Chatwoot, Twilio y el transporte solo dentro de src/mensajeria", () => {
  assert.deepEqual(hallazgos({ "src/x/a.ts": `fetch(url + "/api/v1/accounts/1/conversations")` }), ["src/x/a.ts:4"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import twilio from "twilio";` }), ["src/x/a.ts:4"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import { TransporteChatwoot } from "../mensajeria/chatwoot/transporte.ts";` }), ["src/x/a.ts:4"]);
  assert.deepEqual(hallazgos({ "src/mensajeria/chatwoot/a.ts": `fetch(url + "/api/v1/accounts")` }), []);
});

test("los tests y src/testutil no se revisan", () => {
  assert.deepEqual(hallazgos({ "src/x/a.itest.ts": `const x = { organizacion_id: id };`, "src/testutil/s.ts": `const x = { organizacion_id: id };` }), []);
});

test("el comando sale con 1 si hay violaciones", () => {
  const raiz = mkdtempSync(join(tmpdir(), "check-capas-"));
  try {
    mkdirSync(join(raiz, "src", "x"), { recursive: true });
    writeFileSync(join(raiz, "src", "x", "a.ts"), "await db.$executeRaw`DELETE FROM lead`;");
    const r = spawnSync(process.execPath, [SCRIPT, "--raiz", raiz], { encoding: "utf8" });
    assert.equal(r.status, 1, r.stdout + r.stderr);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
