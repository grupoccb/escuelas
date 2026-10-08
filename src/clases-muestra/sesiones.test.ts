import { test } from "node:test";
import assert from "node:assert/strict";
import { describirSesion, esSesionDelGrupo, instanteDeSesion, problemaDeFecha, sesionesAgendables, sesionesEntre } from "./sesiones.ts";

const MX = "America/Mexico_City"; // sin horario de verano desde 2022
const NY = "America/New_York"; // salta el 8 de marzo de 2026 y retrocede el 1 de noviembre de 2026
const TJ = "America/Tijuana"; // con horario de verano
const TOKIO = "Asia/Tokyo";

const lunes16 = [{ dia_semana: 1, hora_inicio_min: 960 }];
const domingo10 = [{ dia_semana: 0, hora_inicio_min: 600 }];
const iso = (d: Date): string => d.toISOString();

test("D1: una sesión es el día de la semana y la hora de pared EN LA ZONA de la sucursal", () => {
  // lunes 12 de octubre de 2026, 16:00 en la Ciudad de México (UTC-6) = 22:00 UTC
  assert.equal(esSesionDelGrupo(new Date("2026-10-12T22:00:00Z"), lunes16, MX), true);
  assert.equal(esSesionDelGrupo(new Date("2026-10-12T16:00:00Z"), lunes16, MX), false, "16:00 UTC es otra hora de pared");
  assert.equal(esSesionDelGrupo(new Date("2026-10-13T22:00:00Z"), lunes16, MX), false, "martes");
  assert.equal(esSesionDelGrupo(new Date("2026-10-12T22:01:00Z"), lunes16, MX), false, "un minuto después no es el inicio");
  assert.equal(esSesionDelGrupo(new Date("2026-10-12T22:00:30Z"), lunes16, MX), false, "con segundos no es el inicio");
  // En otra zona la misma hora de pared es otro instante.
  assert.equal(esSesionDelGrupo(new Date("2026-10-12T07:00:00Z"), lunes16, TOKIO), true, "lunes 16:00 en Tokio (UTC+9)");
  assert.equal(esSesionDelGrupo(new Date("2026-10-12T22:00:00Z"), lunes16, TOKIO), false);
  assert.equal(esSesionDelGrupo(new Date("no es fecha"), lunes16, MX), false);
});

test("D1: el cambio de horario de verano mueve el instante UTC pero no la hora de pared (domingo 10:00 en Nueva York)", () => {
  // Domingo 1 de marzo de 2026: EST (UTC-5) → 15:00 UTC. Domingo 8 de marzo (el salto): 10:00 ya es EDT (UTC-4) → 14:00 UTC.
  const sesiones = sesionesEntre(domingo10, NY, new Date("2026-02-28T00:00:00Z"), new Date("2026-03-16T00:00:00Z")).map(iso);
  assert.deepEqual(sesiones, ["2026-03-01T15:00:00.000Z", "2026-03-08T14:00:00.000Z", "2026-03-15T14:00:00.000Z"]);
  // Y al revés en el retroceso de noviembre: el domingo 1 de noviembre a las 10:00 ya es EST.
  const otono = sesionesEntre(domingo10, NY, new Date("2026-10-25T00:00:00Z"), new Date("2026-11-09T00:00:00Z")).map(iso);
  assert.deepEqual(otono, ["2026-10-25T14:00:00.000Z", "2026-11-01T15:00:00.000Z", "2026-11-08T15:00:00.000Z"]);
});

test("D1: una hora de pared que no existe (el salto de primavera) no es una sesión; la que existe dos veces cuenta una sola vez", () => {
  const madrugada = [{ dia_semana: 0, hora_inicio_min: 150 }]; // domingo 02:30
  // El domingo 8 de marzo de 2026 a las 02:30 no existe en Nueva York.
  assert.equal(instanteDeSesion(2026, 3, 8, 150, NY), null);
  assert.deepEqual(sesionesEntre(madrugada, NY, new Date("2026-03-01T00:00:00Z"), new Date("2026-03-16T00:00:00Z")).map(iso), ["2026-03-01T07:30:00.000Z", "2026-03-15T06:30:00.000Z"]);
  // El domingo 1 de noviembre la 01:30 ocurre dos veces (05:30Z en EDT y 06:30Z en EST): solo la primera es sesión.
  const una = [{ dia_semana: 0, hora_inicio_min: 90 }];
  assert.equal(esSesionDelGrupo(new Date("2026-11-01T05:30:00Z"), una, NY), true);
  assert.equal(esSesionDelGrupo(new Date("2026-11-01T06:30:00Z"), una, NY), false);
  assert.equal(sesionesEntre(una, NY, new Date("2026-10-31T00:00:00Z"), new Date("2026-11-02T12:00:00Z")).length, 1);
});

test("D1: sesionesEntre es inclusiva en los dos extremos, ordenada, sin repetidos y con varias franjas", () => {
  const dos = [
    { dia_semana: 1, hora_inicio_min: 960 },
    { dia_semana: 3, hora_inicio_min: 960 },
    { dia_semana: 1, hora_inicio_min: 960 }, // repetida a propósito
  ];
  const todas = sesionesEntre(dos, MX, new Date("2026-10-12T22:00:00Z"), new Date("2026-10-21T22:00:00Z")).map(iso);
  assert.deepEqual(todas, ["2026-10-12T22:00:00.000Z", "2026-10-14T22:00:00.000Z", "2026-10-19T22:00:00.000Z", "2026-10-21T22:00:00.000Z"]);
  assert.deepEqual(sesionesEntre(dos, MX, new Date("2026-10-12T22:00:01Z"), new Date("2026-10-21T21:59:59Z")).map(iso), ["2026-10-14T22:00:00.000Z", "2026-10-19T22:00:00.000Z"]);
  assert.deepEqual(sesionesEntre([], MX, new Date("2026-10-12T00:00:00Z"), new Date("2026-12-01T00:00:00Z")), []);
  assert.deepEqual(sesionesEntre(dos, MX, new Date("2026-10-20T00:00:00Z"), new Date("2026-10-12T00:00:00Z")), []);
});

test("D1: las zonas con desfases grandes no mueven el día (Tokio y Tijuana)", () => {
  // Tokio: lunes 16:00 local = lunes 07:00 UTC; el día UTC coincide, pero a las 01:00 locales el día UTC es el anterior.
  const tarde = [{ dia_semana: 1, hora_inicio_min: 60 }]; // lunes 01:00 en Tokio = domingo 16:00 UTC
  assert.deepEqual(sesionesEntre(tarde, TOKIO, new Date("2026-10-11T00:00:00Z"), new Date("2026-10-20T00:00:00Z")).map(iso), ["2026-10-11T16:00:00.000Z", "2026-10-18T16:00:00.000Z"]);
  // Tijuana pasa a horario de invierno el 1 de noviembre de 2026: el lunes 2 de noviembre 16:00 ya es UTC-8.
  assert.deepEqual(sesionesEntre(lunes16, TJ, new Date("2026-10-26T00:00:00Z"), new Date("2026-11-04T00:00:00Z")).map(iso), ["2026-10-26T23:00:00.000Z", "2026-11-03T00:00:00.000Z"]);
});

test("D1: problemaDeFecha — sesión del grupo, anticipación mínima inclusiva y horizonte inclusivo", () => {
  const base = { horarios: lunes16, zona: MX, anticipacionMin: 120, horizonteDias: 60 };
  const clase = new Date("2026-10-12T22:00:00Z"); // lunes 16:00 local
  // Justo con la anticipación mínima ya se puede; un minuto menos, no.
  assert.equal(problemaDeFecha(clase, { ...base, ahora: new Date("2026-10-12T20:00:00Z") }), null);
  assert.equal(problemaDeFecha(clase, { ...base, ahora: new Date("2026-10-12T20:01:00Z") }), "sin_anticipacion");
  assert.equal(problemaDeFecha(clase, { ...base, ahora: new Date("2026-10-13T00:00:00Z") }), "sin_anticipacion", "ya pasó");
  // Horizonte: 60 días justos sí; más, no.
  const lejana = new Date("2026-12-14T22:00:00Z"); // lunes; 61 días después del 14 de octubre
  assert.equal(problemaDeFecha(lejana, { ...base, ahora: new Date("2026-10-14T22:00:00Z") }), "fuera_de_horizonte");
  assert.equal(problemaDeFecha(lejana, { ...base, ahora: new Date("2026-10-14T22:00:00Z"), horizonteDias: 61 }), null, "61 días exactos caben");
  assert.equal(problemaDeFecha(lejana, { ...base, ahora: new Date("2026-10-15T22:00:00Z") }), null, "60 días exactos caben");
  // No es una sesión: tiene prioridad sobre lo demás.
  assert.equal(problemaDeFecha(new Date("2026-10-13T22:00:00Z"), { ...base, ahora: new Date("2026-10-01T00:00:00Z") }), "no_es_sesion");
});

test("D1: sesionesAgendables respeta la anticipación y el horizonte, y no incluye una sesión que ya casi empieza", () => {
  const e = { ahora: new Date("2026-10-12T21:00:00Z"), horarios: lunes16, zona: MX, anticipacionMin: 120, horizonteDias: 15 };
  // Hoy a las 15:00 locales la sesión de las 16:00 ya no alcanza (faltan 60 min): la primera agendable es la del 19.
  assert.deepEqual(sesionesAgendables(e).map(iso), ["2026-10-19T22:00:00.000Z", "2026-10-26T22:00:00.000Z"]);
  assert.deepEqual(sesionesAgendables({ ...e, ahora: new Date("2026-10-12T20:00:00Z") }).map(iso)[0], "2026-10-12T22:00:00.000Z", "con 120 min exactos sí");
});

test("D1: describirSesion usa la hora de pared de la sucursal y los nombres en español", () => {
  assert.deepEqual(describirSesion(new Date("2026-10-12T22:00:00Z"), MX), { fecha: "lunes 12 de octubre", hora: "16:00", completa: "lunes 12 de octubre a las 16:00" });
  assert.equal(describirSesion(new Date("2026-03-08T14:00:00Z"), NY).completa, "domingo 8 de marzo a las 10:00");
  assert.equal(describirSesion(new Date("2026-10-12T22:00:00Z"), TOKIO).completa, "martes 13 de octubre a las 07:00");
});
