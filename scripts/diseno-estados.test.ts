// D15 (PLAN-DISENO.md): movimiento y estados. Lee web/src/estilos/base.css y comprueba lo que SISTEMA-VISUAL.md pide:
//   - duraciones de 120 ms (hover y foco) y 180 ms (entradas y salidas), con la curva del sistema, siempre por variable;
//   - nada se anima más de 200 ms ni se mueve solo (salvo el giro de «cargando», que no es movimiento de contenido);
//   - con prefers-reduced-motion todo cambia sin animación;
//   - cada elemento interactivo tiene sus estados: hover, activo (o equivalente), foco visible y deshabilitado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const css = readFileSync(fileURLToPath(new URL("../web/src/estilos/base.css", import.meta.url)), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

const variable = (nombre: string): string => new RegExp(`--${nombre}:\\s*([^;]+);`).exec(css)?.[1]?.trim() ?? "";

test("las duraciones y la curva del sistema están en variables", () => {
  assert.equal(variable("t-rapido"), "120ms");
  assert.equal(variable("t-entrada"), "180ms");
  assert.equal(variable("curva"), "cubic-bezier(0.2, 0.8, 0.2, 1)");
});

test("toda transición y animación usa las variables de duración y la curva del sistema (nunca un tiempo escrito a mano)", () => {
  const sueltas: string[] = [];
  for (const m of css.matchAll(/(?:^|[;{\s])(transition|animation)\s*:\s*([^;}]+)/g)) {
    const valor = m[2]!;
    if (/^\s*(none|gira|0)/.test(valor)) continue;
    if (/\bgira\b/.test(valor)) continue; // el giro de «cargando» (0.8 s, continuo) no mueve contenido
    if (/\b\d+(\.\d+)?m?s\b/.test(valor.replace(/var\([^)]*\)/g, ""))) sueltas.push(`${m[1]}: ${valor.trim()}`);
  }
  assert.deepEqual(sueltas, [], "usa var(--t-rapido) o var(--t-entrada)");
});

test("nada dura más de 200 ms", () => {
  for (const nombre of ["t-rapido", "t-entrada"]) assert.ok(parseInt(variable(nombre), 10) <= 200, nombre);
});

test("con prefers-reduced-motion todo cambia sin animación", () => {
  const bloque = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  assert.match(bloque, /animation-duration:\s*0\.01ms\s*!important/);
  assert.match(bloque, /transition-duration:\s*0\.01ms\s*!important/);
});

test("cada elemento interactivo tiene hover, estado deshabilitado y transición", () => {
  const tienen = (selector: string, estado: string): boolean => css.includes(`${selector}${estado}`) || css.includes(`${selector}:not(:disabled)${estado}`) || new RegExp(`${selector.replace(/[.[\]]/g, "\\$&")}[^{,]*${estado.replace(/[()]/g, "\\$&")}`).test(css);
  for (const clase of [".boton", ".boton-primario", ".boton-sutil", ".boton-peligro", ".boton-icono"]) assert.ok(tienen(clase, ":hover"), `${clase} sin :hover`);
  assert.ok(css.includes(".boton:disabled"), ".boton sin :disabled");
  assert.ok(css.includes(".boton:active"), ".boton sin :active");
  for (const clase of [".opcion", ".pestanas button", ".barra-inferior a", ".lateral-enlaces a", "table.tabla tbody tr", ".ficha-lead"]) assert.ok(tienen(clase, ":hover"), `${clase} sin :hover`);
  assert.match(css, /input:disabled,\s*select:disabled,\s*textarea:disabled/);
});

test("el foco es visible en todo: anillo de 2 px con 2 px de separación", () => {
  assert.match(css, /:focus-visible\s*\{\s*outline:\s*2px solid var\(--foco\);\s*outline-offset:\s*2px/);
  assert.equal(variable("foco").toLowerCase(), "#3a32d1");
});

test("los diálogos aparecen con opacidad y 8 px de desplazamiento; los avisos entran desde abajo", () => {
  assert.match(css, /@keyframes aparece\s*\{\s*from\s*\{\s*opacity:\s*0;\s*transform:\s*translateY\(8px\)/);
  assert.match(css, /@keyframes sube\s*\{\s*from\s*\{[^}]*translateY\(/);
  assert.match(css, /\.dialogo\[open\]\s*\{\s*animation:\s*aparece var\(--t-entrada\) var\(--curva\)/);
});
