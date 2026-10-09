// H2: el reparto de un pago entre cargos de varios hijos — más antiguo primero, parcial, excedente rechazado, ajuste manual validado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ordenDeAplicacion, proponerDistribucion, validarDistribucion, type CargoAbierto } from "./distribucion.ts";

const c = (id: string, saldo: bigint, vence: string, creado = 0): CargoAbierto => ({ id, saldo, fechaVencimiento: vence, creadoEn: creado });

test("el orden es del más antiguo al más nuevo: vencimiento, luego creación, luego id; sin saldo no entra", () => {
  const orden = ordenDeAplicacion([c("d", 100n, "2026-12-01", 1), c("b", 100n, "2026-11-01", 5), c("a", 100n, "2026-11-01", 5), c("c", 100n, "2026-11-01", 2), c("z", 0n, "2026-01-01")]);
  assert.deepEqual(orden.map((x) => x.id), ["c", "a", "b", "d"]);
});

test("un pago que cubre dos hijos se reparte entero entre sus cargos más antiguos", () => {
  const p = proponerDistribucion(200000n, [c("hijo1-nov", 100000n, "2026-11-10"), c("hijo2-nov", 100000n, "2026-11-10", 1), c("hijo1-dic", 100000n, "2026-12-10")]);
  assert.deepEqual(p, { ok: true, aplicaciones: [{ cargoId: "hijo1-nov", monto: 100000n }, { cargoId: "hijo2-nov", monto: 100000n }] });
});

test("pago parcial: se cubre en orden y el último cargo alcanzado queda con saldo", () => {
  const p = proponerDistribucion(150050n, [c("a", 100000n, "2026-11-10"), c("b", 100000n, "2026-12-10")]);
  assert.deepEqual(p, { ok: true, aplicaciones: [{ cargoId: "a", monto: 100000n }, { cargoId: "b", monto: 50050n }] });
  assert.deepEqual(proponerDistribucion(1n, [c("a", 100000n, "2026-11-10")]), { ok: true, aplicaciones: [{ cargoId: "a", monto: 1n }] });
});

test("un pago exacto, y uno mayor a lo adeudado se rechaza diciendo cuánto sobra (no hay saldo a favor)", () => {
  assert.deepEqual(proponerDistribucion(100000n, [c("a", 100000n, "2026-11-10")]), { ok: true, aplicaciones: [{ cargoId: "a", monto: 100000n }] });
  assert.deepEqual(proponerDistribucion(100001n, [c("a", 100000n, "2026-11-10")]), { ok: false, motivo: "excedente_sin_cargo", excedente: 1n });
  assert.deepEqual(proponerDistribucion(500n, []), { ok: false, motivo: "excedente_sin_cargo", excedente: 500n });
  assert.deepEqual(proponerDistribucion(0n, [c("a", 100n, "2026-11-10")]), { ok: false, motivo: "monto_invalido" });
  assert.deepEqual(proponerDistribucion(-5n, [c("a", 100n, "2026-11-10")]), { ok: false, motivo: "monto_invalido" });
});

test("es determinista: el mismo conjunto en cualquier orden da la misma propuesta", () => {
  const base = [c("a", 70000n, "2026-11-01", 3), c("b", 70000n, "2026-11-01", 1), c("c", 70000n, "2026-10-01", 9), c("d", 70000n, "2026-12-01", 0)];
  const esperado = JSON.stringify(proponerDistribucion(150000n, base), (_, v) => (typeof v === "bigint" ? v.toString() : v));
  const permutaciones: (typeof base)[] = [];
  for (let r = 0; r < base.length; r++) {
    const rotada = [...base.slice(r), ...base.slice(0, r)];
    permutaciones.push(rotada, [...rotada].reverse());
  }
  for (const p of permutaciones) assert.equal(JSON.stringify(proponerDistribucion(150000n, p), (_, v) => (typeof v === "bigint" ? v.toString() : v)), esperado);
});

test("el reparto manual se valida: cargo ajeno, repetido, parte que pasa del saldo, partes no positivas y suma distinta del pago", () => {
  const cargos = [c("a", 100000n, "2026-11-10"), c("b", 50000n, "2026-12-10")];
  assert.deepEqual(validarDistribucion(120000n, [{ cargoId: "b", monto: 50000n }, { cargoId: "a", monto: 70000n }], cargos), []);
  assert.deepEqual(validarDistribucion(100000n, [{ cargoId: "x", monto: 100000n }], cargos), [{ motivo: "cargo_ajeno", cargoId: "x" }]);
  assert.ok(validarDistribucion(200000n, [{ cargoId: "a", monto: 100000n }, { cargoId: "a", monto: 100000n }], cargos).some((p) => p.motivo === "cargo_repetido"));
  assert.deepEqual(validarDistribucion(60000n, [{ cargoId: "b", monto: 60000n }], cargos), [{ motivo: "excede_el_saldo", cargoId: "b", saldo: 50000n }]);
  assert.deepEqual(validarDistribucion(100000n, [{ cargoId: "a", monto: 50000n }], cargos), [{ motivo: "no_suma_el_monto", suma: 50000n, monto: 100000n }]);
  assert.ok(validarDistribucion(0n, [{ cargoId: "a", monto: 0n }], cargos).some((p) => p.motivo === "monto_invalido"));
});
