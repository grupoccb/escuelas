import { test } from "node:test";
import assert from "node:assert/strict";
import { ROLES } from "../auth/roles.ts";
import { PERMISOS_ACORDADOS as ACORDADO } from "../testutil/permisos-acordados.ts";
import { MATRIZ_DE_PERMISOS, PERMISOS, permisosDe, tienePermiso } from "./permisos.ts";

test("la matriz de permisos es exactamente la acordada (cambiarla exige cambiar este test)", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(MATRIZ_DE_PERMISOS)), ACORDADO);
});

test("todo permiso tiene al menos un rol, solo roles válidos, y el administrador los tiene todos", () => {
  for (const p of PERMISOS) {
    const roles = MATRIZ_DE_PERMISOS[p] as readonly string[];
    assert.ok(roles.length > 0, p);
    assert.ok(roles.every((r) => (ROLES as readonly string[]).includes(r)), p);
    assert.ok(tienePermiso("administrador", p), p);
  }
});

test("la salud de menores solo la leen y escriben el administrador y el maestro; recepción y asesor nunca", () => {
  for (const p of ["salud:leer", "salud:escribir"] as const) {
    assert.deepEqual([...MATRIZ_DE_PERMISOS[p]], ["administrador", "maestro"]);
    assert.equal(tienePermiso("recepcion", p), false);
    assert.equal(tienePermiso("asesor", p), false);
  }
});

test("permisosDe(rol) coincide con tienePermiso para cada permiso", () => {
  for (const rol of ROLES) {
    assert.deepEqual(permisosDe(rol), PERMISOS.filter((p) => tienePermiso(rol, p)));
  }
  assert.deepEqual(permisosDe("maestro"), ["grupos:leer", "catalogo:leer", "salud:leer", "salud:escribir"]);
});
