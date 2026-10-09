import { test } from "node:test";
import assert from "node:assert/strict";
import { cuerpoDeConversion, delPaso, entradaVacia, etiquetaDeFalta, nacimientoValido, pasoDe, prospectoDe, restantes, type Falta } from "./faltantes.ts";

const P = "11111111-1111-4111-8111-111111111111";
const Q = "22222222-2222-4222-8222-222222222222";
const HOY = "2026-11-10";
const ctx = { hoy: HOY, grupoConPrecio: () => true };
const faltas: Falta[] = [
  { campo: "tutor.parentesco", mensaje: "Falta el parentesco" },
  { campo: `prospectos.${P}.alumno.apellidos`, mensaje: "Faltan los apellidos" },
  { campo: `prospectos.${P}.alumno.fecha_nacimiento`, mensaje: "Falta la fecha" },
  { campo: `prospectos.${P}.grupo_id`, mensaje: "Falta el grupo" },
  { campo: `prospectos.${P}.reglamento`, mensaje: "Falta el reglamento" },
  { campo: `prospectos.${Q}.precio`, mensaje: "Sin precio" },
];

test("cada falta del servidor pertenece a un paso del asistente", () => {
  assert.equal(pasoDe("tutor.nombre"), "familia");
  assert.equal(pasoDe(`prospectos.${P}.alumno.fecha_nacimiento`), "alumnos");
  assert.equal(pasoDe(`prospectos.${P}.grupo_id`), "grupo");
  assert.equal(pasoDe(`prospectos.${P}.precio`), "precio");
  assert.equal(pasoDe(`prospectos.${P}.reglamento`), "reglamento");
  assert.equal(pasoDe("prospectos"), "otros");
  assert.equal(prospectoDe(`prospectos.${P}.grupo_id`), P);
  assert.equal(prospectoDe("tutor.nombre"), null);
  assert.equal(delPaso(faltas, "alumnos").length, 2);
});

test("sin escribir nada, sigue faltando TODO lo que el servidor pidió (y solo eso)", () => {
  assert.deepEqual(restantes(faltas, entradaVacia(), ctx), faltas);
  assert.deepEqual(restantes([], entradaVacia(), ctx), [], "si el servidor no pide nada, no se pide nada");
});

test("escribir lo que falta lo quita; espacios en blanco no cuentan; una fecha inválida no cuenta", () => {
  const e = entradaVacia();
  e.tutor.parentesco = "  ";
  assert.equal(restantes(faltas, e, ctx).some((f) => f.campo === "tutor.parentesco"), true);
  e.tutor.parentesco = "madre";
  e.alumnos[P] = { nombre: "", apellidos: "Mena", fecha_nacimiento: "2026-02-31" };
  e.grupos[P] = "g1";
  const r = restantes(faltas, e, ctx).map((f) => f.campo);
  assert.deepEqual(r, [`prospectos.${P}.alumno.fecha_nacimiento`, `prospectos.${P}.reglamento`, `prospectos.${Q}.precio`]);
  e.alumnos[P] = { nombre: "", apellidos: "Mena", fecha_nacimiento: "2018-05-04" };
  assert.deepEqual(restantes(faltas, e, ctx).map((f) => f.campo), [`prospectos.${P}.reglamento`, `prospectos.${Q}.precio`]);
});

test("el reglamento y lo que no se resuelve escribiendo se quedan hasta que el servidor deje de pedirlo", () => {
  const e = entradaVacia();
  e.grupos[P] = "g1";
  const bloqueos: Falta[] = [{ campo: "tutor.telefono", mensaje: "sin teléfono" }, { campo: `prospectos.${P}.prospecto_id`, mensaje: "ajeno" }, { campo: `prospectos.${P}.reglamento`, mensaje: "x" }];
  assert.equal(restantes(bloqueos, e, ctx).length, 3);
});

test("el precio se resuelve eligiendo un grupo cuyo programa SÍ tiene precio", () => {
  const f: Falta[] = [{ campo: `prospectos.${P}.precio`, mensaje: "Sin precio" }];
  const e = entradaVacia();
  assert.equal(restantes(f, e, ctx).length, 1, "sin grupo elegido no se sabe");
  e.grupos[P] = "g-sin-precio";
  assert.equal(restantes(f, e, { hoy: HOY, grupoConPrecio: () => false }).length, 1);
  assert.equal(restantes(f, e, ctx).length, 0);
});

test("fecha de nacimiento: real, no futura y de 1 a 99 años", () => {
  assert.equal(nacimientoValido("2018-05-04", HOY), true);
  assert.equal(nacimientoValido("2026-02-31", HOY), false);
  assert.equal(nacimientoValido("2027-01-01", HOY), false);
  assert.equal(nacimientoValido("2026-06-01", HOY), false);
  assert.equal(nacimientoValido("1900-01-01", HOY), false);
  assert.equal(nacimientoValido("04/05/2018", HOY), false);
});

test("las etiquetas hablan como una persona", () => {
  assert.equal(etiquetaDeFalta("tutor.parentesco"), "Parentesco del adulto responsable");
  assert.equal(etiquetaDeFalta(`prospectos.${P}.alumno.apellidos`), "Apellidos del alumno");
  assert.equal(etiquetaDeFalta(`prospectos.${P}.reglamento`), "Reglamento aceptado por la familia");
  assert.equal(etiquetaDeFalta("prospectos"), "Al menos un alumno");
});

test("el cuerpo del POST lleva SOLO lo escrito o elegido: nada de lo ya capturado viaja otra vez", () => {
  const e = entradaVacia();
  e.alumnos[P] = { nombre: "", apellidos: " Mena ", fecha_nacimiento: "" };
  e.grupos[P] = "g1";
  const entero = (t: string) => (/^\d{1,3}$/.test(t) ? Number(t) : null);
  assert.deepEqual(cuerpoDeConversion(e, [P], { [P]: { fecha_inicio: "", dia_corte_pago: "", meses: "" } }, entero), { prospectos: [{ prospecto_id: P, alumno: { apellidos: "Mena" }, inscripcion: { grupo_id: "g1" } }] });
  e.tutor.parentesco = "madre";
  const completo = cuerpoDeConversion(e, [P], { [P]: { fecha_inicio: "2026-11-12", dia_corte_pago: "5", meses: "2" } }, entero);
  assert.deepEqual(completo, { tutor: { parentesco: "madre" }, prospectos: [{ prospecto_id: P, alumno: { apellidos: "Mena" }, inscripcion: { grupo_id: "g1", fecha_inicio: "2026-11-12", dia_corte_pago: 5, meses_pagados_por_adelantado: 2 } }] });
  assert.deepEqual(cuerpoDeConversion(entradaVacia(), [P], {}, entero), { prospectos: [{ prospecto_id: P }] }, "si nada falta, se manda solo el prospecto");
});
