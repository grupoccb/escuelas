import { test } from "node:test";
import assert from "node:assert/strict";
import { disciplinasDe, etiquetasDeHijos } from "./disciplinas-de-familia.ts";

const alumnos = [
  { alumno_id: "a1", nombre: "Ana" },
  { alumno_id: "a2", nombre: "Beto" },
  { alumno_id: "a3", nombre: "Cata" },
];
const programas = [
  { id: "p1", vertical_id: "v1" },
  { id: "p2", vertical_id: "v2" },
];
const disciplinas = [
  { id: "v1", nombre: "Disciplina Uno", color_marca: "#aa3311" },
  { id: "v2", nombre: "Disciplina Dos", color_marca: null },
];

test("cada inscripción activa da una etiqueta con la disciplina y el color de su programa", () => {
  const e = etiquetasDeHijos(alumnos, [{ alumno_id: "a1", grupo: "Grupo A", programa_id: "p1", estatus: "activa" }, { alumno_id: "a1", grupo: "Grupo B", programa_id: "p2", estatus: "activa" }], programas, disciplinas);
  assert.deepEqual(e.filter((x) => x.alumnoId === "a1").map((x) => [x.grupo, x.disciplina, x.color]), [["Grupo A", "Disciplina Uno", "#aa3311"], ["Grupo B", "Disciplina Dos", null]]);
});

test("un hijo sin inscripción activa (o con una baja) queda con una etiqueta neutra de solo su nombre", () => {
  const e = etiquetasDeHijos(alumnos, [{ alumno_id: "a2", grupo: "Grupo A", programa_id: "p1", estatus: "baja" }], programas, disciplinas);
  assert.deepEqual(e.filter((x) => x.alumnoId === "a2").map((x) => [x.nombre, x.grupo, x.disciplina, x.color]), [["Beto", null, null, null]]);
  assert.equal(e.length, 3);
});

test("si no se conoce el programa o la disciplina (módulo apagado, sin permiso), conserva el grupo y no inventa color", () => {
  const e = etiquetasDeHijos(alumnos, [{ alumno_id: "a3", grupo: "Grupo C", programa_id: "desconocido", estatus: "activa" }], [], []);
  assert.deepEqual(e.filter((x) => x.alumnoId === "a3").map((x) => [x.grupo, x.disciplina, x.color]), [["Grupo C", null, null]]);
});

test("las disciplinas de un hijo, sin repetir", () => {
  const e = etiquetasDeHijos(alumnos, [{ alumno_id: "a1", grupo: "Grupo A", programa_id: "p1", estatus: "activa" }, { alumno_id: "a1", grupo: "Grupo A2", programa_id: "p1", estatus: "activa" }], programas, disciplinas);
  assert.deepEqual(disciplinasDe(e, "a1"), { texto: "Disciplina Uno", color: "#aa3311" });
  assert.equal(disciplinasDe(e, "a2"), null);
});
