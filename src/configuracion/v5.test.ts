// V5: lo que pasó de constante del código a ajuste de la escuela conserva su valor de siempre (puro, sin base). Los valores por omisión son los de las constantes que reemplazan; el rango de cada
// ajuste contiene su valor por omisión; y el horario de envío de la escuela solo puede estrechar 09:00–20:00 (invariante 14).

import { test } from "node:test";
import assert from "node:assert/strict";
import { AJUSTES } from "../api/rutas/configuracion.ts";
import { MAX_INTENTOS } from "../captacion/maquina.ts";
import { TIEMPO_ESPERA_MS } from "../captacion/espera.ts";
import { acotado, estrechar, ventanaDeLaOrganizacion } from "../mensajeria/horario-envio.ts";
import { HORARIO_DE_ENVIO, dentroDeHorario, recorrerODescartar, siguienteHorarioValido } from "../mensajeria/reglas.ts";
import { INICIO_DE_ENVIO_MIN, FIN_DE_ENVIO_MIN } from "../automatizaciones/ajustes.ts";
import { UMBRAL_A_REVENTAR, UMBRAL_VACIO, estadoDeOcupacion } from "../reportes/ejecutivo.ts";
import { CONFIGURACION_POR_DEFECTO } from "./index.ts";

test("V5: cada ajuste nuevo nace con el valor de la constante que reemplaza (nada cambia mientras nadie lo toque)", () => {
  const c = CONFIGURACION_POR_DEFECTO;
  assert.equal(c.horarioEnvioInicioMin, HORARIO_DE_ENVIO.inicioMin);
  assert.equal(c.horarioEnvioFinMin, HORARIO_DE_ENVIO.finMin);
  assert.equal(c.horarioEnvioInicioMin, INICIO_DE_ENVIO_MIN);
  assert.equal(c.horarioEnvioFinMin, FIN_DE_ENVIO_MIN);
  assert.equal(c.leadAMediasMinutos * 60_000, TIEMPO_ESPERA_MS);
  assert.equal(c.botMaxIntentos, MAX_INTENTOS);
  assert.equal(c.ocupacionAReventarPct, UMBRAL_A_REVENTAR);
  assert.equal(c.ocupacionVacioPct, UMBRAL_VACIO);
  assert.deepEqual([c.horarioEnvioInicioMin, c.horarioEnvioFinMin, c.leadAMediasMinutos, c.botMaxIntentos, c.ocupacionAReventarPct, c.ocupacionVacioPct], [540, 1200, 30, 3, 90, 25]);
});

test("cada ajuste de la pantalla tiene su valor por omisión dentro de su rango, su explicación y un campo que existe", () => {
  for (const [clave, a] of Object.entries(AJUSTES)) {
    const valor = CONFIGURACION_POR_DEFECTO[a.campo];
    assert.equal(typeof valor, "number", clave);
    assert.ok((valor as number) >= a.min && (valor as number) <= a.max, `${clave}: ${String(valor)} fuera de ${a.min}–${a.max}`);
    assert.ok(a.etiqueta.length > 5 && a.ayuda.length > 10 && a.efecto.length > 10 && a.grupo.length > 3, clave);
    assert.doesNotMatch(`${a.etiqueta} ${a.ayuda} ${a.efecto}`, /_|SQL|JSON|API|endpoint/, `${clave}: sin términos técnicos`);
  }
  // El horario de envío nunca se ofrece fuera de 09:00–20:00 (la base lo repite con un CHECK).
  assert.deepEqual([AJUSTES.horario_envio_inicio_min.min, AJUSTES.horario_envio_fin_min.max], [540, 1200]);
  assert.ok(AJUSTES.horario_envio_inicio_min.max < AJUSTES.horario_envio_fin_min.max);
});

test("el horario de la escuela solo puede estrechar 09:00–20:00: lo que se salga vuelve al horario de siempre", () => {
  assert.deepEqual(acotado({ inicioMin: 600, finMin: 1080 }), { inicioMin: 600, finMin: 1080 });
  assert.deepEqual(acotado({ inicioMin: 480, finMin: 1200 }), { inicioMin: 540, finMin: 1200 }, "no abre antes de las 09:00");
  assert.deepEqual(acotado({ inicioMin: 540, finMin: 1320 }), { inicioMin: 540, finMin: 1200 }, "no cierra después de las 20:00");
  assert.deepEqual(acotado({ inicioMin: 1100, finMin: 700 }), { inicioMin: 540, finMin: 1200 }, "al revés: el de siempre");
  const v = ventanaDeLaOrganizacion({ inicioMin: 600, finMin: 1080 });
  assert.deepEqual([v.inicioMin, v.finMin, v.dias.length], [600, 1080, 7]);
});

test("la ventana de una automatización se recorta al horario de la escuela; si no se tocan, manda el de la escuela", () => {
  const auto = { hora_inicio_min: 540, hora_fin_min: 1200 };
  assert.deepEqual(estrechar(auto, { inicioMin: 600, finMin: 1080 }), { hora_inicio_min: 600, hora_fin_min: 1080 });
  assert.deepEqual(estrechar({ hora_inicio_min: 660, hora_fin_min: 900 }, { inicioMin: 600, finMin: 1080 }), { hora_inicio_min: 660, hora_fin_min: 900 }, "la propia más estrecha se conserva");
  assert.deepEqual(estrechar({ hora_inicio_min: 540, hora_fin_min: 600 }, { inicioMin: 720, finMin: 1080 }), { hora_inicio_min: 720, hora_fin_min: 1080 }, "sin traslape: el de la escuela");
});

test("con el horario de la escuela, lo de las 09:30 espera a las 10:00 y lo de las 18:30 al día siguiente (hora de Ciudad de México)", () => {
  const zona = "America/Mexico_City";
  const escuela = ventanaDeLaOrganizacion({ inicioMin: 600, finMin: 1080 });
  const a0930 = new Date("2026-10-08T15:30:00Z");
  const a1030 = new Date("2026-10-08T16:30:00Z");
  const a1830 = new Date("2026-10-09T00:30:00Z");
  assert.equal(dentroDeHorario(a0930, zona), true, "con el horario de siempre sale");
  assert.equal(dentroDeHorario(a0930, zona, escuela), false);
  assert.equal(dentroDeHorario(a1030, zona, escuela), true);
  assert.equal(dentroDeHorario(a1830, zona, escuela), false);
  assert.equal(siguienteHorarioValido(a0930, zona, escuela).toISOString(), "2026-10-08T16:00:00.000Z");
  assert.equal(siguienteHorarioValido(a1830, zona, escuela).toISOString(), "2026-10-09T16:00:00.000Z");
  // Si recorrerlo llega al evento o después, se descarta (invariante 14).
  assert.equal(recorrerODescartar(a0930, zona, new Date("2026-10-08T16:00:00Z"), escuela, true), null);
  assert.ok(recorrerODescartar(a0930, zona, new Date("2026-10-08T17:00:00Z"), escuela, true));
});

test("los umbrales de ocupación del tablero son los de la escuela y por omisión los de siempre", () => {
  assert.equal(estadoDeOcupacion(9, 10), "a_reventar");
  assert.equal(estadoDeOcupacion(2, 8), "vacio");
  assert.equal(estadoDeOcupacion(8, 10), "normal");
  const exigente = { aReventarPct: 70, vacioPct: 40 };
  assert.equal(estadoDeOcupacion(8, 10, exigente), "a_reventar");
  assert.equal(estadoDeOcupacion(4, 10, exigente), "vacio");
  assert.equal(estadoDeOcupacion(5, 10, exigente), "normal");
});
