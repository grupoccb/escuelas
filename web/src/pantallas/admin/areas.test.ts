import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { coincide } from "../../lib/texto.ts";
import { areasDelMenu, filtrarAreas, GRUPOS_DE_ADMINISTRACION } from "./areas.ts";

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

test("el menú de áreas del patrón de catálogo trae solo las que lo usan, por permisos y sin grupos vacíos", () => {
  const todas = areasDelMenu(GRUPOS_DE_ADMINISTRACION, todo);
  assert.deepEqual(todas.map((g) => g.titulo), ["Catálogo", "Canales y organización", "Mensajería y usuarios"]);
  const rutas = todas.flatMap((g) => g.areas.map((a) => a.ruta));
  for (const r of ["/admin/verticales", "/admin/sucursales", "/admin/programas", "/admin/grupos", "/admin/instructores", "/admin/etapas", "/admin/motivos", "/admin/canales", "/admin/campanas", "/admin/promociones", "/admin/plantillas", "/admin/usuarios"]) assert.ok(rutas.includes(r), r);
  for (const r of ["/admin/catalogo", "/admin/precios", "/admin/modulos", "/admin/configuracion", "/admin/textos", "/admin/automatizaciones", "/admin/bandeja"]) assert.ok(!rutas.includes(r), `${r} no usa el patrón`);
  assert.deepEqual(areasDelMenu(GRUPOS_DE_ADMINISTRACION, () => false), []);
  // Con solo el permiso de usuarios, el menú trae únicamente «Usuarios y roles» (y su grupo); los demás grupos no salen vacíos.
  const soloUsuarios = areasDelMenu(GRUPOS_DE_ADMINISTRACION, (p) => p === "usuarios:administrar");
  assert.deepEqual(soloUsuarios.map((g) => g.titulo), ["Mensajería y usuarios"]);
  assert.deepEqual(soloUsuarios.flatMap((g) => g.areas.map((a) => a.ruta)), ["/admin/usuarios"]);
});
