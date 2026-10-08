// Eventos de una vertical y quién participa (G4). Determinista (invariante 10).
//
// El CUPO del evento se reparte con una sola idea, la misma de los grupos (F4): se toma la fila del evento (`bloquearEvento`, un UPDATE que serializa a quien
// reparte lugares), se cuenta DESPUÉS y se inserta, todo en la misma transacción; y la base lo respalda con un disparador que falla cerrado
// (`evento_alumno_cupo`, migración `20261020010000_eventos`) por si algún código se equivoca o alguien escribe por SQL directo. Ocupan lugar los participantes
// vivos: convocado, confirmado, pagado y asistió.
//
// Solo se convoca a quien es ELEGIBLE por clases mínimas (`src/progresion/elegibilidad.ts`) cuando el evento otorga progresión. Otorgar el resultado «aprobado» crea
// el peldaño del alumno (`otorgarNivel`) en la misma transacción que el resultado: no puede quedar uno sin el otro.

import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import { hoyEn } from "../asistencia/pase.ts";
import { elegibilidadDe, type MotivoNoElegible } from "../progresion/elegibilidad.ts";
import { historialDeVertical, nivelesDeVertical, otorgarNivel, siguienteNivel, type MotivoDeRechazoDeNivel } from "../progresion/progresion.ts";

export const ESTATUS_DE_PARTICIPANTE = ["convocado", "confirmado", "pagado", "asistio"] as const;
export type EstatusDeParticipante = (typeof ESTATUS_DE_PARTICIPANTE)[number];
export const RESULTADOS_DE_EVENTO = ["aprobado", "no_aprobado"] as const;
export type ResultadoDeEvento = (typeof RESULTADOS_DE_EVENTO)[number];

const RANGO: Record<EstatusDeParticipante, number> = { convocado: 0, confirmado: 1, pagado: 2, asistio: 3 };
/** El estatus solo avanza: de un rango a uno MAYOR. */
export const puedeAvanzar = (de: EstatusDeParticipante, a: EstatusDeParticipante): boolean => RANGO[a] > RANGO[de];

/** Una regla del evento que rompe la transacción en curso (después de haber reclamado algo): quien llama la deja subir para revertirla. */
export class RechazoDeEvento extends Error {
  readonly motivo: string;
  constructor(motivo: string, mensaje: string) {
    super(mensaje);
    this.motivo = motivo;
  }
}

/** Toma la fila del evento: quien reparte lugares se forma en fila. false si el evento no existe (o es de otra organización). */
export async function bloquearEvento(tx: Consultas, eventoId: string): Promise<boolean> {
  const r = await tx.evento.updateMany({ where: { id: eventoId }, data: { actualizado_en: new Date() } });
  return r.count === 1;
}

export interface CupoDeEvento {
  cupo: number;
  ocupados: number;
  disponibles: number;
}

export async function cupoDelEvento(db: Consultas, eventoId: string): Promise<CupoDeEvento | null> {
  const e = await db.evento.findFirst({ where: { id: eventoId }, select: { cupo: true } });
  if (!e) return null;
  const ocupados = await db.evento_alumno.count({ where: { evento_id: eventoId } });
  return { cupo: e.cupo, ocupados, disponibles: Math.max(0, e.cupo - ocupados) };
}

interface EventoParaOperar {
  id: string;
  verticalId: string;
  fecha: string;
  cupo: number;
  otorgaProgresion: boolean;
  zona: string;
}

async function cargarEvento(tx: Consultas, eventoId: string): Promise<EventoParaOperar | null> {
  const e = await tx.evento.findFirst({ where: { id: eventoId }, select: { id: true, vertical_id: true, fecha: true, cupo: true, otorga_progresion: true, sucursal: { select: { zona_horaria: true } } } });
  return e ? { id: e.id, verticalId: e.vertical_id, fecha: e.fecha.toISOString().slice(0, 10), cupo: e.cupo, otorgaProgresion: e.otorga_progresion, zona: e.sucursal.zona_horaria } : null;
}

export type MotivoDeRechazoDeConvocatoria = "alumno_inexistente" | "evento_lleno" | MotivoNoElegible;

export interface ResultadoDeConvocatoria {
  convocados: { alumnoId: string; participanteId: string }[];
  yaConvocados: string[];
  rechazados: { alumnoId: string; motivo: MotivoDeRechazoDeConvocatoria; faltan?: number }[];
}

/**
 * Convoca a los alumnos al evento, en orden, bajo la fila del evento. Cada uno puede quedar convocado, ya estarlo (idempotente) o ser rechazado con su motivo:
 * no existe o no lo ve quien convoca, no es elegible (si el evento otorga progresión) o ya no hay lugar. Lo que cabe se convoca aunque otros se rechacen.
 */
export async function convocarAlumnos(
  tx: Consultas,
  p: { eventoId: string; alumnoIds: readonly string[]; usuarioId: string | null; alumnoVisible: Record<string, unknown>; alCambiar?: (tx: Consultas, c: { participanteId: string; alumnoId: string }) => Promise<void> },
): Promise<{ ok: true; resultado: ResultadoDeConvocatoria } | { ok: false; motivo: "evento_inexistente" }> {
  if (!(await bloquearEvento(tx, p.eventoId))) return { ok: false, motivo: "evento_inexistente" };
  const evento = await cargarEvento(tx, p.eventoId);
  if (!evento) return { ok: false, motivo: "evento_inexistente" };
  const resultado: ResultadoDeConvocatoria = { convocados: [], yaConvocados: [], rechazados: [] };
  let ocupados = await tx.evento_alumno.count({ where: { evento_id: p.eventoId } });
  for (const alumnoId of new Set(p.alumnoIds)) {
    if (!(await tx.alumno.findFirst({ where: { id: alumnoId, ...p.alumnoVisible }, select: { id: true } }))) {
      resultado.rechazados.push({ alumnoId, motivo: "alumno_inexistente" });
      continue;
    }
    if (await tx.evento_alumno.findFirst({ where: { evento_id: p.eventoId, alumno_id: alumnoId }, select: { id: true } })) {
      resultado.yaConvocados.push(alumnoId);
      continue;
    }
    // Solo se convoca a quien es alumno vigente de esa vertical; si el evento sube de peldaño, además tiene que ser elegible.
    const e = await elegibilidadDe(tx, alumnoId, evento.verticalId);
    if (e.motivo === "sin_inscripcion_activa" || (evento.otorgaProgresion && !e.elegible)) {
      resultado.rechazados.push({ alumnoId, motivo: e.motivo ?? "clases_insuficientes", ...(e.faltan > 0 ? { faltan: e.faltan } : {}) });
      continue;
    }
    if (ocupados >= evento.cupo) {
      resultado.rechazados.push({ alumnoId, motivo: "evento_lleno" });
      continue;
    }
    const fila = await tx.evento_alumno.create({ data: altaConAlcance({ evento_id: p.eventoId, alumno_id: alumnoId, registrado_por_usuario_id: p.usuarioId }), select: { id: true } });
    ocupados++;
    resultado.convocados.push({ alumnoId, participanteId: fila.id });
    await p.alCambiar?.(tx, { participanteId: fila.id, alumnoId });
  }
  return { ok: true, resultado };
}

export type ResultadoDeEstatus =
  | { ok: true; sinCambio: boolean; participanteId: string; antes: EstatusDeParticipante; despues: EstatusDeParticipante }
  | { ok: false; motivo: "participante_inexistente" | "transicion_invalida" | "evento_futuro" | "cambio_simultaneo"; mensaje: string };

/** Avanza el estatus de un participante (solo hacia adelante). `asistio` exige que el evento ya haya llegado (en la zona de su sucursal). Idempotente. */
export async function cambiarEstatus(tx: Consultas, p: { eventoId: string; alumnoId: string; estatus: EstatusDeParticipante; ahora: Date; usuarioId: string | null }): Promise<ResultadoDeEstatus> {
  const evento = await cargarEvento(tx, p.eventoId);
  const fila = await tx.evento_alumno.findFirst({ where: { evento_id: p.eventoId, alumno_id: p.alumnoId }, select: { id: true, estatus: true } });
  if (!evento || !fila) return { ok: false, motivo: "participante_inexistente", mensaje: "El alumno no está en este evento" };
  if (fila.estatus === p.estatus) return { ok: true, sinCambio: true, participanteId: fila.id, antes: fila.estatus, despues: fila.estatus };
  if (!puedeAvanzar(fila.estatus, p.estatus)) return { ok: false, motivo: "transicion_invalida", mensaje: `El estatus solo avanza: de «${fila.estatus}» no se pasa a «${p.estatus}»` };
  if (p.estatus === "asistio" && evento.fecha > hoyEn(evento.zona, p.ahora)) return { ok: false, motivo: "evento_futuro", mensaje: "El evento todavía no llega: no se puede marcar la asistencia" };
  // Cambio condicional: si otra petición lo movió entre la lectura y aquí, no se pisa.
  const r = await tx.evento_alumno.updateMany({ where: { id: fila.id, estatus: fila.estatus }, data: { estatus: p.estatus, registrado_por_usuario_id: p.usuarioId } });
  if (r.count !== 1) return { ok: false, motivo: "cambio_simultaneo", mensaje: "El estatus cambió mientras tanto; vuelve a intentarlo" };
  return { ok: true, sinCambio: false, participanteId: fila.id, antes: fila.estatus, despues: p.estatus };
}

export type ResultadoDelResultado =
  | { ok: true; sinCambio: boolean; participanteId: string; resultado: ResultadoDeEvento; progresionId: string | null; nivelId: string | null }
  | { ok: false; motivo: "participante_inexistente" | "no_asistio" | "resultado_ya_registrado"; mensaje: string };

/**
 * Registra el resultado de un participante que asistió y, si aprobó un evento que otorga progresión, le crea el peldaño (por omisión el siguiente al que tiene; o
 * el que se indique, que debe ser de la vertical y superior al actual). Idempotente: repetir el mismo resultado no cambia nada; uno distinto es un conflicto. Si
 * el peldaño no se puede otorgar lanza `RechazoDeEvento` y la transacción entera se revierte (el resultado no queda sin su peldaño).
 */
export async function registrarResultado(
  tx: Consultas,
  p: { eventoId: string; alumnoId: string; resultado: ResultadoDeEvento; nivelId?: string | null; ahora: Date; usuarioId: string | null; instructorId: string | null; observaciones?: string | null },
): Promise<ResultadoDelResultado> {
  const evento = await cargarEvento(tx, p.eventoId);
  const fila = await tx.evento_alumno.findFirst({ where: { evento_id: p.eventoId, alumno_id: p.alumnoId }, select: { id: true, estatus: true, resultado: true, nivel_otorgado_id: true } });
  if (!evento || !fila) return { ok: false, motivo: "participante_inexistente", mensaje: "El alumno no está en este evento" };
  if (fila.estatus !== "asistio") return { ok: false, motivo: "no_asistio", mensaje: "Solo se registra el resultado de quien asistió" };
  const yaRegistrado = async (resultado: ResultadoDeEvento): Promise<ResultadoDelResultado> => {
    if (resultado !== p.resultado) return { ok: false, motivo: "resultado_ya_registrado", mensaje: `El resultado ya se registró como «${resultado}»` };
    const prog = await tx.alumno_progresion.findFirst({ where: { evento_id: p.eventoId, alumno_id: p.alumnoId }, select: { id: true } });
    return { ok: true, sinCambio: true, participanteId: fila.id, resultado, progresionId: prog?.id ?? null, nivelId: fila.nivel_otorgado_id };
  };
  if (fila.resultado) return yaRegistrado(fila.resultado);

  // Se reclama el resultado con un cambio condicional (solo si sigue sin resultado): quien llegue después lo ve ya puesto.
  const reclamo = await tx.evento_alumno.updateMany({ where: { id: fila.id, resultado: null }, data: { resultado: p.resultado, registrado_por_usuario_id: p.usuarioId } });
  if (reclamo.count !== 1) {
    const ahoraFila = await tx.evento_alumno.findFirst({ where: { id: fila.id }, select: { resultado: true, nivel_otorgado_id: true } });
    if (ahoraFila?.resultado) return yaRegistrado(ahoraFila.resultado);
    return { ok: false, motivo: "participante_inexistente", mensaje: "El alumno ya no está en este evento" };
  }

  let progresionId: string | null = null;
  let nivelId: string | null = null;
  if (p.resultado === "aprobado" && evento.otorgaProgresion) {
    const niveles = await nivelesDeVertical(tx, evento.verticalId);
    const actual = (await historialDeVertical(tx, p.alumnoId, evento.verticalId))[0] ?? null;
    const elegido = p.nivelId ? niveles.find((n) => n.id === p.nivelId) : siguienteNivel(niveles, actual?.nivel ?? null);
    if (p.nivelId && !elegido) throw new RechazoDeEvento("nivel_de_otra_vertical", "Ese nivel no es de la vertical del evento");
    if (!elegido) throw new RechazoDeEvento("sin_siguiente_nivel", "El alumno ya está en el último nivel: no hay a dónde subir");
    if (p.nivelId && actual && elegido.orden <= actual.nivel.orden) throw new RechazoDeEvento("nivel_no_superior", "El nivel que se otorga tiene que ser superior al que ya tiene");
    const r = await otorgarNivel(tx, { alumnoId: p.alumnoId, nivelId: elegido.id, fechaObtenido: evento.fecha, ahora: p.ahora, usuarioId: p.usuarioId, instructorId: p.instructorId, eventoId: p.eventoId, observaciones: p.observaciones ?? null });
    if (!r.ok) throw new RechazoDeEvento(r.motivo satisfies MotivoDeRechazoDeNivel, r.mensaje);
    progresionId = r.progresionId;
    nivelId = elegido.id;
    await tx.evento_alumno.updateMany({ where: { id: fila.id }, data: { nivel_otorgado_id: elegido.id } });
  }
  return { ok: true, sinCambio: false, participanteId: fila.id, resultado: p.resultado, progresionId, nivelId };
}
