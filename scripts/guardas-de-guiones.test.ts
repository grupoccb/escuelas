// V13-fix EV-09 / EV-37: los guiones que escriben en la base (`demo:vivo`, `demo:datos`, `catalogo:importar --aplicar`) se niegan ANTES de conectarse cuando el entorno es de producción
// (en cualquier forma de escribirlo) o la base no es local, aunque se les dé la bandera de confirmación. Se corren de verdad como procesos: lo que se comprueba es el cableado.
// (Que la organización sea la de la demo y la confirmación del nombre de la base se prueban en `scripts/lib/demo-todo.test.ts`.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
/** Una base que de existir fallaría al conectar: si el guion llegara a conectarse, el resultado sería distinto de «se niega». */
const BASE_LOCAL = "postgresql://inscripciones:inscripciones@localhost:1/inscripciones";
const BASE_REMOTA = "postgresql://inscripciones:inscripciones@127.0.0.2:5543/inscripciones";

function correr(guion: string, args: string[], env: Record<string, string>) {
  const limpio = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(NODE_ENV|DATABASE_URL|ENTORNO_DEMO)$/.test(k)));
  const r = spawnSync(process.execPath, [guion, ...args], { cwd: RAIZ, env: { ...limpio, ...env } as NodeJS.ProcessEnv, encoding: "utf8", timeout: 30_000 });
  return { codigo: r.status, salida: `${r.stdout}${r.stderr}` };
}

for (const [guion, args] of [
  ["scripts/demo-vivo.ts", ["--confirmar-base-de-demo"]],
  ["scripts/demo-datos.ts", ["--confirmar-base-de-demo"]],
] as const) {
  test(`${guion}: con NODE_ENV=production (también «Production» o un valor raro) se niega aunque lleve la bandera, sin conectarse`, () => {
    for (const modo of ["production", "Production", "prod"]) {
      const r = correr(guion, [...args], { NODE_ENV: modo, DATABASE_URL: BASE_LOCAL });
      assert.equal(r.codigo, 2, `${modo}: ${r.salida}`);
      assert.match(r.salida, /se niega.*NODE_ENV=/s, modo);
    }
  });
  test(`${guion}: con una base que no es local se niega aunque lleve la bandera (la repro de la auditoría: 127.0.0.2)`, () => {
    const r = correr(guion, [...args], { NODE_ENV: "development", DATABASE_URL: BASE_REMOTA });
    assert.equal(r.codigo, 2, r.salida);
    assert.match(r.salida, /no es local/);
    const ambas = correr(guion, [...args], { NODE_ENV: "production", DATABASE_URL: BASE_REMOTA });
    assert.equal(ambas.codigo, 2);
    assert.match(ambas.salida, /NODE_ENV=production/);
    assert.match(ambas.salida, /no es local/);
  });
}

test("catalogo:importar --aplicar: se niega con producción o una base que no es local, y sin --confirmar-base; la simulación (sin --aplicar) no se ve afectada por estas guardas", () => {
  const base = ["--organizacion", "x", "--carpeta", "/no/existe", "--aplicar", "--administrador", "a@b.test"];
  const prod = correr("scripts/catalogo-importar.ts", [...base, "--confirmar-base", "inscripciones"], { NODE_ENV: "Production", DATABASE_URL: BASE_LOCAL });
  assert.equal(prod.codigo, 2, prod.salida);
  assert.match(prod.salida, /NODE_ENV=Production/);
  const remota = correr("scripts/catalogo-importar.ts", [...base, "--confirmar-base", "inscripciones"], { NODE_ENV: "development", DATABASE_URL: BASE_REMOTA });
  assert.equal(remota.codigo, 2, remota.salida);
  assert.match(remota.salida, /no es local/);
  const sinConfirmar = correr("scripts/catalogo-importar.ts", base, { NODE_ENV: "development", DATABASE_URL: BASE_LOCAL });
  assert.equal(sinConfirmar.codigo, 2, sinConfirmar.salida);
  assert.match(sinConfirmar.salida, /--confirmar-base inscripciones/);
  const mal = correr("scripts/catalogo-importar.ts", [...base, "--confirmar-base", "otra"], { NODE_ENV: "development", DATABASE_URL: BASE_LOCAL });
  assert.equal(mal.codigo, 2, mal.salida);
  // Con todo en regla pasa las guardas (y falla después por otra cosa: aquí, no hay base ni carpeta): no es el «se niega».
  const bien = correr("scripts/catalogo-importar.ts", [...base, "--confirmar-base", "inscripciones"], { NODE_ENV: "development", DATABASE_URL: BASE_LOCAL });
  assert.ok(!/se niega/.test(bien.salida), bien.salida);
  // La simulación nunca escribe: no pide confirmación (falla después por la carpeta/base inexistentes).
  const simula = correr("scripts/catalogo-importar.ts", ["--organizacion", "x", "--carpeta", "/no/existe"], { NODE_ENV: "development", DATABASE_URL: BASE_LOCAL });
  assert.ok(!/se niega/.test(simula.salida), simula.salida);
});
