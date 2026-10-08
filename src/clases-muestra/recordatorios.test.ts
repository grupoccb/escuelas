import { test } from "node:test";
import assert from "node:assert/strict";
import { planearRecordatorios, type AutomatizacionDeRecordatorio } from "./recordatorios.ts";

const TODOS = [0, 1, 2, 3, 4, 5, 6];
const A24: AutomatizacionDeRecordatorio = { id: "a24", offset_minutos: -1440, hora_inicio_min: 540, hora_fin_min: 1200, dias_permitidos: TODOS };
const A2: AutomatizacionDeRecordatorio = { id: "a2", offset_minutos: -120, hora_inicio_min: 540, hora_fin_min: 1200, dias_permitidos: TODOS };
const MX = "America/Mexico_City"; // UTC-6 en noviembre de 2026
const NY = "America/New_York";

const iso = (d: Date | null): string | null => d?.toISOString() ?? null;
const plan = (inicio: string, ahora: string, o: { zona?: string; automatizaciones?: AutomatizacionDeRecordatorio[] } = {}) =>
  planearRecordatorios({ inicio: new Date(inicio), zonaHoraria: o.zona ?? MX, ahora: new Date(ahora), automatizaciones: o.automatizaciones ?? [A24, A2] }).map((p) => ({ id: p.automatizacionId, sale: iso(p.programadoPara), motivo: p.motivo }));

test("D3 domingo 10:00: el de 24 h sale el sábado a las 10:00 y el de 2 h (08:00) se recorre a las 09:00 y sale", () => {
  // Domingo 1 de noviembre de 2026, 10:00 locales = 16:00Z.
  assert.deepEqual(plan("2026-11-01T16:00:00Z", "2026-10-20T00:00:00Z"), [
    { id: "a24", sale: "2026-10-31T16:00:00.000Z", motivo: null },
    { id: "a2", sale: "2026-11-01T15:00:00.000Z", motivo: null },
  ]);
});

test("D3 el borde: recorrido, el de 2 h sale si queda ANTES del inicio (domingo 09:30) y se descarta si queda IGUAL (domingo 09:00)", () => {
  assert.deepEqual(plan("2026-11-01T15:30:00Z", "2026-10-20T00:00:00Z"), [
    { id: "a24", sale: "2026-10-31T15:30:00.000Z", motivo: null },
    { id: "a2", sale: "2026-11-01T15:00:00.000Z", motivo: null }, // 07:30 → 09:00, media hora antes de la clase
  ]);
  assert.deepEqual(plan("2026-11-01T15:00:00Z", "2026-10-20T00:00:00Z"), [
    { id: "a24", sale: "2026-10-31T15:00:00.000Z", motivo: null },
    { id: "a2", sale: null, motivo: "evento_pasado" }, // 07:00 → 09:00 = la hora de la clase
  ]);
});

test("D3 lunes 09:00: el de 24 h cae el domingo 09:00 y sale; el de 2 h (07:00) se recorre a las 09:00 = la clase y se descarta", () => {
  assert.deepEqual(plan("2026-11-02T15:00:00Z", "2026-10-20T00:00:00Z"), [
    { id: "a24", sale: "2026-11-01T15:00:00.000Z", motivo: null },
    { id: "a2", sale: null, motivo: "evento_pasado" },
  ]);
});

test("D3 los días permitidos de la automatización mandan: sin domingo, el de 24 h de una clase del lunes 09:00 también se descarta", () => {
  const sinDomingo: AutomatizacionDeRecordatorio = { ...A24, dias_permitidos: [1, 2, 3, 4, 5, 6] };
  assert.deepEqual(plan("2026-11-02T15:00:00Z", "2026-10-20T00:00:00Z", { automatizaciones: [sinDomingo] }), [{ id: "a24", sale: null, motivo: "evento_pasado" }]);
  // Y con una clase del lunes a las 16:00 el de 24 h (domingo 16:00, día no permitido) se recorre al lunes 09:00: antes de la clase, sale.
  assert.deepEqual(plan("2026-11-02T22:00:00Z", "2026-10-20T00:00:00Z", { automatizaciones: [sinDomingo] }), [{ id: "a24", sale: "2026-11-02T15:00:00.000Z", motivo: null }]);
});

test("D3 agendada con menos de 24 h: el de 24 h no existe (se descarta con motivo) y el de 2 h sí, si alcanza", () => {
  // Clase martes 3 de noviembre 15:00 locales (21:00Z); se agenda el lunes 2 a las 19:00 locales (01:00Z del martes): faltan 20 h.
  assert.deepEqual(plan("2026-11-03T21:00:00Z", "2026-11-03T01:00:00Z"), [
    { id: "a24", sale: null, motivo: "ya_paso_el_momento" },
    { id: "a2", sale: "2026-11-03T19:00:00.000Z", motivo: null },
  ]);
  // Faltan 90 min: ya ninguno alcanza.
  assert.deepEqual(plan("2026-11-03T21:00:00Z", "2026-11-03T19:30:00Z"), [
    { id: "a24", sale: null, motivo: "ya_paso_el_momento" },
    { id: "a2", sale: null, motivo: "ya_paso_el_momento" },
  ]);
});

test("D3 el momento nominal justo AHORA todavía existe (24 h exactas); un minuto antes ya no", () => {
  assert.equal(plan("2026-11-03T21:00:00Z", "2026-11-02T21:00:00Z")[0]!.sale, "2026-11-02T21:00:00.000Z");
  assert.equal(plan("2026-11-03T21:00:00Z", "2026-11-02T21:01:00Z")[0]!.motivo, "ya_paso_el_momento");
});

test("D3 los tiempos son configurables (offsets) y se respetan; sin automatizaciones no hay nada", () => {
  const seisHoras: AutomatizacionDeRecordatorio = { id: "a6", offset_minutos: -360, hora_inicio_min: 540, hora_fin_min: 1200, dias_permitidos: TODOS };
  assert.deepEqual(plan("2026-11-03T21:00:00Z", "2026-11-01T00:00:00Z", { automatizaciones: [seisHoras] }), [{ id: "a6", sale: "2026-11-03T15:00:00.000Z", motivo: null }]);
  assert.deepEqual(plan("2026-11-03T21:00:00Z", "2026-11-01T00:00:00Z", { automatizaciones: [] }), []);
});

test("D3 una clase al final del día: el de 24 h cae después de las 20:00 y se recorre a las 09:00 de la clase (antes que ella)", () => {
  // Martes 3 de noviembre, 20:30 locales (02:30Z del miércoles).
  assert.deepEqual(plan("2026-11-04T02:30:00Z", "2026-10-20T00:00:00Z"), [
    { id: "a24", sale: "2026-11-03T15:00:00.000Z", motivo: null }, // lunes 20:30 → martes 09:00
    { id: "a2", sale: "2026-11-04T00:30:00.000Z", motivo: null }, // 18:30
  ]);
});

test("D3 la ventana propia de la automatización puede ser más estrecha que 09:00–20:00", () => {
  const estrecha: AutomatizacionDeRecordatorio = { ...A2, hora_inicio_min: 600, hora_fin_min: 1080 }; // 10:00–18:00
  // Clase a las 12:00 (18:00Z): 2 h antes = 10:00 → sale; clase a las 11:00: 09:00 → se recorre a las 10:00 (antes de la clase).
  assert.equal(plan("2026-11-03T18:00:00Z", "2026-11-01T00:00:00Z", { automatizaciones: [estrecha] })[0]!.sale, "2026-11-03T16:00:00.000Z");
  assert.equal(plan("2026-11-03T17:00:00Z", "2026-11-01T00:00:00Z", { automatizaciones: [estrecha] })[0]!.sale, "2026-11-03T16:00:00.000Z");
  // Clase a las 10:00: 08:00 → 10:00 = la clase → se descarta.
  assert.equal(plan("2026-11-03T16:00:00Z", "2026-11-01T00:00:00Z", { automatizaciones: [estrecha] })[0]!.motivo, "evento_pasado");
});

test("D3 horario de verano en Nueva York: el salto de primavera (domingo 8 de marzo de 2026) no mueve la hora de pared de lo que sale", () => {
  // Clase domingo 8 de marzo, 10:00 EDT = 14:00Z. El de 24 h: sábado 7, 14:00Z = 09:00 EST (justo dentro de horario). El de 2 h: 12:00Z = 08:00 EDT → 09:00 EDT = 13:00Z.
  assert.deepEqual(plan("2026-03-08T14:00:00Z", "2026-03-01T00:00:00Z", { zona: NY }), [
    { id: "a24", sale: "2026-03-07T14:00:00.000Z", motivo: null },
    { id: "a2", sale: "2026-03-08T13:00:00.000Z", motivo: null },
  ]);
  // Clase domingo 8 de marzo, 09:30 EDT = 13:30Z: el de 24 h cae el sábado 13:30Z = 08:30 EST → fuera → 09:00 EST (14:00Z) del sábado, antes de la clase.
  assert.deepEqual(plan("2026-03-08T13:30:00Z", "2026-03-01T00:00:00Z", { zona: NY }), [
    { id: "a24", sale: "2026-03-07T14:00:00.000Z", motivo: null },
    { id: "a2", sale: "2026-03-08T13:00:00.000Z", motivo: null },
  ]);
});

test("D3 horario de verano en Nueva York: el retroceso de otoño (domingo 1 de noviembre de 2026)", () => {
  // Clase domingo 1 de noviembre, 10:00 EST = 15:00Z. El de 2 h: 13:00Z = 08:00 EST → 09:00 EST = 14:00Z. El de 24 h: sábado 31, 15:00Z = 11:00 EDT.
  assert.deepEqual(plan("2026-11-01T15:00:00Z", "2026-10-25T00:00:00Z", { zona: NY }), [
    { id: "a24", sale: "2026-10-31T15:00:00.000Z", motivo: null },
    { id: "a2", sale: "2026-11-01T14:00:00.000Z", motivo: null },
  ]);
  // Una clase a las 09:00 EST (14:00Z) del domingo del retroceso: el de 2 h (12:00Z = 07:00 EST) se recorre a las 09:00 EST = la clase → se descarta.
  assert.equal(plan("2026-11-01T14:00:00Z", "2026-10-25T00:00:00Z", { zona: NY })[1]!.motivo, "evento_pasado");
});

test("D3 zonas con desfases grandes: Tokio (UTC+9) y Kiritimati (UTC+14) usan SU hora de pared, no la del servidor", () => {
  // Clase en Tokio el martes 3 de noviembre a las 10:00 (01:00Z). El de 2 h es 08:00 en Tokio → 09:00 en Tokio = 00:00Z.
  assert.equal(plan("2026-11-03T01:00:00Z", "2026-11-01T00:00:00Z", { zona: "Asia/Tokyo" })[1]!.sale, "2026-11-03T00:00:00.000Z");
  // Kiritimati: clase a las 15:00 locales del miércoles 4 (01:00Z del miércoles); el de 24 h es el martes 15:00 local = 01:00Z del martes.
  assert.deepEqual(plan("2026-11-04T01:00:00Z", "2026-11-01T00:00:00Z", { zona: "Pacific/Kiritimati" }), [
    { id: "a24", sale: "2026-11-03T01:00:00.000Z", motivo: null },
    { id: "a2", sale: "2026-11-03T23:00:00.000Z", motivo: null },
  ]);
});

test("D3 la salida no depende del orden en que lleguen las automatizaciones (determinista)", () => {
  const a = plan("2026-11-01T16:00:00Z", "2026-10-20T00:00:00Z", { automatizaciones: [A24, A2] });
  const b = plan("2026-11-01T16:00:00Z", "2026-10-20T00:00:00Z", { automatizaciones: [A2, A24] });
  assert.deepEqual(a, [...b].reverse());
});
