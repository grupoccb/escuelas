import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { escanearDinero } from "./check-dinero.ts";

const SCRIPT = fileURLToPath(new URL("./check-dinero.ts", import.meta.url));
const REPO = fileURLToPath(new URL("..", import.meta.url));

function hallazgos(archivos: Record<string, string>): string[] {
  const raiz = mkdtempSync(join(tmpdir(), "check-dinero-"));
  try {
    for (const [ruta, contenido] of Object.entries(archivos)) {
      mkdirSync(join(raiz, ruta, ".."), { recursive: true });
      writeFileSync(join(raiz, ruta), contenido);
    }
    return escanearDinero(raiz).hallazgos.map((h) => `${h.archivo}:${h.linea}`);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

test("el repositorio real no usa punto flotante con dinero", () => {
  const r = escanearDinero(REPO);
  assert.deepEqual(r.hallazgos, []);
  assert.ok(r.archivos > 30);
});

test("parseFloat y .toNumber() fallan en cualquier archivo, con cualquier nombre", () => {
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const n = parseFloat(texto);` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const n = Number.parseFloat(texto);` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const n = fila.valor.toNumber();` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const n = fila.valor\n  .toNumber();` }), ["src/x/a.ts:2"], "también partido en dos líneas");
});

test("Number(), parseInt, toFixed y Math.round sobre una línea de dinero fallan; sobre otras cosas no", () => {
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const t = Number(fila.precio);` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const c = Math.round(monto * 100);` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const c = Math.floor(descuento / 3);` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const s = saldo.toFixed(2);` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const n = parseInt(costoInscripcion, 10);` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `const port = Number(process.env["PORT"]);\nconst pagina = Math.floor(total / limite);` }), [], "no es dinero");
  assert.deepEqual(hallazgos({ "src/x/a.ts": `// Number(precio) estaba mal\nconst ok = 1;` }), [], "los comentarios no cuentan");
});

test("en una zona de dinero cualquier llamada a flotantes falla, sin mirar los nombres", () => {
  assert.deepEqual(hallazgos({ "src/promociones/a.ts": `const x = Number(fila.v);` }), ["src/promociones/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/cotizador/a.ts": `const x = Math.round(a * 3);` }), ["src/cotizador/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/catalogo/precios.ts": `const x = Number(fila.v);` }), ["src/catalogo/precios.ts:1"]);
  assert.deepEqual(hallazgos({ "src/otra/a.ts": `const x = Number(fila.v);` }), []);
});

test("src/lib/dinero.ts puede usar toFixed (lee un Decimal por su texto) pero no parseFloat", () => {
  assert.deepEqual(hallazgos({ "src/lib/dinero.ts": `return deTexto(d.toFixed(2));` }), []);
  assert.deepEqual(hallazgos({ "src/lib/dinero.ts": `return parseFloat(x);` }), ["src/lib/dinero.ts:1"]);
  assert.deepEqual(hallazgos({ "src/otro/dinero.ts": `return deTexto(d.toFixed(2));\nconst centavos = d.toFixed(2);` }), ["src/otro/dinero.ts:2"], "fuera de src/lib/dinero.ts, toFixed junto a una palabra de dinero falla");
});

test("los tests, generated y testutil no se revisan", () => {
  assert.deepEqual(hallazgos({ "src/x/a.test.ts": `parseFloat("1.5")`, "src/testutil/a.ts": `parseFloat("1.5")`, "src/generated/a.ts": `parseFloat("1.5")` }), []);
});

test("el script sale con código 1 si hay violaciones y 0 si no", () => {
  const raiz = mkdtempSync(join(tmpdir(), "check-dinero-bin-"));
  try {
    mkdirSync(join(raiz, "src"), { recursive: true });
    writeFileSync(join(raiz, "src", "a.ts"), "export const ok = 1;\n");
    assert.equal(spawnSync(process.execPath, [SCRIPT, "--raiz", raiz]).status, 0);
    writeFileSync(join(raiz, "src", "a.ts"), "export const n = parseFloat('1.5');\n");
    const r = spawnSync(process.execPath, [SCRIPT, "--raiz", raiz], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /a\.ts:1/);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
