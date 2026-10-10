// V1: la interfaz y los módulos. La barra no muestra lo de un módulo apagado, nadie aterriza en una pantalla «No disponible» y TODA ruta del cliente declara su módulo.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import type { ModuloId, Modulos, Rol } from "./api/tipos.ts";
import { INICIO_POR_ROL, SECCIONES, inicioDe, seccionesDe } from "./navegacion.ts";

const TODOS: Modulos = { captacion: true, cotizador: true, clase_muestra: true, inscripcion: true, operacion: true, finanzas: true, tableros: true };
const SOLO_CAPTACION: Modulos = { captacion: true, cotizador: false, clase_muestra: false, inscripcion: false, operacion: false, finanzas: false, tableros: false };
const apagado = (...ms: ModuloId[]): Modulos => ({ ...TODOS, ...Object.fromEntries(ms.map((m) => [m, false])) });

/** Los permisos de un rol con todos los módulos encendidos (los de las secciones). */
const PERMISOS_DE_TODO = SECCIONES.map((s) => s.permiso);

test("con todo encendido la barra muestra todas las secciones del usuario; sin permiso no se muestra aunque el módulo esté encendido", () => {
  assert.equal(seccionesDe(PERMISOS_DE_TODO, TODOS).length, SECCIONES.length);
  assert.deepEqual(seccionesDe(["leads:escribir"], TODOS).map((s) => s.id), ["embudo"]);
});

// Una tabla de casos: por módulo apagado, qué secciones desaparecen (y solo esas).
const DESAPARECE: [ModuloId, string[]][] = [
  ["clase_muestra", ["hoy"]],
  ["operacion", ["pase"]],
  ["finanzas", ["pagos", "cuenta", "uniformes", "ventas", "corte"]],
  ["tableros", ["tableros"]],
  ["inscripcion", ["alumnos", "familias"]],
  ["cotizador", []],
];
for (const [modulo, ids] of DESAPARECE) {
  test(`${modulo} apagado: la barra no muestra ${ids.length > 0 ? ids.join(", ") : "ninguna sección propia"} y deja las demás`, () => {
    const vistas = seccionesDe(PERMISOS_DE_TODO, apagado(modulo)).map((s) => s.id);
    for (const id of ids) assert.ok(!vistas.includes(id), id);
    assert.equal(vistas.length, SECCIONES.length - ids.length);
  });
}

test("solo la captación: la barra se queda con el embudo, las tareas y la administración", () => {
  assert.deepEqual(seccionesDe(PERMISOS_DE_TODO, SOLO_CAPTACION).map((s) => s.id), ["embudo", "tareas", "admin"]);
});

test("cada sección declara su módulo y la captación es el de las que no se apagan", () => {
  for (const s of SECCIONES) assert.ok(["captacion", "cotizador", "clase_muestra", "inscripcion", "operacion", "finanzas", "tableros"].includes(s.modulo), s.id);
});

test("nadie aterriza en una pantalla «No disponible»: el inicio es la sección preferida del rol si está, o la primera que sí tenga, o «Más»", () => {
  const permisosDe = (rol: Rol): string[] => (rol === "maestro" ? ["clases_muestra:leer", "asistencia:registrar", "alumnos:leer"] : rol === "recepcion" ? ["pagos:registrar", "estado_cuenta:leer", "tutores:leer"] : PERMISOS_DE_TODO);
  assert.equal(inicioDe("maestro", permisosDe("maestro"), TODOS), INICIO_POR_ROL.maestro);
  assert.equal(inicioDe("maestro", permisosDe("maestro"), apagado("clase_muestra", "tableros")), "/pase", "sin clase muestra, el maestro entra al pase de lista");
  assert.equal(inicioDe("maestro", permisosDe("maestro"), apagado("clase_muestra", "operacion", "tableros")), "/alumnos");
  assert.equal(inicioDe("maestro", ["clases_muestra:leer"], SOLO_CAPTACION), "/mas", "sin nada disponible: «Más»");
  assert.equal(inicioDe("recepcion", permisosDe("recepcion"), apagado("finanzas", "tableros")), "/familias");
  assert.equal(inicioDe("recepcion", ["pagos:registrar"], SOLO_CAPTACION), "/mas");
  assert.equal(inicioDe("asesor", PERMISOS_DE_TODO, SOLO_CAPTACION), "/embudo");
});

// ── Las rutas del cliente ─────────────────────────────────────────────────────────────────────────────

const APP = readFileSync(resolve(import.meta.dirname, "app.tsx"), "utf8");
const RUTAS = [...APP.matchAll(/<Route path="([^"]+)" element=\{<RequierePermiso permiso="([^"]+)"( modulo="([^"]+)")?>/g)].map((m) => ({ ruta: m[1]!, permiso: m[2]!, modulo: m[4] ?? null }));

test("TODA ruta del cliente protegida declara su módulo (una pantalla nueva sin módulo hace fallar este test)", () => {
  assert.ok(RUTAS.length >= 30);
  assert.deepEqual(RUTAS.filter((r) => r.modulo === null).map((r) => r.ruta), []);
  const solas = [...APP.matchAll(/<Route path="([^"]+)" element=\{<(?!RequierePermiso)/g)].map((m) => m[1]);
  assert.deepEqual(solas.sort(), ["*", "/", "/mas"], "las únicas rutas sin RequierePermiso son la raíz, «Más» y la de no encontrada");
});

test("la ruta de cada sección de la barra tiene el MISMO módulo que la sección", () => {
  for (const s of SECCIONES) {
    const r = RUTAS.find((x) => x.ruta === s.ruta);
    assert.ok(r, s.ruta);
    assert.equal(r.modulo, s.modulo, s.ruta);
  }
});

test("las rutas de un módulo apagado: de alumnos y familias a inscripción, pagos a finanzas, pase a operación, hoy y registro a clase muestra, tableros a tableros", () => {
  const de = (ruta: string) => RUTAS.find((r) => r.ruta === ruta)?.modulo;
  assert.equal(de("/leads/:id/convertir"), "inscripcion");
  assert.equal(de("/alumnos/:id"), "inscripcion");
  assert.equal(de("/alumnos/:id/salud"), "inscripcion");
  assert.equal(de("/familias/:tutorId"), "inscripcion");
  assert.equal(de("/cuenta/:tutorId"), "finanzas");
  assert.equal(de("/clases/:id/registro"), "clase_muestra");
  assert.equal(de("/leads/:id"), "captacion");
  assert.equal(de("/admin/modulos"), "captacion", "la pantalla de módulos nunca se apaga");
  assert.equal(de("/admin/usuarios"), "captacion");
});
