import { test } from "node:test";
import assert from "node:assert/strict";
import { alumnoDesde, antecedentesDesde, correoValido, cuerpoDeAlumno, datosLegalesQueFaltan, faltanDeSeccion, guardadoHace, textoDeFaltan, cuerpoDeAntecedentes, cuerpoDeTutores, telefonoValido, tutorDesde, tutorVacio, validarAlumno, validarAntecedentes, validarTutores } from "./formulario.ts";
import type { Registro } from "./tipos.ts";

const registro = (parcial: Partial<Registro> = {}): Registro => ({
  existe: true,
  id: "r1",
  clase_muestra_id: "c1",
  prospecto_id: "p1",
  lead_id: "l1",
  clase: { estatus: "agendada", fecha_hora: "2026-11-10T22:00:00.000Z" },
  estatus: "borrador",
  alumno: { nombre: "Ana", apellidos: null, fecha_nacimiento: "2018-05-04", sexo: null, escuela: null, turno_escolar: null, talla_uniforme: null },
  tutores: [],
  antecedentes: { practico_antes: null, practico_donde: null, practico_nivel: null, motivo_clase: null, motivo_clase_detalle: null },
  observacion: { asistio: null, nivel_observado: null, grupo_recomendado_id: null, interes_percibido: null, notas: null },
  salud: { contacto_registrado: false, completa: false, faltantes: [], puedes_ver_valores: true },
  faltantes: [],
  completo_en: null,
  cerrado_en: null,
  actualizado_en: null,
  ...parcial,
});

test("del registro a los campos (texto) y de vuelta: lo vacío se manda como null para que el servidor lo borre", () => {
  const f = alumnoDesde(registro());
  assert.equal(f.nombre, "Ana");
  assert.equal(f.apellidos, "");
  assert.deepEqual(cuerpoDeAlumno(f), { nombre: "Ana", apellidos: null, fecha_nacimiento: "2018-05-04", sexo: null, escuela: null, turno_escolar: null, talla_uniforme: null });
  assert.equal(cuerpoDeAlumno({ ...f, nombre: "  Ana  " }).nombre, "Ana", "se recorta");
});

test("antecedentes: quien no practicó no manda dónde ni nivel, y el detalle solo vale con el motivo «otro»", () => {
  const base = antecedentesDesde(registro());
  assert.equal(base.practico_antes, "");
  const no = cuerpoDeAntecedentes({ ...base, practico_antes: "no", practico_donde: "Escuela X", practico_nivel: "Medio", motivo_clase: "disciplina", motivo_clase_detalle: "algo" });
  assert.deepEqual(no, { practico_antes: false, practico_donde: null, practico_nivel: null, motivo_clase: "disciplina", motivo_clase_detalle: null });
  const si = cuerpoDeAntecedentes({ ...base, practico_antes: "si", practico_donde: "Escuela X", practico_nivel: "Medio", motivo_clase: "otro", motivo_clase_detalle: "Lo recomendó un amigo" });
  assert.deepEqual(si, { practico_antes: true, practico_donde: "Escuela X", practico_nivel: "Medio", motivo_clase: "otro", motivo_clase_detalle: "Lo recomendó un amigo" });
  assert.deepEqual(validarAntecedentes({ ...base, motivo_clase: "disciplina", motivo_clase_detalle: "x" }), { "antecedentes.motivo_clase_detalle": "El detalle solo se anota cuando el motivo es «Otro»" });
});

test("fecha de nacimiento: real, no futura y de 1 a 99 años", () => {
  const f = alumnoDesde(registro());
  assert.deepEqual(validarAlumno(f, "2026-11-10"), {});
  assert.deepEqual(validarAlumno({ ...f, fecha_nacimiento: "" }, "2026-11-10"), {}, "vacío es un borrador válido");
  assert.match(validarAlumno({ ...f, fecha_nacimiento: "2026-02-31" }, "2026-11-10")["alumno.fecha_nacimiento"] ?? "", /fecha real/);
  assert.match(validarAlumno({ ...f, fecha_nacimiento: "2027-01-01" }, "2026-11-10")["alumno.fecha_nacimiento"] ?? "", /futura/);
  assert.match(validarAlumno({ ...f, fecha_nacimiento: "1900-01-01" }, "2026-11-10")["alumno.fecha_nacimiento"] ?? "", /1 y 99/);
  assert.match(validarAlumno({ ...f, fecha_nacimiento: "2026-06-01" }, "2026-11-10")["alumno.fecha_nacimiento"] ?? "", /1 y 99/, "menor de un año");
});

test("adultos: nombre, parentesco y teléfono por fila; teléfonos distintos; un solo responsable de pago y uno que lo lleva", () => {
  const a = { ...tutorVacio(), nombre: "Rosa", parentesco: "madre", telefono: "55 1234 5678", es_responsable_pago: true };
  assert.deepEqual(validarTutores([a]), {});
  const e = validarTutores([a, { ...tutorVacio(), nombre: "", telefono: "5512345678", correo: "mal" }, { ...tutorVacio(), nombre: "Luz", parentesco: "abuela", telefono: "123" }]);
  assert.equal(e["tutores[1].nombre"], "Falta: nombre.");
  assert.match(e["tutores[1].telefono"] ?? "", /mismo teléfono del adulto 1/);
  assert.equal(e["tutores[1].correo"], "Escribe un correo válido (nombre@dominio.com)");
  assert.match(e["tutores[2].telefono"] ?? "", /10 dígitos/);
  assert.equal(validarTutores([{ ...a, es_responsable_pago: true }, { ...a, telefono: "5598765432", es_responsable_pago: true }])["tutores"], "Solo un adulto puede ser el responsable de pago");
  assert.equal(validarTutores([{ ...a, lo_lleva: true }, { ...a, telefono: "5598765432", lo_lleva: true }])["tutores"], "Solo un adulto puede ser quien lo lleva");
});

test("el cuerpo de adultos manda la lista completa y conserva el id de los que ya existían", () => {
  const existente = tutorDesde({ id: "t1", nombre: "Rosa", apellidos: null, parentesco: "madre", telefono: "+525512345678", correo: null, es_responsable_pago: true, lo_lleva: false, puede_recoger: true });
  const nuevo = { ...tutorVacio(), nombre: "Luz ", parentesco: "abuela", telefono: " 5598765432", puede_recoger: true };
  const cuerpo = cuerpoDeTutores([existente, nuevo]);
  assert.equal(cuerpo.length, 2);
  assert.equal(cuerpo[0]?.id, "t1");
  assert.equal("id" in (cuerpo[1] ?? {}), false);
  assert.deepEqual(cuerpo[1], { nombre: "Luz", apellidos: null, parentesco: "abuela", telefono: "5598765432", correo: null, es_responsable_pago: false, lo_lleva: false, puede_recoger: true });
});

test("teléfono y correo", () => {
  assert.equal(telefonoValido("(55) 1234-5678"), true);
  assert.equal(telefonoValido("+52 1 55 1234 5678"), true);
  assert.equal(telefonoValido("12345"), false);
  assert.equal(correoValido("a@b.co"), true);
  assert.equal(correoValido("a@b"), false);
});

test("estado de cada sección: sale de lo guardado; la observación cuenta su interés percibido", () => {
  const r = registro({ faltantes: ["alumno.apellidos", "alumno.sexo", "tutores.responsable_pago", "antecedentes.motivo_clase", "salud.alergias"], salud: { contacto_registrado: false, completa: false, faltantes: ["salud.alergias", "salud.medicamentos"], puedes_ver_valores: true } });
  assert.equal(faltanDeSeccion("alumno", r), 2);
  assert.equal(faltanDeSeccion("tutores", r), 1);
  assert.equal(faltanDeSeccion("antecedentes", r), 1);
  assert.equal(faltanDeSeccion("salud", r), 2);
  assert.equal(faltanDeSeccion("observacion", r), 1);
  assert.equal(faltanDeSeccion("observacion", registro({ observacion: { asistio: null, nivel_observado: null, grupo_recomendado_id: null, interes_percibido: "alto", notas: null } })), 0);
  assert.equal(faltanDeSeccion("alumno", registro()), 0);
});

test("textoDeFaltan: Completa, Falta 1 dato, Faltan N datos", () => {
  assert.equal(textoDeFaltan(0), "Completa");
  assert.equal(textoDeFaltan(1), "Falta 1 dato");
  assert.equal(textoDeFaltan(3), "Faltan 3 datos");
});

test("reglamento e imagen: el reglamento debe estar aceptado y la imagen respondida (aunque sea que no)", () => {
  const docs = ["reglamento", "uso_imagen"];
  assert.equal(datosLegalesQueFaltan(docs, []), 2);
  assert.equal(datosLegalesQueFaltan(docs, [{ tipo: "reglamento", estado: "aceptada" }, { tipo: "uso_imagen", estado: "rechazada" }]), 0);
  assert.equal(datosLegalesQueFaltan(docs, [{ tipo: "reglamento", estado: "rechazada" }, { tipo: "uso_imagen", estado: "aceptada" }]), 1);
  assert.equal(datosLegalesQueFaltan(["reglamento"], [{ tipo: "reglamento", estado: "aceptada" }]), 0);
  assert.equal(datosLegalesQueFaltan([], []), 0);
});

test("guardadoHace: un momento, minutos, horas y días", () => {
  const t = Date.UTC(2026, 9, 12, 12, 0, 0);
  assert.equal(guardadoHace(new Date(t - 20_000).toISOString(), t), "hace un momento");
  assert.equal(guardadoHace(new Date(t - 3 * 60_000).toISOString(), t), "hace 3 min");
  assert.equal(guardadoHace(new Date(t - 2 * 3_600_000).toISOString(), t), "hace 2 h");
  assert.equal(guardadoHace(new Date(t - 3 * 86_400_000).toISOString(), t), "hace 3 d");
  assert.equal(guardadoHace("no es fecha", t), "hace un momento");
});
