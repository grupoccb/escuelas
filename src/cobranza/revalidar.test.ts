// H6: lo que se programó solo se manda si el cargo sigue abierto y vale lo que decía.
import { test } from "node:test";
import assert from "node:assert/strict";
import { revalidarCobro, type CargoParaCobrar } from "./revalidar.ts";

const c = (o: Partial<CargoParaCobrar> = {}): CargoParaCobrar => ({ estatus: "pendiente", vencimiento: "2026-11-10", inscripcionEstatus: "activa", ...o });

test("un cargo abierto de una inscripción vigente se cobra; saldado, cancelado o de una baja, no", () => {
  assert.deepEqual(revalidarCobro("cargo_vencido", c(), "2026-11-12"), { ok: true });
  assert.deepEqual(revalidarCobro("cargo_vencido", c({ estatus: "vencido" }), "2026-11-12"), { ok: true });
  assert.deepEqual(revalidarCobro("cargo_vencido", c({ estatus: "pagado" }), "2026-11-12"), { ok: false, motivo: "cargo_saldado" });
  assert.deepEqual(revalidarCobro("cargo_vencido", c({ estatus: "cancelado" }), "2026-11-12"), { ok: false, motivo: "cargo_cancelado" });
  assert.deepEqual(revalidarCobro("cargo_vencido", c({ inscripcionEstatus: "baja" }), "2026-11-12"), { ok: false, motivo: "inscripcion_baja" });
  assert.deepEqual(revalidarCobro("cargo_vencido", c({ inscripcionEstatus: "congelada" }), "2026-11-12"), { ok: true });
  assert.deepEqual(revalidarCobro("cargo_vencido", c({ inscripcionEstatus: null }), "2026-11-12"), { ok: true });
});

test("«vencido» exige que ya haya vencido; «por vencer» sirve hasta el día de vencimiento inclusive", () => {
  assert.deepEqual(revalidarCobro("cargo_vencido", c(), "2026-11-10"), { ok: false, motivo: "cargo_no_vencido" });
  assert.deepEqual(revalidarCobro("cargo_vencido", c(), "2026-11-11"), { ok: true });
  assert.deepEqual(revalidarCobro("cargo_por_vencer", c(), "2026-11-10"), { ok: true });
  assert.deepEqual(revalidarCobro("cargo_por_vencer", c(), "2026-11-11"), { ok: false, motivo: "evento_pasado" });
});
