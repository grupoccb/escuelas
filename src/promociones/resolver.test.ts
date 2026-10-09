// Resolutor de promociones (C3): cada condición, bordes de fecha, alcance, prioridad y acumulación, cupo y
// montos exactos. Todo con nombres neutros (invariante 2).

import { test } from "node:test";
import assert from "node:assert/strict";
import { aTexto, deTexto } from "../lib/dinero.ts";
import { motivoDeDescarte, resolverPromociones, type BeneficioDef, type ContextoPromocion, type PromocionDef } from "./resolver.ts";

const ctx = (extra: Partial<ContextoPromocion> = {}): ContextoPromocion => ({
  fecha: "2026-10-15",
  verticalId: "v1",
  sucursalId: "s1",
  programaId: "p1",
  hermanosInscritos: 0,
  mesesPagadosPorAdelantado: 0,
  costoInscripcion: deTexto("1234.50"),
  costoMensualidad: deTexto("900.00"),
  ...extra,
});

let contador = 0;
const beneficio = (b: Partial<BeneficioDef> & Pick<BeneficioDef, "tipo" | "modo">): BeneficioDef => ({
  id: `b${String(++contador).padStart(3, "0")}`,
  valor: null,
  productoId: null,
  descripcion: null,
  momento: "inmediato",
  ...b,
});
const promo = (id: string, extra: Partial<PromocionDef> = {}, ...beneficios: BeneficioDef[]): PromocionDef => ({
  id,
  nombre: `Promoción ${id}`,
  codigo: id.toUpperCase(),
  activa: true,
  vigenciaDesde: "2026-01-01",
  vigenciaHasta: null,
  condicion: { tipo: "sin_condicion" },
  cupoMaximo: null,
  cupoUsado: 0,
  acumulable: false,
  prioridad: 0,
  alcance: { verticales: [], sucursales: [], programas: [] },
  beneficios,
  ...extra,
});
const pct = (valor: string, tipo: "descuento_inscripcion" | "descuento_mensualidad" = "descuento_inscripcion") => beneficio({ tipo, modo: "porcentaje", valor });
const fijo = (valor: string, tipo: "descuento_inscripcion" | "descuento_mensualidad" = "descuento_inscripcion") => beneficio({ tipo, modo: "monto_fijo", valor });
const gratis = (tipo: "descuento_inscripcion" | "descuento_mensualidad" = "descuento_inscripcion") => beneficio({ tipo, modo: "total" });

test("15 % de la inscripción de $1,234.50 = $185.18 y se paga $1,049.32 (montos exactos, sin flotantes)", () => {
  const r = resolverPromociones([promo("a", {}, pct("15.00"))], ctx());
  assert.equal(aTexto(r.inscripcion.descuentoAhora), "185.18");
  assert.equal(aTexto(r.inscripcion.finalAhora), "1049.32");
  assert.equal(aTexto(r.inscripcion.original), "1234.50");
  assert.equal(r.inscripcion.descuentoAhora + r.inscripcion.finalAhora, r.inscripcion.original);
  assert.equal(r.lineas.length, 1);
  assert.equal(r.lineas[0]!.estado, "inmediato");
  assert.equal(r.mensualidad.descuentoAhora, 0n);
});

test("monto fijo, gratis (total) y mensualidad recurrente; un descuento mayor que el importe lo deja en cero (nunca negativo)", () => {
  const r = resolverPromociones([promo("a", { acumulable: true }, fijo("200.25"), gratis("descuento_mensualidad"))], ctx());
  assert.equal(aTexto(r.inscripcion.finalAhora), "1034.25");
  assert.equal(aTexto(r.mensualidad.finalAhora), "0.00");
  const grande = resolverPromociones([promo("a", {}, fijo("5000.00"))], ctx());
  assert.equal(aTexto(grande.inscripcion.finalAhora), "0.00");
  assert.equal(aTexto(grande.lineas[0]!.descuento), "1234.50", "el descuento se recorta al importe");
  assert.equal(aTexto(resolverPromociones([promo("a", {}, gratis())], ctx()).inscripcion.finalAhora), "0.00");
});

test("varios descuentos se calculan sobre el ORIGINAL (no en cascada): 10 % + 10 % = 20 %, y se recortan en orden al llegar a cero", () => {
  const r = resolverPromociones([promo("a", { acumulable: true }, pct("10")), promo("b", { acumulable: true }, pct("10"))], ctx({ costoInscripcion: deTexto("1000.00") }));
  assert.equal(aTexto(r.inscripcion.descuentoAhora), "200.00");
  const recorte = resolverPromociones(
    [promo("a", { acumulable: true, prioridad: 5 }, pct("80")), promo("b", { acumulable: true, prioridad: 1 }, pct("50"))],
    ctx({ costoInscripcion: deTexto("1000.00") }),
  );
  assert.deepEqual(recorte.lineas.map((l) => [l.promocionId, aTexto(l.descuento)]), [["a", "800.00"], ["b", "200.00"]], "el segundo solo alcanza lo que queda");
  assert.equal(aTexto(recorte.inscripcion.finalAhora), "0.00");
});

test("meses gratis: el ahorro es n × la mensualidad ya con el descuento recurrente; cuenta los inmediatos y los pendientes por separado", () => {
  const r = resolverPromociones(
    [promo("a", { acumulable: true }, pct("10", "descuento_mensualidad"), beneficio({ tipo: "meses_gratis", modo: "total", valor: "2.00" }))],
    ctx({ costoMensualidad: deTexto("900.00") }),
  );
  assert.equal(aTexto(r.mensualidad.finalAhora), "810.00");
  assert.equal(r.mesesGratisAhora, 2);
  assert.equal(r.mesesGratisDiferidos, 0);
  const meses = r.lineas.find((l) => l.tipo === "meses_gratis")!;
  assert.equal(meses.meses, 2);
  assert.equal(aTexto(meses.descuento), "1620.00");
  const diferido = resolverPromociones(
    [promo("a", { condicion: { tipo: "al_pagar_primera_mensualidad" } }, beneficio({ tipo: "meses_gratis", modo: "total", valor: "1.00", momento: "al_cumplir_condicion" }))],
    ctx(),
  );
  assert.deepEqual([diferido.mesesGratisAhora, diferido.mesesGratisDiferidos], [0, 1]);
});

test("al pagar la primera mensualidad: lo inmediato aplica ya y lo diferido queda PENDIENTE (con su monto aparte)", () => {
  const uniforme = beneficio({ tipo: "producto_gratis", modo: "total", momento: "al_cumplir_condicion", descripcion: "Uniforme", productoId: "00000000-0000-4000-8000-000000000999" });
  const r = resolverPromociones(
    [promo("a", { condicion: { tipo: "al_pagar_primera_mensualidad" } }, gratis(), uniforme, beneficio({ tipo: "descuento_mensualidad", modo: "monto_fijo", valor: "100.00", momento: "al_cumplir_condicion" }))],
    ctx(),
  );
  assert.equal(aTexto(r.inscripcion.finalAhora), "0.00", "la inscripción gratis rige ya");
  assert.equal(aTexto(r.mensualidad.finalAhora), "900.00", "el descuento diferido todavía no");
  assert.equal(aTexto(r.mensualidad.descuentoDiferido), "100.00");
  assert.equal(aTexto(r.mensualidad.finalConDiferidos), "800.00");
  const pendiente = r.lineas.find((l) => l.tipo === "producto_gratis")!;
  assert.deepEqual([pendiente.estado, pendiente.descripcion, pendiente.productoId, pendiente.descuento], ["pendiente", "Uniforme", "00000000-0000-4000-8000-000000000999", 0n]);
  assert.deepEqual(r.lineas.map((l) => l.estado).sort(), ["inmediato", "pendiente", "pendiente"]);
});

test("un beneficio «al cumplir la condición» con otra condición ya cumplida (hermanos) es inmediato", () => {
  const r = resolverPromociones([promo("a", { condicion: { tipo: "min_hermanos", hermanos: 2 } }, beneficio({ tipo: "descuento_inscripcion", modo: "total", momento: "al_cumplir_condicion" }))], ctx({ hermanosInscritos: 1 }));
  assert.equal(r.lineas[0]!.estado, "inmediato");
  assert.equal(aTexto(r.inscripcion.finalAhora), "0.00");
});

test("condición min_hermanos(n): cuenta al que se inscribe (hermanosInscritos + 1 ≥ n)", () => {
  const p2 = promo("a", { condicion: { tipo: "min_hermanos", hermanos: 2 } }, pct("10"));
  assert.equal(motivoDeDescarte(p2, ctx({ hermanosInscritos: 0 })), "condicion_no_cumplida");
  assert.equal(motivoDeDescarte(p2, ctx({ hermanosInscritos: 1 })), null);
  assert.equal(motivoDeDescarte(p2, ctx({ hermanosInscritos: 5 })), null);
  const p3 = promo("a", { condicion: { tipo: "min_hermanos", hermanos: 3 } }, pct("10"));
  assert.equal(motivoDeDescarte(p3, ctx({ hermanosInscritos: 1 })), "condicion_no_cumplida");
  assert.equal(motivoDeDescarte(p3, ctx({ hermanosInscritos: 2 })), null);
});

test("condición pago_anticipado(m): meses pagados por adelantado ≥ m", () => {
  const p = promo("a", { condicion: { tipo: "pago_anticipado", meses: 3 } }, pct("10"));
  assert.equal(motivoDeDescarte(p, ctx({ mesesPagadosPorAdelantado: 0 })), "condicion_no_cumplida");
  assert.equal(motivoDeDescarte(p, ctx({ mesesPagadosPorAdelantado: 2 })), "condicion_no_cumplida");
  assert.equal(motivoDeDescarte(p, ctx({ mesesPagadosPorAdelantado: 3 })), null);
  assert.equal(motivoDeDescarte(p, ctx({ mesesPagadosPorAdelantado: 12 })), null);
});

test("vigencia: desde y hasta INCLUSIVOS; abierta; el día antes y el día después no", () => {
  const p = promo("a", { vigenciaDesde: "2026-10-01", vigenciaHasta: "2026-10-31" }, pct("10"));
  assert.equal(motivoDeDescarte(p, ctx({ fecha: "2026-09-30" })), "fuera_de_vigencia");
  assert.equal(motivoDeDescarte(p, ctx({ fecha: "2026-10-01" })), null);
  assert.equal(motivoDeDescarte(p, ctx({ fecha: "2026-10-31" })), null);
  assert.equal(motivoDeDescarte(p, ctx({ fecha: "2026-11-01" })), "fuera_de_vigencia");
  const abierta = promo("a", { vigenciaDesde: "2026-10-01", vigenciaHasta: null }, pct("10"));
  assert.equal(motivoDeDescarte(abierta, ctx({ fecha: "2099-01-01" })), null);
  assert.equal(motivoDeDescarte(abierta, ctx({ fecha: "2026-09-30" })), "fuera_de_vigencia");
  assert.equal(motivoDeDescarte(promo("a", { vigenciaDesde: "2026-10-15", vigenciaHasta: "2026-10-15" }, pct("1")), ctx({ fecha: "2026-10-15" })), null, "de un solo día");
});

test("alcance: lista vacía = todos; con listas, TODAS (vertical, sucursal y programa) tienen que incluir al contexto", () => {
  const con = (verticales: string[], sucursales: string[], programas: string[]) => promo("a", { alcance: { verticales, sucursales, programas } }, pct("10"));
  assert.equal(motivoDeDescarte(con([], [], []), ctx()), null);
  assert.equal(motivoDeDescarte(con(["v1"], [], []), ctx()), null);
  assert.equal(motivoDeDescarte(con(["v2"], [], []), ctx()), "fuera_de_alcance");
  assert.equal(motivoDeDescarte(con([], ["s2"], []), ctx()), "fuera_de_alcance");
  assert.equal(motivoDeDescarte(con([], ["s1", "s2"], []), ctx()), null);
  assert.equal(motivoDeDescarte(con([], [], ["p2"]), ctx()), "fuera_de_alcance");
  assert.equal(motivoDeDescarte(con(["v1"], ["s1"], ["p1"]), ctx()), null);
  assert.equal(motivoDeDescarte(con(["v1"], ["s1"], ["p2"]), ctx()), "fuera_de_alcance", "una sola lista que no incluye basta para quedar fuera");
});

test("cupo: aplica con un lugar libre, no cuando cupo_usado llegó al máximo; sin tope siempre", () => {
  const con = (max: number | null, usado: number) => promo("a", { cupoMaximo: max, cupoUsado: usado }, pct("10"));
  assert.equal(motivoDeDescarte(con(1, 0), ctx()), null);
  assert.equal(motivoDeDescarte(con(1, 1), ctx()), "sin_cupo");
  assert.equal(motivoDeDescarte(con(10, 9), ctx()), null);
  assert.equal(motivoDeDescarte(con(10, 10), ctx()), "sin_cupo");
  assert.equal(motivoDeDescarte(con(10, 11), ctx()), "sin_cupo", "más usados que el tope (se bajó el tope)");
  assert.equal(motivoDeDescarte(con(null, 9999), ctx()), null);
});

test("una promoción inactiva no aplica; el orden de los motivos es inactiva, vigencia, alcance, condición, cupo", () => {
  assert.equal(motivoDeDescarte(promo("a", { activa: false }, pct("10")), ctx()), "inactiva");
  const todoMal = promo("a", { activa: false, vigenciaDesde: "2030-01-01", alcance: { verticales: ["x"], sucursales: [], programas: [] }, condicion: { tipo: "min_hermanos", hermanos: 5 }, cupoMaximo: 1, cupoUsado: 1 }, pct("10"));
  assert.equal(motivoDeDescarte(todoMal, ctx()), "inactiva");
  assert.equal(motivoDeDescarte({ ...todoMal, activa: true }, ctx()), "fuera_de_vigencia");
  assert.equal(motivoDeDescarte({ ...todoMal, activa: true, vigenciaDesde: "2026-01-01" }, ctx()), "fuera_de_alcance");
  assert.equal(motivoDeDescarte({ ...todoMal, activa: true, vigenciaDesde: "2026-01-01", alcance: { verticales: [], sucursales: [], programas: [] } }, ctx()), "condicion_no_cumplida");
});

test("las NO acumulables compiten: gana la de mayor prioridad; a igualdad de prioridad, la que más beneficia al cliente; a igualdad de beneficio, el menor id (V2, decisión 6)", () => {
  const a = promo("a", { prioridad: 1 }, pct("10"));
  const b = promo("b", { prioridad: 5 }, pct("20"));
  const c = promo("c", { prioridad: 5 }, pct("30"));
  const r = resolverPromociones([a, c, b], ctx({ costoInscripcion: deTexto("1000.00") }));
  assert.deepEqual(r.aplicadas.map((x) => x.promocionId), ["c"], "b y c empatan en prioridad: gana la de 30 % (más beneficia al cliente), no la de menor id");
  assert.equal(aTexto(r.inscripcion.descuentoAhora), "300.00");
  assert.deepEqual(r.descartadas.map((d) => [d.promocionId, d.motivo]), [["a", "pierde_por_prioridad"], ["b", "pierde_por_prioridad"]]);
  // Con el mismo beneficio, el menor id.
  const iguales = resolverPromociones([promo("z", { prioridad: 5 }, pct("20")), promo("y", { prioridad: 5 }, pct("20"))], ctx());
  assert.deepEqual(iguales.aplicadas.map((x) => x.promocionId), ["y"]);
  // La prioridad puede ser negativa.
  assert.deepEqual(resolverPromociones([promo("x", { prioridad: -1 }, pct("1")), promo("y", { prioridad: -2 }, pct("2"))], ctx()).aplicadas.map((x) => x.promocionId), ["x"]);
});

test("las acumulables se SUMAN todas entre sí; una no acumulable NO se combina con ellas (ni ellas con ella); una no acumulable que no aplica no estorba (V2, decisión 6)", () => {
  const noAcumulable = promo("g", { prioridad: 9 }, pct("10"));
  const perdedora = promo("p", { prioridad: 1 }, pct("50"));
  const suma1 = promo("s1", { acumulable: true, prioridad: 0 }, pct("5"));
  const suma2 = promo("s2", { acumulable: true, prioridad: 3 }, pct("5"));
  // La no acumulable de mayor prioridad gana SOLA: ni las acumulables ni la otra no acumulable se le suman.
  const r = resolverPromociones([perdedora, suma1, noAcumulable, suma2], ctx({ costoInscripcion: deTexto("1000.00") }));
  assert.deepEqual(r.aplicadas.map((x) => x.promocionId), ["g"]);
  assert.equal(aTexto(r.inscripcion.descuentoAhora), "100.00", "solo el 10 % de la ganadora");
  assert.deepEqual(r.descartadas.map((d) => [d.promocionId, d.motivo]), [["p", "pierde_por_prioridad"], ["s1", "pierde_por_prioridad"], ["s2", "pierde_por_prioridad"]]);
  // Sin no acumulables, las acumulables se suman todas, en orden de prioridad.
  const sumas = resolverPromociones([suma1, suma2], ctx({ costoInscripcion: deTexto("1000.00") }));
  assert.deepEqual(sumas.aplicadas.map((x) => x.promocionId), ["s2", "s1"]);
  assert.equal(aTexto(sumas.inscripcion.descuentoAhora), "100.00", "5 % + 5 %");
  // La mejor no acumulable está fuera de vigencia: la siguiente toma su lugar.
  const fuera = promo("f", { prioridad: 99, vigenciaHasta: "2026-01-01" }, pct("90"));
  const r2 = resolverPromociones([fuera, perdedora], ctx());
  assert.deepEqual(r2.aplicadas.map((x) => x.promocionId), ["p"]);
  assert.equal(r2.descartadas[0]!.motivo, "fuera_de_vigencia");
});

test("el resultado NO depende del orden de entrada (determinismo): 30 barajas distintas dan exactamente lo mismo", () => {
  const todas = [
    promo("a", { prioridad: 2 }, pct("10"), beneficio({ tipo: "producto_gratis", modo: "total", momento: "al_cumplir_condicion" })),
    promo("b", { prioridad: 2, acumulable: true }, fijo("50.00"), pct("5", "descuento_mensualidad")),
    promo("c", { prioridad: 7, condicion: { tipo: "al_pagar_primera_mensualidad" } }, gratis(), beneficio({ tipo: "meses_gratis", modo: "total", valor: "1.00", momento: "al_cumplir_condicion" })),
    promo("d", { prioridad: 7, acumulable: true }, pct("2.5")),
    promo("e", { activa: false }, pct("99")),
    promo("f", { cupoMaximo: 1, cupoUsado: 1 }, pct("99")),
  ];
  const base = JSON.stringify(resolverPromociones(todas, ctx()), (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
  let semilla = 12345;
  const azar = (): number => {
    semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
    return semilla;
  };
  for (let vez = 0; vez < 30; vez++) {
    const baraja = [...todas];
    for (let i = baraja.length - 1; i > 0; i--) {
      const j = azar() % (i + 1);
      [baraja[i], baraja[j]] = [baraja[j]!, baraja[i]!];
    }
    assert.equal(JSON.stringify(resolverPromociones(baraja, ctx()), (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)), base, `baraja ${vez}`);
  }
});

test("sin promociones, o ninguna aplicable: nada se descuenta y los totales son los originales", () => {
  for (const r of [resolverPromociones([], ctx()), resolverPromociones([promo("a", { activa: false }, pct("10"))], ctx())]) {
    assert.deepEqual(r.aplicadas, []);
    assert.equal(r.inscripcion.finalAhora, r.inscripcion.original);
    assert.equal(r.mensualidad.finalConDiferidos, r.mensualidad.original);
    assert.deepEqual([r.mesesGratisAhora, r.mesesGratisDiferidos, r.lineas.length], [0, 0, 0]);
  }
});

test("una promoción sin beneficios aplica sin efecto; un beneficio de importe sin valor es un dato corrupto y lanza", () => {
  assert.deepEqual(resolverPromociones([promo("a")], ctx()).aplicadas.map((x) => x.promocionId), ["a"]);
  assert.throws(() => resolverPromociones([promo("a", {}, beneficio({ tipo: "descuento_inscripcion", modo: "porcentaje", valor: null }))], ctx()), /sin valor/);
});

test("EC-09 (R18): solo las líneas de meses gratis llevan meses; descuentos y productos llevan 0", () => {
  const r = resolverPromociones(
    [
      promo("a", { acumulable: true }, beneficio({ tipo: "descuento_inscripcion", modo: "porcentaje", valor: "10.00" }), beneficio({ tipo: "descuento_mensualidad", modo: "monto_fijo", valor: "50.00" }), beneficio({ tipo: "producto_gratis", modo: "total", descripcion: "un regalo" })),
      promo("b", { acumulable: true }, beneficio({ tipo: "meses_gratis", modo: "total", valor: "2.00" })),
    ],
    ctx(),
  );
  assert.deepEqual(r.lineas.map((l) => [l.tipo, l.meses]), [["descuento_inscripcion", 0], ["descuento_mensualidad", 0], ["producto_gratis", 0], ["meses_gratis", 2]]);
});
