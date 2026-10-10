import { test } from "node:test";
import assert from "node:assert/strict";
import { fechaEnPalabras, fechaLocal, formatearHorarios, horaDeMinutos, nombreDeDia } from "./horario.ts";

test("nombres de los días en español de México", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6].map(nombreDeDia), ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]);
  assert.throws(() => nombreDeDia(7), RangeError);
});

test("horaDeMinutos", () => {
  assert.equal(horaDeMinutos(0), "00:00");
  assert.equal(horaDeMinutos(965), "16:05");
  assert.equal(horaDeMinutos(1020), "17:00");
  assert.equal(horaDeMinutos(1440), "24:00");
  assert.throws(() => horaDeMinutos(-1), RangeError);
  assert.throws(() => horaDeMinutos(1441), RangeError);
  assert.throws(() => horaDeMinutos(1.5), RangeError);
});

test("formatearHorarios junta los días con la misma hora y ordena lunes a domingo", () => {
  assert.equal(formatearHorarios([{ dia: 1, inicioMin: 960, finMin: 1020 }]), "lunes de 16:00 a 17:00");
  assert.equal(
    formatearHorarios([
      { dia: 3, inicioMin: 960, finMin: 1020 },
      { dia: 1, inicioMin: 960, finMin: 1020 },
    ]),
    "lunes y miércoles de 16:00 a 17:00",
  );
  assert.equal(
    formatearHorarios([
      { dia: 1, inicioMin: 960, finMin: 1020 },
      { dia: 3, inicioMin: 960, finMin: 1020 },
      { dia: 5, inicioMin: 960, finMin: 1020 },
    ]),
    "lunes, miércoles y viernes de 16:00 a 17:00",
  );
  assert.equal(
    formatearHorarios([
      { dia: 0, inicioMin: 600, finMin: 660 },
      { dia: 2, inicioMin: 1080, finMin: 1140 },
      { dia: 4, inicioMin: 1080, finMin: 1140 },
    ]),
    "martes y jueves de 18:00 a 19:00; domingo de 10:00 a 11:00",
    "el domingo va al final de la semana",
  );
  assert.equal(formatearHorarios([]), "");
});

test("formatearHorarios es determinista sin importar el orden de entrada", () => {
  const f = [
    { dia: 6, inicioMin: 600, finMin: 660 },
    { dia: 2, inicioMin: 960, finMin: 1020 },
    { dia: 4, inicioMin: 960, finMin: 1020 },
    { dia: 2, inicioMin: 960, finMin: 1020 },
  ];
  const esperado = formatearHorarios(f);
  assert.equal(esperado, "martes y jueves de 16:00 a 17:00; sábado de 10:00 a 11:00");
  assert.equal(formatearHorarios([...f].reverse()), esperado);
});

test("fechaLocal usa el reloj de la zona, no el de UTC", () => {
  const instante = new Date("2026-10-09T03:30:00Z"); // 21:30 del 8 de octubre en Ciudad de México
  assert.equal(fechaLocal(instante, "America/Mexico_City"), "2026-10-08");
  assert.equal(fechaLocal(instante, "UTC"), "2026-10-09");
  assert.equal(fechaLocal(instante, "Asia/Tokyo"), "2026-10-09");
});

test("V10: fechaEnPalabras es el día de calendario de la zona de la escuela, en español, no el día UTC", () => {
  // 9 de octubre, 21:30 en la Ciudad de México = 10 de octubre, 03:30 UTC.
  const instante = new Date("2026-10-10T03:30:00Z");
  assert.equal(fechaEnPalabras(instante, "America/Mexico_City"), "9 de octubre de 2026");
  assert.equal(fechaEnPalabras(instante, "UTC"), "10 de octubre de 2026");
  assert.equal(fechaEnPalabras(instante, "Asia/Tokyo"), "10 de octubre de 2026");
  assert.equal(fechaEnPalabras(new Date("2026-01-01T05:59:00Z"), "America/Mexico_City"), "31 de diciembre de 2025", "cruza el año");
  assert.equal(fechaEnPalabras(new Date("2026-03-05T18:00:00Z"), "America/Mexico_City"), "5 de marzo de 2026");
});
