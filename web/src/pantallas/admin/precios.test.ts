import assert from "node:assert/strict";
import { test } from "node:test";
import { estadoDeVigencia, rangoDeVigencia } from "./precios.ts";

const HOY = "2026-10-12";

test("una vigencia es futura si empieza después de hoy, vigente si hoy cae dentro (o está abierta) y pasada si ya cerró", () => {
  assert.equal(estadoDeVigencia({ vigencia_desde: "2027-01-01", vigencia_hasta: null }, HOY), "futura");
  assert.equal(estadoDeVigencia({ vigencia_desde: "2026-08-01", vigencia_hasta: null }, HOY), "vigente");
  assert.equal(estadoDeVigencia({ vigencia_desde: "2026-08-01", vigencia_hasta: "2026-12-31" }, HOY), "vigente");
  assert.equal(estadoDeVigencia({ vigencia_desde: "2026-01-01", vigencia_hasta: "2026-10-12" }, HOY), "vigente", "el último día todavía rige");
  assert.equal(estadoDeVigencia({ vigencia_desde: "2026-01-01", vigencia_hasta: "2026-07-31" }, HOY), "pasada");
  assert.equal(estadoDeVigencia({ vigencia_desde: "2026-10-12", vigencia_hasta: null }, HOY), "vigente", "el primer día ya rige");
});

test("el rango se dice en palabras: abierto, en un mismo año y entre años", () => {
  assert.equal(rangoDeVigencia({ vigencia_desde: "2027-01-01", vigencia_hasta: null }), "Desde el 1 de enero de 2027 · abierta");
  assert.equal(rangoDeVigencia({ vigencia_desde: "2026-08-01", vigencia_hasta: "2026-12-31" }), "1 de agosto al 31 de diciembre de 2026");
  assert.equal(rangoDeVigencia({ vigencia_desde: "2025-01-01", vigencia_hasta: "2026-07-31" }), "1 de enero de 2025 al 31 de julio de 2026");
});
