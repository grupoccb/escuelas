// G4: la regla de elegibilidad es pura — clases mínimas del SIGUIENTE peldaño, sin inscripción vigente no hay nada, y en el último ya no hay a dónde subir.

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarElegibilidad } from "./elegibilidad.ts";
import type { NivelDeVertical } from "./progresion.ts";

const sig = (clasesMinimas: number): NivelDeVertical => ({ id: "n", nombre: "Siguiente", orden: 2, colorHex: null, horasMinimas: 0, clasesMinimas, requisitosTexto: null });

test("elegible justo al llegar a las clases mínimas del siguiente (el borde es inclusivo); una menos no", () => {
  assert.deepEqual(evaluarElegibilidad({ tieneInscripcionActiva: true, siguiente: sig(20), clasesCumplidas: 20 }), { elegible: true, motivo: null, clasesRequeridas: 20, faltan: 0 });
  assert.deepEqual(evaluarElegibilidad({ tieneInscripcionActiva: true, siguiente: sig(20), clasesCumplidas: 19 }), { elegible: false, motivo: "clases_insuficientes", clasesRequeridas: 20, faltan: 1 });
  assert.deepEqual(evaluarElegibilidad({ tieneInscripcionActiva: true, siguiente: sig(20), clasesCumplidas: 0 }), { elegible: false, motivo: "clases_insuficientes", clasesRequeridas: 20, faltan: 20 });
  assert.equal(evaluarElegibilidad({ tieneInscripcionActiva: true, siguiente: sig(20), clasesCumplidas: 500 }).elegible, true, "de más también");
});

test("un siguiente sin clases mínimas (el primer peldaño) lo puede presentar cualquiera con inscripción vigente", () => {
  assert.deepEqual(evaluarElegibilidad({ tieneInscripcionActiva: true, siguiente: sig(0), clasesCumplidas: 0 }), { elegible: true, motivo: null, clasesRequeridas: 0, faltan: 0 });
});

test("sin inscripción activa no es elegible (aunque cumpla las clases); sin siguiente peldaño tampoco; la inscripción manda sobre lo demás", () => {
  assert.equal(evaluarElegibilidad({ tieneInscripcionActiva: false, siguiente: sig(10), clasesCumplidas: 99 }).motivo, "sin_inscripcion_activa");
  assert.equal(evaluarElegibilidad({ tieneInscripcionActiva: false, siguiente: null, clasesCumplidas: 99 }).motivo, "sin_inscripcion_activa");
  assert.deepEqual(evaluarElegibilidad({ tieneInscripcionActiva: true, siguiente: null, clasesCumplidas: 99 }), { elegible: false, motivo: "sin_siguiente_nivel", clasesRequeridas: 0, faltan: 0 });
});
