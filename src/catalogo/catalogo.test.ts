import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularCupo } from "./cupo.ts";
import { choquesDeSalon, resumenDeCapacidad, traslapesDeEdad, type Catalogo } from "./verificacion.ts";

// Nombres neutros a propósito: los reales viven en las tablas (invariante 2).
const SUC = new Map([["s1", "Norte"], ["s2", "Sur"]]);
const VER = new Map([["v1", "Vertical Uno"], ["v2", "Vertical Dos"]]);

function catalogo(extra: Partial<Catalogo> = {}): Catalogo {
  return { programas: [], grupos: [], horarios: [], sucursales: SUC, verticales: VER, ...extra };
}
const programa = (id: string, verticalId: string, sucursalId: string, edadMin: number, edadMax: number) => ({
  id, nombre: `P${id}`, verticalId, sucursalId, edadMin, edadMax,
});
const grupo = (id: string, programaId: string, salon: string | null, cupoMaximo = 10) => ({ id, nombre: `G${id}`, programaId, salon, cupoMaximo });
const horario = (grupoId: string, dia: number, inicioMin: number, finMin: number) => ({ grupoId, dia, inicioMin, finMin });

// ── 1. Traslapes de edad ──────────────────────────────────────────────────────────────

test("traslape de edad: dos programas de la misma vertical y sucursal que aceptan la misma edad", () => {
  const r = traslapesDeEdad(catalogo({ programas: [programa("a", "v1", "s1", 3, 6), programa("b", "v1", "s1", 6, 13)] }));
  assert.deepEqual(r, [{ sucursal: "Norte", vertical: "Vertical Uno", programaA: "Pa", programaB: "Pb" }]);
});

test("sin traslape: rangos contiguos, otra sucursal u otra vertical", () => {
  assert.deepEqual(traslapesDeEdad(catalogo({ programas: [programa("a", "v1", "s1", 3, 5), programa("b", "v1", "s1", 6, 13), programa("c", "v1", "s1", 14, 99)] })), []);
  assert.deepEqual(traslapesDeEdad(catalogo({ programas: [programa("a", "v1", "s1", 3, 10), programa("b", "v1", "s2", 3, 10)] })), []);
  assert.deepEqual(traslapesDeEdad(catalogo({ programas: [programa("a", "v1", "s1", 3, 10), programa("b", "v2", "s1", 3, 10)] })), []);
});

test("un rango contenido en otro también es traslape", () => {
  assert.equal(traslapesDeEdad(catalogo({ programas: [programa("a", "v1", "s1", 3, 99), programa("b", "v1", "s1", 6, 7)] })).length, 1);
});

// ── 2. Capacidad ──────────────────────────────────────────────────────────────────────

test("resumen de capacidad: programas, grupos y cupo por sucursal y vertical", () => {
  const c = catalogo({
    programas: [programa("a", "v1", "s1", 3, 5), programa("b", "v1", "s1", 6, 13), programa("c", "v1", "s2", 3, 5), programa("d", "v2", "s1", 3, 5)],
    grupos: [grupo("g1", "a", "X", 12), grupo("g2", "a", "X", 12), grupo("g3", "b", "X", 18), grupo("g4", "c", "Y", 20)],
  });
  assert.deepEqual(resumenDeCapacidad(c), [
    { sucursal: "Norte", vertical: "Vertical Dos", programas: 1, grupos: 0, capacidad: 0 },
    { sucursal: "Norte", vertical: "Vertical Uno", programas: 2, grupos: 3, capacidad: 42 },
    { sucursal: "Sur", vertical: "Vertical Uno", programas: 1, grupos: 1, capacidad: 20 },
  ]);
});

// ── 3. Choques de salón ───────────────────────────────────────────────────────────────

const base = [programa("a", "v1", "s1", 3, 5), programa("b", "v1", "s1", 6, 13), programa("c", "v1", "s2", 3, 5)];
const dosGrupos = [grupo("g1", "a", "Salón"), grupo("g2", "b", "Salón")];

test("choque de salón: mismo salón, misma sucursal, mismo día y horas que se pisan", () => {
  const r = choquesDeSalon(catalogo({ programas: base, grupos: dosGrupos, horarios: [horario("g1", 2, 960, 1020), horario("g2", 2, 990, 1050)] }));
  assert.deepEqual(r, [{ sucursal: "Norte", salon: "Salón", dia: 2, grupoA: "Gg1", grupoB: "Gg2" }]);
});

test("sin choque: una clase termina cuando empieza la otra, otro día, otro salón, otra sucursal o sin salón", () => {
  const sinChoque = (c: Partial<Catalogo>) => assert.deepEqual(choquesDeSalon(catalogo({ programas: base, ...c })), []);
  sinChoque({ grupos: dosGrupos, horarios: [horario("g1", 2, 960, 1020), horario("g2", 2, 1020, 1080)] }); // contiguas
  sinChoque({ grupos: dosGrupos, horarios: [horario("g1", 2, 960, 1020), horario("g2", 3, 960, 1020)] }); // otro día
  sinChoque({ grupos: [grupo("g1", "a", "Uno"), grupo("g2", "b", "Dos")], horarios: [horario("g1", 2, 960, 1020), horario("g2", 2, 960, 1020)] });
  sinChoque({ grupos: [grupo("g1", "a", "Salón"), grupo("g3", "c", "Salón")], horarios: [horario("g1", 2, 960, 1020), horario("g3", 2, 960, 1020)] }); // otra sucursal
  sinChoque({ grupos: [grupo("g1", "a", null), grupo("g2", "b", null)], horarios: [horario("g1", 2, 960, 1020), horario("g2", 2, 960, 1020)] });
});

test("un mismo grupo con dos horarios que se pisan no choca consigo mismo", () => {
  assert.deepEqual(choquesDeSalon(catalogo({ programas: base, grupos: [grupo("g1", "a", "Salón")], horarios: [horario("g1", 2, 960, 1020), horario("g1", 2, 990, 1050)] })), []);
});

// ── Cupo ──────────────────────────────────────────────────────────────────────────────

test("cupo: disponibles = cupo máximo − ocupados, y qué se ofrece", () => {
  assert.deepEqual(calcularCupo(12, 0, true), { cupoMaximo: 12, ocupados: 0, disponibles: 12, lleno: false, oferta: "lugar" });
  assert.deepEqual(calcularCupo(12, 11, false), { cupoMaximo: 12, ocupados: 11, disponibles: 1, lleno: false, oferta: "lugar" });
  assert.deepEqual(calcularCupo(12, 12, true), { cupoMaximo: 12, ocupados: 12, disponibles: 0, lleno: true, oferta: "lista_de_espera" });
  assert.deepEqual(calcularCupo(12, 12, false), { cupoMaximo: 12, ocupados: 12, disponibles: 0, lleno: true, oferta: "sin_lugar" });
});

test("cupo: más ocupados que cupo (se bajó el cupo) no da disponibles negativos", () => {
  assert.equal(calcularCupo(10, 14, true).disponibles, 0);
  assert.equal(calcularCupo(10, 14, true).oferta, "lista_de_espera");
});

test("cupo: datos imposibles se rechazan, no se adivinan", () => {
  for (const [max, ocupados] of [[0, 0], [-1, 0], [10, -1], [1.5, 0], [10, 0.5], [Number.NaN, 0]] as const) {
    assert.throws(() => calcularCupo(max, ocupados, true), RangeError, `${max}/${ocupados}`);
  }
});

test("cupo: es determinista (misma entrada, misma salida)", () => {
  assert.deepEqual(calcularCupo(18, 7, true), calcularCupo(18, 7, true));
});
