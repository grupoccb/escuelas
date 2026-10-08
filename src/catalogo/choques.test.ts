// Choques de ocupación (C1), parte pura: el traslape, los bordes y los dos recursos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { choquesDe, describirChoque, detectarChoques, franjaTexto, franjasSeTraslapan, horaTexto, type OcupacionDeGrupo } from "./choques.ts";

const g = (grupoId: string, salonId: string | null, instructorId: string | null, ...franjas: [number, number, number][]): OcupacionDeGrupo => ({
  grupoId,
  grupoNombre: `Grupo ${grupoId}`,
  salonId,
  instructorId,
  franjas: franjas.map(([dia, inicioMin, finMin]) => ({ dia, inicioMin, finMin })),
});

test("traslape: bordes exactos. Terminar cuando la otra empieza NO choca; un minuto de solape sí; contenido sí; otro día no", () => {
  const f = (dia: number, i: number, fin: number) => ({ dia, inicioMin: i, finMin: fin });
  assert.equal(franjasSeTraslapan(f(1, 600, 660), f(1, 660, 720)), false, "contiguas");
  assert.equal(franjasSeTraslapan(f(1, 660, 720), f(1, 600, 660)), false, "contiguas al revés");
  assert.equal(franjasSeTraslapan(f(1, 600, 661), f(1, 660, 720)), true, "un minuto");
  assert.equal(franjasSeTraslapan(f(1, 600, 720), f(1, 630, 660)), true, "contenida");
  assert.equal(franjasSeTraslapan(f(1, 630, 660), f(1, 600, 720)), true, "contenedora");
  assert.equal(franjasSeTraslapan(f(1, 600, 660), f(1, 600, 660)), true, "idéntica");
  assert.equal(franjasSeTraslapan(f(1, 600, 660), f(2, 600, 660)), false, "otro día");
  assert.equal(franjasSeTraslapan(f(0, 0, 1440), f(0, 1439, 1440)), true, "el día entero");
});

test("detectarChoques: salón e instructor por separado, cada par una vez, en orden estable", () => {
  const grupos = [
    g("b", "s1", "i1", [2, 600, 660], [4, 600, 660]),
    g("a", "s1", "i2", [2, 630, 690]),
    g("c", "s2", "i1", [4, 630, 690]),
    g("d", null, null, [2, 600, 660]),
  ];
  const r = detectarChoques(grupos);
  assert.deepEqual(
    r.map((x) => [x.tipo, x.recursoId, x.grupoId, x.otroGrupoId, x.dia]),
    [
      ["instructor", "i1", "b", "c", 4],
      ["salon", "s1", "a", "b", 2],
    ],
  );
  assert.deepEqual(detectarChoques([...grupos].reverse()), r, "el orden de entrada no cambia el resultado");
  assert.deepEqual(detectarChoques([]), []);
  assert.deepEqual(detectarChoques([grupos[0]!]), [], "un grupo solo no choca");
});

test("dos grupos que comparten salón E instructor y se pisan dan dos choques; sin recurso en común, ninguno", () => {
  assert.equal(detectarChoques([g("a", "s1", "i1", [1, 600, 660]), g("b", "s1", "i1", [1, 600, 660])]).length, 2);
  assert.deepEqual(detectarChoques([g("a", "s1", "i1", [1, 600, 660]), g("b", "s2", "i2", [1, 600, 660])]), []);
  assert.deepEqual(detectarChoques([g("a", null, null, [1, 600, 660]), g("b", null, null, [1, 600, 660])]), [], "null no es un recurso");
});

test("choquesDe: solo los del candidato, con el candidato como `grupo`; ignora al propio candidato aunque venga en la lista", () => {
  const otros = [g("z", "s1", null, [3, 600, 660]), g("y", "s1", null, [3, 700, 760]), g("x", "s9", "i1", [3, 600, 660])];
  const candidato = g("m", "s1", "i1", [3, 630, 690]);
  const r = choquesDe(candidato, [...otros, candidato]);
  assert.deepEqual(r.map((c) => [c.tipo, c.grupoId, c.otroGrupoId]), [["instructor", "m", "x"], ["salon", "m", "z"]]);
  assert.deepEqual(choquesDe(g("m", "s1", null, [3, 660, 700]), [otros[0]!]), [], "contiguo a z");
});

test("redacción para personas: día, horas y el otro grupo", () => {
  assert.equal(horaTexto(75), "01:15");
  assert.equal(horaTexto(1020), "17:00");
  assert.equal(franjaTexto({ dia: 6, inicioMin: 600, finMin: 690 }), "sábado de 10:00 a 11:30");
  const [c] = choquesDe(g("m", "s1", null, [2, 1020, 1080]), [g("z", "s1", null, [2, 990, 1050])]);
  assert.equal(describirChoque(c!), "El salón ya está ocupado por el grupo «Grupo z» el martes de 16:30 a 17:30 (se traslapa con 17:00–18:00)");
});
