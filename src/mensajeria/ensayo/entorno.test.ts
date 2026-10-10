import { test } from "node:test";
import assert from "node:assert/strict";
import { enmascararSecreto, leerEntornoEnsayo, sinSecretos, urlsDeEnsayo, validarOrigenPublico, SIMULADO } from "./entorno.ts";

const SID = `AC${"a1".repeat(16)}`;
const TOKEN = "f3e2d1c0b9a8f7e6d5c4b3a291807f6e";
const completo = (): NodeJS.ProcessEnv => ({
  ENSAYO_LOCAL: "si",
  TWILIO_ACCOUNT_SID: SID,
  TWILIO_AUTH_TOKEN: TOKEN,
  TWILIO_WHATSAPP_NUMERO: "+1 415 523 8886",
  ORIGEN_PUBLICO: "https://palabras-al-azar.trycloudflare.com/",
  ENSAYO_TWILIO_BLOQUEO_PREFIJO: "apagado-",
  CHATWOOT_URL_HOST: "http://localhost:3001",
  CHATWOOT_ADMIN_TOKEN: "t-admin",
  CHATWOOT_CUENTA: "Demo local",
  CHATWOOT_BOT_NOMBRE: "Bot",
  CHATWOOT_WEBHOOK_SECRETO: "s",
});

test("con todo puesto: queda listo, el número en la forma canónica y la URL sin barra final", () => {
  const { entorno, problemas } = leerEntornoEnsayo(completo());
  assert.deepEqual(problemas, []);
  assert.equal(entorno!.twilio.numero, "whatsapp:+14155238886");
  assert.equal(entorno!.origen, "https://palabras-al-azar.trycloudflare.com");
});

test("sin nada: cada faltante dice qué es y dónde conseguirlo, en español", () => {
  const { entorno, problemas } = leerEntornoEnsayo({});
  assert.equal(entorno, null);
  const texto = problemas.join("\n");
  for (const esperado of ["ENSAYO_LOCAL=si", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_NUMERO", "ORIGEN_PUBLICO", "consola de Twilio", "CHATWOOT_ADMIN_TOKEN", "ENSAYO_TWILIO_BLOQUEO_PREFIJO"]) {
    assert.ok(texto.includes(esperado), esperado);
  }
});

test("valores mal escritos: el SID, el token con espacios, el número y la URL (http, localhost, puerto, ruta)", () => {
  const mal = (cambio: NodeJS.ProcessEnv): string => leerEntornoEnsayo({ ...completo(), ...cambio }).problemas.join("\n");
  assert.match(mal({ TWILIO_ACCOUNT_SID: "ACcorto" }), /TWILIO_ACCOUNT_SID no tiene la forma/);
  assert.match(mal({ TWILIO_AUTH_TOKEN: "con espacios y todo" }), /TWILIO_AUTH_TOKEN no parece un token/);
  assert.match(mal({ TWILIO_WHATSAPP_NUMERO: "hola" }), /TWILIO_WHATSAPP_NUMERO no es un número válido/);
  assert.match(mal({ ORIGEN_PUBLICO: "http://algo.trycloudflare.com" }), /https/);
  assert.match(mal({ ORIGEN_PUBLICO: "https://localhost" }), /localhost/);
  assert.match(mal({ ORIGEN_PUBLICO: "https://algo.example.test:8443" }), /puerto/);
  assert.match(mal({ ORIGEN_PUBLICO: "https://algo.example.test/webhooks" }), /sin ruta/);
});

test("el token nunca aparece completo en lo que se muestra", () => {
  assert.equal(enmascararSecreto(TOKEN), "****7f6e");
  assert.equal(enmascararSecreto("corto"), "****");
  assert.equal(enmascararSecreto(undefined), "(vacío)");
  assert.ok(!sinSecretos(`falló con ${TOKEN} adentro`, [TOKEN]).includes(TOKEN));
  // Un problema de validación tampoco repite el token que se puso mal.
  const { problemas } = leerEntornoEnsayo({ ...completo(), TWILIO_AUTH_TOKEN: "con espacios secretos de ejemplo" });
  assert.ok(!problemas.join("\n").includes("espacios secretos"));
});

test("--simulado completa lo que falta con valores falsos que Twilio real rechazaría", () => {
  const { entorno, problemas } = leerEntornoEnsayo({ CHATWOOT_URL_HOST: "http://localhost:3001", CHATWOOT_ADMIN_TOKEN: "t", CHATWOOT_CUENTA: "c", CHATWOOT_BOT_NOMBRE: "b", CHATWOOT_WEBHOOK_SECRETO: "s" }, { simulado: true });
  assert.deepEqual(problemas, []);
  assert.equal(entorno!.twilio.sid, SIMULADO.sid);
  assert.equal(entorno!.twilio.numero, SIMULADO.numero);
});

test("las direcciones del ensayo salen de la URL pública", () => {
  const u = urlsDeEnsayo("https://a.example.test/");
  assert.deepEqual(u, {
    entrantes: "https://a.example.test/webhooks/twilio/entrantes",
    estados: "https://a.example.test/webhooks/twilio/estados",
    estadosDeChatwoot: "https://a.example.test/twilio/delivery_status",
    diagnostico: "https://a.example.test/webhooks/twilio/diagnostico",
  });
  assert.ok("origen" in validarOrigenPublico("https://a.example.test"));
});

// ── V13-fix EV-40: ORIGEN_PUBLICO con caracteres de shell o saltos de línea se RECHAZA (antes se aceptaba o se limpiaba en silencio) ──────────────

test("EV-40: validarOrigenPublico rechaza `$()`, comillas invertidas, comillas, punto y coma y saltos de línea, con un mensaje, y no los borra en silencio", () => {
  const malos = [
    "https://a.example$(id)",
    "https://a.example`id`",
    "https://a.example\nTWILIO_AUTH_TOKEN=x",
    "https://a.example\r\nX=1",
    "https://a.exa\tmple",
    'https://a.example"; rm -rf /',
    "https://a.example';id",
    "https://a.example;id",
    "https://a b.example",
    "https://a.example|id",
    "https://a.example&x",
    "https://a_b.example",
    "https://-a.example",
  ];
  for (const m of malos) {
    const r = validarOrigenPublico(m);
    assert.ok("problema" in r, `se aceptó ${JSON.stringify(m)} → ${JSON.stringify(r)}`);
    assert.ok(r.problema.startsWith("ORIGEN_PUBLICO"), r.problema);
  }
  assert.match((validarOrigenPublico("https://a.example\nX=1") as { problema: string }).problema, /espacios o saltos de línea/);
  assert.match((validarOrigenPublico("https://a.example$(id)") as { problema: string }).problema, /caracteres que no son de una dirección/);
  // Lo normal sigue valiendo.
  for (const bueno of ["https://algo.trycloudflare.com", "https://a-b.c-d.example.com", "  https://algo.trycloudflare.com  ", "https://xn--espaa-rta.example", "HTTPS://ALGO.EXAMPLE/"]) {
    assert.ok("origen" in validarOrigenPublico(bueno), bueno);
  }
});
