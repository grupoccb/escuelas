// Las métricas del PROCESO y su estado de salud: lo que este proceso del backend sabe de sí mismo. Una sola instancia por proceso.

import { RegistroDeMetricas } from "./registro.ts";

export const metricas = new RegistroDeMetricas();

metricas.declarar("inscripciones_webhooks_total", "counter", "Webhooks recibidos por origen y resultado (aceptado, rechazado, inesperado, reintentar).");
metricas.conEtiquetas("inscripciones_webhooks_total");
metricas.declarar("inscripciones_http_respuestas_total", "counter", "Respuestas HTTP por grupo de ruta (api, webhooks, landing, salud, web) y clase (2xx, 3xx, 4xx, 5xx).");
metricas.conEtiquetas("inscripciones_http_respuestas_total");
metricas.declarar("inscripciones_ciclos_total", "counter", "Ciclos del barrido por resultado (completo, con_errores, fallido).");
metricas.conEtiquetas("inscripciones_ciclos_total");
metricas.declarar("inscripciones_ciclo_errores_total", "counter", "Errores aislados dentro de los ciclos del barrido.");
metricas.declarar("inscripciones_ultimo_ciclo_timestamp_seconds", "gauge", "Cuándo terminó el último ciclo completo del barrido (segundos desde 1970). 0 si aún no hay.");
metricas.declarar("inscripciones_barrido_edad_segundos", "gauge", "Segundos desde el último ciclo del barrido (o desde el arranque si todavía no hay ninguno).");
metricas.declarar("inscripciones_proceso_inicio_timestamp_seconds", "gauge", "Cuándo arrancó este proceso (segundos desde 1970).");

export type OrigenDeWebhook = "chatwoot" | "twilio_entrante" | "twilio_estado";
export type ResultadoDeWebhook = "aceptado" | "rechazado" | "inesperado" | "reintentar" | "limitado";

export function contarWebhook(origen: OrigenDeWebhook, resultado: ResultadoDeWebhook): void {
  metricas.incrementar("inscripciones_webhooks_total", { origen, resultado });
}

/** El grupo de ruta de una petición, de un conjunto cerrado (la ruta exacta puede traer identificadores). */
export function grupoDeRuta(ruta: string): "api" | "webhooks" | "landing" | "salud" | "metricas" | "web" {
  if (ruta.startsWith("/api")) return "api";
  if (ruta.startsWith("/webhooks")) return "webhooks";
  if (ruta === "/l" || ruta.startsWith("/l/")) return "landing";
  if (ruta.startsWith("/salud")) return "salud";
  if (ruta.startsWith("/metricas")) return "metricas";
  return "web";
}

export function contarRespuesta(ruta: string, estado: number): void {
  metricas.incrementar("inscripciones_http_respuestas_total", { grupo: grupoDeRuta(ruta), clase: `${Math.floor(estado / 100)}xx` });
}

// ── El barrido ──────────────────────────────────────────────────────────────────────────────────────────

const inicioMs = Date.now();
let ultimoCicloMs: number | null = null;
metricas.fijar("inscripciones_proceso_inicio_timestamp_seconds", Math.floor(inicioMs / 1000));

/** El barrido avisa que un ciclo terminó. `errores > 0` lo cuenta como «con_errores» pero sigue siendo un ciclo completado (el barrido corre). */
export function registrarCiclo(errores: number, ahoraMs = Date.now()): void {
  ultimoCicloMs = ahoraMs;
  metricas.incrementar("inscripciones_ciclos_total", { resultado: errores > 0 ? "con_errores" : "completo" });
  if (errores > 0) metricas.incrementar("inscripciones_ciclo_errores_total", {}, errores);
  metricas.fijar("inscripciones_ultimo_ciclo_timestamp_seconds", Math.floor(ahoraMs / 1000));
}

export function registrarCicloFallido(): void {
  metricas.incrementar("inscripciones_ciclos_total", { resultado: "fallido" });
}

export interface EstadoDelBarrido {
  iniciadoEn: number;
  ultimoCicloEn: number | null;
}

export function estadoDelBarrido(): EstadoDelBarrido {
  return { iniciadoEn: inicioMs, ultimoCicloEn: ultimoCicloMs };
}

/** Solo para las pruebas: vuelve al estado de recién arrancado. */
export function reiniciarProcesoParaPruebas(): void {
  ultimoCicloMs = null;
}
