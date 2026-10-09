// H3: la antigüedad de lo vencido — bordes de los renglones y suma exacta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { antiguedadDe, atrasoEn, renglonDeAntiguedad, totalDeAntiguedad } from "./estado-cuenta.ts";

test("los bordes de los renglones: 1 y 30 días → de 0 a 30; 31 y 60 → de 31 a 60; 61 y 90 → de 61 a 90; 91 en adelante → más de 90", () => {
  const casos: [number, string][] = [[1, "de_0_a_30"], [30, "de_0_a_30"], [31, "de_31_a_60"], [60, "de_31_a_60"], [61, "de_61_a_90"], [90, "de_61_a_90"], [91, "mas_de_90"], [400, "mas_de_90"]];
  for (const [dias, esperado] of casos) assert.equal(renglonDeAntiguedad(dias), esperado, `${dias} días`);
});

test("la antigüedad suma el SALDO (no el monto) de cada cargo vencido; lo que no ha vencido o ya está saldado no entra", () => {
  const a = antiguedadDe([
    { saldo: 10050n, diasDeAtraso: 5 },
    { saldo: 20000n, diasDeAtraso: 30 },
    { saldo: 30025n, diasDeAtraso: 45 },
    { saldo: 40000n, diasDeAtraso: 90 },
    { saldo: 50000n, diasDeAtraso: 91 },
    { saldo: 99999n, diasDeAtraso: 0 },
    { saldo: 0n, diasDeAtraso: 200 },
  ]);
  assert.deepEqual(a, { de_0_a_30: 30050n, de_31_a_60: 30025n, de_61_a_90: 40000n, mas_de_90: 50000n });
  assert.equal(totalDeAntiguedad(a), 150075n);
});

test("atrasoEn: 0 si no ha vencido o vence hoy", () => {
  assert.equal(atrasoEn("2026-11-10", "2026-11-10"), 0);
  assert.equal(atrasoEn("2026-11-20", "2026-11-10"), 0);
  assert.equal(atrasoEn("2026-11-09", "2026-11-10"), 1);
});
