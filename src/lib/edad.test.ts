import { test } from "node:test";
import assert from "node:assert/strict";
import { edadCumplida, partesDeFecha } from "./edad.ts";

test("edadCumplida: el día del cumpleaños ya cuenta el año; la víspera, no", () => {
  assert.equal(edadCumplida("2018-06-15", "2026-06-14"), 7);
  assert.equal(edadCumplida("2018-06-15", "2026-06-15"), 8);
  assert.equal(edadCumplida("2018-06-15", "2026-06-16"), 8);
  assert.equal(edadCumplida("2018-06-15", "2026-12-31"), 8);
  assert.equal(edadCumplida("2018-06-15", "2027-01-01"), 8);
});

test("edadCumplida: recién nacido, mismo día y al día siguiente", () => {
  assert.equal(edadCumplida("2026-10-08", "2026-10-08"), 0);
  assert.equal(edadCumplida("2026-10-08", "2027-10-07"), 0);
  assert.equal(edadCumplida("2026-10-08", "2027-10-08"), 1);
});

test("edadCumplida: quien nació un 29 de febrero cumple el 1 de marzo en los años no bisiestos", () => {
  assert.equal(edadCumplida("2016-02-29", "2023-02-28"), 6);
  assert.equal(edadCumplida("2016-02-29", "2023-03-01"), 7);
  assert.equal(edadCumplida("2016-02-29", "2024-02-28"), 7);
  assert.equal(edadCumplida("2016-02-29", "2024-02-29"), 8, "año bisiesto: el día exacto");
  assert.equal(edadCumplida("2016-02-29", "2024-03-01"), 8);
  assert.equal(edadCumplida("2016-02-29", "2026-02-28"), 9);
  assert.equal(edadCumplida("2016-02-29", "2026-03-01"), 10);
});

test("edadCumplida: cambio de año y fin de mes", () => {
  assert.equal(edadCumplida("2000-12-31", "2026-12-30"), 25);
  assert.equal(edadCumplida("2000-12-31", "2026-12-31"), 26);
  assert.equal(edadCumplida("2000-01-01", "2026-01-01"), 26);
  assert.equal(edadCumplida("2000-01-01", "2025-12-31"), 25);
});

test("edadCumplida rechaza fechas inválidas y fechas anteriores al nacimiento", () => {
  assert.throws(() => edadCumplida("2018-02-30", "2026-01-01"), RangeError);
  assert.throws(() => edadCumplida("2018-13-01", "2026-01-01"), RangeError);
  assert.throws(() => edadCumplida("18-01-01", "2026-01-01"), RangeError);
  assert.throws(() => edadCumplida("2018-01-01", "2026-04-31"), RangeError);
  assert.throws(() => edadCumplida("2026-01-02", "2026-01-01"), RangeError);
  assert.deepEqual(partesDeFecha("2024-02-29"), { anio: 2024, mes: 2, dia: 29 });
  assert.throws(() => partesDeFecha("2023-02-29"), RangeError);
});

test("edadCumplida coincide con una cuenta día por día durante 40 años", () => {
  // Contraste independiente: la edad sube exactamente en cada cumpleaños, ni antes ni después.
  const nac = "2003-09-17";
  let anterior = 0;
  const f = new Date("2003-09-17T00:00:00Z");
  for (let i = 0; i < 40 * 366; i++) {
    const dia = new Date(f.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const e = edadCumplida(nac, dia);
    assert.ok(e === anterior || e === anterior + 1, `salto raro en ${dia}`);
    if (e === anterior + 1) assert.equal(dia.slice(5), "09-17", `la edad solo sube en el cumpleaños (${dia})`);
    anterior = e;
  }
  assert.ok(anterior >= 39);
});
