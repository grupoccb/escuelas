import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { GRUPOS_DE_ADMINISTRACION } from "./areas.ts";
import { pestanasVisibles, PESTANAS_DE_SISTEMA } from "./sistema.ts";

const APP = readFileSync(resolve(import.meta.dirname, "../../app.tsx"), "utf8");
const AREAS = GRUPOS_DE_ADMINISTRACION.flatMap((g) => g.areas);

test("cada pestaña de Sistema es una ruta de la aplicación, con el título y el permiso que tiene en el menú de Administración", () => {
  assert.equal(new Set(PESTANAS_DE_SISTEMA.map((p) => p.ruta)).size, PESTANAS_DE_SISTEMA.length);
  for (const p of PESTANAS_DE_SISTEMA) {
    assert.ok(APP.includes(`path="${p.ruta}"`), `${p.ruta} no está en app.tsx`);
    const area = AREAS.find((a) => a.ruta === p.ruta);
    assert.ok(area, `${p.ruta} no está en el menú de Administración`);
    assert.equal(area.titulo, p.texto);
    assert.equal(area.permiso, p.permiso);
  }
});

test("las pestañas siguen el orden del prototipo y solo salen las que la persona puede abrir", () => {
  assert.deepEqual(PESTANAS_DE_SISTEMA.map((p) => p.texto), ["Módulos", "Configuración", "Automatizaciones", "Textos del asistente", "Bandeja del administrador"]);
  assert.deepEqual(pestanasVisibles(() => true).length, 5);
  assert.deepEqual(pestanasVisibles((p) => p === "registro_cambios:leer").map((p) => p.texto), ["Bandeja del administrador"]);
  assert.deepEqual(pestanasVisibles(() => false), []);
});
