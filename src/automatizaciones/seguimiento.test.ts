// D8: las reglas puras del lead frío y de la promoción por vencer (sin base ni reloj real).

import { test } from "node:test";
import assert from "node:assert/strict";
import { ATRASO_MAXIMO_POR_OMISION_DIAS, atrasoMaximoDias, esFrioReciente, fechaLarga, finDePromocion, momentoDeFrio, planearAvisoDePromocion, promocionesDeSnapshot, siguienteOcurrenciaDeFrio } from "./seguimiento.ts";
import type { VentanaHoraria } from "../mensajeria/reglas.ts";

const DIA = 24 * 3_600_000;
const HORA = 3_600_000;
const T = new Date("2026-11-01T12:00:00Z");
const despues = (ms: number): Date => new Date(T.getTime() + ms);

test("atrasoMaximoDias: condiciones.max_atraso_dias entre 1 y 90, o 14", () => {
  assert.equal(atrasoMaximoDias({}), ATRASO_MAXIMO_POR_OMISION_DIAS);
  assert.equal(atrasoMaximoDias(null), 14);
  assert.equal(atrasoMaximoDias([]), 14);
  assert.equal(atrasoMaximoDias({ max_atraso_dias: 30 }), 30);
  for (const mal of [0, 91, 2.5, "7", null]) assert.equal(atrasoMaximoDias({ max_atraso_dias: mal }), 14, String(mal));
});

test("momentoDeFrio y esFrioReciente: los días de la etapa + el offset; ni antes de tiempo ni de hace mucho", () => {
  const lead = { ultimaInteraccionEn: T, creadoEn: new Date("2026-01-01T00:00:00Z") };
  assert.equal(momentoDeFrio(lead, 3, 0).toISOString(), despues(3 * DIA).toISOString());
  assert.equal(momentoDeFrio(lead, 3, 120).toISOString(), despues(3 * DIA + 2 * HORA).toISOString(), "el offset suma minutos");
  assert.equal(momentoDeFrio({ ultimaInteraccionEn: null, creadoEn: T }, 2, 0).toISOString(), despues(2 * DIA).toISOString(), "sin interacción, desde que se creó");
  assert.equal(esFrioReciente(lead, 3, 0, 14, despues(3 * DIA - 1)), false, "un instante antes de cumplir los días");
  assert.equal(esFrioReciente(lead, 3, 0, 14, despues(3 * DIA)), true, "cumplirlos ya cuenta");
  assert.equal(esFrioReciente(lead, 3, 0, 14, despues(17 * DIA)), true, "a los 14 días de enfriarse todavía");
  assert.equal(esFrioReciente(lead, 3, 0, 14, despues(17 * DIA + 1)), false, "más viejo no se persigue");
  assert.equal(esFrioReciente(lead, 3, 120, 14, despues(3 * DIA + HORA)), false, "con offset todavía no");
});

test("siguienteOcurrenciaDeFrio: la primera siempre; la siguiente solo con movimiento después de detectado el episodio anterior y hasta max_intentos", () => {
  const detectado = despues(5 * DIA);
  assert.equal(siguienteOcurrenciaDeFrio(null, T, 3), 1);
  assert.equal(siguienteOcurrenciaDeFrio(null, T, 0), null);
  assert.equal(siguienteOcurrenciaDeFrio({ ocurrencia: 1, detectadoEn: detectado }, T, 3), null, "el mismo frío: sin movimiento desde entonces");
  assert.equal(siguienteOcurrenciaDeFrio({ ocurrencia: 1, detectadoEn: detectado }, detectado, 3), null, "el movimiento justo en ese instante no cuenta como posterior");
  assert.equal(siguienteOcurrenciaDeFrio({ ocurrencia: 1, detectadoEn: detectado }, null, 3), null);
  assert.equal(siguienteOcurrenciaDeFrio({ ocurrencia: 1, detectadoEn: detectado }, despues(5 * DIA + 1), 3), 2);
  assert.equal(siguienteOcurrenciaDeFrio({ ocurrencia: 2, detectadoEn: detectado }, despues(6 * DIA), 3), 3);
  assert.equal(siguienteOcurrenciaDeFrio({ ocurrencia: 3, detectadoEn: detectado }, despues(6 * DIA), 3), null, "tope de intentos");
  assert.equal(siguienteOcurrenciaDeFrio({ ocurrencia: 1, detectadoEn: detectado }, despues(6 * DIA), 1), null);
});

test("promocionesDeSnapshot: los ids que aplicó la cotización, sin repetir; JSON raro = ninguno", () => {
  const snap = { version: 1, programa: { promociones: { aplicadas: [{ promocion_id: "a", nombre: "A" }, { promocion_id: "b" }, { promocion_id: "a" }, { nombre: "sin id" }, 5], lineas: [{ promocion_id: "z" }] } } };
  assert.deepEqual(promocionesDeSnapshot(snap), ["a", "b"]);
  for (const raro of [null, undefined, 3, "x", [], {}, { programa: null }, { programa: { promociones: null } }, { programa: { promociones: { aplicadas: "no" } } }]) assert.deepEqual(promocionesDeSnapshot(raro), []);
});

test("finDePromocion: las 00:00 del día siguiente al último día, en la zona de la sucursal (también con cambio de horario)", () => {
  assert.equal(finDePromocion("2026-11-13", "America/Mexico_City").toISOString(), "2026-11-14T06:00:00.000Z");
  assert.equal(finDePromocion("2026-12-31", "America/Mexico_City").toISOString(), "2027-01-01T06:00:00.000Z", "fin de año");
  assert.equal(finDePromocion("2026-03-07", "America/New_York").toISOString(), "2026-03-08T05:00:00.000Z", "víspera del salto de primavera: UTC-5");
  assert.equal(finDePromocion("2026-03-08", "America/New_York").toISOString(), "2026-03-09T04:00:00.000Z", "el día del salto termina en UTC-4");
  assert.equal(finDePromocion("2026-11-01", "America/New_York").toISOString(), "2026-11-02T05:00:00.000Z", "retroceso de otoño");
  assert.equal(finDePromocion("2028-02-29", "Asia/Tokyo").toISOString(), "2028-02-29T15:00:00.000Z");
});

const MX = "America/Mexico_City";
const TODO: VentanaHoraria = { inicioMin: 540, finMin: 1200, dias: [0, 1, 2, 3, 4, 5, 6] };
const plan = (venceEl: string, ahora: string, o: { offset?: number; ventana?: VentanaHoraria } = {}) => planearAvisoDePromocion({ venceEl, zona: MX, offsetMinutos: o.offset ?? -4320, ventana: o.ventana ?? TODO, ahora: new Date(ahora) });

test("planearAvisoDePromocion: aún no, vencida, dentro de la ventana (siguiente horario válido) o descartado si llegaría cuando ya venció", () => {
  // La promo vale hasta el viernes 13; vence a las 00:00 del sábado 14 (06:00Z). Con -3 días el momento es el miércoles 11 a las 00:00 (06:00Z).
  assert.deepEqual(plan("2026-11-13", "2026-11-11T05:59:59Z"), { estado: "aun_no", abreEn: new Date("2026-11-11T06:00:00Z") });
  assert.equal(plan("2026-11-13", "2026-11-14T06:00:00Z").estado, "vencida", "el instante en que vence ya no sirve");
  assert.equal(plan("2026-11-13", "2026-11-14T06:00:01Z").estado, "vencida");
  // Abre a las 00:00: sale a las 09:00 locales (15:00Z), dentro del horario de envío.
  const abre = plan("2026-11-13", "2026-11-11T06:00:00Z");
  assert.deepEqual(abre.estado === "programar" && abre.programadoPara.toISOString(), "2026-11-11T15:00:00.000Z");
  // Ya en horario: se programa para el momento nominal recorrido… a un instante ya pasado (sale en cuanto corre el motor).
  const yaEnHorario = plan("2026-11-13", "2026-11-12T18:00:00Z");
  assert.equal(yaEnHorario.estado, "programar");
  // Un offset corto que cae de noche y llegaría después del vencimiento: -60 min = 23:00 del viernes; el siguiente horario válido es el sábado 09:00, ya vencida.
  const noche = plan("2026-11-13", "2026-11-14T05:30:00Z", { offset: -60 });
  assert.equal(noche.estado, "descartar", JSON.stringify(noche));
  // Con ventana más estrecha (10:00–12:00) el aviso se recorre dentro de ella.
  const estrecha = plan("2026-11-13", "2026-11-11T06:00:00Z", { ventana: { inicioMin: 600, finMin: 720, dias: [0, 1, 2, 3, 4, 5, 6] } });
  assert.deepEqual(estrecha.estado === "programar" && estrecha.programadoPara.toISOString(), "2026-11-11T16:00:00.000Z");
  // Día no permitido: sin miércoles, se recorre al jueves 09:00.
  const sinMiercoles = plan("2026-11-13", "2026-11-11T06:00:00Z", { ventana: { ...TODO, dias: [0, 1, 2, 4, 5, 6] } });
  assert.deepEqual(sinMiercoles.estado === "programar" && sinMiercoles.programadoPara.toISOString(), "2026-11-12T15:00:00.000Z");
  // Sin ningún horario antes del vencimiento (solo sábados y la promo acaba el viernes): se descarta y queda registrado.
  assert.equal(plan("2026-11-13", "2026-11-11T06:00:00Z", { ventana: { ...TODO, dias: [6] } }).estado, "descartar");
});

test("ED-05: el borde de la promoción por vencer es EXCLUSIVO: si el siguiente horario válido cae justo cuando vence, se descarta", () => {
  // La promo vale hasta el sábado 7 (vence a las 00:00 del domingo 8, 06:00Z). La ventana solo permite los domingos desde las 00:00: el aviso de las 20:00
  // del sábado se recorre exactamente a las 00:00 del domingo = el instante en que vence → ya no sirve (con un límite inclusivo saldría tarde).
  const soloDomingo: VentanaHoraria = { inicioMin: 0, finMin: 1200, dias: [0] };
  const justo = plan("2026-11-07", "2026-11-08T02:00:00Z", { offset: -240, ventana: soloDomingo });
  assert.equal(justo.estado, "descartar", JSON.stringify(justo));
});

test("fechaLarga: la fecha en español de México", () => {
  assert.equal(fechaLarga("2026-11-13"), "viernes 13 de noviembre");
  assert.equal(fechaLarga("2027-01-01"), "viernes 1 de enero");
});
