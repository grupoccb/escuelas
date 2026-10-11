import { test } from "node:test";
import assert from "node:assert/strict";
import { apellidoDeFamilia, asistenciaEsBaja, lineaDeFamilia, pideAtencion, porcentajeEntero, sucursalesDe, subtituloDeAlumnos, textoDeEdad } from "./alumnos-vista.ts";

const tutor = (apellidos: string | null, paga: boolean) => ({ tutor_id: "t", nombre: "Ana", apellidos, parentesco: "madre", es_responsable_pago: paga, es_contacto_urgencia: false, puede_recoger: false, lo_lleva: false });

test("el porcentaje es entero y acepta el texto que a veces manda la API", () => {
  assert.equal(porcentajeEntero(66.7), 67);
  assert.equal(porcentajeEntero("62"), 62);
  assert.equal(porcentajeEntero(null), null);
  assert.equal(porcentajeEntero("nada"), null);
  assert.equal(porcentajeEntero(0), 0);
});

test("la asistencia es baja por debajo de 75 y sin dato no cuenta", () => {
  assert.equal(asistenciaEsBaja(74), true);
  assert.equal(asistenciaEsBaja(75), false);
  assert.equal(asistenciaEsBaja(null), false);
});

test("«solo con atraso o faltas»: con vencido o con asistencia baja; el pendiente o al corriente con buena asistencia no", () => {
  assert.equal(pideAtencion({ cuenta: "con_vencido", asistencia_30_dias: 100 }), true);
  assert.equal(pideAtencion({ cuenta: "al_corriente", asistencia_30_dias: 71 }), true);
  assert.equal(pideAtencion({ cuenta: "por_pagar", asistencia_30_dias: 94 }), false);
  assert.equal(pideAtencion({ cuenta: null, asistencia_30_dias: null }), false);
  assert.equal(pideAtencion(undefined), false);
});

test("la edad y la línea de la familia", () => {
  assert.equal(textoDeEdad(7), "7 años");
  assert.equal(textoDeEdad(1), "1 año");
  assert.equal(textoDeEdad(null), "");
  const base = { edad: 7, apellidos: "Vivanco Lozano", tutores: [tutor("Lozano Ruiz", false), tutor("Vivanco", true)] };
  assert.equal(apellidoDeFamilia(base), "Vivanco");
  assert.equal(lineaDeFamilia(base), "7 años · familia Vivanco");
  assert.equal(lineaDeFamilia({ ...base, tutores: [tutor(null, true)] }), "7 años · familia Vivanco Lozano");
  assert.equal(lineaDeFamilia({ ...base, edad: null, tutores: [] }), "sin adultos registrados");
});

test("las sucursales no se repiten", () => {
  const i = (s: string) => ({ id: s, estatus: "activa" as const, grupo: { id: "g", nombre: "G" }, vertical: { id: "v", nombre: "V", color_marca: null }, sucursal: { id: s, nombre: s } });
  assert.deepEqual(sucursalesDe({ inscripciones: [i("Norte"), i("Sur"), i("Norte")] }), ["Norte", "Sur"]);
  assert.deepEqual(sucursalesDe(undefined), []);
});

test("el subtítulo dice cuántos alumnos hay y con qué estatus", () => {
  assert.equal(subtituloDeAlumnos({ total: null, estatus: "", esMaestro: false }), "Busca por nombre del alumno o por teléfono de un adulto de la familia.");
  assert.equal(subtituloDeAlumnos({ total: 312, estatus: "", esMaestro: false }), "312 alumnos · busca por nombre del alumno o por teléfono de un adulto de la familia");
  assert.equal(subtituloDeAlumnos({ total: 1, estatus: "congelado", esMaestro: true }), "1 alumno congelado · sin datos de contacto de la familia ni importes");
  assert.equal(subtituloDeAlumnos({ total: 1, estatus: "baja", esMaestro: false }), "1 alumno dado de baja · busca por nombre del alumno o por teléfono de un adulto de la familia");
  assert.equal(subtituloDeAlumnos({ total: 4, estatus: "baja", esMaestro: false }), "4 alumnos dados de baja · busca por nombre del alumno o por teléfono de un adulto de la familia");
});
