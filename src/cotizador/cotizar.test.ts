import { test } from "node:test";
import assert from "node:assert/strict";
import { aTexto, deTexto } from "../lib/dinero.ts";
import type { PromocionDef } from "../promociones/resolver.ts";
import { cotizar, edadParaPrograma, sucursalesConPrograma } from "./cotizar.ts";
import { cotizacionAJson } from "./json.ts";
import type { CatalogoCotizable, GrupoCotizable, ProgramaCotizable } from "./tipos.ts";

const V = "v-1";
const S1 = "s-1";
const S2 = "s-2";

const grupo = (id: string, extra: Partial<GrupoCotizable> = {}): GrupoCotizable => ({
  id,
  nombre: `Grupo ${id}`,
  cupoMaximo: 10,
  permiteListaEspera: false,
  ocupados: 0,
  horarios: [{ dia: 1, inicioMin: 960, finMin: 1020 }],
  ...extra,
});

const programa = (id: string, min: number, max: number, extra: Partial<ProgramaCotizable> = {}): ProgramaCotizable => ({
  id,
  nombre: `Programa ${id}`,
  descripcionPublica: null,
  nivel: null,
  verticalId: V,
  sucursalId: S1,
  edadMin: min,
  edadMax: max,
  fechaCorteEdad: null,
  permiteTraslape: false,
  precio: { id: `pr-${id}`, costoInscripcion: deTexto("500.00"), costoMensualidad: deTexto("800.00"), moneda: "MXN", desde: "2026-01-01", hasta: null },
  grupos: [grupo(`g-${id}`)],
  ...extra,
});

const promo = (id: string, extra: Partial<PromocionDef> = {}): PromocionDef => ({
  id,
  nombre: `Promoción ${id}`,
  codigo: id.toUpperCase(),
  activa: true,
  vigenciaDesde: "2026-01-01",
  vigenciaHasta: null,
  condicion: { tipo: "sin_condicion" },
  cupoMaximo: null,
  cupoUsado: 0,
  acumulable: true,
  prioridad: 0,
  alcance: { verticales: [], sucursales: [], programas: [] },
  beneficios: [{ id: `${id}-b`, tipo: "descuento_inscripcion", modo: "porcentaje", valor: "10.00", productoId: null, descripcion: null, momento: "inmediato" }],
  ...extra,
});

const catalogo = (programas: ProgramaCotizable[], extra: Partial<CatalogoCotizable> = {}): CatalogoCotizable => ({ fecha: "2026-10-08", programas, promociones: [], ...extra });
const entrada = (edad: number, extra = {}) => ({ verticalId: V, sucursalId: S1, edadDeclarada: edad, ...extra });
const ids = (c: ReturnType<typeof cotizar>) => c.programas.map((p) => p.programaId);

// Rangos contiguos: 3-5, 6-13, 14-99.
const ESCALERA = catalogo([programa("chicos", 3, 5), programa("medianos", 6, 13), programa("grandes", 14, 99)]);

test("cada borde de rango cae en el programa correcto (5/6, 13/14) y ambos extremos son inclusivos", () => {
  const porEdad = (e: number) => ids(cotizar(ESCALERA, entrada(e)));
  assert.deepEqual(porEdad(2), [], "uno por debajo del primer rango");
  assert.deepEqual(porEdad(3), ["chicos"]);
  assert.deepEqual(porEdad(5), ["chicos"]);
  assert.deepEqual(porEdad(6), ["medianos"]);
  assert.deepEqual(porEdad(13), ["medianos"]);
  assert.deepEqual(porEdad(14), ["grandes"]);
  assert.deepEqual(porEdad(99), ["grandes"]);
  assert.deepEqual(porEdad(100), [], "uno por encima del último");
});

test("sin programa para la edad: lista vacía, no un error", () => {
  const c = cotizar(ESCALERA, entrada(1));
  assert.deepEqual(c.programas, []);
  assert.equal(cotizacionAJson(c).alternativas, false);
});

test("solo cuentan los programas de la vertical y la sucursal pedidas", () => {
  const cat = catalogo([programa("a", 3, 12), programa("b", 3, 12, { sucursalId: S2 }), programa("c", 3, 12, { verticalId: "otra" })]);
  assert.deepEqual(ids(cotizar(cat, entrada(8))), ["a"]);
  assert.deepEqual(ids(cotizar(cat, entrada(8, { sucursalId: S2 }))), ["b"]);
  assert.deepEqual(ids(cotizar(cat, entrada(8, { verticalId: "otra" }))), ["c"]);
  assert.deepEqual(ids(cotizar(cat, entrada(8, { verticalId: "inexistente" }))), []);
});

test("varios programas para una misma edad (alternativas) salen en orden de nombre", () => {
  const cat = catalogo([programa("z", 15, 99, { nombre: "Zeta", permiteTraslape: true }), programa("a", 15, 99, { nombre: "Alfa", permiteTraslape: true })]);
  const c = cotizar(cat, entrada(20));
  assert.deepEqual(c.programas.map((p) => p.nombre), ["Alfa", "Zeta"]);
  assert.equal(cotizacionAJson(c).alternativas, true);
});

test("grupo lleno: ofrece lista de espera si el grupo la permite y «sin lugar» si no", () => {
  const cat = catalogo([
    programa("p", 3, 12, {
      grupos: [
        grupo("con-lista", { cupoMaximo: 4, ocupados: 4, permiteListaEspera: true }),
        grupo("sin-lista", { cupoMaximo: 4, ocupados: 4, permiteListaEspera: false }),
        grupo("con-lugar", { cupoMaximo: 4, ocupados: 3 }),
        grupo("pasado", { cupoMaximo: 4, ocupados: 6 }),
      ],
    }),
  ]);
  const g = cotizar(cat, entrada(8)).programas[0]!.grupos;
  const por = Object.fromEntries(g.map((x) => [x.grupoId, [x.cupo.disponibles, x.cupo.oferta]]));
  assert.deepEqual(por, { "con-lista": [0, "lista_de_espera"], "sin-lista": [0, "sin_lugar"], "con-lugar": [1, "lugar"], pasado: [0, "sin_lugar"] });
  assert.equal(g[0]!.grupoId, "con-lugar", "los de más lugares primero");
});

test("los grupos se ordenan por lugares (más primero), luego nombre y id; un grupo sin horario no se ofrece", () => {
  const cat = catalogo([
    programa("p", 3, 12, {
      grupos: [
        grupo("b", { nombre: "B", cupoMaximo: 5, ocupados: 0 }),
        grupo("a", { nombre: "A", cupoMaximo: 5, ocupados: 0 }),
        grupo("c", { nombre: "C", cupoMaximo: 9, ocupados: 0 }),
        grupo("sin-horario", { horarios: [] }),
      ],
    }),
  ]);
  assert.deepEqual(cotizar(cat, entrada(8)).programas[0]!.grupos.map((g) => g.grupoId), ["c", "a", "b"]);
});

test("los horarios salen formateados en español", () => {
  const cat = catalogo([programa("p", 3, 12, { grupos: [grupo("g", { horarios: [{ dia: 3, inicioMin: 960, finMin: 1020 }, { dia: 1, inicioMin: 960, finMin: 1020 }] })] })]);
  assert.equal(cotizar(cat, entrada(8)).programas[0]!.grupos[0]!.horarioTexto, "lunes y miércoles de 16:00 a 17:00");
});

test("sin precio vigente se dice «sin precio» y no se inventa uno ni se calculan promociones", () => {
  const cat = catalogo([programa("p", 3, 12, { precio: null })], { promociones: [promo("x")] });
  const p = cotizar(cat, entrada(8)).programas[0]!;
  assert.equal(p.precio, null);
  assert.equal(p.promociones, null);
  const j = cotizacionAJson(cotizar(cat, entrada(8))).programas[0]!;
  assert.equal(j.sin_precio, true);
  assert.equal(j.precio, null);
});

test("dinero exacto: 15 % de $1,234.50 de inscripción = $185.18 y el total sale en texto decimal", () => {
  const p = programa("p", 3, 12, { precio: { id: "pr", costoInscripcion: deTexto("1234.50"), costoMensualidad: deTexto("999.99"), moneda: "MXN", desde: "2026-01-01", hasta: null } });
  const cat = catalogo([p], {
    promociones: [promo("d", { beneficios: [{ id: "b", tipo: "descuento_inscripcion", modo: "porcentaje", valor: "15.00", productoId: null, descripcion: null, momento: "inmediato" }] })],
  });
  const j = cotizacionAJson(cotizar(cat, entrada(8))).programas[0]!;
  assert.equal(j.precio!.costo_inscripcion, "1234.50");
  assert.equal(j.precio!.costo_mensualidad, "999.99");
  assert.equal(j.promociones!.inscripcion.descuento_ahora, "185.18");
  assert.equal(j.promociones!.inscripcion.final_ahora, "1049.32");
  assert.equal(j.promociones!.mensualidad.final_ahora, "999.99");
  assert.equal(aTexto(cotizar(cat, entrada(8)).programas[0]!.promociones!.inscripcion.finalAhora), "1049.32");
});

test("promoción vencida (o que empieza mañana) no aplica; el día de su fin y el de su inicio sí", () => {
  const cat = (fecha: string) => catalogo([programa("p", 3, 12)], { fecha, promociones: [promo("v", { vigenciaDesde: "2026-10-01", vigenciaHasta: "2026-10-31" })] });
  const aplica = (fecha: string) => cotizar(cat(fecha), entrada(8)).programas[0]!.promociones!.aplicadas.length;
  assert.equal(aplica("2026-09-30"), 0);
  assert.equal(aplica("2026-10-01"), 1);
  assert.equal(aplica("2026-10-31"), 1);
  assert.equal(aplica("2026-11-01"), 0);
  const vencida = cotizar(cat("2026-11-01"), entrada(8)).programas[0]!.promociones!;
  assert.deepEqual(vencida.descartadas.map((d) => d.motivo), ["fuera_de_vigencia"]);
});

test("las promociones respetan hermanos y meses por adelantado que manda quien cotiza", () => {
  const cat = catalogo([programa("p", 3, 12)], {
    promociones: [promo("h", { condicion: { tipo: "min_hermanos", hermanos: 2 } })],
  });
  assert.equal(cotizar(cat, entrada(8)).programas[0]!.promociones!.aplicadas.length, 0);
  assert.equal(cotizar(cat, entrada(8, { hermanosInscritos: 1 })).programas[0]!.promociones!.aplicadas.length, 1);
});

// ── La edad y la fecha de corte ───────────────────────────────────────────────────────────────────────

test("con fecha de nacimiento y fecha de corte, la edad se calcula A LA FECHA DE CORTE y no a hoy", () => {
  // Nació el 2018-12-01. Hoy (2026-10-08) tiene 7 años; el 2026-09-01 (inicio de ciclo) tenía 7; el 2026-12-01 tendrá 8.
  const cat = catalogo([
    programa("al-corte-pasado", 7, 7, { fechaCorteEdad: "2026-09-01" }),
    programa("al-corte-futuro", 8, 8, { fechaCorteEdad: "2026-12-01" }),
    programa("sin-corte", 7, 7),
  ]);
  const c = cotizar(cat, entrada(0, { edadDeclarada: null, fechaNacimiento: "2018-12-01" }));
  assert.deepEqual(ids(c).sort(), ["al-corte-futuro", "al-corte-pasado", "sin-corte"]);
  const por = Object.fromEntries(c.programas.map((p) => [p.programaId, [p.edad, p.fuenteEdad]]));
  assert.deepEqual(por, { "al-corte-pasado": [7, "nacimiento_a_corte"], "al-corte-futuro": [8, "nacimiento_a_corte"], "sin-corte": [7, "nacimiento_a_fecha"] });
});

test("el mismo niño cae en programas distintos según la fecha de corte de cada uno (borde: el día del cumpleaños)", () => {
  const cat = catalogo([programa("antes", 8, 9, { fechaCorteEdad: "2026-11-30" }), programa("despues", 8, 9, { fechaCorteEdad: "2026-12-01" })]);
  // Cumple 8 el 2026-12-01: el 30 de noviembre aún tiene 7.
  const c = cotizar(cat, entrada(0, { edadDeclarada: null, fechaNacimiento: "2018-12-01" }));
  assert.deepEqual(ids(c), ["despues"]);
});

test("con solo la edad declarada se usa tal cual, aun si el programa tiene fecha de corte", () => {
  const cat = catalogo([programa("p", 8, 8, { fechaCorteEdad: "2030-01-01" })]);
  const p = cotizar(cat, entrada(8)).programas[0]!;
  assert.deepEqual([p.edad, p.fuenteEdad], [8, "declarada"]);
  assert.deepEqual(cotizar(cat, entrada(7)).programas, []);
});

test("con fecha de nacimiento y edad declarada a la vez manda la fecha de nacimiento", () => {
  const cat = catalogo([programa("p", 7, 7)]);
  assert.deepEqual(ids(cotizar(cat, entrada(30, { fechaNacimiento: "2019-01-01" }))), ["p"]);
});

test("quien nació después de la fecha de corte todavía no es elegible para ese programa", () => {
  const cat = catalogo([programa("p", 0, 5, { fechaCorteEdad: "2026-09-01" })]);
  assert.deepEqual(cotizar(cat, entrada(0, { edadDeclarada: null, fechaNacimiento: "2026-09-02" })).programas, []);
  assert.deepEqual(ids(cotizar(cat, entrada(0, { edadDeclarada: null, fechaNacimiento: "2026-09-01" }))), ["p"]);
});

test("la fecha de nacimiento de un 29 de febrero y el corte en 28 de febrero / 1 de marzo", () => {
  const cat = catalogo([programa("a", 9, 9, { fechaCorteEdad: "2026-02-28" }), programa("b", 10, 10, { fechaCorteEdad: "2026-03-01" })]);
  const c = cotizar(cat, entrada(0, { edadDeclarada: null, fechaNacimiento: "2016-02-29" }));
  assert.deepEqual(ids(c), ["a", "b"], "9 el 28 de febrero y 10 el 1 de marzo");
});

test("entradas imposibles lanzan RangeError", () => {
  assert.throws(() => cotizar(ESCALERA, { verticalId: V, sucursalId: S1 }), RangeError);
  assert.throws(() => cotizar(ESCALERA, entrada(-1)), RangeError);
  assert.throws(() => cotizar(ESCALERA, entrada(121)), RangeError);
  assert.throws(() => cotizar(ESCALERA, entrada(5.5)), RangeError);
  assert.throws(() => cotizar(ESCALERA, entrada(0, { edadDeclarada: null, fechaNacimiento: "2027-01-01" })), RangeError, "nace en el futuro");
  assert.throws(() => cotizar(ESCALERA, entrada(0, { edadDeclarada: null, fechaNacimiento: "2018-02-30" })), RangeError);
  assert.throws(() => cotizar(ESCALERA, entrada(8, { hermanosInscritos: -1 })), RangeError);
  assert.throws(() => edadParaPrograma({ fechaCorteEdad: null }, {}, "2026-10-08"), RangeError);
});

test("es determinista: el orden del catálogo de entrada no cambia el resultado", () => {
  const programas = [programa("a", 3, 12, { nombre: "A" }), programa("b", 3, 12, { nombre: "B", permiteTraslape: true }), programa("c", 3, 12, { nombre: "C" })];
  const base = JSON.stringify(cotizacionAJson(cotizar(catalogo(programas, { promociones: [promo("1"), promo("2", { prioridad: 5 })] }), entrada(8))));
  for (let i = 0; i < 20; i++) {
    const barajado = [...programas].sort(() => Math.random() - 0.5);
    assert.equal(JSON.stringify(cotizacionAJson(cotizar(catalogo(barajado, { promociones: [promo("2", { prioridad: 5 }), promo("1")] }), entrada(8)))), base);
  }
});

test("sucursalesConPrograma lista las sucursales con programa para esa persona", () => {
  const cat = catalogo([programa("a", 3, 5), programa("b", 6, 12, { sucursalId: S2 }), programa("c", 3, 12, { sucursalId: "s-3", verticalId: "otra" })]);
  assert.deepEqual(sucursalesConPrograma(cat, { verticalId: V, edadDeclarada: 4 }), [S1]);
  assert.deepEqual(sucursalesConPrograma(cat, { verticalId: V, edadDeclarada: 8 }), [S2]);
  assert.deepEqual(sucursalesConPrograma(cat, { verticalId: V, edadDeclarada: 30 }), []);
});
