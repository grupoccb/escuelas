import { test } from "node:test";
import assert from "node:assert/strict";
import { avanceHaciaElEvento, avisoDeFaltas, celdasDeClases, diaCorto, estadoDelAlumno, lineaDeTiempo, textoDeAsistencia, textoDeProximoEvento } from "./expediente-vista.ts";
import type { Trayectoria } from "./tipos.ts";

const HOY = "2026-10-11";
const g = (id: string, nombre: string) => ({ id, nombre });
const insc = (o: Partial<Trayectoria["inscripciones"][number]> & { id: string }): Trayectoria["inscripciones"][number] => ({ estatus: "activa", fecha_inicio: "2026-03-03", fecha_baja: null, grupo: g("g2", "Grupo B"), programa: g("p", "Programa"), vertical: g("v", "Disciplina"), sucursal: g("s", "Sede"), ...o });
const trayectoria = (o: Partial<Trayectoria> = {}): Trayectoria => ({ fecha_de_inicio: "2026-03-03", antiguedad: { dias: 222, meses: 7 }, grupo_actual: g("g2", "Grupo B"), inscripciones: [insc({ id: "i1" })], historial_de_cambios_de_grupo: [], niveles: [], proximo_examen: [], ...o });

test("el día corto", () => {
  assert.equal(diaCorto("2026-08-03"), "3 ago");
  assert.equal(diaCorto("2026-12-31"), "31 dic");
  assert.equal(diaCorto("raro"), "raro");
});

test("el estado del alumno: activo desde, congelado y baja desde la última baja", () => {
  assert.deepEqual(estadoDelAlumno("activo", trayectoria(), HOY), { texto: "Activo desde el 3 de marzo", tono: "exito" });
  assert.deepEqual(estadoDelAlumno("activo", trayectoria({ fecha_de_inicio: null }), HOY), { texto: "Activo", tono: "exito" });
  assert.deepEqual(estadoDelAlumno("congelado", trayectoria(), HOY), { texto: "Congelado", tono: "info" });
  const dos = trayectoria({ inscripciones: [insc({ id: "a", estatus: "baja", fecha_baja: "2026-08-15" }), insc({ id: "b", estatus: "baja", fecha_baja: "2026-10-01" })] });
  assert.deepEqual(estadoDelAlumno("baja", dos, HOY), { texto: "Baja desde el 1 de octubre", tono: "peligro" });
  assert.deepEqual(estadoDelAlumno("baja", trayectoria(), HOY), { texto: "Baja", tono: "peligro" });
});

test("la línea de tiempo: la alta en el grupo de entrada, cada cambio, el nivel, los eventos y la baja con su motivo; lo más reciente primero", () => {
  const t = trayectoria({
    inscripciones: [insc({ id: "i1", grupo: g("g2", "Grupo B"), fecha_inicio: "2026-03-03" }), insc({ id: "i2", estatus: "baja", grupo: g("g9", "Otra"), fecha_inicio: "2026-01-10", fecha_baja: "2026-02-20" })],
    historial_de_cambios_de_grupo: [{ inscripcion_id: "i1", fecha: "2026-09-01", grupo_anterior: g("g1", "Grupo A"), grupo_nuevo: g("g2", "Grupo B") }],
    niveles: [{ vertical: { id: "v", nombre: "Disciplina", etiqueta_progresion: "Peldaño" }, nivel: { id: "n", nombre: "Nivel 2", color_hex: null }, fecha_obtenido: "2026-10-03" }, { vertical: { id: "w", nombre: "Otra", etiqueta_progresion: null }, nivel: null, fecha_obtenido: null }],
  });
  const h = lineaDeTiempo(t, {
    hoy: HOY,
    bajas: [{ inscripcion_id: "i2", fecha_baja: "2026-02-20", motivo: { id: "m", codigo: "x", nombre: "Mudanza" } }],
    eventos: [
      { evento: { id: "e1", nombre: "Examen", tipo: "examen", fecha: "2026-07-18" }, estatus: "asistio", resultado: "aprobado", nivel_otorgado: { id: "n", nombre: "Nivel 1" } },
      { evento: { id: "e2", nombre: "Muestra", tipo: "evento", fecha: "2026-12-01" }, estatus: "inscrito", resultado: null, nivel_otorgado: null },
    ],
  });
  assert.deepEqual(h.map((x) => x.titulo), ["Pasó a Nivel 2", "Cambió de Grupo A a Grupo B", "Asistió a Examen", "Se inscribió en Grupo A", "Se dio de baja de Otra", "Se inscribió en Otra"]);
  assert.equal(h[0]!.detalle, "Peldaño en Disciplina · 3 de octubre");
  assert.equal(h[2]!.detalle, "18 de julio · Aprobado · Nivel 1");
  assert.equal(h[4]!.detalle, "20 de febrero · Mudanza");
  assert.equal(h[3]!.detalle, "3 de marzo · Programa · Sede");
});

test("la línea de tiempo con una sola inscripción sin cambios dice el grupo de ahora", () => {
  assert.deepEqual(lineaDeTiempo(trayectoria(), { hoy: HOY }).map((x) => x.titulo), ["Se inscribió en Grupo B"]);
});

test("las últimas clases: las 16 más recientes, la más antigua primero, con su marca en palabras", () => {
  const filas = Array.from({ length: 20 }, (_, i) => ({ fecha: `2026-09-${String(i + 1).padStart(2, "0")}`, estatus: i % 3 === 0 ? "falta" : i % 3 === 1 ? "justificada" : "presente" }));
  const c = celdasDeClases([...filas].reverse());
  assert.equal(c.length, 16);
  assert.equal(c[0]!.fecha, "2026-09-05");
  assert.equal(c[15]!.fecha, "2026-09-20");
  assert.deepEqual([c[0]!.marca, c[0]!.tono, c[0]!.titulo], ["Justificada", "info", "5 sep: Justificada"]);
  assert.equal(celdasDeClases([{ fecha: "2026-09-01", estatus: "rara" }]).length, 0);
});

test("el aviso de faltas solo sale al llegar al umbral", () => {
  assert.equal(avisoDeFaltas(2, 3), null);
  assert.equal(avisoDeFaltas(3, 3), "Lleva 3 faltas seguidas. Se creó una tarea para que el asesor hable con la familia.");
  assert.equal(avisoDeFaltas(1, 1), "Lleva 1 falta seguida. Se creó una tarea para que el asesor hable con la familia.");
  assert.equal(avisoDeFaltas(5, 0), null);
});

test("el porcentaje de asistencia: entero, o «—»", () => {
  assert.equal(textoDeAsistencia(62), "62 %");
  assert.equal(textoDeAsistencia("62"), "62 %");
  assert.equal(textoDeAsistencia(66.6), "67 %");
  assert.equal(textoDeAsistencia(null), "—");
});

test("el avance hacia el evento y su renglón", () => {
  assert.equal(avanceHaciaElEvento({ clases_cumplidas: 21, clases_requeridas: 24 }), 87);
  assert.equal(avanceHaciaElEvento({ clases_cumplidas: 30, clases_requeridas: 24 }), 100);
  assert.equal(avanceHaciaElEvento({ clases_cumplidas: 0, clases_requeridas: 0 }), null);
  const larga = (f: string) => `fecha ${f}`;
  const el = { elegible: false, motivo: null, clases_cumplidas: 8, clases_requeridas: 12, faltan: 4, siguiente_nivel: null };
  const v = { id: "v", nombre: "D", etiqueta_evento: "Examen" };
  assert.equal(textoDeProximoEvento({ vertical: v, evento: { id: "e", nombre: "Examen de otoño", tipo: "examen", fecha: "2026-11-20", estatus_del_alumno: null }, elegibilidad: el }, larga), "Próximo examen: Examen de otoño · fecha 2026-11-20. Le faltan 4 clases (8 de 12).");
  assert.equal(textoDeProximoEvento({ vertical: v, evento: null, elegibilidad: el }, larga), "Sin examen próximo. Le faltan 4 clases (8 de 12).");
  assert.equal(textoDeProximoEvento({ vertical: v, evento: null, elegibilidad: { ...el, clases_requeridas: 0, clases_cumplidas: 0, faltan: 0 } }, larga), null);
});
