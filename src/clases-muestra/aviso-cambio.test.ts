// V2, decisión 4: las reglas puras del aviso a la familia cuando una persona cambia su clase muestra (horario, límite de la clase) y el texto de la tarea para el asesor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { descripcionDeTareaDeCambio, esEventoDeCambioDeClase, EVENTO_DE_CAMBIO, planearAvisosDeCambio, type AutomatizacionDeAviso } from "./aviso-cambio.ts";

const ZONA = "America/Mexico_City"; // UTC-6 en noviembre de 2026
const auto = (extra: Partial<AutomatizacionDeAviso> = {}): AutomatizacionDeAviso => ({ id: "a1", offset_minutos: 0, hora_inicio_min: 540, hora_fin_min: 1200, dias_permitidos: [0, 1, 2, 3, 4, 5, 6], ...extra });
const hora = (local: string): Date => new Date(`${local.replace(" ", "T")}:00-06:00`); // «2026-11-04 12:00» hora de la Ciudad de México
const plan = (ahora: string, inicio: string, a: AutomatizacionDeAviso = auto()) => planearAvisosDeCambio({ inicio: hora(inicio), zonaHoraria: ZONA, ahora: hora(ahora), automatizaciones: [a] })[0]!;
const iso = (d: Date | null): string | null => d?.toISOString() ?? null;

test("dentro del horario sale enseguida (más el desfase)", () => {
  const p = plan("2026-11-04 12:00", "2026-11-06 10:00");
  assert.deepEqual([iso(p.programadoPara), p.motivo], [hora("2026-11-04 12:00").toISOString(), null]);
  const conDesfase = plan("2026-11-04 12:00", "2026-11-06 10:00", auto({ offset_minutos: 90 }));
  assert.equal(iso(conDesfase.programadoPara), hora("2026-11-04 13:30").toISOString());
});

test("fuera del horario se recorre al siguiente horario válido (09:00) si todavía llega antes de la clase", () => {
  assert.equal(iso(plan("2026-11-04 22:00", "2026-11-05 10:00").programadoPara), hora("2026-11-05 09:00").toISOString(), "de noche → 09:00 del día siguiente");
  assert.equal(iso(plan("2026-11-04 06:30", "2026-11-04 12:00").programadoPara), hora("2026-11-04 09:00").toISOString(), "de madrugada → 09:00 de ese mismo día");
  assert.equal(iso(plan("2026-11-04 20:00", "2026-11-05 11:00").programadoPara), hora("2026-11-05 09:00").toISOString(), "las 20:00 ya no valen (el horario es [09:00, 20:00))");
});

test("si recorrerlo lo deja a la hora de la clase o después, se descarta (evento_pasado): la clase de las 09:00 avisada a las 22:00 no alcanza", () => {
  for (const [ahora, inicio] of [["2026-11-04 22:00", "2026-11-05 09:00"], ["2026-11-04 22:00", "2026-11-05 08:00"], ["2026-11-04 20:10", "2026-11-04 20:30"], ["2026-11-04 08:30", "2026-11-04 09:00"]] as const) {
    const p = plan(ahora, inicio);
    assert.deepEqual([p.programadoPara, p.motivo], [null, "evento_pasado"], `${ahora} → clase ${inicio}`);
  }
  // Un minuto antes de que empiece, ya dentro de horario: todavía sale (nada lo recorre).
  assert.equal(plan("2026-11-04 12:00", "2026-11-04 12:01").motivo, null);
  // A la hora exacta de la clase, no.
  assert.equal(plan("2026-11-04 12:00", "2026-11-04 12:00").motivo, "ya_paso_el_momento");
});

test("una clase que ya empezó no se avisa (ya_paso_el_momento, sin tarea); la ventana propia más estrecha manda", () => {
  assert.deepEqual([plan("2026-11-04 12:00", "2026-11-04 10:00").programadoPara, plan("2026-11-04 12:00", "2026-11-04 10:00").motivo], [null, "ya_paso_el_momento"]);
  const estrecha = auto({ hora_inicio_min: 600, hora_fin_min: 840 }); // 10:00–14:00
  assert.equal(iso(plan("2026-11-04 09:00", "2026-11-04 18:00", estrecha).programadoPara), hora("2026-11-04 10:00").toISOString());
  assert.equal(plan("2026-11-04 15:00", "2026-11-05 09:30", estrecha).motivo, "evento_pasado", "mañana a las 10:00 ya es después de la clase de las 09:30");
});

test("los días permitidos de la automatización también recorren (miércoles 4 de noviembre; solo lunes a viernes)", () => {
  const entreSemana = auto({ dias_permitidos: [1, 2, 3, 4, 5] });
  // Sábado 7 de noviembre a las 12:00: el siguiente horario válido es el lunes 9 a las 09:00.
  assert.equal(iso(plan("2026-11-07 12:00", "2026-11-10 16:00", entreSemana).programadoPara), hora("2026-11-09 09:00").toISOString());
  assert.equal(plan("2026-11-07 12:00", "2026-11-08 16:00", entreSemana).motivo, "evento_pasado", "la clase del domingo ya no alcanza");
});

test("el texto de la tarea: la clase, qué pasó y qué hacer; sin datos de salud", () => {
  const t = descripcionDeTareaDeCambio({ tipo: "reprogramada", nombre: "Sofía", fecha: "jueves 5 de noviembre", hora: "09:00", porQue: "fuera_de_horario" });
  assert.equal(t, "La clase muestra de Sofía cambió al jueves 5 de noviembre a las 09:00 y no se le pudo avisar a la familia por WhatsApp (ya es fuera del horario de mensajes y la clase empieza antes de que pueda salir). Llámale y avísale del cambio.");
  const c = descripcionDeTareaDeCambio({ tipo: "cancelada", nombre: "Sofía", fecha: "jueves 5 de noviembre", hora: "09:00", porQue: "sin_conversacion" });
  assert.match(c, /se canceló y no se le pudo avisar a la familia por WhatsApp \(la familia no tiene una conversación de WhatsApp\)\. Llámale y avísale del cambio\.$/);
  assert.match(descripcionDeTareaDeCambio({ tipo: "cancelada", nombre: "Sofía", fecha: "x", hora: "y", porQue: "tope_frecuencia" }), /máximo de mensajes automáticos del día/);
});

test("los eventos del cambio: uno por tipo, y solo ellos se reconocen", () => {
  assert.deepEqual(EVENTO_DE_CAMBIO, { reprogramada: "clase_muestra_reprogramada", cancelada: "clase_muestra_cancelada" });
  assert.equal(esEventoDeCambioDeClase("clase_muestra_cancelada"), true);
  assert.equal(esEventoDeCambioDeClase("clase_muestra_proxima"), false);
  assert.equal(esEventoDeCambioDeClase("clase_muestra_no_asistio"), false);
});
