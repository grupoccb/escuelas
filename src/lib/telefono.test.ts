import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarNumeroWhatsapp, normalizarTelefono } from "./telefono.ts";

const E164 = "+525512345678";

test("+521… y +52… devuelven lo mismo", () => {
  assert.equal(normalizarTelefono("+5215512345678"), E164);
  assert.equal(normalizarTelefono("+525512345678"), E164);
  assert.equal(normalizarTelefono("+5215512345678"), normalizarTelefono("+525512345678"));
});

test("acepta el prefijo whatsapp: de Twilio", () => {
  assert.equal(normalizarTelefono("whatsapp:+5215512345678"), E164);
  assert.equal(normalizarTelefono("WhatsApp:+525512345678"), E164);
});

test("acepta formatos con espacios, guiones, paréntesis y puntos", () => {
  for (const entrada of ["+52 1 55 1234 5678", "+52 (55) 1234-5678", "55.1234.5678", "  +52-55-1234-5678  "]) {
    assert.equal(normalizarTelefono(entrada), E164, entrada);
  }
});

test("sin código de país: 10 dígitos se toman como México", () => {
  assert.equal(normalizarTelefono("5512345678"), E164);
});

test("sin +: 52 o 521 al inicio con la longitud mexicana", () => {
  assert.equal(normalizarTelefono("525512345678"), E164);
  assert.equal(normalizarTelefono("5215512345678"), E164);
});

test("prefijo internacional 00", () => {
  assert.equal(normalizarTelefono("00 52 1 55 1234 5678"), E164);
  assert.equal(normalizarTelefono("0014155552671"), "+14155552671");
});

test("otros países quedan en E.164 sin tocar", () => {
  assert.equal(normalizarTelefono("+1 (415) 555-2671"), "+14155552671");
  assert.equal(normalizarTelefono("+34 612 345 678"), "+34612345678");
});

test("es idempotente", () => {
  for (const entrada of ["+5215512345678", "5512345678", "+14155552671"]) {
    const una = normalizarTelefono(entrada);
    assert.ok(una);
    assert.equal(normalizarTelefono(una), una);
  }
});

test("rechaza lo que no es un teléfono", () => {
  for (const entrada of [
    "",
    "   ",
    "hola",
    "55 1234 567a",
    "12345",
    "+52 55 1234 567", // México con 9 dígitos
    "+52 2 55 1234 5678", // 11 dígitos tras 52 sin el 1 de móvil
    "+1234567890123456", // más de 15 dígitos
    "+0123456789",
  ]) {
    assert.equal(normalizarTelefono(entrada), null, JSON.stringify(entrada));
  }
});

test("número receptor de WhatsApp: forma canónica, igual con +521 y +52", () => {
  assert.equal(normalizarNumeroWhatsapp("whatsapp:+5215512345678"), "whatsapp:+525512345678");
  assert.equal(normalizarNumeroWhatsapp("whatsapp:+525512345678"), "whatsapp:+525512345678");
  assert.equal(normalizarNumeroWhatsapp("+1 (500) 555-0006"), "whatsapp:+15005550006");
  assert.equal(normalizarNumeroWhatsapp("no es un número"), null);
});
