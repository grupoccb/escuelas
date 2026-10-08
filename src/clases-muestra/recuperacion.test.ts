import { test } from "node:test";
import assert from "node:assert/strict";
import { planearRecuperacion, type AutomatizacionDeRecuperacion } from "./recuperacion.ts";

const MX = "America/Mexico_City"; // UTC-6 en noviembre de 2026
const NY = "America/New_York";
const base: AutomatizacionDeRecuperacion = { id: "r", offset_minutos: 120, espaciado_minutos: 2880, max_intentos: 2, hora_inicio_min: 540, hora_fin_min: 1200, dias_permitidos: [0, 1, 2, 3, 4, 5, 6] };
const plan = (marcada: string, o: Partial<AutomatizacionDeRecuperacion> = {}, zona = MX) =>
  planearRecuperacion({ marcadaEn: new Date(marcada), zonaHoraria: zona, automatizacion: { ...base, ...o } }).map((p) => [p.ocurrencia, p.programadoPara.toISOString()]);

test("D4 recuperación: el primer intento sale 2 h después de marcarlo y el segundo, 48 h después del primero", () => {
  // Marcado el lunes 2 de noviembre a las 12:00 locales (18:00Z).
  assert.deepEqual(plan("2026-11-02T18:00:00Z"), [[1, "2026-11-02T20:00:00.000Z"], [2, "2026-11-04T20:00:00.000Z"]]);
});

test("D4 recuperación: dentro del horario de envío — de noche se recorre a las 09:00 y NUNCA se descarta (no hay clase a la que llegar tarde)", () => {
  // Marcado el lunes 2 a las 19:30 locales (01:30Z del martes): +2 h son las 21:30 → el martes 09:00 (15:00Z). El segundo: el miércoles 4 a las
  // 21:30 (48 h después del nominal del primero) → el jueves 09:00.
  assert.deepEqual(plan("2026-11-03T01:30:00Z"), [[1, "2026-11-03T15:00:00.000Z"], [2, "2026-11-05T15:00:00.000Z"]]);
});

test("D4 recuperación: sin espaciado el segundo intento usa el mismo offset; con un solo intento hay uno; los días permitidos mandan", () => {
  assert.deepEqual(plan("2026-11-02T18:00:00Z", { espaciado_minutos: null }), [[1, "2026-11-02T20:00:00.000Z"], [2, "2026-11-02T22:00:00.000Z"]]);
  assert.deepEqual(plan("2026-11-02T18:00:00Z", { max_intentos: 1 }), [[1, "2026-11-02T20:00:00.000Z"]]);
  // Marcado un sábado por la tarde y la automatización no permite domingos: el segundo intento (domingo) pasa al lunes 09:00.
  assert.deepEqual(plan("2026-11-07T18:00:00Z", { espaciado_minutos: 1440, dias_permitidos: [1, 2, 3, 4, 5, 6] }), [[1, "2026-11-07T20:00:00.000Z"], [2, "2026-11-09T15:00:00.000Z"]]);
});

test("D4 recuperación: la hora de pared es la de la sucursal y respeta el horario de verano (Nueva York, retroceso del 1 de noviembre)", () => {
  // Marcado el sábado 31 de octubre a las 16:00 EDT (20:00Z): +2 h = 18:00 EDT (22:00Z); +48 h cae el lunes 2 de noviembre a las 17:00 EST (22:00Z).
  assert.deepEqual(plan("2026-10-31T20:00:00Z", {}, NY), [[1, "2026-10-31T22:00:00.000Z"], [2, "2026-11-02T22:00:00.000Z"]]);
});
