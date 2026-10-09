// Aviso a la familia cuando una PERSONA (asesor, administrador o maestro) reprograma o cancela su clase muestra (V2, decisión 4).
//
// Cómo funciona. Es un aviso de SERVICIO sobre algo que la familia ya había acordado (invariante 6: sale aunque una persona esté atendiendo la conversación). Lo mandan
// automatizaciones de dos eventos propios, `clase_muestra_reprogramada` y `clase_muestra_cancelada`, con su plantilla de clase «servicio»: el motor las ejecuta y MessagingProvider decide
// con TODAS sus reglas (baja, ventana de servicio de 24 h y plantilla aprobada, horario 09:00–20:00 de la sucursal, frecuencia). Aquí solo se PROGRAMA, en la misma transacción
// del cambio, y se deja la tarea para el asesor cuando el aviso no puede salir a tiempo.
//
//   · UN aviso por cambio (invariante 8): la ejecución es `(automatización, clase_muestra, clase, ocurrencia 1)` y la clase es la NUEVA (reprogramada) o la cancelada. Reintentar
//     el mismo cambio no manda dos (la clase ya no está agendada: el cambio se rechaza antes); reprogramar dos veces son dos clases nuevas y por eso dos avisos distintos.
//   · SI LA FAMILIA MISMA cambió su clase (por el bot, en la conversación) NO hay aviso: ya se le confirmó ahí. Solo avisa quien llama con `origen = usuario`.
//   · HORARIO (invariante 14, igual que el recordatorio): lo que cae fuera de 09:00–20:00 (o de la ventana propia de la automatización, nunca más ancha) se recorre al siguiente
//     horario válido; si con eso llegaría a la hora de la clase o después, se descarta (`evento_pasado`) y se crea la tarea para el asesor: llamar a la familia. Una clase que ya empezó
//     no se avisa (`ya_paso_el_momento`, sin tarea: ya no hay nada que avisar).
//   · Lo que se manda solo vale mientras el cambio siga siendo el último: si antes de que salga el aviso la clase vuelve a cambiar, el motor lo omite (`clase_no_vigente`) y sale el del
//     cambio nuevo, con la fecha buena.
//   · Si la escuela no tiene la automatización (la plantilla de una organización nueva no las trae) no sale nada: es una configuración, no un olvido.

import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import { siguienteHorarioValido, type VentanaHoraria } from "../mensajeria/reglas.ts";
import { leerModulos } from "../modulos/index.ts";
import { describirSesion } from "./sesiones.ts";

const MINUTO_MS = 60_000;

/** Qué cambio hizo la persona y el evento de automatización que lo avisa. */
export const EVENTO_DE_CAMBIO = { reprogramada: "clase_muestra_reprogramada", cancelada: "clase_muestra_cancelada" } as const;
export type TipoDeCambioDeClase = keyof typeof EVENTO_DE_CAMBIO;

export function esEventoDeCambioDeClase(evento: string): evento is (typeof EVENTO_DE_CAMBIO)[TipoDeCambioDeClase] {
  return evento === EVENTO_DE_CAMBIO.reprogramada || evento === EVENTO_DE_CAMBIO.cancelada;
}

export interface AutomatizacionDeAviso {
  id: string;
  /** Minutos DESPUÉS del cambio (0 = en cuanto el horario lo permita). */
  offset_minutos: number;
  hora_inicio_min: number;
  hora_fin_min: number;
  dias_permitidos: readonly number[];
}

export type MotivoDeDescarteDeAviso = "ya_paso_el_momento" | "evento_pasado";

export interface AvisoPlaneado {
  automatizacionId: string;
  /** El cambio + el desfase, sin recorrer. */
  nominal: Date;
  /** Cuándo saldrá; null si se descarta. */
  programadoPara: Date | null;
  motivo: MotivoDeDescarteDeAviso | null;
}

/** Cuándo sale el aviso de un cambio hecho `ahora` sobre una clase que empieza en `inicio`. PURA. */
export function planearAvisosDeCambio(e: { inicio: Date; zonaHoraria: string; ahora: Date; automatizaciones: readonly AutomatizacionDeAviso[] }): AvisoPlaneado[] {
  return e.automatizaciones.map((a) => {
    const nominal = new Date(e.ahora.getTime() + a.offset_minutos * MINUTO_MS);
    // La clase ya empezó (o está empezando): no hay nada que avisar.
    if (e.inicio.getTime() <= e.ahora.getTime()) return { automatizacionId: a.id, nominal, programadoPara: null, motivo: "ya_paso_el_momento" as const };
    const ventana: VentanaHoraria = { inicioMin: a.hora_inicio_min, finMin: a.hora_fin_min, dias: a.dias_permitidos };
    const programado = siguienteHorarioValido(nominal, e.zonaHoraria, ventana);
    // Posterior o IGUAL al inicio: llegaría tarde. Se descarta y una persona llama.
    if (programado.getTime() >= e.inicio.getTime()) return { automatizacionId: a.id, nominal, programadoPara: null, motivo: "evento_pasado" as const };
    return { automatizacionId: a.id, nominal, programadoPara: programado, motivo: null };
  });
}

/** Por qué el aviso no salió, en palabras para la tarea del asesor. */
export type PorQueNoSalio = "fuera_de_horario" | "sin_conversacion" | "tope_frecuencia";
const TEXTO_DE_POR_QUE: Record<PorQueNoSalio, string> = {
  fuera_de_horario: "ya es fuera del horario de mensajes y la clase empieza antes de que pueda salir",
  sin_conversacion: "la familia no tiene una conversación de WhatsApp",
  tope_frecuencia: "la familia ya recibió el máximo de mensajes automáticos del día",
};

/** El texto de la tarea para el asesor (sin datos de salud: solo nombre de pila del alumno y la fecha de la clase). */
export function descripcionDeTareaDeCambio(e: { tipo: TipoDeCambioDeClase; nombre: string; fecha: string; hora: string; porQue: PorQueNoSalio }): string {
  const hecho = e.tipo === "cancelada" ? `La clase muestra de ${e.nombre} del ${e.fecha} a las ${e.hora} se canceló` : `La clase muestra de ${e.nombre} cambió al ${e.fecha} a las ${e.hora}`;
  return `${hecho} y no se le pudo avisar a la familia por WhatsApp (${TEXTO_DE_POR_QUE[e.porQue]}). Llámale y avísale del cambio.`;
}

interface ClaseParaAviso {
  id: string;
  estatus: string;
  fecha_hora: Date;
  lead_id: string;
  prospecto: { nombre: string | null };
  grupo: { programa: { vertical_id: string; sucursal_id: string; sucursal: { zona_horaria: string } } };
}

async function cargarClaseParaAviso(tx: Consultas, claseId: string): Promise<ClaseParaAviso | null> {
  return tx.clase_muestra.findFirst({
    where: { id: claseId },
    select: { id: true, estatus: true, fecha_hora: true, lead_id: true, prospecto: { select: { nombre: true } }, grupo: { select: { programa: { select: { vertical_id: true, sucursal_id: true, sucursal: { select: { zona_horaria: true } } } } } } },
  });
}

/**
 * Una tarea para el asesor: avisarle a la familia a mano del cambio de su clase. Una pendiente por clase. Dentro de la transacción de quien llama (consulta antes de crear: el choque
 * de un índice único abortaría la transacción). Devuelve true si la creó.
 */
export async function asegurarTareaDeCambioDeClase(tx: Consultas, e: { claseId: string; tipo: TipoDeCambioDeClase; porQue: PorQueNoSalio; ahora: Date }): Promise<boolean> {
  const clase = await cargarClaseParaAviso(tx, e.claseId);
  if (!clase) return false;
  const pendiente = await tx.tarea_asesor.findFirst({ where: { clase_muestra_id: clase.id, tipo: "avisar_cambio_de_clase", estado: "pendiente" }, select: { id: true } });
  if (pendiente) return false;
  const { fecha, hora } = describirSesion(clase.fecha_hora, clase.grupo.programa.sucursal.zona_horaria);
  await tx.tarea_asesor.create({
    data: altaConAlcance({
      lead_id: clase.lead_id,
      clase_muestra_id: clase.id,
      tipo: "avisar_cambio_de_clase" as const,
      descripcion: descripcionDeTareaDeCambio({ tipo: e.tipo, nombre: clase.prospecto.nombre ?? "un alumno", fecha, hora, porQue: e.porQue }),
      // Para una clase reprogramada, avisar tiene sentido hasta que empiece. Una cancelada, igual.
      ...(clase.fecha_hora.getTime() > e.ahora.getTime() ? { vence_en: clase.fecha_hora } : {}),
    }),
  });
  return true;
}

export interface ResumenDeAviso {
  programados: number;
  descartados: number;
  /** Ya existían (un reintento no duplica). */
  existentes: number;
  /** Se creó la tarea para el asesor (el aviso no pudo salir a tiempo). */
  tarea: boolean;
}

/**
 * Programa el aviso del cambio de la clase `claseId` (la nueva, si se reprogramó; la cancelada, si se canceló). Dentro de la transacción del cambio. Idempotente.
 * Las automatizaciones aplicables son las activas del evento de la vertical y la sucursal de la clase (las que no fijan vertical o sucursal valen para todas).
 */
export async function programarAvisoDeCambio(tx: Consultas, e: { claseId: string; tipo: TipoDeCambioDeClase; ahora: Date }): Promise<ResumenDeAviso> {
  const nada: ResumenDeAviso = { programados: 0, descartados: 0, existentes: 0, tarea: false };
  // Con la clase muestra apagada para la escuela no corre nada de esto (las rutas ya no responden; esto cubre cualquier otro camino).
  if (!(await leerModulos(tx)).clase_muestra) return nada;
  const clase = await cargarClaseParaAviso(tx, e.claseId);
  if (!clase) return nada;
  const { vertical_id, sucursal_id, sucursal } = clase.grupo.programa;
  const automatizaciones = await tx.automatizacion.findMany({
    where: { activo: true, evento_disparador: EVENTO_DE_CAMBIO[e.tipo], AND: [{ OR: [{ vertical_id: null }, { vertical_id }] }, { OR: [{ sucursal_id: null }, { sucursal_id }] }] },
    select: { id: true, offset_minutos: true, hora_inicio_min: true, hora_fin_min: true, dias_permitidos: true },
    orderBy: [{ offset_minutos: "asc" }, { id: "asc" }],
  });
  const plan = planearAvisosDeCambio({ inicio: clase.fecha_hora, zonaHoraria: sucursal.zona_horaria, ahora: e.ahora, automatizaciones });
  if (plan.length === 0) return nada;
  const r = await tx.automatizacion_ejecucion.createMany({
    data: plan.map((p) =>
      altaConAlcance({
        automatizacion_id: p.automatizacionId,
        entidad_tipo: "clase_muestra",
        entidad_id: clase.id,
        ocurrencia: 1,
        programado_para: p.programadoPara ?? p.nominal,
        estatus: p.programadoPara ? ("programado" as const) : ("descartado" as const),
        motivo_omision: p.motivo,
      }),
    ),
    skipDuplicates: true,
  });
  const descartados = plan.filter((p) => !p.programadoPara).length;
  // Llegaría tarde: una persona llama. (Una clase que ya empezó no lleva tarea.) Solo si ESTE aviso es nuevo: un reintento no repite la tarea.
  const llegariaTarde = r.count > 0 && plan.some((p) => p.motivo === "evento_pasado");
  const tarea = llegariaTarde ? await asegurarTareaDeCambioDeClase(tx, { claseId: clase.id, tipo: e.tipo, porQue: "fuera_de_horario", ahora: e.ahora }) : false;
  return { programados: Math.max(0, r.count - descartados), descartados: Math.min(r.count, descartados), existentes: plan.length - r.count, tarea };
}
