// V2, decisión 6: una promoción NO acumulable no se combina con ninguna otra. Pruebas de tabla y de propiedad sobre el resolutor puro: TODAS las combinaciones de
// acumulable / no acumulable con prioridades y beneficios que empatan o no, el orden de entrada irrelevante (todas las permutaciones), montos exactos en centavos, el desempate
// (prioridad → beneficio al cliente → menor id) y los caminos de promociones diferidas y por hermanos. Nombres neutros (invariante 2).

import { test } from "node:test";
import assert from "node:assert/strict";
import { aTexto, deTexto } from "../lib/dinero.ts";
import { resolverPromociones, type BeneficioDef, type ContextoPromocion, type PromocionDef, type ResultadoPromociones } from "./resolver.ts";

const ctx = (extra: Partial<ContextoPromocion> = {}): ContextoPromocion => ({
  fecha: "2026-10-15",
  verticalId: "v1",
  sucursalId: "s1",
  programaId: "p1",
  hermanosInscritos: 0,
  mesesPagadosPorAdelantado: 0,
  costoInscripcion: deTexto("1000.00"),
  costoMensualidad: deTexto("900.00"),
  ...extra,
});

let n = 0;
const beneficio = (b: Partial<BeneficioDef> & Pick<BeneficioDef, "tipo" | "modo">): BeneficioDef => ({ id: `b${String(++n).padStart(4, "0")}`, valor: null, productoId: null, descripcion: null, momento: "inmediato", ...b });
const pct = (valor: string, tipo: "descuento_inscripcion" | "descuento_mensualidad" = "descuento_inscripcion", momento: BeneficioDef["momento"] = "inmediato") => beneficio({ tipo, modo: "porcentaje", valor, momento });
const promo = (id: string, extra: Partial<PromocionDef>, ...beneficios: BeneficioDef[]): PromocionDef => ({
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

const ids = (r: ResultadoPromociones): string[] => r.aplicadas.map((a) => a.promocionId);
const json = (r: ResultadoPromociones): string => JSON.stringify(r, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
function permutaciones<T>(xs: readonly T[]): T[][] {
  if (xs.length <= 1) return [[...xs]];
  return xs.flatMap((x, i) => permutaciones([...xs.slice(0, i), ...xs.slice(i + 1)]).map((resto) => [x, ...resto]));
}

/** Todas las asignaciones de «acumulable o no» a `k` promociones: 2^k filas. */
const combinaciones = (k: number): boolean[][] => Array.from({ length: 2 ** k }, (_, mascara) => Array.from({ length: k }, (_, i) => ((mascara >> i) & 1) === 1));

// ── Los casos de la regla, con montos exactos ───────────────────────────────────────────────────────────────

test("una acumulable NUNCA se suma a una no acumulable ganadora, y una no acumulable NUNCA entra en el grupo de acumulables ganador (con montos exactos)", () => {
  // Prioridad 9 la no acumulable (30 % = $300.00); acumulables de prioridad baja (10 % + 5 % = $150.00): gana la no acumulable, SOLA.
  const n1 = promo("n1", { prioridad: 9 }, pct("30"));
  const a1 = promo("a1", { acumulable: true, prioridad: 1 }, pct("10"));
  const a2 = promo("a2", { acumulable: true, prioridad: 2 }, pct("5"));
  const gana = resolverPromociones([a1, n1, a2], ctx());
  assert.deepEqual(ids(gana), ["n1"]);
  assert.equal(aTexto(gana.inscripcion.descuentoAhora), "300.00");
  assert.equal(aTexto(gana.inscripcion.finalAhora), "700.00");
  assert.deepEqual(gana.descartadas.map((d) => [d.promocionId, d.motivo]), [["a1", "pierde_por_prioridad"], ["a2", "pierde_por_prioridad"]]);
  // Al revés: las acumulables de mayor prioridad ganan JUNTAS y la no acumulable (aunque dé más) queda fuera.
  const a1Alta = { ...a1, prioridad: 20 };
  const a2Alta = { ...a2, prioridad: 19 };
  const grupo = resolverPromociones([n1, a1Alta, a2Alta], ctx());
  assert.deepEqual(ids(grupo), ["a1", "a2"], "en orden de prioridad");
  assert.equal(aTexto(grupo.inscripcion.descuentoAhora), "150.00", "10 % + 5 % de $1,000.00, sin el 30 % de la no acumulable");
  assert.deepEqual(grupo.descartadas.map((d) => [d.promocionId, d.motivo]), [["n1", "pierde_por_prioridad"]]);
});

test("dos no acumulables jamás se combinan: gana UNA, aunque ambas sean de la misma prioridad", () => {
  const r = resolverPromociones([promo("x", { prioridad: 3 }, pct("10")), promo("y", { prioridad: 3 }, pct("10", "descuento_mensualidad"))], ctx());
  assert.equal(r.aplicadas.length, 1);
});

test("DESEMPATE documentado: prioridad → mayor beneficio al cliente → menor id de la cabeza; entre una no acumulable y el grupo de acumulables, el grupo vale la suma de sus descuentos", () => {
  // Misma prioridad: la no acumulable (20 % = $200.00) contra el grupo de acumulables (5 % + 10 % = $150.00): gana la no acumulable por beneficio.
  const n1 = promo("n1", { prioridad: 5 }, pct("20"));
  const a1 = promo("a1", { acumulable: true, prioridad: 5 }, pct("5"));
  const a2 = promo("a2", { acumulable: true, prioridad: 5 }, pct("10"));
  assert.deepEqual(ids(resolverPromociones([a1, a2, n1], ctx())), ["n1"]);
  // Si el grupo suma más ($250.00 con 15 % + 10 %), gana el grupo.
  assert.deepEqual(ids(resolverPromociones([{ ...a1, beneficios: [pct("15")] }, a2, n1], ctx())), ["a1", "a2"]);
  // Mismo beneficio exacto ($200.00 = 10 % + 10 %): gana la cabeza de menor id. Cabeza del grupo = su primera acumulable (a1); la no acumulable «n1» pierde contra «a1»…
  const empate = [promo("n1", { prioridad: 5 }, pct("20")), promo("a1", { acumulable: true, prioridad: 5 }, pct("10")), promo("a2", { acumulable: true, prioridad: 5 }, pct("10"))];
  assert.deepEqual(ids(resolverPromociones(empate, ctx())), ["a1", "a2"]);
  // …y si la no acumulable se llama «0» (id menor), gana ella.
  assert.deepEqual(ids(resolverPromociones([{ ...empate[0]!, id: "0" }, empate[1]!, empate[2]!], ctx())), ["0"]);
  // La prioridad pesa más que el beneficio: 1 punto más de prioridad le gana a más dinero.
  assert.deepEqual(ids(resolverPromociones([promo("n1", { prioridad: 6 }, pct("1")), promo("n2", { prioridad: 5 }, pct("90"))], ctx())), ["n1"]);
  // El beneficio mide también lo diferido y los meses gratis: meses gratis (2 × $900.00 = $1,800.00) > 50 % de la inscripción ($500.00).
  const meses = promo("m", { prioridad: 5 }, beneficio({ tipo: "meses_gratis", modo: "total", valor: "2.00" }));
  assert.deepEqual(ids(resolverPromociones([promo("d", { prioridad: 5 }, pct("50")), meses], ctx())), ["m"]);
});

test("promociones DIFERIDAS: una no acumulable con beneficio al pagar la primera mensualidad no arrastra acumulables; sus montos pendientes son exactos", () => {
  const diferida = promo("dif", { prioridad: 4, condicion: { tipo: "al_pagar_primera_mensualidad" } }, pct("100", "descuento_inscripcion", "al_cumplir_condicion"), pct("10", "descuento_mensualidad"));
  const suma = promo("suma", { acumulable: true, prioridad: 1 }, pct("5"));
  const r = resolverPromociones([suma, diferida], ctx());
  assert.deepEqual(ids(r), ["dif"]);
  assert.equal(aTexto(r.inscripcion.descuentoAhora), "0.00", "la inscripción gratis es del que paga la primera mensualidad: queda pendiente");
  assert.equal(aTexto(r.inscripcion.descuentoDiferido), "1000.00");
  assert.equal(aTexto(r.mensualidad.descuentoAhora), "90.00");
  assert.equal(aTexto(r.inscripcion.finalAhora), "1000.00");
  assert.equal(aTexto(r.inscripcion.finalConDiferidos), "0.00");
  assert.deepEqual(r.lineas.map((l) => [l.promocionId, l.estado]), [["dif", "pendiente"], ["dif", "inmediato"]]);
  // Con la diferida más baja que la acumulable, ganan las acumulables y NO queda nada diferido.
  const sinDiferida = resolverPromociones([{ ...suma, prioridad: 8 }, diferida], ctx());
  assert.deepEqual(ids(sinDiferida), ["suma"]);
  assert.equal(sinDiferida.inscripcion.descuentoDiferido, 0n);
  assert.equal(sinDiferida.mesesGratisDiferidos, 0);
});

test("promoción por HERMANOS (no acumulable): con el hermano inscrito gana sola y no arrastra acumulables; sin él, ni compite y las acumulables sí se aplican", () => {
  const hermanos = promo("herm", { prioridad: 5, condicion: { tipo: "min_hermanos", hermanos: 2 } }, pct("20", "descuento_mensualidad"));
  const suma = promo("suma", { acumulable: true, prioridad: 1 }, pct("10", "descuento_mensualidad"));
  const con = resolverPromociones([suma, hermanos], ctx({ hermanosInscritos: 1 }));
  assert.deepEqual(ids(con), ["herm"]);
  assert.equal(aTexto(con.mensualidad.descuentoAhora), "180.00", "20 % de $900.00, sin el 10 % acumulable");
  const sin = resolverPromociones([suma, hermanos], ctx({ hermanosInscritos: 0 }));
  assert.deepEqual(ids(sin), ["suma"]);
  assert.equal(aTexto(sin.mensualidad.descuentoAhora), "90.00");
  assert.deepEqual(sin.descartadas.map((d) => [d.promocionId, d.motivo]), [["herm", "condicion_no_cumplida"]]);
});

test("cupo agotado: la no acumulable ganadora sin cupo deja su lugar al siguiente (el grupo de acumulables aparece cuando ya no hay quien lo bloquee)", () => {
  const n1 = promo("n1", { prioridad: 9, cupoMaximo: 1, cupoUsado: 1 }, pct("50"));
  const a1 = promo("a1", { acumulable: true, prioridad: 1 }, pct("5"));
  const r = resolverPromociones([n1, a1], ctx());
  assert.deepEqual(ids(r), ["a1"]);
  assert.deepEqual(r.descartadas.map((d) => [d.promocionId, d.motivo]), [["n1", "sin_cupo"]]);
});

// ── Todas las combinaciones ──────────────────────────────────────────────────────────────────────────────────

/** Un caso: cada promoción con su acumulabilidad, su prioridad y su porcentaje (todas descuentan la inscripción). */
interface Caso { acumulables: boolean[]; prioridades: number[]; porcentajes: string[] }

function armar(c: Caso): PromocionDef[] {
  return c.acumulables.map((acumulable, i) => promo(`p${i}`, { acumulable, prioridad: c.prioridades[i]! }, pct(c.porcentajes[i]!)));
}

/** El oráculo: escrito aparte del resolutor. Opciones = cada no acumulable sola + el grupo de todas las acumulables; orden: prioridad de la cabeza, beneficio, id. */
function esperadas(promos: readonly PromocionDef[]): string[] {
  const beneficio = (grupo: readonly PromocionDef[]): bigint => {
    // Un conjunto de un solo grupo no compite con nada: el resolutor lo devuelve tal cual y mide sus líneas.
    const r = resolverPromociones(grupo, ctx());
    return r.lineas.reduce((t, l) => t + l.descuento, 0n);
  };
  const porPrioridad = [...promos].sort((a, b) => b.prioridad - a.prioridad || (a.id < b.id ? -1 : 1));
  const acumulables = porPrioridad.filter((p) => p.acumulable);
  const noAcumulables = porPrioridad.filter((p) => !p.acumulable);
  if (noAcumulables.length === 0) return acumulables.map((p) => p.id);
  const opciones = noAcumulables.map((p) => ({ cabeza: p, grupo: [p] }));
  if (acumulables.length > 0) opciones.push({ cabeza: acumulables[0]!, grupo: acumulables });
  opciones.sort((a, b) => {
    if (a.cabeza.prioridad !== b.cabeza.prioridad) return b.cabeza.prioridad - a.cabeza.prioridad;
    const ba = beneficio(a.grupo);
    const bb = beneficio(b.grupo);
    if (ba !== bb) return ba > bb ? -1 : 1;
    return a.cabeza.id < b.cabeza.id ? -1 : 1;
  });
  return opciones[0]!.grupo.map((p) => p.id);
}

test("TODAS las combinaciones de acumulable / no acumulable de 1 a 5 promociones, con prioridades y beneficios que empatan o no: coincide con el oráculo, nunca mezcla y los montos son exactos", () => {
  const prioridadesPosibles = [[0, 0, 0, 0, 0], [1, 2, 3, 4, 5], [5, 4, 3, 2, 1], [3, 3, 1, 1, 2], [2, 2, 2, 1, 1]];
  const porcentajesPosibles = [["10", "20", "30", "40", "50"], ["20", "20", "20", "20", "20"], ["50", "40", "30", "20", "10"], ["15", "15", "5", "5", "25"]];
  let casos = 0;
  for (let k = 1; k <= 5; k++) {
    for (const acumulables of combinaciones(k)) {
      for (const prio of prioridadesPosibles) {
        for (const pcts of porcentajesPosibles) {
          const c: Caso = { acumulables, prioridades: prio.slice(0, k), porcentajes: pcts.slice(0, k) };
          const promos = armar(c);
          const r = resolverPromociones(promos, ctx());
          const donde = JSON.stringify(c);
          casos++;

          // 1. Coincide con el oráculo.
          assert.deepEqual(ids(r), esperadas(promos), donde);
          // 2. Nunca se mezclan: o una sola no acumulable, o solo acumulables.
          const aplicadas = promos.filter((p) => ids(r).includes(p.id));
          if (aplicadas.some((p) => !p.acumulable)) assert.equal(aplicadas.length, 1, `una no acumulable va sola: ${donde}`);
          else assert.equal(aplicadas.length, promos.filter((p) => p.acumulable).length, `sin no acumulables ganando, todas las acumulables van: ${donde}`);
          // 3. Cada candidata está aplicada o descartada (nada se pierde ni se repite).
          assert.deepEqual([...ids(r), ...r.descartadas.map((d) => d.promocionId)].sort(), promos.map((p) => p.id).sort(), donde);
          // 4. Montos exactos en centavos: lo descontado es la suma de las líneas y descuento + final = original.
          const suma = r.lineas.reduce((t, l) => t + l.descuento, 0n);
          assert.equal(r.inscripcion.descuentoAhora, suma, donde);
          assert.equal(r.inscripcion.descuentoAhora + r.inscripcion.finalAhora, r.inscripcion.original, donde);
          const porcentajeTotal = aplicadas.reduce((t, p) => t + Number(pcts[Number(p.id.slice(1))]!), 0);
          assert.equal(aTexto(r.inscripcion.descuentoAhora), (Math.min(porcentajeTotal, 100) * 10).toFixed(2), `$1,000.00 × % acumulado: ${donde}`);
        }
      }
    }
  }
  assert.ok(casos > 500, `se probaron ${casos} combinaciones`);
});

test("el orden de entrada es irrelevante: TODAS las permutaciones de cada combinación (hasta 5 promociones) dan exactamente el mismo resultado", () => {
  const prioridades = [3, 3, 1, 3, 2];
  const porcentajes = ["10", "10", "25", "5", "10"];
  let comprobadas = 0;
  for (const k of [3, 4, 5]) {
    for (const acumulables of combinaciones(k)) {
      const promos = armar({ acumulables, prioridades: prioridades.slice(0, k), porcentajes: porcentajes.slice(0, k) });
      const base = json(resolverPromociones(promos, ctx()));
      for (const baraja of permutaciones(promos)) {
        assert.equal(json(resolverPromociones(baraja, ctx())), base, `${JSON.stringify(acumulables)} en el orden ${baraja.map((p) => p.id).join(",")}`);
        comprobadas++;
      }
    }
  }
  assert.ok(comprobadas > 1000, `${comprobadas} permutaciones`);
});
