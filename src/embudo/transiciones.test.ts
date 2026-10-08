// D7: las reglas puras de cambio de etapa, el tiempo en cada etapa y el lead estancado.

import { test } from "node:test";
import assert from "node:assert/strict";
import { diasSinMovimiento, estaEstancado, evaluarTransicion, tiempoPorEtapa, tramosEnEtapa, type EntradaDeTransicion, type EtapaParaTransicion } from "./transiciones.ts";

const e = (id: string, orden: number, o: { ganado?: boolean; perdido?: boolean } = {}): EtapaParaTransicion => ({ id, orden, esGanado: o.ganado ?? false, esPerdido: o.perdido ?? false });
const NUEVO = e("nuevo", 1);
const CONTACTADO = e("contactado", 2);
const NEGOCIACION = e("negociacion", 5);
const INSCRITO = e("inscrito", 6, { ganado: true });
const PERDIDO = e("perdido", 7, { perdido: true });
const base = { esAdministrador: false, conMotivoDePerdida: false, conNota: false };
const ev = (desde: EtapaParaTransicion, hacia: EtapaParaTransicion, resto: Partial<EntradaDeTransicion> = {}) => evaluarTransicion({ desde, hacia, ...base, ...resto });

test("avance, retroceso y lateral entre etapas activas", () => {
  assert.deepEqual(ev(NUEVO, NEGOCIACION), { ok: true, tipo: "avance" }, "saltar etapas hacia adelante es válido");
  assert.deepEqual(ev(NEGOCIACION, CONTACTADO), { ok: true, tipo: "retroceso" });
  assert.deepEqual(ev(e("a", 3), e("b", 3)), { ok: true, tipo: "lateral" });
});

test("pasar a perdido EXIGE el motivo; el motivo sin perder es un error", () => {
  assert.deepEqual(ev(CONTACTADO, PERDIDO), { ok: false, motivo: "falta_motivo_perdida" });
  assert.deepEqual(ev(CONTACTADO, PERDIDO, { conMotivoDePerdida: true }), { ok: true, tipo: "perdida" });
  assert.deepEqual(ev(CONTACTADO, NEGOCIACION, { conMotivoDePerdida: true }), { ok: false, motivo: "motivo_sin_perdida" });
  assert.deepEqual(ev(PERDIDO, CONTACTADO, { conMotivoDePerdida: true, conNota: true }), { ok: false, motivo: "motivo_sin_perdida" });
});

test("recuperar (de perdido a una etapa activa) exige la nota; perdido a perdido, no", () => {
  assert.deepEqual(ev(PERDIDO, CONTACTADO), { ok: false, motivo: "falta_nota_recuperacion" });
  assert.deepEqual(ev(PERDIDO, CONTACTADO, { conNota: true }), { ok: true, tipo: "recuperacion" });
  assert.deepEqual(ev(PERDIDO, NUEVO, { conNota: true }), { ok: true, tipo: "recuperacion" }, "aunque la etapa sea de menor orden");
  assert.deepEqual(ev(PERDIDO, e("otra-perdida", 8, { perdido: true }), { conMotivoDePerdida: true }), { ok: false, motivo: "perdido_a_perdido" });
});

test("a una etapa ganada no se llega moviendo etapas (ni el administrador); de una ganada solo el administrador, y nunca a perdido", () => {
  assert.deepEqual(ev(NEGOCIACION, INSCRITO), { ok: false, motivo: "destino_ganado" });
  assert.deepEqual(ev(NEGOCIACION, INSCRITO, { esAdministrador: true }), { ok: false, motivo: "destino_ganado" });
  assert.deepEqual(ev(INSCRITO, CONTACTADO), { ok: false, motivo: "ganado_inmutable" });
  assert.deepEqual(ev(INSCRITO, CONTACTADO, { esAdministrador: true }), { ok: true, tipo: "retroceso" });
  assert.deepEqual(ev(INSCRITO, PERDIDO, { esAdministrador: true, conMotivoDePerdida: true }), { ok: false, motivo: "ganado_a_perdido" });
  assert.deepEqual(ev(INSCRITO, PERDIDO, { conMotivoDePerdida: true }), { ok: false, motivo: "ganado_a_perdido" });
});

test("la matriz configurable: prohibida y solo administrador; permitida no levanta las reglas fijas", () => {
  assert.deepEqual(ev(NUEVO, NEGOCIACION, { regla: "prohibida" }), { ok: false, motivo: "prohibida" });
  assert.deepEqual(ev(NUEVO, NEGOCIACION, { regla: "prohibida", esAdministrador: true }), { ok: false, motivo: "prohibida" }, "ni el administrador");
  assert.deepEqual(ev(NUEVO, NEGOCIACION, { regla: "solo_administrador" }), { ok: false, motivo: "solo_administrador" });
  assert.deepEqual(ev(NUEVO, NEGOCIACION, { regla: "solo_administrador", esAdministrador: true }), { ok: true, tipo: "avance" });
  assert.deepEqual(ev(NUEVO, NEGOCIACION, { regla: "permitida" }), { ok: true, tipo: "avance" });
  assert.deepEqual(ev(NEGOCIACION, INSCRITO, { regla: "permitida", esAdministrador: true }), { ok: false, motivo: "destino_ganado" });
  assert.deepEqual(ev(INSCRITO, CONTACTADO, { regla: "permitida" }), { ok: false, motivo: "ganado_inmutable" });
});

const T0 = new Date("2026-10-01T10:00:00Z");
const en = (horas: number): Date => new Date(T0.getTime() + horas * 3_600_000);

test("tramos: con el alta en el historial, cada cambio cierra un tramo y el último corre hasta ahora", () => {
  const filas = [
    { etapaAnteriorId: null, etapaNuevaId: "nuevo", creadoEn: T0 },
    { etapaAnteriorId: "nuevo", etapaNuevaId: "contactado", creadoEn: en(2) },
    { etapaAnteriorId: "contactado", etapaNuevaId: "perdido", creadoEn: en(5) },
    { etapaAnteriorId: "perdido", etapaNuevaId: "contactado", creadoEn: en(10) },
  ];
  const tramos = tramosEnEtapa(T0, "contactado", filas, en(12));
  assert.deepEqual(tramos.map((t) => [t.etapaId, t.segundos, t.hasta === null]), [["nuevo", 7200, false], ["contactado", 10800, false], ["perdido", 18000, false], ["contactado", 7200, true]]);
  assert.deepEqual(tiempoPorEtapa(tramos), [{ etapaId: "nuevo", segundos: 7200, veces: 1 }, { etapaId: "contactado", segundos: 18000, veces: 2 }, { etapaId: "perdido", segundos: 18000, veces: 1 }]);
});

test("tramos: un lead anterior al historial nace en la etapa de la que sale su primer movimiento; sin historial, todo el tiempo en la etapa actual; el reloj que retrocede no da negativos", () => {
  const sinAlta = tramosEnEtapa(T0, "contactado", [{ etapaAnteriorId: "nuevo", etapaNuevaId: "contactado", creadoEn: en(3) }], en(4));
  assert.deepEqual(sinAlta.map((t) => [t.etapaId, t.segundos]), [["nuevo", 10800], ["contactado", 3600]]);
  assert.deepEqual(tramosEnEtapa(T0, "nuevo", [], en(1)).map((t) => [t.etapaId, t.segundos]), [["nuevo", 3600]]);
  assert.equal(tramosEnEtapa(T0, "nuevo", [], en(-5))[0]!.segundos, 0);
  // Dos cambios con la MISMA fecha: se respeta el orden en que llegan (el de registro) y el primero dura cero segundos.
  const empate = tramosEnEtapa(T0, "c", [{ etapaAnteriorId: null, etapaNuevaId: "a", creadoEn: T0 }, { etapaAnteriorId: "a", etapaNuevaId: "b", creadoEn: en(1) }, { etapaAnteriorId: "b", etapaNuevaId: "c", creadoEn: en(1) }], en(2));
  assert.deepEqual(empate.map((t) => [t.etapaId, t.segundos]), [["a", 3600], ["b", 0], ["c", 3600]]);
});

test("estancado: el umbral de la etapa, días completos, nunca en etapas de cierre ni sin umbral", () => {
  const DIA = 24 * 3_600_000;
  const ahora = new Date("2026-10-20T12:00:00Z");
  const lead = (diasAtras: number, horas = 0) => ({ ultimaInteraccionEn: new Date(ahora.getTime() - diasAtras * DIA - horas * 3_600_000), creadoEn: new Date("2026-01-01T00:00:00Z") });
  const etapa = { diasAlerta: 3, esGanado: false, esPerdido: false };
  assert.equal(diasSinMovimiento(lead(3), ahora), 3);
  assert.equal(diasSinMovimiento(lead(2, 23), ahora), 2);
  assert.equal(estaEstancado(lead(3), etapa, ahora), true, "cumplir el umbral ya cuenta");
  assert.equal(estaEstancado(lead(2, 23), etapa, ahora), false);
  assert.equal(estaEstancado(lead(30), { ...etapa, diasAlerta: null }, ahora), false, "sin umbral no se alerta");
  assert.equal(estaEstancado(lead(30), { ...etapa, esGanado: true }, ahora), false);
  assert.equal(estaEstancado(lead(30), { ...etapa, esPerdido: true }, ahora), false);
  // Sin ninguna interacción cuenta desde que se creó.
  assert.equal(estaEstancado({ ultimaInteraccionEn: null, creadoEn: new Date(ahora.getTime() - 4 * DIA) }, etapa, ahora), true);
  assert.equal(estaEstancado({ ultimaInteraccionEn: null, creadoEn: new Date(ahora.getTime() - 1 * DIA) }, etapa, ahora), false);
});
