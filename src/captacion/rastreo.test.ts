// E2: el parser del código de rastreo sobre el texto de un mensaje (puro).

import { test } from "node:test";
import assert from "node:assert/strict";
import { candidatosDeCodigo, sinCodigos } from "./rastreo.ts";

const codigos = (t: string): string[] => candidatosDeCodigo(t).map((c) => c.codigo);

test("encuentra el código con mayúsculas o minúsculas, con espacio, guion, raya, punto, guion bajo o sin separador", () => {
  for (const escrito of ["ABCD-EFG2", "abcd-efg2", "ABCD EFG2", "abcd.efg2", "ABCD_EFG2", "ABCD–EFG2", "ABCD—EFG2", "ABCDEFG2", "AbCd-EfG2", "ABCD·EFG2"]) {
    assert.deepEqual(codigos(`Hola, quiero información de la escuela. Mi código es ${escrito}`), ["ABCDEFG2"], escrito);
  }
});

test("rodeado de signos y saltos de línea; al principio, en medio o al final; varios códigos en orden", () => {
  assert.deepEqual(codigos("(ABCD-EFG2)"), ["ABCDEFG2"]);
  assert.deepEqual(codigos("¡Hola!\nMi código es: abcd efg2.\nGracias"), ["ABCDEFG2"]);
  assert.deepEqual(codigos("QR7M-2KXA y luego ZZZ2-PPP3"), ["QR7M2KXA", "ZZZ2PPP3"]);
  assert.deepEqual(codigos("ABCD-EFG2, ABCD-EFG2"), ["ABCDEFG2", "ABCDEFG2"]);
});

test("no confunde palabras ni códigos mal formados: sin dígito, con I/L/O/0/1, de otra longitud o pegados a otras letras", () => {
  for (const t of ["Hola buenos días quiero informes", "ABCD-EFGH", "información", "ABCD-EFG0", "ABCD-EFG1", "ABCI-EFG2", "ABCD-EFGO2", "ABC-DEFG2", "ABCDE-FGH2", "ABCD-EFG23", "xABCD-EFG2", "ABCD-EFG2x", "AB3D-EFG2z", "1234 5678 9012"]) assert.deepEqual(codigos(t), [], t);
  // Un teléfono de 8 dígitos o una fecha sí parecen código (solo dígitos 2-9): la tabla decide si existen.
  assert.deepEqual(codigos("llámame al 5523 4567"), ["55234567"]);
});

test("sinCodigos: quita solo lo que se le pide, junto con «Mi código es», y compacta los espacios", () => {
  const t = "Hola, quiero información de Vertical. Mi código es ABCD-EFG2";
  assert.equal(sinCodigos(t, candidatosDeCodigo(t)), "Hola, quiero información de Vertical.");
  assert.equal(sinCodigos("ABCD-EFG2", candidatosDeCodigo("ABCD-EFG2")), "", "un mensaje que era solo el código queda vacío");
  assert.equal(sinCodigos("código: abcd efg2 , hola", candidatosDeCodigo("código: abcd efg2 , hola")), ", hola");
  assert.equal(sinCodigos("a   QR7M-2KXA   b", candidatosDeCodigo("a   QR7M-2KXA   b")), "a b");
  // Solo los que se piden: el otro se queda tal cual.
  const dos = "QR7M-2KXA y ZZZ2-PPP3";
  assert.equal(sinCodigos(dos, candidatosDeCodigo(dos).slice(0, 1)), "y ZZZ2-PPP3");
  assert.equal(sinCodigos("sin código aquí", []), "sin código aquí");
});
