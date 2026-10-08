import { test } from "node:test";
import assert from "node:assert/strict";
import { condicionDe, validarBeneficio, validarCondicion } from "./condicion.ts";
import { MODOS_DE_BENEFICIO, TIPOS_DE_BENEFICIO } from "./tipos.ts";

test("condicion_valor: cada tipo acepta SOLO su forma", () => {
  assert.deepEqual(validarCondicion("sin_condicion", null), { ok: true, valor: null });
  assert.deepEqual(validarCondicion("sin_condicion", undefined), { ok: true, valor: null });
  assert.deepEqual(validarCondicion("al_pagar_primera_mensualidad", null), { ok: true, valor: null });
  assert.equal(validarCondicion("sin_condicion", { hermanos: 2 }).ok, false, "no lleva valor");
  assert.equal(validarCondicion("al_pagar_primera_mensualidad", {}).ok, false);
  assert.deepEqual(validarCondicion("min_hermanos", { hermanos: 2 }), { ok: true, valor: { hermanos: 2 } });
  assert.deepEqual(validarCondicion("pago_anticipado", { meses: 3 }), { ok: true, valor: { meses: 3 } });
  for (const mal of [null, undefined, 2, "2", [], {}, { hermanos: 1 }, { hermanos: 21 }, { hermanos: 2.5 }, { hermanos: "2" }, { hermanos: 2, extra: 1 }, { meses: 2 }]) {
    assert.equal(validarCondicion("min_hermanos", mal).ok, false, JSON.stringify(mal));
  }
  for (const mal of [null, {}, { meses: 0 }, { meses: 25 }, { meses: 1.5 }, { hermanos: 2 }, { meses: 2, otro: 1 }]) {
    assert.equal(validarCondicion("pago_anticipado", mal).ok, false, JSON.stringify(mal));
  }
  const r = validarCondicion("min_hermanos", { hermanos: 1 });
  assert.ok(!r.ok && r.errores[0]!.campo === "condicion_valor.hermanos");
});

test("condicionDe: lo guardado se vuelve la condición del resolutor; lo incoherente lanza", () => {
  assert.deepEqual(condicionDe("sin_condicion", null), { tipo: "sin_condicion" });
  assert.deepEqual(condicionDe("al_pagar_primera_mensualidad", null), { tipo: "al_pagar_primera_mensualidad" });
  assert.deepEqual(condicionDe("min_hermanos", { hermanos: 3 }), { tipo: "min_hermanos", hermanos: 3 });
  assert.deepEqual(condicionDe("pago_anticipado", { meses: 6 }), { tipo: "pago_anticipado", meses: 6 });
  assert.throws(() => condicionDe("min_hermanos", null), /inválida/);
});

test("beneficio: la matriz completa de tipo × modo × valor", () => {
  const ok = (t: (typeof TIPOS_DE_BENEFICIO)[number], m: (typeof MODOS_DE_BENEFICIO)[number], v: string | null | undefined, esperado: string | null) =>
    assert.deepEqual(validarBeneficio(t, m, v), { ok: true, valor: esperado }, `${t}/${m}/${v}`);
  const mal = (t: (typeof TIPOS_DE_BENEFICIO)[number], m: (typeof MODOS_DE_BENEFICIO)[number], v: string | null | undefined, campo: string) => {
    const r = validarBeneficio(t, m, v);
    assert.ok(!r.ok && r.errores[0]!.campo === campo, `${t}/${m}/${v}: ${JSON.stringify(r)}`);
  };
  for (const t of ["descuento_inscripcion", "descuento_mensualidad"] as const) {
    ok(t, "total", null, null);
    ok(t, "total", undefined, null);
    ok(t, "porcentaje", "15", "15.00");
    ok(t, "porcentaje", "12.5", "12.50");
    ok(t, "porcentaje", "100", "100.00");
    ok(t, "porcentaje", "0.01", "0.01");
    ok(t, "monto_fijo", "150", "150.00");
    ok(t, "monto_fijo", "150.5", "150.50");
    ok(t, "monto_fijo", "9999999999.99", "9999999999.99");
    mal(t, "total", "10", "valor");
    mal(t, "porcentaje", null, "valor");
    mal(t, "porcentaje", "0", "valor");
    mal(t, "porcentaje", "100.01", "valor");
    mal(t, "porcentaje", "-5", "valor");
    mal(t, "porcentaje", "1.234", "valor");
    mal(t, "porcentaje", "15%", "valor");
    mal(t, "monto_fijo", null, "valor");
    mal(t, "monto_fijo", "0", "valor");
    mal(t, "monto_fijo", "0.00", "valor");
    mal(t, "monto_fijo", "1,500", "valor");
    mal(t, "monto_fijo", "10000000000", "valor");
  }
  ok("producto_gratis", "total", null, null);
  mal("producto_gratis", "total", "1", "valor");
  mal("producto_gratis", "porcentaje", null, "modo");
  mal("producto_gratis", "monto_fijo", null, "modo");
  ok("meses_gratis", "total", "1", "1.00");
  ok("meses_gratis", "total", "24", "24.00");
  mal("meses_gratis", "total", "0", "valor");
  mal("meses_gratis", "total", "25", "valor");
  mal("meses_gratis", "total", "1.5", "valor");
  mal("meses_gratis", "total", null, "valor");
  mal("meses_gratis", "porcentaje", "2", "modo");
  mal("meses_gratis", "monto_fijo", "2", "modo");
});
