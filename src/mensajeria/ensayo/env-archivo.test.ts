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
