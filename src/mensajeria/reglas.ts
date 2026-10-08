// Reglas de envío. Puras: deciden con el estado de la conversación, la plantilla, la hora y el
// historial reciente, sin tocar base ni red. Solo MessagingProvider las llama (invariante 4).
//
// En orden de precedencia:
// 1. atención humana (invariante 6), sin excepción, ni siquiera para notas internas;
// 2. baja (opt-out) y conversación cerrada;
// 3. plantilla: lo que lleva plantilla debe ser una aprobada y activa;
// 4. ventana de servicio (invariante 5): fuera de ella solo cabe una plantilla aprobada;
// 5. horario (invariante 14): lo iniciado por el sistema solo sale de 09:00 a 20:00, hora local
//    de la sucursal. Contestar a quien acaba de escribir no tiene restricción de horario;
// 6. frecuencia: tope de mensajes automáticos por teléfono.

import type { EstadoConversacion, OrigenMensaje } from "../datos/tipos.ts";

export type TipoSaliente = "mensaje" | "nota_interna";

export type MotivoBloqueo =
  | "atencion_humana"
  | "opt_out"
  | "conversacion_cerrada"
  | "plantilla_no_apta"
  | "fuera_de_ventana"
  | "fuera_de_horario"
  | "sin_zona_horaria"
  | "tope_frecuencia";

export interface EstadoParaReglas {
  estado: EstadoConversacion;
  ventana_servicio_hasta: Date | null;
  /**
   * La baja vigente del teléfono en TODA la organización, no solo en esta conversación
   * (consentimiento). Una baja dada en una vertical aplica a todas.
   */
  dado_de_baja?: boolean;
  /** Baja solo de mensajes de marketing. No impide plantillas de servicio ni utilitarias. */
  dado_de_baja_marketing?: boolean;
}

export interface PlantillaParaReglas {
  /** Aprobada por Meta, activa, no borrada y válida para la vertical de la conversación. */
  enviable: boolean;
  categoria: "marketing" | "utility" | "authentication" | "servicio";
}

export interface EntradaReglas {
  conv: EstadoParaReglas;
  tipo: TipoSaliente;
  origen: OrigenMensaje;
  ahora: Date;
  /** La plantilla que lleva el mensaje; null = mensaje libre. */
  plantilla: PlantillaParaReglas | null;
  /** Zona horaria IANA de la sucursal. Obligatoria para lo iniciado por el sistema. */
  zonaHoraria: string | null;
  /** Mensajes automáticos ya enviados a este teléfono en la ventana de frecuencia. */
  automaticosRecientes: number;
  limiteFrecuencia: number;
}

/** Devuelve el motivo por el que NO se puede mandar, o null si se puede. */
export function evaluarReglas(e: EntradaReglas): MotivoBloqueo | null {
  const { conv, tipo, origen, ahora, plantilla } = e;

  // Sin excepción: ni siquiera una nota interna automática cuando ya atiende una persona.
  if (conv.estado === "en_atencion_humana") return "atencion_humana";
  if (tipo === "nota_interna") return null;

  // La confirmación de la baja es lo único que sale a quien ya la pidió. Es una respuesta a su
  // mensaje, así que sigue sujeta a la ventana de servicio.
  if (origen !== "confirmacion_baja") {
    if (conv.estado === "opt_out" || conv.dado_de_baja) return "opt_out";
    if (plantilla?.categoria === "marketing" && conv.dado_de_baja_marketing) return "opt_out";
    if (conv.estado === "cerrada") return "conversacion_cerrada";
  }

  if (plantilla && !plantilla.enviable) return "plantilla_no_apta";

  const ventanaAbierta = conv.ventana_servicio_hasta !== null && conv.ventana_servicio_hasta.getTime() > ahora.getTime();
  if (!ventanaAbierta && !plantilla) return "fuera_de_ventana";

  if (origen === "automatizacion") {
    if (!e.zonaHoraria) return "sin_zona_horaria";
    if (!dentroDeHorario(ahora, e.zonaHoraria)) return "fuera_de_horario";
    if (e.automaticosRecientes >= e.limiteFrecuencia) return "tope_frecuencia";
  }
  return null;
}

/**
 * Versión corta, sin plantilla ni horario ni frecuencia. La usan los tests de las reglas más
 * simples; MessagingProvider usa evaluarReglas().
 */
export function motivoBloqueo(
  conv: EstadoParaReglas,
  tipo: TipoSaliente,
  ahora: Date,
  origen: OrigenMensaje = "respuesta",
): MotivoBloqueo | null {
  return evaluarReglas({
    conv,
    tipo,
    origen,
    ahora,
    plantilla: null,
    zonaHoraria: null,
    automaticosRecientes: 0,
    limiteFrecuencia: Number.POSITIVE_INFINITY,
  });
}

// ---------------------------------------------------------------------------------------------
// Ventanas de conversación (invariante 5)

/** 24 h desde el último mensaje entrante. */
export const DURACION_VENTANA_SERVICIO_MS = 24 * 60 * 60 * 1000;

export function ventanaServicioDesde(entrante: Date): Date {
  return new Date(entrante.getTime() + DURACION_VENTANA_SERVICIO_MS);
}

/** 72 h desde la entrada por anuncio. Solo afecta el costo; nunca habilita un envío. */
export const DURACION_VENTANA_GRATIS_MS = 72 * 60 * 60 * 1000;

export function ventanaGratisDesde(entradaPorAnuncio: Date): Date {
  return new Date(entradaPorAnuncio.getTime() + DURACION_VENTANA_GRATIS_MS);
}

// ---------------------------------------------------------------------------------------------
// Horario de envío (invariante 14)

export interface VentanaHoraria {
  /** Minutos desde la medianoche local en que abre (inclusive). */
  inicioMin: number;
  /** Minutos desde la medianoche local en que cierra (exclusive). */
  finMin: number;
  /** 0 = domingo. */
  dias: readonly number[];
}

/** 09:00–20:00 todos los días. Ninguna automatización puede salirse de aquí (CHECK en la base). */
export const HORARIO_DE_ENVIO: VentanaHoraria = { inicioMin: 9 * 60, finMin: 20 * 60, dias: [0, 1, 2, 3, 4, 5, 6] };

interface ParteLocal {
  anio: number;
  mes: number;
  dia: number;
  minutos: number;
  diaSemana: number;
}

const DIAS_ABREVIADOS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function partesLocales(instante: Date, zona: string): ParteLocal {
  const formato = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
  });
  const v: Record<string, string> = {};
  for (const p of formato.formatToParts(instante)) v[p.type] = p.value;
  return {
    anio: Number(v["year"]),
    mes: Number(v["month"]),
    dia: Number(v["day"]),
    minutos: Number(v["hour"]) * 60 + Number(v["minute"]),
    diaSemana: DIAS_ABREVIADOS.indexOf(v["weekday"] ?? ""),
  };
}

/** Diferencia (local - UTC) en minutos de esa zona en ese instante. */
function desfaseMin(instante: Date, zona: string): number {
  const p = partesLocales(instante, zona);
  const comoUtc = Date.UTC(p.anio, p.mes - 1, p.dia, 0, p.minutos);
  const alMinuto = Math.floor(instante.getTime() / 60_000) * 60_000;
  return (comoUtc - alMinuto) / 60_000;
}

/** El instante UTC que en esa zona es la fecha y la hora local dadas. */
function instanteLocal(anio: number, mes: number, dia: number, minutos: number, zona: string): Date {
  const supuesto = Date.UTC(anio, mes - 1, dia, 0, minutos);
  let resultado = supuesto - desfaseMin(new Date(supuesto), zona) * 60_000;
  // Si el desfase cambió entre el supuesto y el resultado (cambio de horario), se corrige.
  const corregido = supuesto - desfaseMin(new Date(resultado), zona) * 60_000;
  if (corregido !== resultado) resultado = corregido;
  return new Date(resultado);
}

/** true si es hora de envío en esa zona: dentro de [inicio, fin) y en un día permitido. */
export function dentroDeHorario(instante: Date, zona: string, ventana: VentanaHoraria = HORARIO_DE_ENVIO): boolean {
  const p = partesLocales(instante, zona);
  return p.minutos >= ventana.inicioMin && p.minutos < ventana.finMin && ventana.dias.includes(p.diaSemana);
}

/** El primer instante >= `desde` en que se puede mandar. Si ya lo es, `desde`. */
export function siguienteHorarioValido(desde: Date, zona: string, ventana: VentanaHoraria = HORARIO_DE_ENVIO): Date {
  if (dentroDeHorario(desde, zona, ventana)) return desde;
  const hoy = partesLocales(desde, zona);
  for (let i = 0; i <= 8; i++) {
    const dia = new Date(Date.UTC(hoy.anio, hoy.mes - 1, hoy.dia + i));
    if (!ventana.dias.includes(dia.getUTCDay())) continue;
    const candidato = instanteLocal(dia.getUTCFullYear(), dia.getUTCMonth() + 1, dia.getUTCDate(), ventana.inicioMin, zona);
    if (candidato.getTime() > desde.getTime()) return candidato;
  }
  throw new Error("La ventana horaria no tiene ningún día permitido");
}

/**
 * Recorre lo programado fuera de horario al siguiente horario válido. Si con eso llegaría
 * después del evento (`limite`), devuelve null: se descarta y se registra, nunca se manda tarde.
 */
export function recorrerODescartar(
  programado: Date,
  zona: string,
  limite: Date | null,
  ventana: VentanaHoraria = HORARIO_DE_ENVIO,
): Date | null {
  const siguiente = siguienteHorarioValido(programado, zona, ventana);
  return limite && siguiente.getTime() > limite.getTime() ? null : siguiente;
}
