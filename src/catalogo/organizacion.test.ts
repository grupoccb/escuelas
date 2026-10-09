import assert from "node:assert/strict";
import { test } from "node:test";
import { esUrlHttpsPublica, esZonaHorariaValida, PATRON_DE_COLOR, PATRON_DE_SLUG, slugDe } from "./organizacion.ts";

test("el slug sale del nombre sin acentos, en minúsculas y con guiones", () => {
  assert.equal(slugDe("Artes Marciales"), "artes-marciales");
  assert.equal(slugDe("  Música y Danza  "), "musica-y-danza");
  assert.equal(slugDe("Niños 3-5 años"), "ninos-3-5-anos");
  assert.equal(slugDe("¡¡¡"), "");
  assert.ok(slugDe("a".repeat(100)).length <= 60);
  assert.match(slugDe("Gimnasia rítmica"), PATRON_DE_SLUG);
});

test("el patrón de slug rechaza mayúsculas, espacios, guiones al borde y dobles", () => {
  for (const malo of ["Hola", "a b", "-a", "a-", "a--b", "", "a_b"]) assert.doesNotMatch(malo, PATRON_DE_SLUG, malo);
  for (const bueno of ["a", "a-b", "a1-2b"]) assert.match(bueno, PATRON_DE_SLUG, bueno);
});

test("zonas horarias: solo nombres IANA que el runtime conoce", () => {
  assert.ok(esZonaHorariaValida("America/Mexico_City"));
  assert.ok(esZonaHorariaValida("America/Argentina/Buenos_Aires"));
  assert.ok(esZonaHorariaValida("UTC"));
  for (const mala of ["CST", "Mexico", "America/Nowhere_City_Xyz", "", "../etc/passwd", "America/", "GMT+6"]) assert.equal(esZonaHorariaValida(mala), false, mala);
});

test("el color es #RRGGBB y el logotipo una URL https sin credenciales", () => {
  assert.match("#1F5fBF", PATRON_DE_COLOR);
  for (const malo of ["1F5FBF", "#12345", "#GGGGGG", "rojo"]) assert.doesNotMatch(malo, PATRON_DE_COLOR);
  assert.ok(esUrlHttpsPublica("https://ejemplo.com/logo.png"));
  for (const mala of ["http://ejemplo.com/x.png", "https://u:p@ejemplo.com/x", "javascript:alert(1)", "https://localhost/x", "no es url"]) assert.equal(esUrlHttpsPublica(mala), false, mala);
});
