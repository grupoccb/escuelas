// G1: las reglas puras del pase de lista — qué sesiones tiene un día, cuándo se puede pasar lista y cómo se comporta con zonas horarias y cambios de horario.

import { test } from "node:test";
import assert from "node:assert/strict";
import { fechaADate, dateAFecha, hoyEn, problemaDePase, sesionesDelDia } from "./pase.ts";

const MX = "America/Mexico_City";
const LUN_MIE_16 = [
  { dia_semana: 1, hora_inicio_min: 960 },
  { dia_semana: 3, hora_inicio_min: 960 },
];

test("sesionesDelDia: solo los días de la semana del grupo, a la hora de pared de la sucursal", () => {
  // Lunes 16 de noviembre de 2026, 16:00 en la Ciudad de México = 22:00Z.
  assert.deepEqual(sesionesDelDia("2026-11-16", LUN_MIE_16, MX).map((d) => d.toISOString()), ["2026-11-16T22:00:00.000Z"]);
  assert.deepEqual(sesionesDelDia("2026-11-18", LUN_MIE_16, MX).map((d) => d.toISOString()), ["2026-11-18T22:00:00.000Z"]);
  assert.deepEqual(sesionesDelDia("2026-11-17", LUN_MIE_16, MX), [], "el martes no da clase");
  assert.deepEqual(sesionesDelDia("2026-11-16", [], MX), []);
});

test("sesionesDelDia: dos sesiones el mismo día salen en orden y una repetida cuenta una vez", () => {
  const dos = [
    { dia_semana: 1, hora_inicio_min: 1080 },
    { dia_semana: 1, hora_inicio_min: 600 },
    { dia_semana: 1, hora_inicio_min: 600 },
  ];
  assert.deepEqual(sesionesDelDia("2026-11-16", dos, MX).map((d) => d.toISOString()), ["2026-11-16T16:00:00.000Z", "2026-11-17T00:00:00.000Z"]);
});

test("sesionesDelDia: el cambio de horario de verano — la hora de pared manda, y la hora que no existe no es sesión", () => {
  const NY = "America/New_York";
  // Domingo 8 de marzo de 2026: a las 02:00 los relojes saltan a las 03:00. Una clase a las 02:30 ese día no existe; una a las 10:00 es a las 14:00Z (EDT).
  const dom = (min: number) => [{ dia_semana: 0, hora_inicio_min: min }];
  assert.deepEqual(sesionesDelDia("2026-03-08", dom(150), NY), []);
  assert.deepEqual(sesionesDelDia("2026-03-08", dom(600), NY).map((d) => d.toISOString()), ["2026-03-08T14:00:00.000Z"]);
  // La semana anterior (EST) la misma hora de pared es una hora más tarde en UTC.
  assert.deepEqual(sesionesDelDia("2026-03-01", dom(600), NY).map((d) => d.toISOString()), ["2026-03-01T15:00:00.000Z"]);
});

test("problemaDePase: tiene que ser una sesión y haber empezado — el borde es el instante exacto de inicio", () => {
  const e = (ahora: string) => ({ horarios: LUN_MIE_16, zona: MX, ahora: new Date(ahora) });
  assert.equal(problemaDePase("2026-11-17", e("2026-11-18T18:00:00Z")), "no_es_sesion");
  assert.equal(problemaDePase("2026-11-18", e("2026-11-18T21:59:59.999Z")), "fecha_futura", "un milisegundo antes de empezar");
  assert.equal(problemaDePase("2026-11-18", e("2026-11-18T22:00:00Z")), null, "justo al empezar ya se puede");
  assert.equal(problemaDePase("2026-11-16", e("2026-11-18T18:00:00Z")), null, "una sesión pasada");
  assert.equal(problemaDePase("2026-11-23", e("2026-11-18T18:00:00Z")), "fecha_futura");
});

test("hoyEn y las fechas: el día de calendario es el LOCAL de la sucursal, no el de UTC", () => {
  // 00:30 del martes 17 en Tokio (UTC+9) es todavía el lunes 16 a las 15:30Z.
  assert.equal(hoyEn("Asia/Tokyo", new Date("2026-11-16T15:30:00Z")), "2026-11-17");
  assert.equal(hoyEn(MX, new Date("2026-11-17T03:00:00Z")), "2026-11-16");
  assert.equal(dateAFecha(fechaADate("2026-11-16")), "2026-11-16");
  // Una sesión de Tokio del martes 17 a las 00:30 locales se resuelve contra el 17, aunque en UTC sea el 16.
  assert.deepEqual(sesionesDelDia("2026-11-17", [{ dia_semana: 2, hora_inicio_min: 30 }], "Asia/Tokyo").map((d) => d.toISOString()), ["2026-11-16T15:30:00.000Z"]);
});
