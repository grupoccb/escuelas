import { test } from "node:test";
import assert from "node:assert/strict";
import { CAMPOS_AUDITABLES, esCampoProhibidoEnRegistro, filtrarCampos, soloLoQueCambio } from "./registro.ts";

test("la lista blanca de cada entidad no incluye ningún campo prohibido (contraseñas, tokens, hashes)", () => {
  for (const [entidad, campos] of Object.entries(CAMPOS_AUDITABLES)) {
    for (const c of campos) assert.equal(esCampoProhibidoEnRegistro(c), false, `${entidad}.${c}`);
  }
  for (const malo of ["contrasena", "contrasena_hash", "password", "token_hash", "api_access_token", "secreto", "cookie"]) {
    assert.equal(esCampoProhibidoEnRegistro(malo), true, malo);
  }
});

test("filtrarCampos deja SOLO la lista blanca aunque le pasen la fila completa con la contraseña", () => {
  const fila = { id: "x", correo: "a@b.co", nombre: "Ana", rol: "asesor", activo: true, contrasena_hash: "scrypt$…", contrasena: "secreta-123", sucursales: ["s1"] };
  assert.deepEqual(filtrarCampos("usuario", fila), { nombre: "Ana", rol: "asesor", activo: true, sucursales: ["s1"] });
  assert.equal(filtrarCampos("usuario", null), null);
});

test("las fechas se guardan en ISO y un valor ausente no aparece", () => {
  assert.deepEqual(filtrarCampos("tarea_asesor", { estado: "hecha", resuelta_en: new Date("2026-10-10T12:00:00Z") }), { estado: "hecha", resuelta_en: "2026-10-10T12:00:00.000Z" });
  assert.deepEqual(filtrarCampos("tarea_asesor", { estado: "hecha" }), { estado: "hecha" });
});

test("soloLoQueCambio guarda únicamente los campos distintos (listas incluidas)", () => {
  const r = soloLoQueCambio({ nombre: "Ana", rol: "asesor", sucursales: ["a"] }, { nombre: "Ana", rol: "maestro", sucursales: ["a", "b"] });
  assert.deepEqual(r, { antes: { rol: "asesor", sucursales: ["a"] }, despues: { rol: "maestro", sucursales: ["a", "b"] } });
});
