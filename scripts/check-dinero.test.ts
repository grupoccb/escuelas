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

test("EF-09: la inscripción y la conversión mueven dinero: también son zonas estrictas", () => {
  assert.deepEqual(hallazgos({ "src/inscripciones/a.ts": `const x = Number(fila.v);` }), ["src/inscripciones/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/conversion/a.ts": `const x = Number(fila.v);` }), ["src/conversion/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/inscripciones/a.ts": `const d = importe * 0.15;` }), ["src/inscripciones/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/familias/a.ts": `const x = Number(fila.v);` }), [], "fuera de las zonas y sin palabras de dinero, no se mira (límite documentado)");
});

test("EG-11: eventos (la cuota) y el expediente (las mensualidades) también son zonas estrictas", () => {
  for (const ruta of ["src/eventos/a.ts", "src/expediente/a.ts", "src/api/rutas/eventos.ts", "src/api/rutas/expediente.ts"]) {
    assert.deepEqual(hallazgos({ [ruta]: `const x = Number(fila.v);` }), [`${ruta}:1`], ruta);
    assert.deepEqual(hallazgos({ [ruta]: `const d = importe * 0.15;` }), [`${ruta}:1`], ruta);
  }
  assert.deepEqual(hallazgos({ "src/api/rutas/niveles.ts": `const x = Number(fila.v);` }), [], "fuera de las zonas y sin palabras de dinero, no se mira (límite documentado)");
});

test("en una zona de dinero cualquier llamada a flotantes falla, sin mirar los nombres", () => {
  assert.deepEqual(hallazgos({ "src/promociones/a.ts": `const x = Number(fila.v);` }), ["src/promociones/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/cotizador/a.ts": `const x = Math.round(a * 3);` }), ["src/cotizador/a.ts:1"]);
  assert.deepEqual(hallazgos({ "src/catalogo/precios.ts": `const x = Number(fila.v);` }), ["src/catalogo/precios.ts:1"]);
  assert.deepEqual(hallazgos({ "src/otra/a.ts": `const x = Number(fila.v);` }), []);
});

test("EC-06: lo que esquivaba la guarda ahora falla (llamada partida, corchetes, alias, unario, literal decimal, ×1, ~~, globalThis, Math.fround)", () => {
  // Una línea puede incumplir varias reglas a la vez (Math["round"]): aquí importa en qué líneas falla.
  const z = (codigo: string, ruta = "src/promociones/a.ts") => [...new Set(hallazgos({ [ruta]: codigo }))];
  assert.deepEqual(z(`const n = x.toNumber\n  ();`), ["src/promociones/a.ts:1"], ".toNumber con el paréntesis en otra línea");
  assert.deepEqual(z(`const n = x\n  .\n  toNumber\n  ();`), ["src/promociones/a.ts:2"]);
  assert.deepEqual(z(`const n = parseFloat\n  (t);`, "src/x/a.ts"), ["src/x/a.ts:1"], "parseFloat con el paréntesis en otra línea, en cualquier archivo");
  assert.deepEqual(z(`const n = x["toNumber"]();`, "src/x/a.ts"), ["src/x/a.ts:1"], "x[\"toNumber\"] en cualquier archivo");
  assert.deepEqual(z("const n = x[`toFixed`](2);", "src/x/a.ts"), ["src/x/a.ts:1"]);
  assert.deepEqual(z(`const r = Math["round"](x);`), ["src/promociones/a.ts:1"]);
  assert.deepEqual(z(`const r = Math.fround(x);`), ["src/promociones/a.ts:1"]);
  assert.deepEqual(z(`const f = parseFloat;\nconst g = [1].map(Number);`), ["src/promociones/a.ts:1", "src/promociones/a.ts:2"], "alias sin llamar");
  assert.deepEqual(z(`const f = parseFloat;`, "src/x/a.ts"), [], "fuera de dinero, un alias sin palabra de dinero no se persigue");
  assert.deepEqual(z(`const f = Number; // precio`, "src/x/a.ts"), [], "los comentarios no cuentan");
  assert.deepEqual(z(`const precios = lista.map(Number);`, "src/x/a.ts"), ["src/x/a.ts:1"], "en una línea de dinero sí");
  assert.deepEqual(z(`const d = +precio * 3;`), ["src/promociones/a.ts:1"], "+x unario");
  assert.deepEqual(z(`return +x;`), ["src/promociones/a.ts:1"]);
  assert.deepEqual(z(`const d = importe * 0.15;`), ["src/promociones/a.ts:1"], "multiplicar por un decimal");
  assert.deepEqual(z(`const d = importe / 1.16;`), ["src/promociones/a.ts:1"]);
  assert.deepEqual(z(`const d = 0.5 * importe;`), ["src/promociones/a.ts:1"]);
  assert.deepEqual(z(`const d = texto * 1;`), ["src/promociones/a.ts:1"], "× 1 para convertir");
  assert.deepEqual(z(`const d = ~~x;`), ["src/promociones/a.ts:1"]);
  assert.deepEqual(z(`const n = globalThis["Number"](x);`), ["src/promociones/a.ts:1"], "globalThis");
  assert.deepEqual(z(`const g = globalThis;`), ["src/promociones/a.ts:1"], "globalThis solo (sin corchetes ni llamada)");
  assert.deepEqual(z(`const r = Math[nombre](x);`), ["src/promociones/a.ts:1"], "Math[nombre]: el acceso por corchetes con una variable");
  assert.deepEqual(z(`const d = importe * 1e3;`), ["src/promociones/a.ts:1"], "un literal con exponente es un flotante");
});

test("EC-06: lo que NO es flotante sigue pasando en una zona de dinero (suma, ++, bigint, separadores, expresiones regulares)", () => {
  const z = (codigo: string) => hallazgos({ "src/promociones/a.ts": codigo });
  assert.deepEqual(z(`const t = a + b + c;\nlet i = 0; i++; const j = i + 1;\nconst k = (a + b) * 2n;`), []);
  assert.deepEqual(z(`const c = importe * 100n + 5n;\nconst d = total / 10_000n;\nconst e = x * 1n;\nconst f = y / 100;`), []);
  assert.deepEqual(z(`const re = /^\\d+\\.\\d+$/;\nconst ok = re.test(texto);`), []);
  assert.deepEqual(z(`const s = a +\n  b;\nconst t = \`\${a}+\${b}\`;\nconst u = "x" +\n  "y";`), []);
  assert.deepEqual(z(`if (Number.isInteger(n) && n > 0) { const ok = Math.max(0, n - 1) + Math.min(3, n); }`), [], "Number.isInteger, Math.max y Math.min no bajan un importe");
  // Fuera de una zona de dinero la aritmética de flotantes sin llamadas es un límite conocido (la cabecera lo dice).
  assert.deepEqual(hallazgos({ "src/otro/a.ts": `const d = +x * 0.15;` }), []);
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

test("J1: la interfaz (web/src) también: recepción, conversión y su formateador de dinero son zonas estrictas", () => {
  assert.deepEqual(hallazgos({ "web/src/pantallas/recepcion/a.tsx": `const x = Number(fila.v);` }), ["web/src/pantallas/recepcion/a.tsx:1"]);
  assert.deepEqual(hallazgos({ "web/src/pantallas/conversion/a.tsx": `const x = parseFloat(t);` }), ["web/src/pantallas/conversion/a.tsx:1"]);
  assert.deepEqual(hallazgos({ "web/src/pantallas/recepcion/a.tsx": `const d = importe * 0.15;` }), ["web/src/pantallas/recepcion/a.tsx:1"]);
  assert.deepEqual(hallazgos({ "web/src/lib/dinero.ts": `return Number(texto);` }), ["web/src/lib/dinero.ts:1"]);
  assert.deepEqual(hallazgos({ "web/src/lib/dinero.ts": `return d.toFixed(2);` }), ["web/src/lib/dinero.ts:1"], "en la interfaz ni siquiera dinero.ts usa toFixed");
  // Fuera de esas zonas, solo las líneas con palabra de dinero.
  assert.deepEqual(hallazgos({ "web/src/pantallas/asesor/a.tsx": `const n = Number(params.pagina);` }), []);
  assert.deepEqual(hallazgos({ "web/src/pantallas/asesor/a.tsx": `const n = Number(cotizacion.precio);` }), ["web/src/pantallas/asesor/a.tsx:1"]);
  assert.deepEqual(hallazgos({ "web/src/pantallas/asesor/a.tsx": `const n = parseFloat(x);` }), ["web/src/pantallas/asesor/a.tsx:1"]);
  assert.deepEqual(hallazgos({ "web/src/pantallas/recepcion/a.test.ts": `Number("1")` }), []);
});

test("UI-06: el expediente, la ficha de la familia y las cotizaciones del asesor (saldos y precios) son zonas estrictas; el resto de familia/ no", () => {
  for (const f of ["familia/Expediente.tsx", "familia/FichaFamilia.tsx", "asesor/Cotizaciones.tsx"]) {
    assert.deepEqual(hallazgos({ [`web/src/pantallas/${f}`]: `const x = Number(t.valor);` }), [`web/src/pantallas/${f}:1`], f);
  }
  assert.deepEqual(hallazgos({ "web/src/pantallas/familia/vista.ts": `const años = Math.floor(a.meses / 12);` }), [], "la edad en años no es dinero");
});
