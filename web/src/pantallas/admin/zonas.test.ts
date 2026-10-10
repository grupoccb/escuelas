import assert from "node:assert/strict";
import { test } from "node:test";
import { nombreDeZona, opcionesDeZona, ZONAS_CONOCIDAS } from "./zonas.ts";

test("cada zona conocida se dice en palabras y ninguna lleva el nombre técnico a la vista", () => {
  assert.equal(nombreDeZona("America/Mexico_City"), "Hora del centro de México");
  assert.match(nombreDeZona("America/Mexico_City", "largo"), /Ciudad de México/);
  for (const z of ZONAS_CONOCIDAS) {
    assert.ok(!z.corto.includes("/") && !z.largo.includes("_"), z.valor);
    assert.match(z.corto, /^Hora de/);
  }
  assert.equal(new Set(ZONAS_CONOCIDAS.map((z) => z.valor)).size, ZONAS_CONOCIDAS.length);
});

test("una zona que no está en la lista no se pierde: se muestra como otra zona y se agrega al selector", () => {
  assert.equal(nombreDeZona("Asia/Tokyo"), "Otra zona horaria (Asia/Tokyo)");
  assert.equal(opcionesDeZona("Asia/Tokyo")[0]!.valor, "Asia/Tokyo");
  assert.equal(opcionesDeZona("America/Lima").length, ZONAS_CONOCIDAS.length);
});
