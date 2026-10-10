import { test } from "node:test";
import assert from "node:assert/strict";
import { apagarEnEnv, fusionarEnv } from "./env-archivo.ts";

test("reemplaza la línea de la clave y deja todo lo demás igual", () => {
  const antes = "# comentario\nTWILIO_AUTH_TOKEN=secreto-que-no-se-toca\nORIGEN_PUBLICO=https://viejo.example.test\nOTRA=1\n";
  const despues = fusionarEnv(antes, { ORIGEN_PUBLICO: "https://nuevo.example.test" });
  assert.equal(despues, "# comentario\nTWILIO_AUTH_TOKEN=secreto-que-no-se-toca\nORIGEN_PUBLICO=https://nuevo.example.test\nOTRA=1\n");
});

test("si no existe la agrega al final con su salto de línea; una línea comentada no cuenta como existente", () => {
  assert.equal(fusionarEnv("A=1\n", { ORIGEN_PUBLICO: "https://a.example.test" }), "A=1\nORIGEN_PUBLICO=https://a.example.test\n");
  assert.equal(fusionarEnv("A=1", { ORIGEN_PUBLICO: "https://a.example.test" }), "A=1\nORIGEN_PUBLICO=https://a.example.test\n");
  assert.equal(fusionarEnv("# ORIGEN_PUBLICO=https://ejemplo\n", { ORIGEN_PUBLICO: "https://a.example.test" }), "# ORIGEN_PUBLICO=https://ejemplo\nORIGEN_PUBLICO=https://a.example.test\n");
});

test("es idempotente y rechaza nombres o valores que romperían el archivo", () => {
  const una = fusionarEnv("A=1\n", { ORIGEN_PUBLICO: "https://a.example.test" });
  assert.equal(fusionarEnv(una, { ORIGEN_PUBLICO: "https://a.example.test" }), una);
  assert.throws(() => fusionarEnv("", { ORIGEN_PUBLICO: "https://a\nTWILIO_AUTH_TOKEN=x" }));
  assert.throws(() => fusionarEnv("", { "mala clave": "x" }));
});

test("apagar comenta las líneas activas (el valor se conserva) y no toca las demás ni las que ya estaban comentadas", () => {
  assert.equal(apagarEnEnv("A=1\nENSAYO_LOCAL=si\n# ORIGEN_PUBLICO=x\nORIGEN_PUBLICO=https://a\n", ["ENSAYO_LOCAL", "ORIGEN_PUBLICO"]), "A=1\n# ENSAYO_LOCAL=si\n# ORIGEN_PUBLICO=x\n# ORIGEN_PUBLICO=https://a\n");
  const una = apagarEnEnv("ENSAYO_LOCAL=si\n", ["ENSAYO_LOCAL"]);
  assert.equal(apagarEnEnv(una, ["ENSAYO_LOCAL"]), una, "idempotente");
});

// ── V13-fix EV-39: `export` y las claves repetidas ──────────────────────────────────────────────────────────

test("EV-39: apagar también comenta las líneas con «export » (antes quedaba ENSAYO_LOCAL=si activo)", () => {
  const r = apagarEnEnv("A=1\nexport ENSAYO_LOCAL=si\n  export   ORIGEN_PUBLICO=https://a\nexport OTRA=2\n", ["ENSAYO_LOCAL", "ORIGEN_PUBLICO"]);
  assert.equal(r, "A=1\n# export ENSAYO_LOCAL=si\n# export   ORIGEN_PUBLICO=https://a\nexport OTRA=2\n");
  assert.ok(!/^\s*(export\s+)?ENSAYO_LOCAL=/m.test(r), "ninguna línea activa de ENSAYO_LOCAL");
});

test("EV-39: fusionar deja UNA sola línea activa por clave: reemplaza la primera, conserva su «export» y comenta las repetidas de más abajo (antes ganaba el valor viejo)", () => {
  const antes = "A=1\nORIGEN_PUBLICO=https://viejo.example.test\nB=2\nORIGEN_PUBLICO=https://otro.example.test\n";
  const despues = fusionarEnv(antes, { ORIGEN_PUBLICO: "https://nuevo.example.test" });
  const activas = despues.split("\n").filter((l) => /^\s*(export\s+)?ORIGEN_PUBLICO\s*=/.test(l));
  assert.deepEqual(activas, ["ORIGEN_PUBLICO=https://nuevo.example.test"]);
  assert.match(despues, /# \(repetida, la reemplaza la de arriba\) ORIGEN_PUBLICO=https:\/\/otro\.example\.test/);
  assert.match(despues, /^A=1\n/);
  assert.match(despues, /\nB=2\n/);
  assert.equal(fusionarEnv("export ORIGEN_PUBLICO=https://v.example.test\n", { ORIGEN_PUBLICO: "https://n.example.test" }), "export ORIGEN_PUBLICO=https://n.example.test\n");
  // Idempotente con repetidas.
  assert.equal(fusionarEnv(despues, { ORIGEN_PUBLICO: "https://nuevo.example.test" }), despues);
});
