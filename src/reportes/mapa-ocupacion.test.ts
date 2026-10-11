// Mapa de calor de la ocupación (tablero): celdas por día de la semana y hora de inicio, con la ocupación sumada (no promediada).

import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoDeOcupacion } from "./ejecutivo.ts";
import { mapaDeOcupacion } from "./mapa-ocupacion.ts";

const estado = (o: number, c: number) => estadoDeOcupacion(o, c, { aReventarPct: 90, vacioPct: 25 });

test("la hora es la de INICIO truncada; dos grupos en la misma celda suman ocupados y cupo (no se promedian porcentajes)", () => {
  const celdas = mapaDeOcupacion(
    [
      { ocupados: 10, cupo_maximo: 10, horarios: [{ dia_semana: 1, hora_inicio_min: 16 * 60 }, { dia_semana: 3, hora_inicio_min: 16 * 60 }] },
      { ocupados: 1, cupo_maximo: 10, horarios: [{ dia_semana: 1, hora_inicio_min: 16 * 60 + 30 }] },
    ],
    estado,
  );
  assert.deepEqual(celdas.map((c) => [c.dia_semana, c.hora, c.grupos, c.ocupados, c.cupo_maximo, c.ocupacion, c.estado]), [
    [1, 16, 2, 11, 20, "55.0", "normal"],
    [3, 16, 1, 10, 10, "100.0", "a_reventar"],
  ]);
});

test("un grupo con dos franjas que empiezan en la misma hora del mismo día cuenta una sola vez; solo salen las celdas con clases", () => {
  const celdas = mapaDeOcupacion([{ ocupados: 2, cupo_maximo: 8, horarios: [{ dia_semana: 5, hora_inicio_min: 19 * 60 }, { dia_semana: 5, hora_inicio_min: 19 * 60 + 45 }] }], estado);
  assert.deepEqual(celdas, [{ dia_semana: 5, hora: 19, grupos: 1, ocupados: 2, cupo_maximo: 8, ocupacion: "25.0", estado: "vacio" }]);
  assert.deepEqual(mapaDeOcupacion([], estado), []);
  assert.deepEqual(mapaDeOcupacion([{ ocupados: 0, cupo_maximo: 5, horarios: [] }], estado), [], "un grupo sin horario no aparece en el mapa");
});

test("orden: por hora y, dentro de ella, lunes a sábado y domingo al final", () => {
  const g = (dia: number, hora: number) => ({ ocupados: 1, cupo_maximo: 2, horarios: [{ dia_semana: dia, hora_inicio_min: hora * 60 }] });
  const celdas = mapaDeOcupacion([g(0, 9), g(6, 9), g(1, 9), g(2, 8)], estado);
  assert.deepEqual(celdas.map((c) => [c.hora, c.dia_semana]), [[8, 2], [9, 1], [9, 6], [9, 0]]);
});

test("el estado usa la regla que se le pasa: cambiar los umbrales cambia el estado sin tocar el mapa", () => {
  const grupos = [{ ocupados: 6, cupo_maximo: 10, horarios: [{ dia_semana: 2, hora_inicio_min: 600 }] }];
  assert.equal(mapaDeOcupacion(grupos, estado)[0]!.estado, "normal");
  assert.equal(mapaDeOcupacion(grupos, (o, c) => estadoDeOcupacion(o, c, { aReventarPct: 60, vacioPct: 25 }))[0]!.estado, "a_reventar");
});
