import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { calcularFirmaTwilio, parsearFormulario, urlPublicaDe, variantesDeUrl, verificarFirmaTwilio, verificarWebhookTwilio } from "./firma.ts";

// Implementación independiente y mínima del algoritmo documentado, para no probar el código con él mismo.
function firmaIndependiente(token: string, url: string, params: Record<string, string>): string {
  let datos = url;
  for (const k of Object.keys(params).sort()) datos += k + params[k];
  return createHmac("sha1", token).update(datos).digest("base64");
}

const TOKEN = "token-de-prueba";
const URL_ENTRANTES = "https://escuela.example.test/webhooks/twilio/entrantes";
const PARAMS = { Body: "Hola", From: "whatsapp:+5215512345678", MessageSid: "SM0123456789abcdef0123456789abcdef", To: "whatsapp:+14155238886" };

test("vector de la documentación de Twilio (token 12345, URL con query, 5 parámetros)", () => {
  // Ejemplo publicado por Twilio para validar peticiones. Lo recuerdo de su documentación y de
  // las pruebas de su SDK; no se pudo contrastar en línea. Si coincide es la señal de que el orden
  // y la concatenación son los suyos.
  const url = "https://mycompany.com/myapp.php?foo=1&bar=2";
  const params = { CallSid: "CA1234567890ABCDE", Caller: "+14158675310", Digits: "1234", From: "+14158675310", To: "+18005551212" };
  assert.equal(calcularFirmaTwilio("12345", url, params), "GvWf1cFY/Q7PnoempGyD5oXAezc=");
});

test("vectores fijos escritos a mano con un token falso", () => {
  assert.equal(calcularFirmaTwilio(TOKEN, URL_ENTRANTES, PARAMS), "0KaWbLBKPoUEBidG4b1CeDxB8UA=");
  assert.equal(
    calcularFirmaTwilio(TOKEN, "https://escuela.example.test:443/webhooks/twilio/estados?a=1", { MessageSid: "SM1", MessageStatus: "delivered" }),
    "20VOA9cNTNaUojZZCuOTLAN/FuI=",
  );
});

test("coincide con una implementación independiente para cualquier orden de parámetros", () => {
  const revuelto = { To: PARAMS.To, MessageSid: PARAMS.MessageSid, Body: PARAMS.Body, From: PARAMS.From };
  assert.equal(calcularFirmaTwilio(TOKEN, URL_ENTRANTES, revuelto), firmaIndependiente(TOKEN, URL_ENTRANTES, PARAMS));
  // Mayúsculas antes que minúsculas (orden por unidades de código, como Twilio).
  const mixto = { b: "2", B: "1", a: "3", Z: "4" };
  assert.equal(calcularFirmaTwilio(TOKEN, URL_ENTRANTES, mixto), firmaIndependiente(TOKEN, URL_ENTRANTES, mixto));
});

test("un nombre repetido agrega cada valor, sin duplicados y ordenados", () => {
  const url = "https://x.test/a";
  assert.equal(calcularFirmaTwilio(TOKEN, url, { k: ["b", "a", "b"] }), createHmac("sha1", TOKEN).update(`${url}kakb`).digest("base64"));
});

test("firma válida pasa; token, URL, parámetros o firma distintos fallan", () => {
  const firma = calcularFirmaTwilio(TOKEN, URL_ENTRANTES, PARAMS);
  assert.equal(verificarFirmaTwilio(TOKEN, URL_ENTRANTES, PARAMS, firma), true);
  assert.equal(verificarFirmaTwilio("otro-token", URL_ENTRANTES, PARAMS, firma), false);
  assert.equal(verificarFirmaTwilio(TOKEN, URL_ENTRANTES + "x", PARAMS, firma), false);
  assert.equal(verificarFirmaTwilio(TOKEN, URL_ENTRANTES, { ...PARAMS, Body: "Hola!" }, firma), false);
  assert.equal(verificarFirmaTwilio(TOKEN, URL_ENTRANTES, { ...PARAMS, Extra: "1" }, firma), false);
  assert.equal(verificarFirmaTwilio(TOKEN, URL_ENTRANTES, PARAMS, undefined), false);
  assert.equal(verificarFirmaTwilio(TOKEN, URL_ENTRANTES, PARAMS, ""), false);
  assert.equal(verificarFirmaTwilio(TOKEN, URL_ENTRANTES, PARAMS, firma.slice(0, -2)), false, "longitud distinta no lanza");
  assert.equal(verificarFirmaTwilio(TOKEN, URL_ENTRANTES, PARAMS, firma.replace(/.$/, firma.endsWith("=") ? "A" : "=")), false);
  assert.equal(verificarFirmaTwilio("", URL_ENTRANTES, PARAMS, calcularFirmaTwilio("", URL_ENTRANTES, PARAMS)), false, "sin token no hay firma válida");
});

test("la URL con o sin el puerto por defecto es la misma para Twilio", () => {
  assert.deepEqual(variantesDeUrl("https://h.test/p?q=1"), ["https://h.test/p?q=1", "https://h.test:443/p?q=1"]);
  assert.deepEqual(variantesDeUrl("https://h.test:443/p"), ["https://h.test:443/p", "https://h.test/p"]);
  assert.deepEqual(variantesDeUrl("http://h.test/p"), ["http://h.test/p", "http://h.test:80/p"]);
  assert.deepEqual(variantesDeUrl("https://h.test:8443/p"), ["https://h.test:8443/p", "https://h.test/p", "https://h.test:8443/p"].filter((v, i, a) => a.indexOf(v) === i));
  const firma = calcularFirmaTwilio(TOKEN, "https://h.test:443/p", PARAMS);
  assert.equal(verificarFirmaTwilio(TOKEN, "https://h.test/p", PARAMS, firma), true);
  assert.equal(verificarFirmaTwilio(TOKEN, "https://otro.test/p", PARAMS, firma), false);
});

test("parsearFormulario decodifica como Twilio: + es espacio, %XX, UTF-8, repetidos y nombres peligrosos", () => {
  const p = parsearFormulario(Buffer.from("Body=Hola+mundo%21+%C3%A1&To=whatsapp%3A%2B14155238886&k=1&k=2&__proto__=x&vacio="));
  assert.equal(p["Body"], "Hola mundo! á");
  assert.equal(p["To"], "whatsapp:+14155238886");
  assert.deepEqual(p["k"], ["1", "2"]);
  assert.equal(p["vacio"], "");
  assert.equal(Object.getPrototypeOf(p), null);
  assert.equal(({} as Record<string, unknown>)["x"], undefined, "no contamina el prototipo");
  assert.deepEqual(Object.keys(parsearFormulario(Buffer.alloc(0))), []);
});

test("urlPublicaDe junta la base configurada con la ruta y la query de la petición", () => {
  assert.equal(urlPublicaDe("https://h.test", "/webhooks/twilio/entrantes?a=1"), "https://h.test/webhooks/twilio/entrantes?a=1");
  assert.equal(urlPublicaDe("https://h.test///", "/x"), "https://h.test/x");
});

test("verificarWebhookTwilio: devuelve parámetros y cabeceras a reenviar, o null sin nada que lanzar", () => {
  const cuerpo = Buffer.from(new URLSearchParams(PARAMS).toString());
  const firma = calcularFirmaTwilio(TOKEN, URL_ENTRANTES, PARAMS);
  const peticion = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] });
  const ok = verificarWebhookTwilio(peticion({ "x-twilio-signature": firma, "content-type": "application/x-www-form-urlencoded", "i-twilio-idempotency-token": "tok", "x-otra": "no" }), cuerpo, TOKEN, URL_ENTRANTES);
  assert.deepEqual(ok?.params["MessageSid"], PARAMS.MessageSid);
  assert.deepEqual(ok?.cabeceras, { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": firma, "i-twilio-idempotency-token": "tok" });

  assert.equal(verificarWebhookTwilio(peticion({}), cuerpo, TOKEN, URL_ENTRANTES), null, "sin firma");
  assert.equal(verificarWebhookTwilio(peticion({ "x-twilio-signature": firma }), cuerpo, null, URL_ENTRANTES), null, "sin token configurado");
  assert.equal(verificarWebhookTwilio(peticion({ "x-twilio-signature": firma }), cuerpo, "", URL_ENTRANTES), null);
  assert.equal(verificarWebhookTwilio(peticion({ "x-twilio-signature": firma }), cuerpo, TOKEN, null), null, "sin URL pública configurada");
  assert.equal(verificarWebhookTwilio(peticion({ "x-twilio-signature": firma }), Buffer.from("Body=otro"), TOKEN, URL_ENTRANTES), null, "cuerpo alterado");
});
