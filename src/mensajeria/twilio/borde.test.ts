import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarFromEnCuerpo } from "./borde.ts";
import { ReenviadorTwilioFalso } from "./reenviador.ts";

test("normalizarFromEnCuerpo: solo cambia el valor de From (+521 → +52); el resto de los bytes queda idéntico", () => {
  const original = "Body=Hola%20mundo+%C3%A1&From=whatsapp%3A%2B5215512345678&ReferralCtwaClid=AffX%2Fy%3D%3D&To=whatsapp%3A%2B14155238886&Fromm=1";
  const nuevo = normalizarFromEnCuerpo(Buffer.from(original)).toString();
  assert.equal(nuevo, original.replace("From=whatsapp%3A%2B5215512345678", "From=whatsapp%3A%2B525512345678"));
});

test("normalizarFromEnCuerpo: un From ya canónico, sin From o ilegible deja el cuerpo exactamente igual (mismo buffer)", () => {
  for (const cuerpo of ["From=whatsapp%3A%2B525512345678&Body=x", "Body=x", "From=basura&Body=x", "From=%E0%A4%A&Body=x", ""]) {
    const b = Buffer.from(cuerpo);
    assert.equal(normalizarFromEnCuerpo(b), b, cuerpo);
  }
});

test("normalizarFromEnCuerpo conserva bytes que no son UTF-8 válido", () => {
  const b = Buffer.concat([Buffer.from("Body="), Buffer.from([0xff, 0xfe]), Buffer.from("&From=whatsapp%3A%2B5215512345678")]);
  const nuevo = normalizarFromEnCuerpo(b);
  assert.deepEqual([...nuevo.subarray(0, 7)], [...b.subarray(0, 7)]);
  assert.match(nuevo.toString("latin1"), /From=whatsapp%3A%2B525512345678$/);
});

test("el reenviador falso copia lo que recibe", async () => {
  const f = new ReenviadorTwilioFalso();
  const cuerpo = Buffer.from("a=1");
  await f.reenviar({ tipo: "entrante", cuerpo, cabeceras: { "content-type": "x" } });
  cuerpo[0] = 0x7a;
  assert.equal(f.enviados[0]!.cuerpo.toString(), "a=1");
});
