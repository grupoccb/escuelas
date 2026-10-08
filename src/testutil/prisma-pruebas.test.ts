// EA-17: los tests de integración se niegan a correr contra una base que no sea de pruebas.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { crearPrismaDePruebas, exigirBaseDePruebas, nombreDeBase } from "./prisma-pruebas.ts";

test("nombreDeBase lee la base de la URL", () => {
  assert.equal(nombreDeBase("postgresql://u:p@localhost:5432/inscripciones_pruebas"), "inscripciones_pruebas");
  assert.equal(nombreDeBase("postgresql://u:p@localhost:5432/inscripciones_pruebas?schema=public"), "inscripciones_pruebas");
  assert.equal(nombreDeBase("postgresql://u:p@localhost:5432/"), null);
  assert.equal(nombreDeBase("esto no es una url"), null);
});

test("solo acepta bases cuyo nombre termina en _pruebas o _test", () => {
  assert.equal(exigirBaseDePruebas("postgresql://u:p@h:5432/inscripciones_pruebas"), "postgresql://u:p@h:5432/inscripciones_pruebas");
  assert.doesNotThrow(() => exigirBaseDePruebas("postgresql://u:p@h:5432/aud_test"));
  for (const url of [
    "postgresql://u:p@h:5432/inscripciones", // la base de la demo
    "postgresql://u:p@h:5432/inscripciones_pruebas_viejas",
    "postgresql://u:p@h:5432/pruebas", // sin guion bajo: no es el sufijo
    "postgresql://u:p@h:5432/",
    "no es una url",
  ]) {
    assert.throws(() => exigirBaseDePruebas(url), /terminar en _pruebas o _test/, url);
  }
  assert.throws(() => exigirBaseDePruebas(undefined), /Falta DATABASE_URL/);
});

test("crearPrismaDePruebas rechaza la base de la demo antes de conectarse", () => {
  assert.throws(() => crearPrismaDePruebas("postgresql://inscripciones:inscripciones@localhost:5432/inscripciones"), /inscripciones.*terminar en _pruebas o _test/);
});

test("un itest corrido contra la base de la demo falla de inmediato y dice por qué", () => {
  // Sin NODE_TEST_CONTEXT: si no, el corredor hijo cree que es parte de este y no imprime nada.
  const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: "postgresql://inscripciones:inscripciones@localhost:5432/inscripciones" };
  delete env["NODE_TEST_CONTEXT"];
  const r = spawnSync(process.execPath, ["--test", "src/datos/alcance.itest.ts"], { encoding: "utf8", env });
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /terminar en _pruebas o _test/);
});
