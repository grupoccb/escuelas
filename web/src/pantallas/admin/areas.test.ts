import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { coincide } from "../../lib/texto.ts";
import { filtrarAreas, GRUPOS_DE_ADMINISTRACION } from "./areas.ts";

const APP = readFileSync(resolve(import.meta.dirname, "../../app.tsx"), "utf8");
const RUTAS = new Set([...APP.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]));
const TODAS = GRUPOS_DE_ADMINISTRACION.flatMap((g) => g.areas);
const todo = () => true;

test("cada pantalla del menú de Administración existe como ruta, ninguna se repite y todas dicen para qué sirven", () => {
  assert.ok(TODAS.length >= 19);
  assert.equal(new Set(TODAS.map((a) => a.ruta)).size, TODAS.length);
  for (const a of TODAS) {
    assert.ok(RUTAS.has(a.ruta), `${a.titulo}: ${a.ruta} no está en app.tsx`);
    assert.ok(a.ayuda.length > 15 && a.titulo.length > 3, a.ruta);
  }
});

test("el buscador encuentra por título, por lo que hace y por otras formas de pedirlo, sin importar acentos", () => {
  const rutas = (b: string): string[] => filtrarAreas(GRUPOS_DE_ADMINISTRACION, b, todo, coincide).flatMap((g) => g.areas.map((a) => a.ruta));
  assert.ok(rutas("PRECIO").includes("/admin/precios"), "por título, sin importar mayúsculas");
  assert.ok(!rutas("PRECIO").includes("/admin/usuarios"));
  assert.ok(rutas("contraseña").includes("/admin/usuarios"), "«contraseña» lleva a Usuarios");
  assert.ok(rutas("contrasena").includes("/admin/usuarios"), "sin acento también");
  assert.ok(rutas("excel").includes("/admin/catalogo"));
  assert.ok(rutas("qr").includes("/admin/campanas"));
  assert.ok(rutas("horario").includes("/admin/grupos") && rutas("horario").includes("/admin/configuracion"));
  assert.equal(rutas("zzzz").length, 0);
  assert.equal(rutas("").length, TODAS.length, "sin escribir nada salen todas");
});

test("el buscador solo muestra lo que el rol puede administrar y no deja grupos vacíos", () => {
  const soloUsuarios = filtrarAreas(GRUPOS_DE_ADMINISTRACION, "", (p) => p === "usuarios:administrar", coincide);
  assert.deepEqual(soloUsuarios.map((g) => g.titulo), ["Mensajería y usuarios"]);
  assert.deepEqual(soloUsuarios[0]!.areas.map((a) => a.ruta), ["/admin/usuarios"]);
  assert.deepEqual(filtrarAreas(GRUPOS_DE_ADMINISTRACION, "", () => false, coincide), []);
});
