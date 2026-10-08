import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { campoSensibleEn, escanearSensibles, sinComentarios } from "./check-sensibles.ts";

const SCRIPT = fileURLToPath(new URL("./check-sensibles.ts", import.meta.url));
const REPO = fileURLToPath(new URL("..", import.meta.url));

function hallazgos(archivos: Record<string, string>): string[] {
  const raiz = mkdtempSync(join(tmpdir(), "check-sensibles-"));
  try {
    for (const [ruta, contenido] of Object.entries(archivos)) {
      mkdirSync(join(raiz, ruta, ".."), { recursive: true });
      writeFileSync(join(raiz, ruta), contenido);
    }
    // Una línea puede violar dos reglas a la vez (en una llamada vigilada y fuera de src/sensibles): cuenta una vez.
    return [...new Set(escanearSensibles(raiz).hallazgos.map((h) => `${h.archivo}:${h.linea}`))];
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

test("el repositorio real no viola la guarda", () => {
  const r = escanearSensibles(REPO);
  assert.deepEqual(r.hallazgos, []);
  assert.ok(r.archivos > 30);
});

test("un campo de salud dentro de log.info / log.warn / log.error falla (una línea y varias líneas, camelCase y snake_case)", () => {
  assert.deepEqual(hallazgos({ "src/x/a.ts": `log.info("evento", { alergias: ficha.valor });` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `log.warn("evento", { condicionesMedicas: x });` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/sensibles/a.ts": `log.error("evento", {\n  ok: true,\n  medicamentos,\n});` }), ["src/sensibles/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `log.info("e", { dato: ficha["contacto_emergencia"] });` }), ["src/x/a.ts:1"]);
});

test("un campo de salud en el texto de un mensaje, una nota o una tarea falla", () => {
  assert.deepEqual(hallazgos({ "src/x/a.ts": "await provider.encolar(db, { texto: `Alergias: ${f.alergias}` });" }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `await t.enviarNotaInterna(destino, "Medicamentos: " + medicamentos);` }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": "await asegurarTareaAsesor(db, { descripcion: `Ver ${p.alergia}` });" }), ["src/x/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/x/a.ts": `resumenParaAsesor(tx, id, motivo, condiciones_medicas);` }), ["src/x/a.ts:1"]);
});

test("nombrar un campo de salud en las capas que redactan para el contacto o el asesor falla, aunque no esté en una llamada", () => {
  assert.deepEqual(hallazgos({ "src/captacion/resumen.ts": `const x = prospecto.alergias;` }), ["src/captacion/resumen.ts:1"]);
  assert.deepEqual(hallazgos({ "src/mensajeria/a.ts": `const campos = ["contacto_emergencia"];` }), ["src/mensajeria/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/automatizaciones/a.ts": `const v = { autorizacionAtencionMedica: true };` }), ["src/automatizaciones/a.ts:1"]);
});

test("donde sí se pueden nombrar: src/sensibles, la ruta de salud, tests y comentarios (pero ahí tampoco en un log)", () => {
  assert.deepEqual(hallazgos({ "src/sensibles/c.ts": `export const X = ["alergias"];`, "src/api/rutas/salud.ts": `const e = { medicamentos: 1 };` }), []);
  assert.deepEqual(hallazgos({ "src/captacion/a.itest.ts": `const s = { alergias: "CENTINELA" };` }), []);
  assert.deepEqual(hallazgos({ "src/captacion/a.ts": `// nunca mostrar las alergias\n/* ni los medicamentos */\nconst ok = 1;` }), []);
  // Control: en un lugar permitido, dentro de un log, SIGUE fallando.
  assert.deepEqual(hallazgos({ "src/sensibles/c.ts": `log.info("x", { alergias: 1 });` }), ["src/sensibles/c.ts:1"]);
  assert.deepEqual(hallazgos({ "src/api/rutas/salud.ts": `log.info("x", { medicamentos: 1 });` }), ["src/api/rutas/salud.ts:1"]);
});

test("un log y un mensaje sin campos sensibles pasan; un identificador parecido pero distinto no confunde", () => {
  assert.deepEqual(hallazgos({ "src/captacion/a.ts": `log.info("ok", { sucursal: "Norte", edad: 7 });\nawait p.encolar(db, { texto: "Hola" });` }), []);
});

test("sinComentarios conserva las líneas y no toca el texto dentro de cadenas", () => {
  assert.equal(sinComentarios("a // x\nb /* y\nz */ c"), "a \nb \n c");
  assert.equal(sinComentarios(`const u = "http://x.com/a"; // c`), `const u = "http://x.com/a"; `);
  assert.equal(campoSensibleEn("const informacionGeneral = 1"), null);
  assert.equal(campoSensibleEn("x.condicionesMedicas"), "condicionesMedicas");
});

test("el comando sale con 1 si hay violaciones y con 0 si no", () => {
  const raiz = mkdtempSync(join(tmpdir(), "check-sensibles-"));
  try {
    mkdirSync(join(raiz, "src", "x"), { recursive: true });
    writeFileSync(join(raiz, "src", "x", "a.ts"), `log.info("x", { alergias });`);
    assert.equal(spawnSync(process.execPath, [SCRIPT, "--raiz", raiz], { encoding: "utf8" }).status, 1);
    writeFileSync(join(raiz, "src", "x", "a.ts"), `log.info("x", { ok: 1 });`);
    assert.equal(spawnSync(process.execPath, [SCRIPT, "--raiz", raiz], { encoding: "utf8" }).status, 0);
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
});
