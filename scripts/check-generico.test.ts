// Los términos se leen del archivo de datos: este test no puede escribirlos literalmente.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { escanear, leerTerminos, ARCHIVO_TERMINOS, BYTE_NULO } from "./check-generico.ts";

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

// ---------------------------------------------------------------------------------------------
// Endurecimiento (F1-08): cada forma de colar un término que antes pasaba en verde ahora falla.

const TERMINO = `const x = "${UNO}";`;

/** Hallazgos al sembrar `contenido` en `ruta`, escribiendo los bytes tal cual. */
function hallazgosEn(ruta: string, contenido: string | Buffer): number {
  const raiz = mkdtempSync(join(tmpdir(), "check-generico-"));
  try {
    const completo = join(raiz, ruta);
    mkdirSync(join(completo, ".."), { recursive: true });
    writeFileSync(completo, contenido);
    return escanear(raiz, TERMINOS).hallazgos.length;
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

test("carpetas excluidas solo por ruta exacta: dist y coverage anidados SÍ se escanean", () => {
  assert.equal(hallazgosEn("src/dist/z.ts", TERMINO), 1);
  assert.equal(hallazgosEn("src/coverage/z.ts", TERMINO), 1);
  assert.equal(hallazgosEn("src/node_modules/z.ts", TERMINO), 1);
  assert.equal(hallazgosEn("src/.tmp/z.ts", TERMINO), 1);
  assert.equal(hallazgosEn("src/foo/generated/z.ts", TERMINO), 1);
  // Las de la raíz, que no son código del repo, siguen fuera.
  assert.equal(hallazgosEn("dist/z.ts", TERMINO), 0);
  assert.equal(hallazgosEn("coverage/z.ts", TERMINO), 0);
  assert.equal(hallazgosEn("node_modules/p/z.ts", TERMINO), 0);
  assert.equal(hallazgosEn(".tmp/z.ts", TERMINO), 0);
  assert.equal(hallazgosEn(".git/z.ts", TERMINO), 0);
});

test("un dígito pegado al término no lo oculta: `termino2` y `2termino` cuentan", () => {
  assert.equal(hallazgos(`const a = "${UNO}2";`), 1);
  assert.equal(hallazgos(`const a = "2${UNO}";`), 1);
  assert.equal(hallazgos(`const ${UNO}2_id = 1;`), 1);
  assert.equal(hallazgos(`const a = "${UNO}12 y más";`), 1);
  // Las letras sí lo ocultan (palabras que solo lo contienen).
  assert.equal(hallazgos(`const a = "pre${UNO}x";`), 0);
});

test("se escanean todos los archivos de texto, sea cual sea la extensión", () => {
  for (const ruta of [
    "src/z.mts",
    "src/z.cts",
    "src/z.css",
    "scripts/z.sh",
    "z.md",
    "src/notas.md",
    "datos.csv",
    "Dockerfile",
    "Dockerfile.dev",
    "src/Dockerfile.prueba",
    ".env",
    ".env.local",
    "config/z.env",
    "src/z.vue",
    "src/sin-extension",
    ".github/workflows/z.yml",
  ]) {
    assert.equal(hallazgosEn(ruta, TERMINO), 1, ruta);
  }
});

test("prisma/seed: el SQL es dato (se excluye), el código no", () => {
  assert.equal(hallazgosEn("prisma/seed/z.sql", TERMINO), 0);
  assert.equal(hallazgosEn("prisma/seed/sub/z.sql", TERMINO), 0);
  assert.equal(hallazgosEn("prisma/seed/z.ts", TERMINO), 1);
  assert.equal(hallazgosEn("prisma/seed/z.json", TERMINO), 1);
  assert.equal(hallazgosEn("prisma/seeds/z.sql", TERMINO), 1, "solo la ruta exacta prisma/seed/");
  assert.equal(hallazgosEn("prisma/z.sql", TERMINO), 1);
});

test("exclusiones exactas de siempre: docs, CLAUDE.md, SPEC.md, el archivo de términos y el lockfile", () => {
  assert.equal(hallazgosEn("docs/a/b/z.md", TERMINO), 0);
  assert.equal(hallazgosEn("CLAUDE.md", TERMINO), 0);
  assert.equal(hallazgosEn("SPEC.md", TERMINO), 0);
  assert.equal(hallazgosEn("package-lock.json", TERMINO), 0);
  // Solo en esa ruta: el mismo nombre en otro lugar se escanea.
  assert.equal(hallazgosEn("src/CLAUDE.md", TERMINO), 1);
  assert.equal(hallazgosEn("src/docs/z.md", TERMINO), 1);
  assert.equal(hallazgosEn("src/package-lock.json", TERMINO), 1);
});

test("los archivos binarios no se escanean (imágenes, .DS_Store)", () => {
  const binario = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00]), Buffer.from(TERMINO)]);
  assert.equal(hallazgosEn("src/z.png", binario), 0);
  assert.equal(hallazgosEn("src/z.png", Buffer.from(TERMINO)), 1, "el mismo contenido sin bytes nulos sí es texto");
});

test("EA-16: un archivo de código con un byte nulo NO se salta: se reporta y se escanea completo", () => {
  const nulo = "\0";
  const detalle = (ruta: string, contenido: string): string[] => {
    const raiz = repoTemporal({ [ruta]: contenido });
    try {
      return escanear(raiz, TERMINOS).hallazgos.map((h) => h.termino);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  };
  // Node ejecuta un .ts con NUL en un comentario: la guarda no puede tratarlo como imagen.
  assert.deepEqual(detalle("src/z.ts", `// ${nulo}\nexport const x = 1;\n`), [BYTE_NULO]);
  assert.deepEqual(detalle("src/z.ts", `// ${nulo}\nconst nombre = "${UNO}";\n`), [BYTE_NULO, UNO], "y además se escanea: el término escondido tras el NUL aparece");
  for (const ruta of ["src/z.mts", "src/z.js", "src/z.json", "src/z.md", "src/z.sh", "Dockerfile", "Dockerfile.prod", "src/.env", "src/z.sql"]) {
    assert.deepEqual(detalle(ruta, `${nulo}\n`), [BYTE_NULO], ruta);
  }
  // Lo que de verdad es binario sigue sin escanearse.
  assert.deepEqual(detalle("src/z.png", `${nulo}${UNO}`), []);
  assert.deepEqual(detalle("src/.DS_Store", `${nulo}${UNO}`), []);
  assert.deepEqual(detalle("src/z.bin", `${nulo}${UNO}`), []);
});

test("el comando sale con 1 al sembrar el término en un archivo `.mts`", () => {
  const raiz = repoTemporal({ "src/sembrado.mts": `export const x = "${UNO}";\n` });
  try {
    const r = spawnSync(process.execPath, [SCRIPT, "--raiz", raiz], { encoding: "utf8" });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /src\/sembrado\.mts:1/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
