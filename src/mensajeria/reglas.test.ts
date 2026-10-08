import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dentroDeHorario,
  esIniciadoPorSistema,
  evaluarReglas,
  motivoBloqueo,
  recorrerODescartar,
  siguienteHorarioValido,
  ventanaServicioDesde,
  type EntradaReglas,
} from "./reglas.ts";

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

test("baja en la organización: bloquea mensajes aunque la conversación esté en bot (consentimiento por teléfono)", () => {
  const conv = { estado: "bot" as const, ventana_servicio_hasta: ABIERTA, dado_de_baja: true };
  assert.equal(motivoBloqueo(conv, "mensaje", AHORA), "opt_out");
  assert.equal(motivoBloqueo(conv, "nota_interna", AHORA), null);
});

test("la confirmación de la baja es lo único que sale a quien ya se dio de baja", () => {
  const conv = { estado: "opt_out" as const, ventana_servicio_hasta: ABIERTA, dado_de_baja: true };
  assert.equal(motivoBloqueo(conv, "mensaje", AHORA), "opt_out");
  assert.equal(motivoBloqueo(conv, "mensaje", AHORA, "respuesta"), "opt_out");
  assert.equal(motivoBloqueo(conv, "mensaje", AHORA, "automatizacion"), "opt_out");
  assert.equal(motivoBloqueo(conv, "mensaje", AHORA, "confirmacion_baja"), null);
});

test("la confirmación de la baja respeta la atención humana (invariante 6) y la ventana de servicio", () => {
  const humana = { estado: "en_atencion_humana" as const, ventana_servicio_hasta: ABIERTA, dado_de_baja: true };
  assert.equal(motivoBloqueo(humana, "mensaje", AHORA, "confirmacion_baja"), "atencion_humana");
  const vencida = { estado: "opt_out" as const, ventana_servicio_hasta: VENCIDA, dado_de_baja: true };
  assert.equal(motivoBloqueo(vencida, "mensaje", AHORA, "confirmacion_baja"), "fuera_de_ventana");
});

// ---------------------------------------------------------------------------------------------
// Horario de envío (invariante 14). Ciudad de México es UTC-6 todo el año (sin horario de verano).

const MX = "America/Mexico_City";

test("horario: de 09:00 (inclusive) a 20:00 (exclusive), hora local de la sucursal", () => {
  assert.equal(dentroDeHorario(new Date("2026-10-08T14:59:00Z"), MX), false); // 08:59
  assert.equal(dentroDeHorario(new Date("2026-10-08T15:00:00Z"), MX), true); // 09:00
  assert.equal(dentroDeHorario(new Date("2026-10-09T01:59:00Z"), MX), true); // 19:59
  assert.equal(dentroDeHorario(new Date("2026-10-09T02:00:00Z"), MX), false); // 20:00
});

test("horario: la misma hora UTC es otra hora local en otra zona", () => {
  const instante = new Date("2026-10-08T15:00:00Z");
  assert.equal(dentroDeHorario(instante, "America/Mexico_City"), true); // 09:00
  assert.equal(dentroDeHorario(instante, "America/Tijuana"), false); // 08:00
  assert.equal(dentroDeHorario(instante, "America/Bogota"), true); // 10:00
});

test("lo programado fuera de rango se recorre al siguiente horario válido", () => {
  // 22:00 local → 09:00 del día siguiente
  assert.equal(siguienteHorarioValido(new Date("2026-10-09T04:00:00Z"), MX).toISOString(), "2026-10-09T15:00:00.000Z");
  // 06:00 local → 09:00 del mismo día
  assert.equal(siguienteHorarioValido(new Date("2026-10-08T12:00:00Z"), MX).toISOString(), "2026-10-08T15:00:00.000Z");
  // exactamente 20:00 ya es fuera
  assert.equal(siguienteHorarioValido(new Date("2026-10-09T02:00:00Z"), MX).toISOString(), "2026-10-09T15:00:00.000Z");
  // dentro de horario no se mueve
  const dentro = new Date("2026-10-08T18:00:00Z");
  assert.equal(siguienteHorarioValido(dentro, MX), dentro);
});

test("respeta los días permitidos de la ventana (0 = domingo)", () => {
  const lunAVie = { inicioMin: 540, finMin: 1200, dias: [1, 2, 3, 4, 5] };
  // sábado 10-oct-2026 a las 11:00 local → lunes 12-oct a las 09:00
  assert.equal(siguienteHorarioValido(new Date("2026-10-10T17:00:00Z"), MX, lunAVie).toISOString(), "2026-10-12T15:00:00.000Z");
});

test("cambio de horario de verano: las 09:00 locales siguen siendo las 09:00 locales", () => {
  const NY = "America/New_York"; // el 8-mar-2026 los relojes adelantan una hora
  // sábado 21:00 EST → domingo 09:00 EDT (13:00 UTC, no 14:00)
  assert.equal(siguienteHorarioValido(new Date("2026-03-08T02:00:00Z"), NY).toISOString(), "2026-03-08T13:00:00.000Z");
  // viernes 22:00 EST → sábado 09:00 EST (14:00 UTC)
  assert.equal(siguienteHorarioValido(new Date("2026-03-07T03:00:00Z"), NY).toISOString(), "2026-03-07T14:00:00.000Z");
});

test("si recorrerlo lo deja después del evento, se descarta; nunca se manda tarde", () => {
  const programado = new Date("2026-10-09T04:00:00Z"); // 22:00 local
  const eventoManana08 = new Date("2026-10-09T14:00:00Z"); // 08:00 local: el recorrido (09:00) llegaría tarde
  assert.equal(recorrerODescartar(programado, MX, eventoManana08), null);
  const eventoManana10 = new Date("2026-10-09T16:00:00Z");
  assert.equal(recorrerODescartar(programado, MX, eventoManana10)?.toISOString(), "2026-10-09T15:00:00.000Z");
  assert.equal(recorrerODescartar(programado, MX, null)?.toISOString(), "2026-10-09T15:00:00.000Z");
});

// ---------------------------------------------------------------------------------------------
// Reglas completas de MessagingProvider (invariante 4)

// Ventana de servicio abierta respecto de los instantes de estas pruebas (8-oct 18:00 y 9-oct 04:00 UTC).
const ABIERTA_AUTOMATICA = new Date("2026-10-09T12:00:00Z");

const entrada = (extra: Partial<EntradaReglas> = {}): EntradaReglas => ({
  conv: { estado: "bot", ventana_servicio_hasta: ABIERTA_AUTOMATICA },
  tipo: "mensaje",
  origen: "automatizacion",
  ahora: new Date("2026-10-08T18:00:00Z"), // 12:00 local
  plantilla: null,
  zonaHoraria: MX,
  automaticosRecientes: 0,
  limiteFrecuencia: 1,
  ...extra,
});
const APROBADA = { enviable: true, categoria: "utility" as const };

test("automatización en regla: dentro de ventana, de horario y bajo el tope", () => {
  assert.equal(evaluarReglas(entrada()), null);
});

test("fuera de la ventana de servicio: con plantilla aprobada se manda; sin plantilla, no (invariante 5)", () => {
  const cerrada = { estado: "bot" as const, ventana_servicio_hasta: VENCIDA };
  assert.equal(evaluarReglas(entrada({ conv: cerrada })), "fuera_de_ventana");
  assert.equal(evaluarReglas(entrada({ conv: cerrada, plantilla: APROBADA })), null);
});

test("una plantilla no aprobada, inactiva o de otra vertical no se manda ni dentro de la ventana", () => {
  assert.equal(evaluarReglas(entrada({ plantilla: { enviable: false, categoria: "utility" } })), "plantilla_no_apta");
  const cerrada = { estado: "bot" as const, ventana_servicio_hasta: VENCIDA };
  assert.equal(evaluarReglas(entrada({ conv: cerrada, plantilla: { enviable: false, categoria: "utility" } })), "plantilla_no_apta");
});

test("horario: lo automático no sale fuera de 09:00–20:00 hora de la sucursal; una respuesta sí (decisión 5)", () => {
  const noche = new Date("2026-10-09T04:00:00Z"); // 22:00 local
  assert.equal(evaluarReglas(entrada({ ahora: noche })), "fuera_de_horario");
  assert.equal(evaluarReglas(entrada({ ahora: noche, origen: "respuesta" })), null);
  assert.equal(evaluarReglas(entrada({ ahora: noche, tipo: "nota_interna" })), null);
});

test("lo automático sin zona horaria no se manda (no se adivina la hora local)", () => {
  assert.equal(evaluarReglas(entrada({ zonaHoraria: null })), "sin_zona_horaria");
  assert.equal(evaluarReglas(entrada({ zonaHoraria: null, origen: "respuesta" })), null);
});

test("frecuencia: tope de mensajes automáticos por teléfono; no limita las respuestas", () => {
  assert.equal(evaluarReglas(entrada({ automaticosRecientes: 1 })), "tope_frecuencia");
  assert.equal(evaluarReglas(entrada({ automaticosRecientes: 0 })), null);
  assert.equal(evaluarReglas(entrada({ automaticosRecientes: 5, origen: "respuesta" })), null);
});

test("baja de marketing: bloquea plantillas de marketing, no las de servicio", () => {
  const conv = { estado: "bot" as const, ventana_servicio_hasta: ABIERTA_AUTOMATICA, dado_de_baja_marketing: true };
  assert.equal(evaluarReglas(entrada({ conv, plantilla: { enviable: true, categoria: "marketing" } })), "opt_out");
  assert.equal(evaluarReglas(entrada({ conv, plantilla: { enviable: true, categoria: "utility" } })), null);
});

test("precedencia: la atención humana gana sobre cualquier otra regla (invariante 6)", () => {
  const conv = { estado: "en_atencion_humana" as const, ventana_servicio_hasta: VENCIDA, dado_de_baja: true };
  assert.equal(evaluarReglas(entrada({ conv, plantilla: { enviable: false, categoria: "marketing" }, zonaHoraria: null })), "atencion_humana");
  assert.equal(evaluarReglas(entrada({ conv, tipo: "nota_interna" })), "atencion_humana");
});

test("precedencia: baja antes que ventana, ventana antes que horario, horario antes que frecuencia", () => {
  const noche = new Date("2026-10-09T04:00:00Z");
  const base = { ahora: noche, automaticosRecientes: 9 };
  assert.equal(evaluarReglas(entrada({ ...base, conv: { estado: "bot", ventana_servicio_hasta: VENCIDA, dado_de_baja: true } })), "opt_out");
  assert.equal(evaluarReglas(entrada({ ...base, conv: { estado: "bot", ventana_servicio_hasta: VENCIDA } })), "fuera_de_ventana");
  assert.equal(evaluarReglas(entrada({ ...base })), "fuera_de_horario");
  assert.equal(evaluarReglas(entrada({ ahora: new Date("2026-10-08T18:00:00Z"), automaticosRecientes: 9 })), "tope_frecuencia");
});

// ---------------------------------------------------------------------------------------------
// F1-04: "iniciado por el sistema" no depende de la etiqueta `origen`

const NOCHE_MX = new Date("2026-10-09T04:00:00Z"); // 22:00 local

test("es del sistema todo origen distinto de respuesta y confirmacion_baja, o una plantilla sin ventana abierta", () => {
  assert.equal(esIniciadoPorSistema({ origen: "automatizacion", conLaPlantilla: false, ventanaAbierta: true }), true);
  assert.equal(esIniciadoPorSistema({ origen: "respuesta", conLaPlantilla: true, ventanaAbierta: false }), true);
  assert.equal(esIniciadoPorSistema({ origen: "confirmacion_baja", conLaPlantilla: true, ventanaAbierta: false }), true);
  // Contestar dentro de la ventana, con o sin plantilla, no lo es.
  assert.equal(esIniciadoPorSistema({ origen: "respuesta", conLaPlantilla: false, ventanaAbierta: true }), false);
  assert.equal(esIniciadoPorSistema({ origen: "respuesta", conLaPlantilla: true, ventanaAbierta: true }), false);
  assert.equal(esIniciadoPorSistema({ origen: "confirmacion_baja", conLaPlantilla: false, ventanaAbierta: true }), false);
});

test("una plantilla con el origen por defecto (respuesta), sin ventana abierta, a las 22:00 NO sale", () => {
  const cerrada = { estado: "bot" as const, ventana_servicio_hasta: VENCIDA };
  assert.equal(evaluarReglas(entrada({ ahora: NOCHE_MX, origen: "respuesta", conv: cerrada, plantilla: APROBADA })), "fuera_de_horario");
  assert.equal(evaluarReglas(entrada({ ahora: new Date("2026-10-08T18:00:00Z"), origen: "respuesta", conv: cerrada, plantilla: APROBADA })), null);
});

test("lo mismo con frecuencia: la plantilla fuera de ventana cuenta como iniciada por el sistema aunque diga `respuesta`", () => {
  const cerrada = { estado: "bot" as const, ventana_servicio_hasta: VENCIDA };
  assert.equal(evaluarReglas(entrada({ origen: "respuesta", conv: cerrada, plantilla: APROBADA, automaticosRecientes: 1 })), "tope_frecuencia");
  assert.equal(evaluarReglas(entrada({ origen: "respuesta", conv: cerrada, plantilla: APROBADA, zonaHoraria: null })), "sin_zona_horaria");
});

test("la respuesta con la ventana abierta sigue sin horario ni frecuencia (decisión 5)", () => {
  assert.equal(evaluarReglas(entrada({ ahora: NOCHE_MX, origen: "respuesta", automaticosRecientes: 9, zonaHoraria: null })), null);
});
