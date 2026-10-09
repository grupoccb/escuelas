// Reglas de envío. Puras: deciden con el estado de la conversación, la plantilla, la hora y el
// historial reciente, sin tocar base ni red. Solo MessagingProvider las llama (invariante 4).
//
// En orden de precedencia:
// 1. atención humana (invariante 6): bloquea al bot y al marketing, ni siquiera sale una nota interna. Lo único que sale con una persona
//    atendiendo es un aviso de SERVICIO iniciado por el sistema (plantilla que declara `clase_mensaje = servicio`): sigue sujeto a todo lo demás;
// 1b. obsoleto: un pendiente que lleva demasiado tiempo esperando ya no es de este momento (EA-09);
// 2. baja (opt-out) y conversación cerrada;
// 3. plantilla: lo que lleva plantilla debe ser una aprobada y activa;
// 4. ventana de servicio (invariante 5): fuera de ella solo cabe una plantilla aprobada;
// 5. horario (invariante 14): lo iniciado por el sistema solo sale de 09:00 a 20:00, hora local
//    de la sucursal. Contestar a quien acaba de escribir no tiene restricción de horario;
// 6. frecuencia (configurable por organización): tope diario de mensajes iniciados por el
//    sistema por teléfono y tope de mensajes de marketing en su ventana de días (EG-05: marketing es la CLASE declarada de la plantilla, no su categoría de Meta).
//
// "Iniciado por el sistema" NO depende de la etiqueta que ponga quien llama (F1-04): es todo
// saliente con origen distinto de `respuesta` y `confirmacion_baja`, y también el que lleva
// plantilla sin que haya un mensaje entrante vigente (ventana de servicio abierta) que contestar.

import type { EstadoConversacion, OrigenMensaje } from "../datos/tipos.ts";

export type TipoSaliente = "mensaje" | "nota_interna";

export type MotivoBloqueo =
  | "atencion_humana"
  | "obsoleto"
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

/** Lo que la plantilla DECLARA ser (INV-6), independiente de su categoría ante Meta. */
export type ClaseMensaje = "servicio" | "marketing";

export interface PlantillaParaReglas {
  /** Aprobada por Meta, activa, no borrada y válida para la vertical de la conversación. */
  enviable: boolean;
  categoria: "marketing" | "utility" | "authentication" | "servicio";
  /** Servicio o marketing. Cualquier valor distinto de `servicio` se trata como marketing (lo conservador). */
  clase: ClaseMensaje;
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
  /**
   * Horario de envío de la organización (V5): la escuela puede estrechar 09:00–20:00, nunca ampliarlo (CHECK en la base). Sin dato, el horario de siempre
   * (`HORARIO_DE_ENVIO`). Lo pone `MessagingProvider` con `configuracion_organizacion`.
   */
  horario?: VentanaHoraria;
  /** Mensajes automáticos ya enviados a este teléfono en las últimas 24 h. */
  automaticosRecientes: number;
  /** Tope diario (`max_automaticos_por_dia` de la configuración de la organización). */
  limiteFrecuencia: number;
  /** Mensajes de plantilla de marketing ya enviados a este teléfono dentro de la ventana de marketing. */
  marketingRecientes?: number;
  /** Tope de marketing por ventana (`max_marketing_por_ventana`). Sin dato, no se limita. */
  limiteMarketing?: number;
  /** Cuánto lleva el mensaje en `pendiente`. Con `vigenciaMs`, decide si ya es obsoleto. */
  edadMs?: number;
  /** Tope de espera de un pendiente antes de darlo por obsoleto. Sin dato, no caduca. */
  vigenciaMs?: number;
}

/** true si la ventana de servicio sigue abierta: hay un mensaje entrante vigente que contestar. */
export function ventanaServicioAbierta(ventanaServicioHasta: Date | null, ahora: Date): boolean {
  return ventanaServicioHasta !== null && ventanaServicioHasta.getTime() > ahora.getTime();
}

/**
 * true si el saliente lo inicia el sistema y no responde a nadie: le aplican el horario de envío
 * (invariante 14) y el tope de frecuencia. Pura; no confía en la etiqueta `origen`.
 */
export function esIniciadoPorSistema(e: { origen: OrigenMensaje; conLaPlantilla: boolean; ventanaAbierta: boolean }): boolean {
  if (e.origen !== "respuesta" && e.origen !== "confirmacion_baja") return true;
  return e.conLaPlantilla && !e.ventanaAbierta;
}

/** true si la plantilla es un aviso de servicio. Solo el valor exacto `servicio` lo es: lo ausente o raro es marketing. */
export function esDeServicio(plantilla: PlantillaParaReglas | null): boolean {
  return plantilla !== null && plantilla.clase === "servicio";
}

/**
 * INV-6: con `en_atencion_humana` solo sale un aviso de SERVICIO que inicia el sistema: un mensaje (no una nota interna) de origen
 * `automatizacion` que lleva una plantilla de clase `servicio`. Todo lo demás se bloquea: lo que contesta el bot (`respuesta`,
 * `confirmacion_baja`), el texto libre automático, las notas internas y cualquier plantilla de marketing.
 */
export function pasaConAtencionHumana(e: { tipo: TipoSaliente; origen: OrigenMensaje; plantilla: PlantillaParaReglas | null }): boolean {
  return e.tipo === "mensaje" && e.origen === "automatizacion" && esDeServicio(e.plantilla);
}

/** Devuelve el motivo por el que NO se puede mandar, o null si se puede. */
export function evaluarReglas(e: EntradaReglas): MotivoBloqueo | null {
  const { conv, tipo, origen, ahora, plantilla } = e;

  // INV-6: con una persona atendiendo el sistema no contesta ni hace marketing; el aviso de servicio sí sale (y sigue sujeto a lo demás).
  if (conv.estado === "en_atencion_humana" && !pasaConAtencionHumana({ tipo, origen, plantilla })) return "atencion_humana";
  // Un pendiente de hace días (el proceso murió entre encolarlo y mandarlo) saldría fuera de
  // contexto y antes de la respuesta nueva. No se manda y no hay tarea: el bot vuelve a preguntar
  // cuando el contacto escriba (EA-09). Aplica también a las notas: un resumen viejo engaña.
  if (e.edadMs !== undefined && e.vigenciaMs !== undefined && e.edadMs > e.vigenciaMs) return "obsoleto";
  if (tipo === "nota_interna") return null;

  // La confirmación de la baja es lo único que sale a quien ya la pidió. Es una respuesta a su
  // mensaje, así que sigue sujeta a la ventana de servicio.
  if (origen !== "confirmacion_baja") {
    if (conv.estado === "opt_out" || conv.dado_de_baja) return "opt_out";
    // La baja de marketing no bloquea los avisos de servicio; la baja total (arriba) bloquea todo.
    if (plantilla && (plantilla.categoria === "marketing" || !esDeServicio(plantilla)) && conv.dado_de_baja_marketing) return "opt_out";
    if (conv.estado === "cerrada") return "conversacion_cerrada";
  }

  if (plantilla && !plantilla.enviable) return "plantilla_no_apta";

  const ventanaAbierta = ventanaServicioAbierta(conv.ventana_servicio_hasta, ahora);
  if (!ventanaAbierta && !plantilla) return "fuera_de_ventana";

  if (esIniciadoPorSistema({ origen, conLaPlantilla: plantilla !== null, ventanaAbierta })) {
    if (!e.zonaHoraria) return "sin_zona_horaria";
    if (!dentroDeHorario(ahora, e.zonaHoraria, e.horario ?? HORARIO_DE_ENVIO)) return "fuera_de_horario";
    if (e.automaticosRecientes >= e.limiteFrecuencia) return "tope_frecuencia";
  }
  // El marketing tiene además su propio tope, en cualquier caso: una plantilla de marketing nunca
  // es "responder" a nadie, aunque la ventana de servicio esté abierta.
  // EG-05 (decisión de Eduardo): el tope se aplica por la CLASE declarada de la plantilla (`clase_mensaje = marketing`), no por la categoría de Meta: el reenganche y la recuperación de quien
  // no llegó son `utility` para Meta pero marketing para el negocio, y cuentan igual que cualquier otro marketing. Lo ausente o raro es marketing (lo conservador, como en `esDeServicio`).
  if (plantilla && !esDeServicio(plantilla) && (e.marketingRecientes ?? 0) >= (e.limiteMarketing ?? Number.POSITIVE_INFINITY)) {
    return "tope_frecuencia";
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

export interface ParteLocal {
  anio: number;
  mes: number;
  dia: number;
  minutos: number;
  diaSemana: number;
}

const DIAS_ABREVIADOS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** El reloj de pared de una zona IANA en ese instante: fecha, minutos desde la medianoche y día de la semana (0 = domingo). */
export function partesLocales(instante: Date, zona: string): ParteLocal {
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

/**
 * El instante UTC que en esa zona es la fecha y la hora local dadas. Una hora que NO existe (el salto de primavera) se
 * corre hacia adelante y una que existe dos veces (el retroceso de otoño) da la primera: quien necesite saber si la hora
 * local pedida existe compara `partesLocales(resultado)` con lo pedido (`instanteDeSesion`, D1).
 */
export function instanteLocal(anio: number, mes: number, dia: number, minutos: number, zona: string): Date {
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
 *
 * Por omisión el límite es inclusivo (llegar justo AL límite todavía vale). Con `limiteExclusivo` llegar al límite o
 * después se descarta: es el caso de un recordatorio, que no sirve a la hora en que empieza la clase (D3).
 */
export function recorrerODescartar(
  programado: Date,
  zona: string,
  limite: Date | null,
  ventana: VentanaHoraria = HORARIO_DE_ENVIO,
  limiteExclusivo = false,
): Date | null {
  const siguiente = siguienteHorarioValido(programado, zona, ventana);
  if (!limite) return siguiente;
  const pasado = limiteExclusivo ? siguiente.getTime() >= limite.getTime() : siguiente.getTime() > limite.getTime();
  return pasado ? null : siguiente;
}
