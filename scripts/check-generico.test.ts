// Los términos se leen del archivo de datos: este test no puede escribirlos literalmente.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { escanear, leerTerminos, ARCHIVO_TERMINOS } from "./check-generico.ts";

const TERMINOS = leerTerminos();
const UNO = TERMINOS[0]!;
const CON_ACENTO = TERMINOS.find((t) => t !== t.normalize("NFD").replace(/\p{M}/gu, ""))!;
const SCRIPT = fileURLToPath(new URL("./check-generico.ts", import.meta.url));

const quitarAcentos = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "");
const capitalizar = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function repoTemporal(archivos: Record<string, string>): string {
  const raiz = mkdtempSync(join(tmpdir(), "check-generico-"));
  for (const [ruta, contenido] of Object.entries(archivos)) {
    const completo = join(raiz, ruta);
    mkdirSync(join(completo, ".."), { recursive: true });
    writeFileSync(completo, contenido);
  }
  return raiz;
}

function hallazgos(contenido: string, ruta = "src/x.ts"): number {
  const raiz = repoTemporal({ [ruta]: contenido });
  try {
    return escanear(raiz, TERMINOS).hallazgos.length;
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

test("la lista de términos no está vacía e incluye uno con acento", () => {
  assert.ok(TERMINOS.length > 0);
  assert.ok(CON_ACENTO, "se espera al menos un término con acento para probar la normalización");
});

test("código limpio: cero hallazgos", () => {
  assert.equal(hallazgos(`export const vertical = await db.vertical.findMany();\n`), 0);
});

test("atrapa el término en texto, identificadores y plural", () => {
  assert.equal(hallazgos(`const nombre = "${capitalizar(UNO)}";`), 1, "texto");
  assert.equal(hallazgos(`const es${capitalizar(UNO)} = true;`), 1, "camelCase");
  assert.equal(hallazgos(`const ${UNO}_id = 1;`), 1, "snake_case");
  assert.equal(hallazgos(`const X = "${UNO.toUpperCase()}S";`), 1, "mayúsculas y plural");
});

test("ignora acentos: el término escrito sin acento también falla", () => {
  assert.equal(hallazgos(`// ${quitarAcentos(CON_ACENTO)}`), 1);
});

test("no marca palabras que solo contienen el término como parte de otra", () => {
  assert.equal(hallazgos(`const pre${UNO}x = 1;`), 0);
});

test("escanea tests, SQL y plantillas", () => {
  assert.equal(hallazgos(`"${UNO}"`, "src/a.test.ts"), 1);
  assert.equal(hallazgos(`-- ${UNO}`, "prisma/migrations/0001/migration.sql"), 1);
  assert.equal(hallazgos(`Hola {{nombre}}, ${UNO}`, "plantillas/bienvenida.txt"), 1);
});

test("excluye docs, seeds, código generado y el archivo de términos", () => {
  assert.equal(hallazgos(UNO, "docs/notas.txt"), 0);
  assert.equal(hallazgos(UNO, "prisma/seed/verticales.sql"), 0);
  assert.equal(hallazgos(UNO, "src/generated/prisma/client.ts"), 0);
  assert.equal(hallazgos(UNO, ARCHIVO_TERMINOS), 0);
});

test("el comando sale con código 1 si se siembra un término y 0 si no", () => {
  const sucio = repoTemporal({ "src/sembrado.ts": `export const x = "${UNO}";\n` });
  const limpio = repoTemporal({ "src/ok.ts": `export const x = 1;\n` });
  try {
    const r1 = spawnSync(process.execPath, [SCRIPT, "--raiz", sucio], { encoding: "utf8" });
    assert.equal(r1.status, 1, r1.stdout + r1.stderr);
    assert.match(r1.stderr, /src\/sembrado\.ts:1/);
    const r0 = spawnSync(process.execPath, [SCRIPT, "--raiz", limpio], { encoding: "utf8" });
    assert.equal(r0.status, 0, r0.stdout + r0.stderr);
  } finally {
    rmSync(sucio, { recursive: true, force: true });
    rmSync(limpio, { recursive: true, force: true });
  }
});
