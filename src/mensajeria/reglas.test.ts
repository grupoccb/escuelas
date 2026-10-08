import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoBloqueo, ventanaServicioDesde } from "./reglas.ts";

const AHORA = new Date("2026-10-07T18:00:00Z");
const ABIERTA = new Date("2026-10-07T20:00:00Z");
const VENCIDA = new Date("2026-10-07T17:59:59Z");

test("en_atencion_humana bloquea mensajes y notas, aun con ventana abierta (invariante 6)", () => {
  const conv = { estado: "en_atencion_humana" as const, ventana_servicio_hasta: ABIERTA };
  assert.equal(motivoBloqueo(conv, "mensaje", AHORA), "atencion_humana");
  assert.equal(motivoBloqueo(conv, "nota_interna", AHORA), "atencion_humana");
});

test("bot con ventana de servicio abierta: se puede mandar", () => {
  assert.equal(motivoBloqueo({ estado: "bot", ventana_servicio_hasta: ABIERTA }, "mensaje", AHORA), null);
});

test("fuera de la ventana de servicio no se manda mensaje libre (invariante 5)", () => {
  assert.equal(motivoBloqueo({ estado: "bot", ventana_servicio_hasta: VENCIDA }, "mensaje", AHORA), "fuera_de_ventana");
  assert.equal(motivoBloqueo({ estado: "bot", ventana_servicio_hasta: null }, "mensaje", AHORA), "fuera_de_ventana");
  assert.equal(motivoBloqueo({ estado: "bot", ventana_servicio_hasta: AHORA }, "mensaje", AHORA), "fuera_de_ventana");
});

test("la ventana no aplica a notas internas: no llegan al contacto", () => {
  assert.equal(motivoBloqueo({ estado: "bot", ventana_servicio_hasta: VENCIDA }, "nota_interna", AHORA), null);
});

test("opt_out y cerrada bloquean mensajes al contacto", () => {
  assert.equal(motivoBloqueo({ estado: "opt_out", ventana_servicio_hasta: ABIERTA }, "mensaje", AHORA), "opt_out");
  assert.equal(motivoBloqueo({ estado: "cerrada", ventana_servicio_hasta: ABIERTA }, "mensaje", AHORA), "conversacion_cerrada");
});

test("la ventana de servicio dura 24 h desde el entrante", () => {
  assert.equal(ventanaServicioDesde(AHORA).toISOString(), "2026-10-08T18:00:00.000Z");
});
