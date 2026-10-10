import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { revisarSecretos } from "./check-secretos.ts";

function repo(archivos: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "secretos-"));
  for (const [ruta, contenido] of Object.entries(archivos)) {
    mkdirSync(dirname(join(dir, ruta)), { recursive: true });
    writeFileSync(join(dir, ruta), contenido);
  }
  return dir;
}
const aleatorio = "a9F3kQ7zL2mX8vB1nC5pR4tY6wE0uH";

test("el repositorio real no tiene secretos", () => {
  assert.deepEqual(revisarSecretos(), []);
});

test("detecta llaves de proveedores aunque estén en un test o en un documento", () => {
  const casos: [string, string][] = [
    ["-----BEGIN RSA " + "PRIVATE KEY-----", "llave privada"],
    ["const k = 'AKI" + "AABCDEFGHIJKLMNOP'", "llave de acceso de AWS"],
    [`sid = AC${"0123456789abcdef".repeat(2)}`, "SID de cuenta de Twilio"],
    [`SK${"0123456789abcdef".repeat(2)}`, "API key de Twilio"],
    [`TWILIO_AUTH_TOKEN=${"0123456789abcdef".repeat(2)}`, "auth token de Twilio"],
    ["gh" + "p_" + "A".repeat(36), "token de GitHub"],
    ["xo" + "xb-1234567890-abcdefghij", "token de Slack"],
    ["sk_" + "live_" + "a1B2c3D4e5F6g7H8i9", "llave de Stripe en vivo"],
    ["ey" + "JhbGciOiJIUzI1NiJ9AAAA.ey" + "JzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop", "JWT"],
  ];
  for (const [texto, que] of casos) {
    const dir = repo({ "docs/nota.md": texto, "src/a.test.ts": texto });
    const h = revisarSecretos(dir);
    assert.ok(h.some((x) => x.que === que && x.archivo === "docs/nota.md"), `${que} en docs`);
    assert.ok(h.some((x) => x.que === que && x.archivo === "src/a.test.ts"), `${que} en un test`);
  }
});

test("un valor largo asignado a un secreto en un archivo de configuración es un hallazgo; el de la demo, por excepción exacta, no", () => {
  const dir = repo({ "config/produccion.yml": `  DATABASE_PASSWORD: ${aleatorio}\n`, "config/demo-local.env": `CHATWOOT_ADMIN_TOKEN=${aleatorio}\n`, "otro/.env": `TWILIO_AUTH_TOKEN=${aleatorio}\n` });
  const h = revisarSecretos(dir);
  assert.ok(h.some((x) => x.archivo === "config/produccion.yml" && /DATABASE_PASSWORD/.test(x.que)));
  assert.ok(h.some((x) => x.archivo === "otro/.env" && x.que === "archivo .env real versionado"));
  assert.ok(!h.some((x) => x.archivo === "config/demo-local.env"));
});

test("las referencias (variables, Secrets Manager, generadores) y los comentarios no son hallazgos", () => {
  const dir = repo({
    "infra/x.tf": `  password = random_password.base.result\n  secret_string = "\${var.valor_largo_largo_largo_largo}"\n  # TOKEN = ${aleatorio}\n`,
    ".env.example": `# TWILIO_AUTH_TOKEN=${aleatorio}\nDATABASE_URL=postgresql://u:p@localhost/db\n`,
  });
  assert.deepEqual(revisarSecretos(dir), []);
});

test("V9: el .gitignore tiene que ignorar «.env» (ahí viven los secretos del ensayo); un token de Twilio con otra forma o en un comentario de ejemplo sin valor no es hallazgo", () => {
  assert.deepEqual(revisarSecretos(repo({ ".gitignore": "node_modules/\n.env\n.env.*\n" })), []);
  const h = revisarSecretos(repo({ ".gitignore": "node_modules/\n.env.*\n" }));
  assert.ok(h.some((x) => x.archivo === ".gitignore" && /no ignora/.test(x.que)));
  // La guía del ensayo puede mostrar la variable sin valor o con uno de ejemplo que no es un token.
  assert.deepEqual(revisarSecretos(repo({ "docs/guia.md": "TWILIO_AUTH_TOKEN=tu_token_aqui\nTWILIO_AUTH_TOKEN=\n" })), []);
});
