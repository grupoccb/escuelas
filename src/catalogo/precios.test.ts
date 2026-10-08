// Precios versionados (C2), parte pura: fechas, vigencias y el plan de una alta.

import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirVigente, planDeAlta, rigeEn, sumarDias, type VigenciaDePrecio } from "./precios.ts";

const v = (id: string, desde: string, hasta: string | null): VigenciaDePrecio => ({ id, desde, hasta });

test("sumarDias: cruza fin de mes, de año y bisiestos", () => {
  assert.equal(sumarDias("2026-10-15", 1), "2026-10-16");
  assert.equal(sumarDias("2026-10-31", 1), "2026-11-01");
  assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(sumarDias("2027-01-01", -1), "2026-12-31");
  assert.equal(sumarDias("2028-02-28", 1), "2028-02-29", "2028 es bisiesto");
  assert.equal(sumarDias("2027-02-28", 1), "2027-03-01");
  assert.equal(sumarDias("2026-03-01", -1), "2026-02-28");
  assert.equal(sumarDias("2026-10-15", 0), "2026-10-15");
});

test("rigeEn: desde y hasta son INCLUSIVOS; hasta nulo es abierta", () => {
  const cerrada = v("a", "2026-01-01", "2026-03-31");
  assert.equal(rigeEn(cerrada, "2025-12-31"), false);
  assert.equal(rigeEn(cerrada, "2026-01-01"), true);
  assert.equal(rigeEn(cerrada, "2026-03-31"), true);
  assert.equal(rigeEn(cerrada, "2026-04-01"), false);
  const abierta = v("b", "2026-04-01", null);
  assert.equal(rigeEn(abierta, "2026-03-31"), false);
  assert.equal(rigeEn(abierta, "2026-04-01"), true);
  assert.equal(rigeEn(abierta, "2099-12-31"), true);
  assert.equal(rigeEn(v("c", "2026-05-05", "2026-05-05"), "2026-05-05"), true, "una vigencia de un solo día");
});

test("elegirVigente: la que rige ese día; con datos heredados traslapados gana siempre la misma", () => {
  const sano = [v("a", "2026-01-01", "2026-03-31"), v("b", "2026-04-01", null)];
  assert.equal(elegirVigente(sano, "2026-02-10")?.id, "a");
  assert.equal(elegirVigente(sano, "2026-04-01")?.id, "b");
  assert.equal(elegirVigente(sano, "2025-06-01"), null);
  assert.equal(elegirVigente([], "2026-01-01"), null);
  const feo = [v("z", "2026-01-01", null), v("y", "2026-02-01", null), v("x", "2026-02-01", null)];
  assert.equal(elegirVigente(feo, "2026-03-01")?.id, "x", "la de desde más reciente y, a igualdad, la de menor id");
  assert.equal(elegirVigente([...feo].reverse(), "2026-03-01")?.id, "x", "sin depender del orden de entrada");
});

test("planDeAlta: la primera no cierra nada; la siguiente cierra la anterior el día previo; no se puede empezar antes ni el mismo día", () => {
  assert.deepEqual(planDeAlta([], "2026-01-01"), { ok: true, cerrar: null });
  assert.deepEqual(planDeAlta([v("a", "2026-01-01", null)], "2026-04-01"), { ok: true, cerrar: { id: "a", hasta: "2026-03-31" } });
  assert.deepEqual(planDeAlta([v("a", "2026-01-01", null)], "2026-01-02"), { ok: true, cerrar: { id: "a", hasta: "2026-01-01" } }, "queda de un solo día");
  assert.deepEqual(planDeAlta([v("a", "2026-01-01", "2026-12-31")], "2026-06-01"), { ok: true, cerrar: { id: "a", hasta: "2026-05-31" } }, "recorta una vigencia ya cerrada que seguía");
  assert.deepEqual(planDeAlta([v("a", "2026-01-01", "2026-02-28")], "2026-06-01"), { ok: true, cerrar: null }, "ya estaba cerrada antes: hay un hueco sin precio, no se toca");
  assert.deepEqual(planDeAlta([v("a", "2026-01-01", "2026-05-31")], "2026-06-01"), { ok: true, cerrar: null }, "ya terminaba el día previo");
  const mismoDia = planDeAlta([v("a", "2026-01-01", null)], "2026-01-01");
  assert.equal(mismoDia.ok, false);
  const antes = planDeAlta([v("a", "2026-06-01", null)], "2026-03-01");
  assert.equal(antes.ok, false);
  assert.equal(!antes.ok && antes.conflictoConId, "a");
  assert.equal(planDeAlta([v("a", "2026-01-01", "2026-03-31"), v("b", "2026-04-01", null)], "2026-04-02").ok, true);
  assert.deepEqual(planDeAlta([v("a", "2026-01-01", "2026-03-31"), v("b", "2026-04-01", null)], "2026-04-02"), { ok: true, cerrar: { id: "b", hasta: "2026-04-01" } }, "cierra la última, no la primera");
});
