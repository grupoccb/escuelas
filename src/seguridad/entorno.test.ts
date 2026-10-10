import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { CLAVE_DE_DEMO_PUBLICADA, esEntornoDeDemo, impedimentosParaArrancar, revisarEntorno } from "./entorno.ts";

const buena = (): NodeJS.ProcessEnv => ({
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://inscripciones_app:" + randomBytes(16).toString("hex") + "@bd.interna:5432/inscripciones?sslmode=require",
  CLAVE_DATOS_SENSIBLES: randomBytes(32).toString("base64"),
  ORIGEN_PUBLICO: "https://app.escuela.example",
  PUBLIC_BASE_URL: "https://app.escuela.example",
  COOKIE_SEGURA: "true",
  TRUST_PROXY: "1",
  CHATWOOT_WEBHOOK_SECRETO: randomBytes(32).toString("hex"),
  METRICAS_TOKEN: randomBytes(32).toString("hex"),
  TWILIO_AUTH_TOKEN: randomBytes(16).toString("hex"),
});

const codigos = (env: NodeJS.ProcessEnv): string[] => revisarEntorno(env).map((h) => h.codigo);

test("una configuración de producción correcta no tiene hallazgos", () => {
  assert.deepEqual(revisarEntorno(buena()), []);
  assert.deepEqual(impedimentosParaArrancar(buena()), []);
});

test("fuera de producción no se revisa nada (desarrollo y pruebas usan valores de desarrollo)", () => {
  assert.deepEqual(revisarEntorno({ NODE_ENV: "development", CLAVE_DATOS_SENSIBLES: CLAVE_DE_DEMO_PUBLICADA, COOKIE_SEGURA: "false" }), []);
  assert.deepEqual(revisarEntorno({}), []);
});

test("la clave de la demo, publicada en el repositorio, impide arrancar en producción", () => {
  assert.ok(codigos({ ...buena(), CLAVE_DATOS_SENSIBLES: CLAVE_DE_DEMO_PUBLICADA }).includes("clave_datos_de_demo"));
  const { CLAVE_DATOS_SENSIBLES: _quitada, ...sinClave } = buena();
  assert.ok(codigos(sinClave).includes("clave_datos_ausente"));
});

test("cualquier variable con un valor de demostración (config/demo-local.env, SECRET_KEY_BASE de ejemplo) impide arrancar y dice cuáles", () => {
  const env = { ...buena(), CHATWOOT_BOT_TOKEN: "demo-local-token-bot-0001", CHATWOOT_ADMIN_PASSWORD: "Demo-local-2026!" };
  const h = revisarEntorno(env).find((x) => x.codigo === "valores_de_demo")!;
  assert.ok(h.grave);
  assert.match(h.mensaje, /CHATWOOT_ADMIN_PASSWORD, CHATWOOT_BOT_TOKEN/);
  assert.ok(!h.mensaje.includes("Demo-local-2026!") && !h.mensaje.includes("0001"), "el mensaje nombra la variable, nunca su valor");
});

test("la base con el usuario y la contraseña de la demo, la cookie sin Secure y un origen sin https impiden arrancar", () => {
  assert.ok(codigos({ ...buena(), DATABASE_URL: "postgresql://inscripciones:inscripciones@postgres:5432/inscripciones" }).includes("base_de_demo"));
  assert.ok(codigos({ ...buena(), COOKIE_SEGURA: "false" }).includes("cookie_sin_secure"));
  assert.ok(codigos({ ...buena(), ORIGEN_PUBLICO: "http://localhost:3000" }).includes("origen_sin_https"));
  const { ORIGEN_PUBLICO: _o, ...sinOrigen } = buena();
  assert.ok(codigos(sinOrigen).includes("origen_ausente"));
  assert.ok(codigos({ ...buena(), DATABASE_URL: "no es una url" }).includes("base_ilegible"));
});

test("los secretos cortos impiden arrancar; sin TRUST_PROXY o con usuario «postgres» solo es un aviso", () => {
  assert.ok(codigos({ ...buena(), CHATWOOT_WEBHOOK_SECRETO: "corto" }).includes("secreto_corto"));
  assert.ok(codigos({ ...buena(), METRICAS_TOKEN: "x".repeat(23) }).includes("secreto_corto"));
  const { TRUST_PROXY: _t, ...sinProxy } = buena();
  const h = revisarEntorno(sinProxy);
  assert.deepEqual(h.map((x) => [x.codigo, x.grave]), [["trust_proxy", false]]);
  assert.deepEqual(impedimentosParaArrancar(sinProxy), []);
  assert.deepEqual(revisarEntorno({ ...buena(), DATABASE_URL: "postgresql://postgres:" + randomBytes(8).toString("hex") + "@bd:5432/x" }).map((x) => [x.codigo, x.grave]), [["base_superusuario", false]]);
});

test("ENTORNO_DEMO=si deja arrancar la demo local (que corre con NODE_ENV=production) pero solo con esa marca exacta", () => {
  const demo = { ...buena(), CLAVE_DATOS_SENSIBLES: CLAVE_DE_DEMO_PUBLICADA, COOKIE_SEGURA: "false", ORIGEN_PUBLICO: "http://localhost:3000" };
  assert.ok(impedimentosParaArrancar(demo).length >= 3);
  assert.deepEqual(impedimentosParaArrancar({ ...demo, ENTORNO_DEMO: "si" }), []);
  assert.equal(esEntornoDeDemo({ ENTORNO_DEMO: "SI" }), true);
  for (const v of ["", "no", "true", "1", "sí "]) assert.ok(impedimentosParaArrancar({ ...demo, ENTORNO_DEMO: v }).length > 0, `«${v}» no es la marca`);
});

test("V9: el ensayo local (ENSAYO_LOCAL=si, sin el bloqueo de Twilio) impide arrancar en una instalación real", () => {
  const conEnsayo = { ...buena(), ENSAYO_LOCAL: "si" };
  assert.ok(codigos(conEnsayo).includes("ensayo_en_produccion"));
  assert.ok(impedimentosParaArrancar(conEnsayo).some((h) => h.codigo === "ensayo_en_produccion"));
  const conPrefijo = { ...buena(), ENSAYO_TWILIO_BLOQUEO_PREFIJO: "apagado-" };
  assert.ok(impedimentosParaArrancar(conPrefijo).some((h) => h.codigo === "ensayo_sin_bloqueo_en_produccion"));
  // «SI» o con espacios también cuenta; «no» no.
  assert.ok(codigos({ ...buena(), ENSAYO_LOCAL: " SI " }).includes("ensayo_en_produccion"));
  assert.ok(!codigos({ ...buena(), ENSAYO_LOCAL: "no" }).includes("ensayo_en_produccion"));
});

test("V9: la demo local declarada (ENTORNO_DEMO=si) sí puede ensayar: es la máquina de quien prueba", () => {
  assert.deepEqual(impedimentosParaArrancar({ ...buena(), ENSAYO_LOCAL: "si", ENTORNO_DEMO: "si" }), []);
});
