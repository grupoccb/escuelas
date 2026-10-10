// Los comandos del ensayo (`ensayo:preparar`, `ensayo:diagnostico`) como se corren de verdad: un proceso, sus variables, su código de salida y su salida de texto. Contra
// la base de pruebas y el Twilio falso local; sin Chatwoot ni red real. Lo que más importa: nunca imprimen el token completo y nunca escriben fuera de `.env`.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearPrismaDePruebas, type PrismaPruebas } from "../../testutil/prisma-pruebas.ts";
import { sembrarOrganizacion } from "../../testutil/semilla.ts";
import { SID_DE_ENSAYO, TOKEN_DE_ENSAYO } from "../../testutil/ensayo.ts";
import { TwilioFalso } from "../../testutil/twilio-falso.ts";

const RAIZ = new URL("../../../", import.meta.url).pathname;
const PREPARAR = join(RAIZ, "scripts/ensayo-preparar.ts");
const DIAGNOSTICO = join(RAIZ, "scripts/ensayo-diagnostico.ts");
const ENTRANTE = join(RAIZ, "scripts/ensayo-entrante.ts");

let prisma: PrismaPruebas;
before(() => {
  prisma = crearPrismaDePruebas();
});
after(async () => {
  await prisma.$disconnect();
});

const baseEnv = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  PATH: process.env["PATH"] ?? "",
  HOME: process.env["HOME"] ?? "",
  DATABASE_URL: process.env["DATABASE_URL"] ?? "",
  CHATWOOT_URL_HOST: "http://127.0.0.1:9",
  CHATWOOT_ADMIN_TOKEN: "token-admin-del-ensayo",
  CHATWOOT_CUENTA: "Demo local",
  CHATWOOT_BOT_NOMBRE: "Bot",
  CHATWOOT_WEBHOOK_SECRETO: "secreto",
  ...extra,
});

function correr(script: string, args: string[], env: NodeJS.ProcessEnv, cwd = RAIZ) {
  const r = spawnSync(process.execPath, [script, ...args], { env, cwd, encoding: "utf8", timeout: 30_000 });
  return { codigo: r.status, salida: `${r.stdout}${r.stderr}` };
}

test("--simulado: sale 0, no toca la base ni nada fuera de este equipo, y muestra el token enmascarado", async () => {
  const org = await sembrarOrganizacion(prisma, "CLI simulado");
  const antes = await prisma.canal_whatsapp.findFirstOrThrow({ where: { id: org.canalId } });
  const r = correr(PREPARAR, ["--simulado"], baseEnv({ TWILIO_AUTH_TOKEN: TOKEN_DE_ENSAYO, TWILIO_ACCOUNT_SID: SID_DE_ENSAYO }));
  assert.equal(r.codigo, 0, r.salida);
  assert.match(r.salida, /SIMULADO/);
  assert.match(r.salida, /When a message comes in:\s+https:\/\/ensayo-simulado\.example\.test\/webhooks\/twilio\/entrantes/);
  assert.ok(!r.salida.includes(TOKEN_DE_ENSAYO), "el token no sale completo");
  assert.match(r.salida, new RegExp(`\\*\\*\\*\\*${TOKEN_DE_ENSAYO.slice(-4)}`));
  const despues = await prisma.canal_whatsapp.findFirstOrThrow({ where: { id: org.canalId } });
  assert.equal(despues.numero_whatsapp, antes.numero_whatsapp, "en seco: la base no cambió");
});

test("sin variables: sale 1 y dice cada faltante en español; con un token mal escrito no lo repite", () => {
  const r = correr(PREPARAR, [], baseEnv());
  assert.equal(r.codigo, 1);
  assert.match(r.salida, /Falta TWILIO_AUTH_TOKEN/);
  assert.match(r.salida, /Falta ORIGEN_PUBLICO/);
  const mal = correr(PREPARAR, [], baseEnv({ ENSAYO_LOCAL: "si", TWILIO_ACCOUNT_SID: SID_DE_ENSAYO, TWILIO_AUTH_TOKEN: "token con espacios que es secreto", TWILIO_WHATSAPP_NUMERO: "+14155238886", ORIGEN_PUBLICO: "https://a.example.test", ENSAYO_TWILIO_BLOQUEO_PREFIJO: "apagado-" }));
  assert.equal(mal.codigo, 1);
  assert.ok(!mal.salida.includes("que es secreto"));
});

test("real contra el Twilio falso: las credenciales pasan y, si Chatwoot no responde, el error no lleva el token", async () => {
  const twilio = new TwilioFalso({ sid: SID_DE_ENSAYO, token: TOKEN_DE_ENSAYO, numero: "whatsapp:+14155238886" });
  const base = await twilio.iniciar();
  try {
    // Chatwoot en un puerto cerrado: falla justo después de validar las credenciales. Asíncrono: el Twilio falso vive en este proceso y tiene que poder contestar.
    const env = baseEnv({ ENSAYO_LOCAL: "si", TWILIO_ACCOUNT_SID: SID_DE_ENSAYO, TWILIO_AUTH_TOKEN: TOKEN_DE_ENSAYO, TWILIO_WHATSAPP_NUMERO: "+14155238886", ORIGEN_PUBLICO: "https://a.example.test", ENSAYO_TWILIO_BLOQUEO_PREFIJO: "apagado-", TWILIO_API_BASE: base });
    const r = await new Promise<{ codigo: number | null; salida: string }>((ok) => {
      execFile(process.execPath, [PREPARAR], { env, cwd: RAIZ, timeout: 30_000 }, (error, stdout, stderr) => ok({ codigo: error ? ((error as { code?: number }).code ?? 1) : 0, salida: `${stdout}${stderr}` }));
    });
    assert.equal(r.codigo, 1);
    assert.ok(!r.salida.includes(TOKEN_DE_ENSAYO));
    assert.ok(twilio.autenticaciones.some((a) => a.ok), "el comando consultó la cuenta del Twilio falso con el SID y el token");
  } finally {
    await twilio.cerrar();
  }
});

test("--url guarda la dirección en .env (solo si git lo ignora), sin tocar el token que ya estaba", () => {
  const dir = mkdtempSync(join(tmpdir(), "ensayo-cli-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  writeFileSync(join(dir, ".gitignore"), ".env\n");
  writeFileSync(join(dir, ".env"), `TWILIO_AUTH_TOKEN=${TOKEN_DE_ENSAYO}\nORIGEN_PUBLICO=https://viejo.example.test\n`);
  const r = correr(PREPARAR, ["--url", "https://nuevo.example.test/", "--sin-docker"], baseEnv({ ENSAYO_LOCAL: "si" }), dir);
  const env = readFileSync(join(dir, ".env"), "utf8");
  assert.equal(env, `TWILIO_AUTH_TOKEN=${TOKEN_DE_ENSAYO}\nORIGEN_PUBLICO=https://nuevo.example.test\n`);
  assert.ok(!r.salida.includes(TOKEN_DE_ENSAYO));
  assert.match(r.salida, /ORIGEN_PUBLICO=https:\/\/nuevo\.example\.test guardado en \.env/);

  // Sin .gitignore que lo ignore, no escribe nada.
  const sinIgnorar = mkdtempSync(join(tmpdir(), "ensayo-cli-"));
  execFileSync("git", ["init", "-q"], { cwd: sinIgnorar });
  writeFileSync(join(sinIgnorar, ".env"), "A=1\n");
  const r2 = correr(PREPARAR, ["--url", "https://nuevo.example.test", "--sin-docker"], baseEnv(), sinIgnorar);
  assert.equal(r2.codigo, 1);
  assert.match(r2.salida, /git no ignora \.env/);
  assert.equal(readFileSync(join(sinIgnorar, ".env"), "utf8"), "A=1\n");

  // Una dirección que no sirve (http, localhost) se rechaza antes de escribir.
  const r3 = correr(PREPARAR, ["--url", "http://localhost:3100", "--sin-docker"], baseEnv(), dir);
  assert.equal(r3.codigo, 1);
  assert.match(r3.salida, /https|localhost/);
  assert.match(readFileSync(join(dir, ".env"), "utf8"), /nuevo\.example\.test/);
});

test("ensayo:diagnostico y ensayo:entrante sin configurar salen 1 y dicen qué falta", () => {
  const d = correr(DIAGNOSTICO, [], baseEnv({ CHATWOOT_URL_HOST: "http://127.0.0.1:9", BACKEND_URL_HOST: "http://127.0.0.1:9" }));
  assert.equal(d.codigo, 1);
  assert.match(d.salida, /✘ Variables de \.env: Falta TWILIO_AUTH_TOKEN/);
  assert.match(d.salida, /✘ Backend: no responde/);
  const e = correr(ENTRANTE, ["--desde", "+5215512345678"], baseEnv());
  assert.equal(e.codigo, 1);
  assert.match(e.salida, /Falta configurar el ensayo/);
  assert.equal(correr(ENTRANTE, [], baseEnv()).codigo, 1);
});
