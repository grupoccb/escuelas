import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { revisarCodigo, revisarCss, revisarRaiz } from "./check-estilo.ts";

const reglas = (h: { regla: string }[]): string[] => h.map((x) => x.regla);

test("código: un estilo en línea, un color o una fuente son hallazgos", () => {
  assert.deepEqual(reglas(revisarCodigo("a.tsx", '<p style={{ color: "red" }}>x</p>')), ["estilo-en-linea"]);
  assert.deepEqual(reglas(revisarCodigo("a.tsx", 'const c = "#3A32D1";')), ["color-fuera-de-variables"]);
  assert.deepEqual(reglas(revisarCodigo("a.tsx", 'const c = "rgb(1 2 3)";')), ["color-fuera-de-variables"]);
  assert.deepEqual(reglas(revisarCodigo("a.tsx", 'const f = { fontFamily: "serif" };')), ["fuente-fuera-de-variables"]);
});

test("código: un ancla («#contenido»), los comentarios y las clases pasan", () => {
  assert.deepEqual(revisarCodigo("a.tsx", '<a href="#add">Saltar</a>\n// color: #fff en un comentario\n<p className="muted">x</p>'), []);
});

test("código: la excepción documentada pasa solo en su archivo", () => {
  const linea = 'e["color_marca"] = "Escribe un color como #1F5FBF";';
  assert.deepEqual(revisarCodigo("web/src/pantallas/admin/Verticales.tsx", linea), []);
  assert.equal(revisarCodigo("web/src/otro.tsx", linea).length, 1);
});

test("css: los colores y las familias de letra solo viven en :root y @font-face", () => {
  const css = `:root { --a: #fff; --f: "Figtree", sans-serif; --s: 0 1px 2px rgb(0 0 0 / 10%); }
@font-face { font-family: "Figtree"; src: url(/f.woff2); }
.x { color: var(--a); background: transparent; border: 1px solid var(--a); font: inherit; font-family: var(--f); }`;
  assert.deepEqual(revisarCss("base.css", css), []);
});

test("css: un color, un nombre de color o una familia fuera de las variables son hallazgos", () => {
  const css = `:root { --a: #fff; }
.x { color: #123456; }
.y { background: rgb(1 2 3); }
.z { border: 1px solid black; }
.w { font-family: Georgia, serif; }
.v { font: 16px serif; }`;
  assert.deepEqual(reglas(revisarCss("base.css", css)), ["color-fuera-de-variables", "color-fuera-de-variables", "color-fuera-de-variables", "fuente-fuera-de-variables", "fuente-fuera-de-variables"]);
});

test("css: los números de línea son los del archivo aunque haya comentarios y :root antes", () => {
  const css = `/* uno\n dos */\n:root {\n --a: #fff;\n}\n.x { color: #000; }`;
  assert.equal(revisarCss("base.css", css)[0]?.linea, 6);
});

test("la raíz del repositorio de verdad pasa limpia", () => {
  const raiz = mkdtempSync(join(tmpdir(), "estilo-"));
  mkdirSync(join(raiz, "web/src/estilos"), { recursive: true });
  writeFileSync(join(raiz, "web/src/estilos/base.css"), ":root { --a: #fff; }\n.x { color: var(--a); }\n");
  writeFileSync(join(raiz, "web/src/a.tsx"), "export const A = () => <p className=\"x\">hola</p>;\n");
  assert.deepEqual(revisarRaiz(raiz), []);
  writeFileSync(join(raiz, "web/src/b.tsx"), 'export const B = () => <p style={{ margin: 0 }}>hola</p>;\n');
  assert.equal(revisarRaiz(raiz).length, 1);
});
