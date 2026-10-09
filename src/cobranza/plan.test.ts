// H6: cuándo toca cada recordatorio de pago — reglas puras, con el horario de la sucursal y los bordes de los días.
import { test } from "node:test";
import assert from "node:assert/strict";
import { atrasoMaximoDias, inicioDelDia, limiteDeRecordatorioPorVencer, nominalDeRecordatorio, ocurrenciaPorProgramar, referenciaDeCobranza } from "./plan.ts";

const ZONA = "America/Mexico_City"; // UTC−6 en noviembre
const iso = (d: Date) => d.toISOString();

test("el inicio del día es la medianoche LOCAL de la sucursal (no la UTC)", () => {
  assert.equal(iso(inicioDelDia("2026-11-10", ZONA)), "2026-11-10T06:00:00.000Z");
  assert.equal(iso(inicioDelDia("2026-11-10", "America/Tijuana")), "2026-11-10T08:00:00.000Z");
});

test("por vencer se mide desde el inicio del día de vencimiento; vencido, desde el inicio del día siguiente", () => {
  assert.equal(iso(referenciaDeCobranza("cargo_por_vencer", "2026-11-10", ZONA)), "2026-11-10T06:00:00.000Z");
  assert.equal(iso(referenciaDeCobranza("cargo_vencido", "2026-11-10", ZONA)), "2026-11-11T06:00:00.000Z");
  assert.equal(iso(referenciaDeCobranza("cargo_vencido", "2026-12-31", ZONA)), "2027-01-01T06:00:00.000Z");
});

test("el recordatorio nominal: -4320 es 3 días antes; los vencidos siguientes van cada espaciado (7 días por omisión)", () => {
  assert.equal(iso(nominalDeRecordatorio("cargo_por_vencer", "2026-11-10", ZONA, { offsetMinutos: -4320, espaciadoMinutos: null }, 1)), "2026-11-07T06:00:00.000Z");
  const v = (n: number, esp: number | null) => iso(nominalDeRecordatorio("cargo_vencido", "2026-11-10", ZONA, { offsetMinutos: 1440, espaciadoMinutos: esp }, n));
  assert.equal(v(1, null), "2026-11-12T06:00:00.000Z");
  assert.equal(v(2, null), "2026-11-19T06:00:00.000Z");
  assert.equal(v(3, 2880), "2026-11-16T06:00:00.000Z");
});

test("por vencer sirve hasta el final del día de vencimiento (exclusivo)", () => {
  assert.equal(iso(limiteDeRecordatorioPorVencer("2026-11-10", ZONA)), "2026-11-11T06:00:00.000Z");
});

const base = { vencimiento: "2026-11-10", zona: ZONA, maxIntentos: 2, offsetMinutos: 1440, espaciadoMinutos: null, atrasoMaximoDias: 60, previa: null } as const;
const en = (s: string) => new Date(s);

test("el primer vencido toca cuando llega su momento, no antes", () => {
  assert.equal(ocurrenciaPorProgramar("cargo_vencido", { ...base, ahora: en("2026-11-12T05:59:00Z") }), null);
  assert.equal(ocurrenciaPorProgramar("cargo_vencido", { ...base, ahora: en("2026-11-12T06:00:00Z") }), 1);
});

test("el segundo solo si el primero salió, separado por el espaciado y sin pasar del tope de intentos", () => {
  const ahora = en("2026-11-19T06:00:00Z");
  assert.equal(ocurrenciaPorProgramar("cargo_vencido", { ...base, ahora, previa: { ocurrencia: 1, salio: true } }), 2);
  assert.equal(ocurrenciaPorProgramar("cargo_vencido", { ...base, ahora: en("2026-11-18T06:00:00Z"), previa: { ocurrencia: 1, salio: true } }), null, "aún no pasa el espaciado");
  assert.equal(ocurrenciaPorProgramar("cargo_vencido", { ...base, ahora, previa: { ocurrencia: 1, salio: false } }), null, "el primero no salió: no se insiste");
  assert.equal(ocurrenciaPorProgramar("cargo_vencido", { ...base, ahora: en("2026-12-01T06:00:00Z"), previa: { ocurrencia: 2, salio: true } }), null, "tope de intentos");
});

test("la deuda vieja no se persigue (tope de atraso) y por vencer no se programa pasado el día de vencimiento", () => {
  assert.equal(ocurrenciaPorProgramar("cargo_vencido", { ...base, ahora: en("2027-02-20T16:00:00Z") }), null);
  assert.equal(ocurrenciaPorProgramar("cargo_vencido", { ...base, ahora: en("2027-02-20T16:00:00Z"), atrasoMaximoDias: 365 }), 1);
  const pv = { ...base, offsetMinutos: -4320, maxIntentos: 1 };
  assert.equal(ocurrenciaPorProgramar("cargo_por_vencer", { ...pv, ahora: en("2026-11-06T16:00:00Z") }), null, "todavía no");
  assert.equal(ocurrenciaPorProgramar("cargo_por_vencer", { ...pv, ahora: en("2026-11-07T06:00:00Z") }), 1);
  assert.equal(ocurrenciaPorProgramar("cargo_por_vencer", { ...pv, ahora: en("2026-11-10T20:00:00Z") }), 1, "el mismo día de vencimiento todavía sirve");
  assert.equal(ocurrenciaPorProgramar("cargo_por_vencer", { ...pv, ahora: en("2026-11-11T06:00:00Z") }), null, "ya venció");
});

test("atrasoMaximoDias lee la condición o usa 60", () => {
  assert.equal(atrasoMaximoDias({}), 60);
  assert.equal(atrasoMaximoDias({ max_atraso_dias: 30 }), 30);
  assert.equal(atrasoMaximoDias({ max_atraso_dias: 0 }), 60);
  assert.equal(atrasoMaximoDias({ max_atraso_dias: 1.5 }), 60);
  assert.equal(atrasoMaximoDias(null), 60);
});
