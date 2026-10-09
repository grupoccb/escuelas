// V3: las reglas puras de los niños de un lead: validación (nombre, fecha de nacimiento o edad coherentes), cuándo dos capturas son el mismo niño, y el aviso de edad contra
// el catálogo. Sin base de datos.

import { test } from "node:test";
import assert from "node:assert/strict";
import { MAXIMO_DE_NINOS_POR_LEAD, avisoDeEdadFueraDelCatalogo, esElMismoNino, nombreNormalizado, validarNino } from "./prospectos.ts";

const HOY = "2026-11-10";

test("validarNino: con nombre y fecha de nacimiento real, la edad que se guarda es la cumplida hoy (el día antes y el día del cumpleaños)", () => {
  assert.deepEqual(validarNino({ nombre: "Sofía", fechaNacimiento: "2019-11-10" }, HOY), { problemas: [], edad: 7 });
  assert.deepEqual(validarNino({ nombre: "Sofía", fechaNacimiento: "2019-11-11" }, HOY), { problemas: [], edad: 6 });
  assert.equal(validarNino({ nombre: "Sofía", fechaNacimiento: "2020-02-29" }, HOY).edad, 6);
});

test("validarNino: solo con la edad que dice la familia se guarda tal cual; sin fecha ni edad, falta uno de los dos", () => {
  assert.deepEqual(validarNino({ nombre: "Leo", edad: 5 }, HOY), { problemas: [], edad: 5 });
  const p = validarNino({ nombre: "Leo" }, HOY);
  assert.equal(p.edad, null);
  assert.deepEqual(p.problemas.map((x) => x.campo), ["fecha_nacimiento"]);
  assert.match(p.problemas[0]!.mensaje, /fecha de nacimiento o, si no la saben, su edad/);
});

test("validarNino: la edad y la fecha tienen que coincidir (coherencia), y no se acepta una fecha futura ni de más de 99 años ni una edad fuera de 1 a 99", () => {
  assert.deepEqual(validarNino({ nombre: "Ana", fechaNacimiento: "2019-05-04", edad: 7 }, HOY).problemas, []);
  const choque = validarNino({ nombre: "Ana", fechaNacimiento: "2019-05-04", edad: 9 }, HOY);
  assert.deepEqual(choque.problemas, [{ campo: "edad", mensaje: "La edad no coincide con la fecha de nacimiento: tiene 7 años" }]);
  assert.match(validarNino({ nombre: "Ana", fechaNacimiento: "2027-01-01" }, HOY).problemas[0]!.mensaje, /futura/);
  assert.match(validarNino({ nombre: "Ana", fechaNacimiento: "1900-01-01" }, HOY).problemas[0]!.mensaje, /razonable/);
  assert.match(validarNino({ nombre: "Ana", fechaNacimiento: "2026-06-01" }, HOY).problemas[0]!.mensaje, /al menos 1 año/);
  assert.equal(validarNino({ nombre: "Ana", edad: 0 }, HOY).problemas[0]!.campo, "edad");
  assert.equal(validarNino({ nombre: "Ana", edad: 100 }, HOY).problemas[0]!.campo, "edad");
  assert.equal(validarNino({ nombre: "Ana", edad: 3.5 }, HOY).problemas[0]!.campo, "edad");
});

test("validarNino: un nombre vacío o de puros espacios es un problema del campo nombre", () => {
  assert.deepEqual(validarNino({ nombre: "   ", edad: 6 }, HOY).problemas, [{ campo: "nombre", mensaje: "Escribe el nombre del niño" }]);
});

test("nombreNormalizado ignora acentos, mayúsculas y espacios de más", () => {
  assert.equal(nombreNormalizado("  María   JOSÉ "), "maria jose");
  assert.equal(nombreNormalizado("MARIA JOSE"), nombreNormalizado("maría josé"));
});

test("esElMismoNino: mismo nombre y misma fecha; sin fecha, misma edad; un niño con fecha y otro sin ella nunca se juntan; nombres distintos nunca", () => {
  const a = { nombre: "María José", fechaNacimiento: "2019-05-04", edad: 7 };
  assert.equal(esElMismoNino(a, { nombre: "maria jose ", fechaNacimiento: "2019-05-04", edad: 7 }), true);
  assert.equal(esElMismoNino(a, { nombre: "María José", fechaNacimiento: "2018-05-04", edad: 8 }), false);
  assert.equal(esElMismoNino({ nombre: "Leo", fechaNacimiento: null, edad: 5 }, { nombre: "LEO", fechaNacimiento: null, edad: 5 }), true);
  assert.equal(esElMismoNino({ nombre: "Leo", fechaNacimiento: null, edad: 5 }, { nombre: "Leo", fechaNacimiento: null, edad: 6 }), false);
  assert.equal(esElMismoNino({ nombre: "Leo", fechaNacimiento: null, edad: 5 }, { nombre: "Leo", fechaNacimiento: "2021-01-01", edad: 5 }), false);
  assert.equal(esElMismoNino(a, { nombre: "Ana", fechaNacimiento: "2019-05-04", edad: 7 }), false);
  assert.equal(esElMismoNino({ nombre: null, fechaNacimiento: null, edad: null }, { nombre: null, fechaNacimiento: null, edad: null }), false);
});

test("avisoDeEdadFueraDelCatalogo: sin programas no avisa; con algún programa que la recibe no avisa; si ninguno la recibe, avisa con la edad", () => {
  const programas = [{ edadMin: 4, edadMax: 6, fechaCorteEdad: null }, { edadMin: 7, edadMax: 12, fechaCorteEdad: null }];
  assert.equal(avisoDeEdadFueraDelCatalogo([], { fechaNacimiento: null, edad: 2 }, HOY), null);
  assert.equal(avisoDeEdadFueraDelCatalogo(programas, { fechaNacimiento: null, edad: 5 }, HOY), null);
  assert.equal(avisoDeEdadFueraDelCatalogo(programas, { fechaNacimiento: "2019-11-10", edad: 7 }, HOY), null);
  assert.match(avisoDeEdadFueraDelCatalogo(programas, { fechaNacimiento: null, edad: 3 }, HOY)!, /Por su edad \(3 años\) no hay un programa/);
  assert.match(avisoDeEdadFueraDelCatalogo(programas, { fechaNacimiento: "2025-01-01", edad: 1 }, HOY)!, /\(1 año\)/);
});

test("avisoDeEdadFueraDelCatalogo respeta la fecha de corte del programa (la edad se cuenta a esa fecha)", () => {
  // Cumple 7 en diciembre: hoy tiene 6, pero al corte del 31 de diciembre ya tiene 7.
  const programas = [{ edadMin: 7, edadMax: 9, fechaCorteEdad: "2026-12-31" }];
  assert.equal(avisoDeEdadFueraDelCatalogo(programas, { fechaNacimiento: "2019-12-05", edad: 6 }, HOY), null);
  assert.notEqual(avisoDeEdadFueraDelCatalogo(programas, { fechaNacimiento: "2020-01-05", edad: 6 }, HOY), null);
});

test("el tope de niños por lead es 10", () => {
  assert.equal(MAXIMO_DE_NINOS_POR_LEAD, 10);
});
