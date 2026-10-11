import { test } from "node:test";
import assert from "node:assert/strict";
import { duracionCorta, esDelDia, hora12, horaDelInstante, horarioDeGrupo, marcaDeAhora, minutosDelDia, texto12 } from "./linea-de-tiempo.ts";

const ZONA = "America/Mexico_City";
// 2026-10-12 a las 16:20 en la Ciudad de México (UTC−6 sin horario de verano en octubre de 2026) = 22:20 UTC.
const AHORA = Date.UTC(2026, 9, 12, 22, 20, 40);
const clase = (id: string, hhmm: string, dia = 12) => ({ id, zona_horaria: ZONA, fecha_hora: new Date(Date.UTC(2026, 9, dia, Number(hhmm.slice(0, 2)) + 6, Number(hhmm.slice(3)))).toISOString() });

test("hora12: de 24 h a 12 h con am y pm", () => {
  assert.deepEqual(hora12("16:00"), { hora: "4:00", ampm: "pm" });
  assert.deepEqual(hora12("09:30"), { hora: "9:30", ampm: "am" });
  assert.deepEqual(hora12("12:05"), { hora: "12:05", ampm: "pm" });
  assert.deepEqual(hora12("00:15"), { hora: "12:15", ampm: "am" });
  assert.equal(texto12("19:10"), "7:10 pm");
});

test("minutosDelDia y horaDelInstante leen la zona de la sucursal, no la del navegador", () => {
  assert.equal(minutosDelDia(AHORA, ZONA), 16 * 60 + 20);
  assert.equal(horaDelInstante(AHORA, ZONA), "4:20 pm");
  assert.equal(horaDelInstante(AHORA, "America/Tijuana"), "3:20 pm");
});

test("duracionCorta: minutos, horas y horas con minutos", () => {
  assert.equal(duracionCorta(40), "40 min");
  assert.equal(duracionCorta(60), "1 h");
  assert.equal(duracionCorta(80), "1 h 20 min");
  assert.equal(duracionCorta(120), "2 h");
});

test("marcaDeAhora: va antes de la próxima clase de hoy y cuenta desde el minuto del reloj", () => {
  const hoy = [clase("a", "16:00"), clase("b", "17:00"), clase("c", "18:30")];
  assert.deepEqual(marcaDeAhora(hoy, AHORA), { antesDeId: "b", texto: "Ahora 4:20 pm · siguiente en 40 min" });
  const antes = Date.UTC(2026, 9, 12, 21, 45, 0);
  assert.deepEqual(marcaDeAhora(hoy, antes), { antesDeId: "a", texto: "Ahora 3:45 pm · siguiente en 15 min" });
  const tarde = Date.UTC(2026, 9, 13, 1, 10, 0);
  assert.equal(marcaDeAhora(hoy, tarde), null, "sin una próxima clase hoy no hay marca");
  const lejos = Date.UTC(2026, 9, 12, 20, 0, 0);
  assert.equal(marcaDeAhora(hoy, lejos)?.texto, "Ahora 2:00 pm · siguiente en 2 h");
  assert.equal(marcaDeAhora([], AHORA), null);
});

test("esDelDia: el día de calendario en la zona de la sucursal", () => {
  const c = clase("a", "23:30");
  assert.equal(esDelDia(c, "2026-10-12"), true);
  assert.equal(esDelDia(c, "2026-10-13"), false);
});

test("horarioDeGrupo: juntos los días con la misma hora; sin horario, vacío", () => {
  assert.equal(horarioDeGrupo([{ dia_semana: 3, hora_inicio_min: 960 }, { dia_semana: 1, hora_inicio_min: 960 }]), "Lun y Mié 4:00 pm");
  assert.equal(horarioDeGrupo([{ dia_semana: 1, hora_inicio_min: 960 }, { dia_semana: 3, hora_inicio_min: 960 }, { dia_semana: 5, hora_inicio_min: 960 }]), "Lun, Mié y Vie 4:00 pm");
  assert.equal(horarioDeGrupo([{ dia_semana: 6, hora_inicio_min: 600 }, { dia_semana: 1, hora_inicio_min: 960 }]), "Sáb 10:00 am · Lun 4:00 pm");
  assert.equal(horarioDeGrupo([0, 1, 2, 3, 4, 5, 6].map((d) => ({ dia_semana: d, hora_inicio_min: 960 }))), "Todos los días 4:00 pm");
  assert.equal(horarioDeGrupo([]), "");
});
