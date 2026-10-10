// D5: la validación de la sección de salud del registro, las notas sin salud y cuándo dos personas son la misma.

import { test } from "node:test";
import assert from "node:assert/strict";
import { ErrorApi } from "../api/errores.ts";
import { contactoDeEntradaEsTutor, leerEntradaDeSalud, mencionaSalud, mismaPersona } from "./index.ts";

test("mencionaSalud: frena lo evidente en un texto libre y deja pasar lo demás", () => {
  for (const t of ["Tiene alergia a las nueces", "toma MEDICAMENTO diario", "es asmático", "tiene asma", "Diabetes tipo 1", "epilepsia", "una enfermedad rara", "tuvo una Lesión en la rodilla", "una fractura de brazo"]) assert.ok(mencionaSalud(t), t);
  for (const t of ["Muy atento y entusiasta", "los fantasmas del gimnasio", "le gusta la música", "llegó puntual", "no hay problema"]) assert.ok(!mencionaSalud(t), t);
});

test("V10 / EF-21: mencionaSalud también frena lo que antes se colaba (enfermo, gripe y fiebre, TDAH, autismo, letras separadas, invisibles) sin frenar el texto normal", () => {
  for (const t of ["está enfermo", "Esta enferma desde ayer", "gripe y fiebre", "tiene tdah", "TDAH", "es autista", "tiene autismo", "a s m a", "A.S.M.A", "a-s-m-a", "as\u200bma", "ale\u200drgia", "síndrome de Down", "trastorno del sueño", "hiperactivo", "tiene dislexia", "una discapacidad motriz", "convulsiones", "problema cardiaco", "déficit de atención"]) assert.ok(mencionaSalud(t), t);
  // Texto normal: lo que NO es salud no se frena (palabras que contienen fragmentos, siglas sueltas y frases largas).
  for (const t of ["Muy atento y entusiasta", "los fantasmas del gimnasio", "una tarde de clase", "le gusta jugar con A y B", "tiene mucha energía", "estudia en la escuela", "su mamá se llama Ana María", "llegó a las 5 y se fue a casa", "vino con su tío", "autoridad y orden"]) assert.ok(!mencionaSalud(t), t);
});

test("mismaPersona: mismo teléfono, o mismo nombre sin acentos ni mayúsculas", () => {
  const a = { nombre: "Lucía Prado", telefono: "+525512345678" };
  assert.ok(mismaPersona(a, { nombre: "Otra", telefono: "+525512345678" }));
  assert.ok(mismaPersona(a, { nombre: "LUCIA   prado", telefono: "+525500000000" }));
  assert.ok(!mismaPersona(a, { nombre: "Lucía Prada", telefono: "+525500000000" }));
  assert.ok(!mismaPersona({ nombre: "", telefono: "+525512345678" }, { nombre: "", telefono: "+525500000000" }), "dos nombres vacíos no son la misma persona");
});

test("leerEntradaDeSalud: esquema cerrado, teléfono normalizado, errores con el prefijo de la sección", () => {
  const ok = leerEntradaDeSalud({ alergias: "ninguna", contacto_emergencia: { nombre: "Tía", telefono: "+52 1 55 1234 5678" }, autorizacion_atencion_medica: false });
  assert.equal((ok.valores["contacto_emergencia"] as { telefono: string }).telefono, "+525512345678");
  assert.deepEqual(ok.contacto, { nombre: "Tía", telefono: "+525512345678" });
  assert.equal(ok.valores["autorizacion_atencion_medica"], false, "«no autorizo» es una respuesta válida");
  assert.equal(leerEntradaDeSalud({ medicamentos: null }).valores["medicamentos"], null, "null borra");
  const campos = (f: () => unknown): string[] => {
    try {
      f();
    } catch (e) {
      assert.ok(e instanceof ErrorApi && e.codigo === "validacion");
      return (e.detalles ?? []).map((d) => d.campo ?? "");
    }
    return [];
  };
  assert.deepEqual(campos(() => leerEntradaDeSalud({})), ["salud"]);
  assert.deepEqual(campos(() => leerEntradaDeSalud({ tipo_sangre: "O+" })), ["salud.tipo_sangre"]);
  assert.deepEqual(campos(() => leerEntradaDeSalud({ contacto_emergencia: { nombre: "T", telefono: "12" } })), ["salud.contacto_emergencia.telefono"]);
  assert.deepEqual(campos(() => leerEntradaDeSalud({ autorizacion_atencion_medica: "sí" })), ["salud.autorizacion_atencion_medica"]);
  assert.deepEqual(campos(() => leerEntradaDeSalud({ alergias: "x".repeat(2001) })), ["salud.alergias"]);
  assert.deepEqual(campos(() => leerEntradaDeSalud([1] as never)), ["salud"]);
});

test("contactoDeEntradaEsTutor: compara el contacto de la entrada con los adultos que quedarán", () => {
  const e = leerEntradaDeSalud({ contacto_emergencia: { nombre: "Lucía Prado", telefono: "5512345678" } });
  assert.ok(contactoDeEntradaEsTutor(e, [{ nombre: "Rosa Mena", telefono: "+525512345678" }]));
  assert.ok(!contactoDeEntradaEsTutor(e, [{ nombre: "Rosa Mena", telefono: "+525500000000" }]));
  assert.ok(!contactoDeEntradaEsTutor(leerEntradaDeSalud({ alergias: "x" }), [{ nombre: "Rosa", telefono: "+525512345678" }]), "sin contacto en la entrada no hay choque");
});
