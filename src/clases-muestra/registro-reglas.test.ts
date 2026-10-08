// D5: las reglas puras del registro de la clase muestra.

import { test } from "node:test";
import assert from "node:assert/strict";
import { faltantesDelRegistro, normalizarTutores, problemaDeFechaDeNacimiento, problemasDeAntecedentes } from "./registro-reglas.ts";

const HOY = "2026-11-10";

test("la fecha de nacimiento razonable: existe, no es futura, de 1 a 99 años cumplidos", () => {
  assert.equal(problemaDeFechaDeNacimiento("2018-05-04", HOY), null);
  assert.equal(problemaDeFechaDeNacimiento("2025-11-10", HOY), null, "justo un año");
  assert.match(problemaDeFechaDeNacimiento("2025-11-11", HOY) ?? "", /al menos 1 año/, "un día antes de cumplirlo");
  assert.equal(problemaDeFechaDeNacimiento("1927-11-10", HOY), null, "99 años");
  assert.equal(problemaDeFechaDeNacimiento("1927-11-09", HOY), null, "99 años y un día");
  assert.match(problemaDeFechaDeNacimiento("1926-11-10", HOY) ?? "", /razonable/, "100 años");
  assert.match(problemaDeFechaDeNacimiento("2026-11-11", HOY) ?? "", /futura/);
  assert.match(problemaDeFechaDeNacimiento("2026-11-10", HOY) ?? "", /al menos/);
  assert.match(problemaDeFechaDeNacimiento("2018-02-30", HOY) ?? "", /calendario/);
  assert.match(problemaDeFechaDeNacimiento("hola", HOY) ?? "", /calendario/);
  assert.equal(problemaDeFechaDeNacimiento("2016-02-29", HOY), null, "29 de febrero");
});

test("normalizarTutores: teléfonos con normalizarTelefono(), sin repetidos, un responsable de pago y uno que lo lleva, ids sin repetir", () => {
  const base = { nombre: "A", parentesco: "madre" };
  const ok = normalizarTutores([{ ...base, telefono: "+52 1 55 1234 5678", es_responsable_pago: true }, { nombre: "B", parentesco: "abuelo", telefono: "5587654321", puede_recoger: true }]);
  assert.deepEqual(ok.problemas, []);
  assert.deepEqual(ok.tutores.map((t) => t.telefono), ["+525512345678", "+525587654321"]);
  assert.deepEqual([ok.tutores[1]!.es_responsable_pago, ok.tutores[1]!.puede_recoger, ok.tutores[1]!.correo, ok.tutores[1]!.apellidos], [false, true, null, null]);
  const malo = normalizarTutores([{ ...base, telefono: "12" }]);
  assert.deepEqual(malo.problemas.map((p) => p.campo), ["tutores[0].telefono"]);
  const repetido = normalizarTutores([{ ...base, telefono: "5512345678" }, { ...base, telefono: "+52 55 1234 5678" }]);
  assert.deepEqual(repetido.problemas.map((p) => p.campo), ["tutores[1].telefono"], "el mismo número escrito distinto es el mismo");
  const dosPagan = normalizarTutores([{ ...base, telefono: "5512345678", es_responsable_pago: true }, { ...base, telefono: "5587654321", es_responsable_pago: true }]);
  assert.deepEqual(dosPagan.problemas.map((p) => p.campo), ["tutores"]);
  const dosLlevan = normalizarTutores([{ ...base, telefono: "5512345678", lo_lleva: true }, { ...base, telefono: "5587654321", lo_lleva: true }]);
  assert.deepEqual(dosLlevan.problemas.map((p) => p.campo), ["tutores"]);
  const id = "00000000-0000-4000-8000-000000000001";
  assert.deepEqual(normalizarTutores([{ ...base, id, telefono: "5512345678" }, { ...base, id, telefono: "5587654321" }]).problemas.map((p) => p.campo), ["tutores[1].id"]);
  assert.deepEqual(normalizarTutores([]), { tutores: [], problemas: [] });
});

test("antecedentes: quien no ha practicado no tiene dónde ni nivel; el detalle del motivo solo con «otro»", () => {
  const base = { practico_antes: null, practico_donde: null, practico_nivel: null, motivo_clase: null, motivo_clase_detalle: null };
  assert.deepEqual(problemasDeAntecedentes(base), []);
  assert.deepEqual(problemasDeAntecedentes({ ...base, practico_antes: true, practico_donde: "x", practico_nivel: "y" }), []);
  assert.deepEqual(problemasDeAntecedentes({ ...base, practico_antes: false, practico_nivel: "y" }).map((p) => p.campo), ["antecedentes.practico_antes"]);
  assert.deepEqual(problemasDeAntecedentes({ ...base, motivo_clase_detalle: "x" }).map((p) => p.campo), ["antecedentes.motivo_clase_detalle", "antecedentes.motivo_clase_detalle"]);
  assert.deepEqual(problemasDeAntecedentes({ ...base, motivo_clase: "otro", motivo_clase_detalle: "x" }), []);
  assert.deepEqual(problemasDeAntecedentes({ ...base, motivo_clase: "disciplina", motivo_clase_detalle: "x" }).length, 1);
});

test("faltantes: alumno, adultos con un responsable de pago, antecedentes y la ficha de salud; lista vacía = completo", () => {
  const completo = { alumno_nombre: "A", alumno_apellidos: "B", alumno_fecha_nacimiento: "2018-05-04", alumno_sexo: "femenino", practico_antes: false, motivo_clase: "disciplina", tutores: [{ telefono: "+525512345678", es_responsable_pago: true }], saludFaltantes: [] };
  assert.deepEqual(faltantesDelRegistro(completo), []);
  assert.deepEqual(faltantesDelRegistro({ ...completo, alumno_nombre: null, alumno_sexo: null }), ["alumno.nombre", "alumno.sexo"]);
  assert.deepEqual(faltantesDelRegistro({ ...completo, tutores: [] }), ["tutores"]);
  assert.deepEqual(faltantesDelRegistro({ ...completo, tutores: [{ telefono: "+525512345678", es_responsable_pago: false }] }), ["tutores.responsable_pago"]);
  assert.deepEqual(faltantesDelRegistro({ ...completo, practico_antes: null, motivo_clase: null }), ["antecedentes.practico_antes", "antecedentes.motivo_clase"]);
  assert.deepEqual(faltantesDelRegistro({ ...completo, saludFaltantes: ["medicamentos"] }), ["salud.medicamentos"]);
  assert.equal(faltantesDelRegistro({ ...completo, practico_antes: false }).length, 0, "no haber practicado es una respuesta, no una falta");
});
