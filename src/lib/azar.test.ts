import { test } from "node:test";
import assert from "node:assert/strict";
import { crearAzar } from "./azar.ts";

const secuencia = (semilla: number, n = 50): number[] => {
  const a = crearAzar(semilla);
  return Array.from({ length: n }, () => a.entre(0, 1_000_000));
};

test("la misma semilla da la misma secuencia; otra semilla, otra", () => {
  assert.deepEqual(secuencia(7), secuencia(7));
  assert.notDeepEqual(secuencia(7), secuencia(8));
});

test("entre respeta sus extremos (ambos se alcanzan) y elegir devuelve elementos de la lista", () => {
  const a = crearAzar(1);
  const vistos = new Set(Array.from({ length: 500 }, () => a.entre(3, 6)));
  assert.deepEqual([...vistos].sort(), [3, 4, 5, 6]);
  assert.equal(a.entre(9, 9), 9);
  const lista = ["a", "b", "c"] as const;
  assert.ok(Array.from({ length: 100 }, () => a.elegir(lista)).every((x) => lista.includes(x)));
  assert.throws(() => a.elegir([]), /de dónde elegir/);
});

test("chance(0) nunca y chance(1) siempre; el pase respeta la asistencia pedida aproximadamente", () => {
  const a = crearAzar(5);
  assert.ok(Array.from({ length: 200 }, () => a.chance(0)).every((x) => !x));
  assert.ok(Array.from({ length: 200 }, () => a.chance(1)).every((x) => x));
  const pases = Array.from({ length: 4_000 }, () => a.pase(80));
  const presentes = pases.filter((x) => x === "presente").length;
  assert.ok(presentes > 3_000 && presentes < 3_400, `presentes ${presentes} de 4000 con 80 %`);
  assert.ok(pases.some((x) => x === "justificada") && pases.some((x) => x === "falta"));
  assert.ok(Array.from({ length: 100 }, () => a.pase(100)).every((x) => x === "presente"));
  assert.ok(Array.from({ length: 100 }, () => a.pase(0)).every((x) => x !== "presente"));
});
