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
    // Sin repetidos: una línea puede violar varias reglas a la vez; interesa qué línea de qué invariante.
    return [...new Set(escanearCapas(raiz).hallazgos.map((h) => `${h.archivo}:${h.linea}:${h.invariante}`))].map((x) => x.replace(/:\d+(?=:\d+$)/, ""));
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

// ---------------------------------------------------------------------------------------------
// Endurecimiento (F1-09): cada violación que antes pasaba en verde ahora falla.

test("invariante 1: `pg` y los clientes de Prisma no se importan fuera de src/datos", () => {
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import pg from "pg";` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import { Pool } from 'pg';` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const pg = require("pg");` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const pg = await import("pg");` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import { PrismaClient } from "@prisma/client";` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import { PrismaPg } from "@prisma/adapter-pg";` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/datos/a.ts": `import pg from "pg";` }), []);
  // Una palabra que solo empieza como `pg` no cuenta.
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import { f } from "./pgn.ts";` }), []);
});

test("invariante 1: el PrismaClient crudo (`deps.prisma.<modelo>.…`) no se consulta fuera de src/datos", () => {
  assert.deepEqual(hallazgos({ "src/x/a.ts": `export const f = (deps: any) => deps.prisma.lead.findMany();` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `await prisma.mensaje.updateMany({ data: {} });` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const n = await this.prisma.conversacion.count();` }), ["src/x/a.ts:1"]);
  // Lo legítimo: pasarlo a conAlcance / sistema, y los métodos de ciclo de vida ($…).
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const db = conAlcance(deps.prisma, id);` }), []);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `await prisma.$disconnect();` }), []);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import { crearPrisma } from "../datos/prisma.ts";` }), []);
  assert.deepEqual(hallazgos({ "src/datos/a.ts": `await prisma.lead.findMany();` }), []);
});

test("invariante 1: organizacion_id escrito a mano dentro de un string SQL", () => {
  assert.deepEqual(hallazgos({ "src/x/a.ts": "const q = `SELECT * FROM lead WHERE organizacion_id = 1`;" }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const q = "UPDATE lead SET x = 1 WHERE organizacion_id != $1";` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const q = "... AND organizacion_id IN (1,2)";` }), ["src/x/a.ts:1"]);
  // Una comparación de JavaScript no es SQL.
  assert.deepEqual(hallazgos({ "src/x/a.ts": `if (a.organizacion_id === b.organizacion_id) return;` }), []);
});

test("invariante 4: `import(\"twilio\")` dinámico, hosts de Twilio y URLs de Chatwoot", () => {
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const t = await import("twilio");` }), ["src/x/a.ts:4"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `await fetch("https://messaging.twilio.com/v1/Services");` }), ["src/x/a.ts:4"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `await fetch("https://content.twilio.com/v1/Content");` }), ["src/x/a.ts:4"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `await fetch("http://chatwoot:3000/algo");` }), ["src/x/a.ts:4"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `await fetch("https://app.chatwoot.com/algo");` }), ["src/x/a.ts:4"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const u = process.env["CHATWOOT_URL"];` }), ["src/x/a.ts:4"]);
  assert.deepEqual(hallazgos({ "src/mensajeria/a.ts": `await fetch("https://content.twilio.com/v1/Content"); const u = process.env["CHATWOOT_URL"];` }), []);
  // La ruta del webhook propio no es una URL de Chatwoot.
  assert.deepEqual(hallazgos({ "src/x/a.ts": `app.post("/webhooks/chatwoot", f);` }), []);
});

test("`generated` y `testutil` solo se excluyen por ruta exacta (src/generated, src/testutil)", () => {
  const malo = `export const x = { organizacion_id: id };`;
  assert.deepEqual(hallazgos({ "src/generated/a.ts": malo, "src/testutil/a.ts": malo }), []);
  assert.deepEqual(hallazgos({ "src/foo/generated/a.ts": malo }), ["src/foo/generated/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/foo/testutil/a.ts": malo }), ["src/foo/testutil/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/testutil/dentro/a.ts": malo }), [], "lo que está bajo src/testutil sigue excluido");
});

test("también se revisan .mts, .tsx y .js; los tests se excluyen por su nombre", () => {
  const malo = "await db.$queryRaw`SELECT 1`;";
  assert.deepEqual(hallazgos({ "src/x/a.mts": malo }), ["src/x/a.mts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.tsx": malo }), ["src/x/a.tsx:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.js": malo }), ["src/x/a.js:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.mjs": malo }), ["src/x/a.mjs:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.test.mts": malo, "src/x/b.itest.ts": malo, "src/x/c.test.tsx": malo }), []);
  // Un archivo que solo tiene "test" en el nombre no es un test.
  assert.deepEqual(hallazgos({ "src/x/attest.ts": malo }), ["src/x/attest.ts:1"]);
});

// ---------------------------------------------------------------------------------------------
// EA-12: el cliente completo ya no llega a los módulos. Las siembras de la auditoría.

test("EA-12: obtener el cliente completo o las utilidades de prueba desde código de producción", () => {
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import { clienteSinAlcance } from "../datos/prisma.ts";` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const p = clienteSinAlcance(deps.prisma);` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import { crearPrismaDePruebas } from "../testutil/prisma-pruebas.ts";` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import { sembrarOrganizacion } from "../testutil/semilla.ts";` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import type { PrismaClient } from "../datos/prisma.ts";` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const raiz = prisma as unknown as { lead: { findMany(): unknown } };` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import { f } from "./otro.test.ts";` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import { f } from "./otro.itest.ts";` }), ["src/x/a.ts:1"]);
  // Dentro de src/datos/ y src/testutil/ sí; el tipo opaco no se castiga.
  assert.deepEqual(hallazgos({ "src/datos/a.ts": `import { clienteSinAlcance } from "./prisma.ts"; const p = clienteSinAlcance(r) as PrismaClient;` }), []);
  assert.deepEqual(hallazgos({ "src/testutil/a.ts": `import { crearPrismaDePruebas } from "./prisma-pruebas.ts";` }), []);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import type { PrismaRaiz } from "../datos/prisma.ts"; const db = conAlcance(deps.prisma, id);` }), []);
});

test("EA-12: cargas dinámicas, createRequire y primitivas de red fuera de src/mensajeria", () => {
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const m = await import(ruta);` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": "const m = await import(`../${nombre}.ts`);" }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const m = await import("./literal.ts");` }), [], "con ruta literal sí se ve y se puede revisar");
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const r = createRequire(import.meta.url)("twilio");` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": "const v = process.env[`CHATWOOT_${x}`];" }), ["src/x/a.ts:4"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `await fetch(url);` }), ["src/x/a.ts:4"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `await fetch('https://api.' + 'twil' + 'io.com/x');` }), ["src/x/a.ts:4"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `import https from "node:https";` }), ["src/x/a.ts:4"]);
  assert.deepEqual(hallazgos({ "src/mensajeria/a.ts": `await fetch(url); import https from "node:https";` }), []);
});

/**
 * Compila cuerpos de función contra los tipos REALES de src/datos/prisma.ts y devuelve, por
 * siembra, si el compilador la rechazó. Una sola corrida de tsc para todas.
 */
function compilar(siembras: Record<string, string>): Record<string, boolean> {
  const dir = join(RAIZ_REPO, ".tmp", `siembras-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  try {
    for (const [nombre, cuerpo] of Object.entries(siembras)) {
      writeFileSync(
        join(dir, `${nombre}.ts`),
        `import type { PrismaRaiz } from "../../src/datos/prisma.ts";\nexport async function f(deps: { prisma: PrismaRaiz }, prisma: PrismaRaiz): Promise<unknown> {\n${cuerpo}\n}\n`,
      );
    }
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({ extends: "../../tsconfig.json", include: ["./*.ts"], compilerOptions: { noEmit: true } }));
    const r = spawnSync(process.execPath, [join(RAIZ_REPO, "node_modules", "typescript", "bin", "tsc"), "-p", join(dir, "tsconfig.json"), "--pretty", "false"], { encoding: "utf8" });
    const salida = r.stdout + r.stderr;
    return Object.fromEntries(Object.keys(siembras).map((n) => [n, new RegExp(`${n}\\.ts\\(\\d+,\\d+\\): error TS`).test(salida)]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const RAIZ_REPO = fileURLToPath(new URL("..", import.meta.url));

test("EA-12: las siembras de la auditoría que esquivaban la guarda de texto ahora NO COMPILAN", () => {
  const rechazadas = compilar({
    alias: `const p = deps.prisma;\nreturn p.lead.findMany();`,
    multilinea: `return deps.prisma\n  .lead\n  .findMany();`,
    corchetes: `return deps["prisma"].lead.findMany();`,
    desestructuracion: `const { lead } = deps.prisma;\nreturn lead.findMany();`,
    transaccion: `return prisma.$transaction(async (tx) => tx.lead.findMany());`,
    sqlCrudo: "return prisma.$queryRaw`SELECT 1`;",
    extends: `return prisma.$extends({});`,
    // Control: lo legítimo compila.
    legitima: `await prisma.$disconnect();\nreturn deps.prisma;`,
  });
  assert.deepEqual(rechazadas, {
    alias: true,
    multilinea: true,
    corchetes: true,
    desestructuracion: true,
    transaccion: true,
    sqlCrudo: true,
    extends: true,
    legitima: false,
  });
});

test("EA-12: lo que el tipo NO impide (cast doble deliberado) lo ve la guarda de texto solo si el cliente va en la misma línea", () => {
  // Documentado: compila, porque el desarrollador escribió a propósito la forma del cliente.
  assert.deepEqual(compilar({ casteo: `return (deps.prisma as never as { lead: { findMany(): unknown } }).lead.findMany();` }), { casteo: false });
  // La guarda de texto sí lo atrapa cuando `prisma` y el cast comparten línea.
  assert.deepEqual(hallazgos({ "src/x/a.ts": `return (deps.prisma as never as { lead: { findMany(): unknown } }).lead.findMany();` }), ["src/x/a.ts:1"]);
  // Y no cuando se parte en dos líneas: residual conocido.
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const p = deps.prisma;\nconst q = p as never as { lead: { findMany(): unknown } };` }), []);
});
