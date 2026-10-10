import { test } from "node:test";
import assert from "node:assert/strict";
import { clasesDeCss, cotejar, rutasDeApp, rutasDeFila, type FilaDeInventario } from "./diseno-inventario.ts";

const fila = (id: string, extra: Partial<FilaDeInventario> = {}): FilaDeInventario => ({ id, rol: "asesor", grupo: "g", titulo: "t", tipo: "pantalla", ...extra });
const base = { rutasDelEnrutador: [], archivosConFlotantes: [], clasesDeBaseCss: [], clasesObservadas: [], clasesExcluidas: [] };

test("rutasDeApp lee las rutas del enrutador", () => {
  assert.deepEqual(rutasDeApp('<Route path="/" element={a} />\n<Route path="/leads/:id" element={b} />\n<Route path="*" />'), ["/", "/leads/:id", "*"]);
});

test("rutasDeFila separa varias rutas por espacio, coma o punto y coma", () => {
  assert.deepEqual(rutasDeFila({ ruta: "/pagos, /cuenta; /corte" }), ["/pagos", "/cuenta", "/corte"]);
  assert.deepEqual(rutasDeFila({}), []);
});

test("clasesDeCss toma las clases de los selectores, también dentro de @media, y no las de comentarios", () => {
  const css = "/* .comentada */ .a, .b:hover { x: 1 } @media (min-width: 900px) { .lateral a.activa { y: 2 } } @keyframes gira { to { z: 3 } } a[aria-current] { w: 4 }";
  assert.deepEqual(clasesDeCss(css), ["a", "activa", "b", "lateral"]);
});

test("una ruta sin fila, un flotante sin fila y una clase sin ver son hallazgos", () => {
  const h = cotejar({
    ...base,
    filas: [fila("uno", { ruta: "/uno", fuentes: ["web/src/x.tsx"] })],
    rutasDelEnrutador: ["/uno", "/dos"],
    archivosConFlotantes: ["web/src/x.tsx", "web/src/y.tsx"],
    clasesDeBaseCss: ["vista", "oculta", "excluida"],
    clasesObservadas: ["vista"],
    clasesExcluidas: ["excluida"],
  });
  assert.deepEqual(h.map((x) => x.regla).sort(), ["clase-sin-fila", "flotante-sin-fila", "ruta-sin-fila"]);
  assert.match(h.find((x) => x.regla === "ruta-sin-fila")!.detalle, /\/dos/);
  assert.match(h.find((x) => x.regla === "clase-sin-fila")!.detalle, /\.oculta/);
});

test("ids repetidos o mal formados son hallazgos", () => {
  const h = cotejar({ ...base, filas: [fila("a-b"), fila("a-b"), fila("Mal Id")] });
  assert.deepEqual(h.map((x) => x.regla).sort(), ["id-invalido", "id-repetido"]);
});

test("sin hallazgos cuando todo está cubierto", () => {
  assert.deepEqual(cotejar({ ...base, filas: [fila("a", { ruta: "/ /a" })], rutasDelEnrutador: ["/", "/a"] }), []);
});
