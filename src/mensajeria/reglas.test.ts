import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dentroDeHorario,
  esDeServicio,
  esIniciadoPorSistema,
  evaluarReglas,
  motivoBloqueo,
  pasaConAtencionHumana,
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
const APROBADA = { enviable: true, categoria: "utility" as const, clase: "servicio" as const };

test("automatización en regla: dentro de ventana, de horario y bajo el tope", () => {
  assert.equal(evaluarReglas(entrada()), null);
});

test("fuera de la ventana de servicio: con plantilla aprobada se manda; sin plantilla, no (invariante 5)", () => {
  const cerrada = { estado: "bot" as const, ventana_servicio_hasta: VENCIDA };
  assert.equal(evaluarReglas(entrada({ conv: cerrada })), "fuera_de_ventana");
  assert.equal(evaluarReglas(entrada({ conv: cerrada, plantilla: APROBADA })), null);
});

test("una plantilla no aprobada, inactiva o de otra vertical no se manda ni dentro de la ventana", () => {
  assert.equal(evaluarReglas(entrada({ plantilla: { enviable: false, categoria: "utility", clase: "servicio" as const } })), "plantilla_no_apta");
  const cerrada = { estado: "bot" as const, ventana_servicio_hasta: VENCIDA };
  assert.equal(evaluarReglas(entrada({ conv: cerrada, plantilla: { enviable: false, categoria: "utility", clase: "servicio" as const } })), "plantilla_no_apta");
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

test("frecuencia de marketing: tope propio por ventana, solo para plantillas de marketing, además del diario", () => {
  const MARKETING = { enviable: true, categoria: "marketing" as const, clase: "marketing" as const };
  const m = (extra: Partial<EntradaReglas> = {}) => entrada({ plantilla: MARKETING, limiteFrecuencia: 3, limiteMarketing: 1, ...extra });
  assert.equal(evaluarReglas(m({ marketingRecientes: 0 })), null);
  assert.equal(evaluarReglas(m({ marketingRecientes: 1 })), "tope_frecuencia");
  assert.equal(evaluarReglas(m({ marketingRecientes: 0, limiteMarketing: 0 })), "tope_frecuencia", "0 apaga el marketing");
  // El diario sigue valiendo para el marketing.
  assert.equal(evaluarReglas(m({ automaticosRecientes: 3 })), "tope_frecuencia");
  // Una plantilla de servicio no se frena por el marketing reciente.
  assert.equal(evaluarReglas(entrada({ plantilla: APROBADA, limiteFrecuencia: 3, marketingRecientes: 9, limiteMarketing: 1 })), null);
  // Marketing dentro de la ventana de servicio, aunque se etiquete `respuesta`, sigue limitado.
  assert.equal(evaluarReglas(m({ origen: "respuesta", marketingRecientes: 1 })), "tope_frecuencia");
  // Sin dato de marketing (reglas simples) no se limita.
  assert.equal(evaluarReglas(entrada({ plantilla: MARKETING, limiteFrecuencia: 3 })), null);
});

test("baja de marketing: bloquea plantillas de marketing, no las de servicio", () => {
  const conv = { estado: "bot" as const, ventana_servicio_hasta: ABIERTA_AUTOMATICA, dado_de_baja_marketing: true };
  assert.equal(evaluarReglas(entrada({ conv, plantilla: { enviable: true, categoria: "marketing", clase: "marketing" as const } })), "opt_out");
  assert.equal(evaluarReglas(entrada({ conv, plantilla: { enviable: true, categoria: "utility", clase: "servicio" as const } })), null);
});

test("precedencia: la atención humana gana sobre cualquier otra regla para lo que no es un aviso de servicio (invariante 6, INV-6)", () => {
  const conv = { estado: "en_atencion_humana" as const, ventana_servicio_hasta: VENCIDA, dado_de_baja: true };
  assert.equal(evaluarReglas(entrada({ conv, plantilla: { enviable: false, categoria: "marketing", clase: "marketing" as const }, zonaHoraria: null })), "atencion_humana");
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

// ---------------------------------------------------------------------------------------------
// EA-09: un pendiente que lleva demasiado tiempo esperando ya no es de este momento

test("obsoleto: un pendiente con más edad que su vigencia no se manda, ni libre ni con plantilla ni como nota", () => {
  const vigenciaMs = 10 * 60_000;
  assert.equal(evaluarReglas(entrada({ edadMs: vigenciaMs + 1, vigenciaMs })), "obsoleto");
  assert.equal(evaluarReglas(entrada({ edadMs: vigenciaMs + 1, vigenciaMs, plantilla: APROBADA })), "obsoleto");
  assert.equal(evaluarReglas(entrada({ edadMs: vigenciaMs + 1, vigenciaMs, tipo: "nota_interna" })), "obsoleto");
  assert.equal(evaluarReglas(entrada({ edadMs: 3 * 24 * 60 * 60_000, vigenciaMs, origen: "respuesta" })), "obsoleto");
  // Justo en el límite todavía sale; sin vigencia o sin edad, no caduca.
  assert.equal(evaluarReglas(entrada({ edadMs: vigenciaMs, vigenciaMs })), null);
  assert.equal(evaluarReglas(entrada({ edadMs: 99 * 24 * 60 * 60_000 })), null);
  assert.equal(evaluarReglas(entrada({ vigenciaMs })), null);
});

test("obsoleto: la atención humana sigue mandando (invariante 6, sin excepción)", () => {
  const conv = { estado: "en_atencion_humana" as const, ventana_servicio_hasta: ABIERTA_AUTOMATICA };
  assert.equal(evaluarReglas(entrada({ conv, edadMs: 99 * 60_000, vigenciaMs: 60_000 })), "atencion_humana");
});

test("D3: con límite exclusivo, llegar AL inicio del evento ya se descarta (un recordatorio no sirve a la hora de la clase)", () => {
  // Programado a las 07:00 locales del jueves 8 de octubre de 2026 (13:00Z): el siguiente horario válido son las 09:00 (15:00Z).
  const programado = new Date("2026-10-08T13:00:00Z");
  const nueve = new Date("2026-10-08T15:00:00Z");
  assert.equal(recorrerODescartar(programado, MX, nueve)?.toISOString(), nueve.toISOString(), "inclusivo: llegar justo al límite todavía vale");
  assert.equal(recorrerODescartar(programado, MX, nueve, undefined, true), null, "exclusivo: justo al inicio, se descarta");
  assert.equal(recorrerODescartar(programado, MX, new Date(nueve.getTime() + 1), undefined, true)?.toISOString(), nueve.toISOString(), "un instante antes del inicio todavía vale");
  assert.equal(recorrerODescartar(programado, MX, null, undefined, true)?.toISOString(), nueve.toISOString());
});

// ---------------------------------------------------------------------------------------------
// INV-6: `en_atencion_humana` bloquea al bot y al marketing; los avisos de SERVICIO sobre algo ya acordado sí salen

const SERVICIO = { enviable: true, categoria: "utility" as const, clase: "servicio" as const };
/** Categoría Meta `marketing`, clase marketing (lead frío, promoción por vencer). */
const MARKETING_META = { enviable: true, categoria: "marketing" as const, clase: "marketing" as const };
/** Categoría Meta `utility` pero que DECLARA marketing (reenganche, recuperación de quien no llegó): la clase manda, no la categoría. */
const MARKETING_UTILITY = { enviable: true, categoria: "utility" as const, clase: "marketing" as const };

/** Cada tipo de saliente del sistema, tal como lo arma quien lo encola: `[tipo, origen, plantilla]`. */
const ORIGENES: Record<string, Pick<EntradaReglas, "tipo" | "origen" | "plantilla">> = {
  "respuesta del bot (texto libre)": { tipo: "mensaje", origen: "respuesta", plantilla: null },
  "respuesta del bot con plantilla de servicio": { tipo: "mensaje", origen: "respuesta", plantilla: SERVICIO },
  "confirmación de baja": { tipo: "mensaje", origen: "confirmacion_baja", plantilla: null },
  "nota interna del bot": { tipo: "nota_interna", origen: "respuesta", plantilla: null },
  "texto libre automático": { tipo: "mensaje", origen: "automatizacion", plantilla: null },
  "recordatorio de clase muestra": { tipo: "mensaje", origen: "automatizacion", plantilla: SERVICIO },
  "bienvenida de inscripción": { tipo: "mensaje", origen: "automatizacion", plantilla: SERVICIO },
  "recordatorio de pago": { tipo: "mensaje", origen: "automatizacion", plantilla: SERVICIO },
  "reenganche": { tipo: "mensaje", origen: "automatizacion", plantilla: MARKETING_UTILITY },
  "recuperación de quien no llegó": { tipo: "mensaje", origen: "automatizacion", plantilla: MARKETING_UTILITY },
  "lead frío": { tipo: "mensaje", origen: "automatizacion", plantilla: MARKETING_META },
  "promoción por vencer": { tipo: "mensaje", origen: "automatizacion", plantilla: MARKETING_META },
};
/** Los únicos que salen con una persona atendiendo. */
const SALEN_CON_ATENCION_HUMANA = new Set(["recordatorio de clase muestra", "bienvenida de inscripción", "recordatorio de pago"]);

test("INV-6, matriz: {estado de la conversación} × {origen y clase de plantilla}: con una persona atendiendo solo salen los avisos de servicio", () => {
  for (const [nombre, o] of Object.entries(ORIGENES)) {
    // Con el bot a cargo todo sale (ventana abierta, horario y frecuencia en regla): la atención humana no cambia a los demás.
    const bot = evaluarReglas(entrada({ ...o, conv: { estado: "bot", ventana_servicio_hasta: ABIERTA_AUTOMATICA } }));
    assert.equal(bot, null, `bot · ${nombre}`);
    const humana = evaluarReglas(entrada({ ...o, conv: { estado: "en_atencion_humana", ventana_servicio_hasta: ABIERTA_AUTOMATICA } }));
    assert.equal(humana, SALEN_CON_ATENCION_HUMANA.has(nombre) ? null : "atencion_humana", `en_atencion_humana · ${nombre}`);
  }
});

test("INV-6: el aviso de servicio con una persona atendiendo SIGUE sujeto a plantilla, ventana, horario, baja total y frecuencia", () => {
  const humana = { estado: "en_atencion_humana" as const, ventana_servicio_hasta: ABIERTA_AUTOMATICA };
  const aviso = (extra: Partial<EntradaReglas> = {}) => entrada({ conv: humana, origen: "automatizacion", plantilla: SERVICIO, ...extra });
  assert.equal(evaluarReglas(aviso()), null);
  assert.equal(evaluarReglas(aviso({ plantilla: { ...SERVICIO, enviable: false } })), "plantilla_no_apta");
  // Fuera de la ventana de servicio: sale por ser plantilla aprobada (invariante 5), como siempre.
  assert.equal(evaluarReglas(aviso({ conv: { ...humana, ventana_servicio_hasta: VENCIDA } })), null);
  // Horario 09:00–20:00 de la sucursal (invariante 14) y zona obligatoria.
  assert.equal(evaluarReglas(aviso({ ahora: new Date("2026-10-09T04:00:00Z") })), "fuera_de_horario");
  assert.equal(evaluarReglas(aviso({ zonaHoraria: null })), "sin_zona_horaria");
  // Frecuencia diaria.
  assert.equal(evaluarReglas(aviso({ automaticosRecientes: 1 })), "tope_frecuencia");
  // La baja TOTAL bloquea todo, también los avisos de servicio; la baja de marketing no.
  assert.equal(evaluarReglas(aviso({ conv: { ...humana, dado_de_baja: true } })), "opt_out");
  assert.equal(evaluarReglas(aviso({ conv: { ...humana, dado_de_baja_marketing: true } })), null);
  // El tope de marketing no frena a un aviso de servicio.
  assert.equal(evaluarReglas(aviso({ marketingRecientes: 9, limiteMarketing: 1 })), null);
});

test("INV-6: la baja de marketing bloquea lo que DECLARA marketing aunque su categoría Meta sea utility; la de servicio sigue saliendo", () => {
  const conv = { estado: "bot" as const, ventana_servicio_hasta: ABIERTA_AUTOMATICA, dado_de_baja_marketing: true };
  assert.equal(evaluarReglas(entrada({ conv, plantilla: MARKETING_UTILITY })), "opt_out");
  assert.equal(evaluarReglas(entrada({ conv, plantilla: MARKETING_META })), "opt_out");
  assert.equal(evaluarReglas(entrada({ conv, plantilla: SERVICIO })), null);
});

test("INV-6, mutación: una plantilla que no declara su clase (ausente o rara) se trata como marketing: con una persona atendiendo NO sale", () => {
  const humana = { estado: "en_atencion_humana" as const, ventana_servicio_hasta: ABIERTA_AUTOMATICA };
  for (const clase of [undefined, null, "", "Servicio", "utility", "SERVICIO"]) {
    const sinDeclarar = { enviable: true, categoria: "utility" as const, clase: clase as never };
    assert.equal(pasaConAtencionHumana({ tipo: "mensaje", origen: "automatizacion", plantilla: sinDeclarar }), false, String(clase));
    assert.equal(evaluarReglas(entrada({ conv: humana, plantilla: sinDeclarar })), "atencion_humana", String(clase));
  }
  // …y con el bot a cargo, la baja de marketing también la frena (lo conservador).
  const baja = { estado: "bot" as const, ventana_servicio_hasta: ABIERTA_AUTOMATICA, dado_de_baja_marketing: true };
  assert.equal(evaluarReglas(entrada({ conv: baja, plantilla: { enviable: true, categoria: "utility", clase: undefined as never } })), "opt_out");
  assert.equal(esDeServicio(null), false);
});

test("INV-6: la precedencia del resto no cambia (baja antes que ventana, ventana antes que horario…) para un aviso de servicio", () => {
  const noche = new Date("2026-10-09T04:00:00Z");
  const base = { ahora: noche, automaticosRecientes: 9, plantilla: SERVICIO };
  assert.equal(evaluarReglas(entrada({ ...base, conv: { estado: "en_atencion_humana", ventana_servicio_hasta: VENCIDA, dado_de_baja: true } })), "opt_out");
  assert.equal(evaluarReglas(entrada({ ...base, conv: { estado: "en_atencion_humana", ventana_servicio_hasta: VENCIDA } })), "fuera_de_horario");
});

test("EG-05 (decisión de Eduardo): el tope de marketing se aplica por la CLASE declarada de la plantilla, no por la categoría de Meta", () => {
  const m = (plantilla: NonNullable<EntradaReglas["plantilla"]>, extra: Partial<EntradaReglas> = {}) => entrada({ plantilla, limiteFrecuencia: 3, limiteMarketing: 1, marketingRecientes: 1, ...extra });
  // Reenganche y recuperación: `utility` para Meta, marketing para el negocio. Antes se saltaban el tope.
  assert.equal(evaluarReglas(m({ enviable: true, categoria: "utility", clase: "marketing" })), "tope_frecuencia");
  assert.equal(evaluarReglas(m({ enviable: true, categoria: "utility", clase: "marketing" }, { marketingRecientes: 0 })), null, "el primero sale");
  assert.equal(evaluarReglas(m({ enviable: true, categoria: "utility", clase: "marketing" }, { marketingRecientes: 0, limiteMarketing: 0 })), "tope_frecuencia", "0 apaga el marketing también para ellos");
  assert.equal(evaluarReglas(m({ enviable: true, categoria: "utility", clase: "marketing" }, { marketingRecientes: 1, limiteMarketing: 2 })), null, "el tope sigue siendo configurable por organización");
  // Un aviso de servicio (utility) no se frena por el marketing reciente, sea cual sea.
  assert.equal(evaluarReglas(m({ enviable: true, categoria: "utility", clase: "servicio" }, { marketingRecientes: 9 })), null);
  // Lo ausente o raro es marketing (lo conservador).
  assert.equal(evaluarReglas(m({ enviable: true, categoria: "utility", clase: undefined as never })), "tope_frecuencia");
  assert.equal(evaluarReglas(m({ enviable: true, categoria: "utility", clase: "otra" as never })), "tope_frecuencia");
});
