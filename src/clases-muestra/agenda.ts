// Agendar, reprogramar y cancelar la clase muestra (D1), desde el bot o desde una persona.
//
// Una clase muestra OCUPA UN LUGAR de su sesión (el instante concreto en que da clase el grupo):
//
//   lugares de la sesión = cupo_maximo − ocupados(grupo) − clases muestra AGENDADAS de esa fecha
//
// «Ocupados» sale de la `FuenteOcupacion` (hoy sin inscripciones; F4 pone la real). La última plaza de una sesión la gana
// una sola persona: todo el que reparte lugares de un grupo toma antes `bloquearCupoDeGrupo` (el candado del cupo) y
// cuenta DESPUÉS de tomarlo. Reprogramar es cancelar la anterior y agendar la nueva en UNA transacción: si la nueva no
// tiene lugar no se escribe nada y la anterior sigue intacta. Cancelar libera el lugar.
//
// Todo corre DENTRO de la transacción del llamador (el mensaje del bot, la escritura de la API con su registro de cambios):
// si el llamador revierte, no queda nada. Las funciones no lanzan por reglas de negocio: devuelven `{ ok: false, motivo }`.

import { bloquearCupoDeGrupo, type FuenteOcupacion } from "../catalogo/cupo.ts";
import { leerConfiguracion } from "../configuracion/index.ts";
import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import { etapaDeSistema, moverLeadAEtapa, tipoDeEtapaDelLead } from "../embudo/etapas.ts";
import { crearAvisoMaestro } from "./avisos.ts";
import { trasladarRegistroDeClase } from "./registro.ts";
import { darPorRecuperadoAlProspecto } from "./asistencia.ts";
import { cancelarRecordatoriosDeClase, programarRecordatoriosDeClase } from "./recordatorios.ts";
import { problemaDeFecha, sesionesAgendables, type HorarioDeGrupo, type ProblemaDeFecha } from "./sesiones.ts";

export type OrigenDeAgenda = { tipo: "bot"; conversacionId: string } | { tipo: "usuario"; usuarioId: string };

export interface ContextoDeAgenda {
  ahora: Date;
  fuente: FuenteOcupacion;
  origen: OrigenDeAgenda;
}

export type MotivoDeRechazo =
  | "prospecto_inexistente"
  | "grupo_inexistente"
  | "grupo_de_otra_vertical"
  | ProblemaDeFecha
  | "sin_lugar"
  | "ya_tiene_clase"
  | "clase_no_vigente"
  | "misma_sesion";

export interface ClaseAgendada {
  id: string;
  leadId: string;
  prospectoId: string;
  grupoId: string;
  sucursalId: string;
  fechaHora: Date;
  zonaHoraria: string;
  reprogramadaDeId: string | null;
}

export type ResultadoDeAgenda = { ok: true; clase: ClaseAgendada } | { ok: false; motivo: MotivoDeRechazo };

// ── Lugares de una sesión ────────────────────────────────────────────────────────────────────────────────

export interface LugaresDeSesion {
  cupoMaximo: number;
  ocupados: number;
  muestras: number;
  /** Lo que queda: nunca negativo. */
  lugares: number;
}

/** Cálculo puro: cupo − ocupados − muestras de esa fecha, sin bajar de cero. */
export function calcularLugaresDeSesion(cupoMaximo: number, ocupados: number, muestras: number): LugaresDeSesion {
  for (const [nombre, v] of [["cupoMaximo", cupoMaximo], ["ocupados", ocupados], ["muestras", muestras]] as const) {
    if (!Number.isInteger(v) || v < 0) throw new RangeError(`${nombre} inválido: ${v}`);
  }
  return { cupoMaximo, ocupados, muestras, lugares: Math.max(0, cupoMaximo - ocupados - muestras) };
}

/** Las clases muestra agendadas en esa sesión del grupo. */
export async function muestrasAgendadasEn(tx: Consultas, grupoId: string, fechaHora: Date): Promise<number> {
  return tx.clase_muestra.count({ where: { grupo_id: grupoId, fecha_hora: fechaHora, estatus: "agendada" } });
}

/** Los lugares de una sesión de un grupo. Para decidir con exactitud, llamarla DESPUÉS de `bloquearCupoDeGrupo`. */
export async function lugaresDeSesion(tx: Consultas, fuente: FuenteOcupacion, grupo: { id: string; cupo_maximo: number }, fechaHora: Date): Promise<LugaresDeSesion> {
  return calcularLugaresDeSesion(grupo.cupo_maximo, await fuente.ocupados(tx, grupo.id), await muestrasAgendadasEn(tx, grupo.id, fechaHora));
}

// ── Lo que un grupo ofrece ───────────────────────────────────────────────────────────────────────────────

interface GrupoParaAgenda {
  id: string;
  cupo_maximo: number;
  programaId: string;
  verticalId: string;
  sucursalId: string;
  zona: string;
  horarios: HorarioDeGrupo[];
}

/** El grupo activo (de un programa y una sucursal activos) con su zona horaria y sus horarios; null si no se puede agendar en él. */
export async function cargarGrupoParaAgenda(tx: Consultas, grupoId: string): Promise<GrupoParaAgenda | null> {
  const g = await tx.grupo.findFirst({ where: { id: grupoId, activo: true }, select: { id: true, cupo_maximo: true, programa_id: true } });
  if (!g) return null;
  const p = await tx.programa.findFirst({ where: { id: g.programa_id, activo: true }, select: { vertical_id: true, sucursal_id: true } });
  if (!p) return null;
  const s = await tx.sucursal.findFirst({ where: { id: p.sucursal_id, activo: true }, select: { zona_horaria: true } });
  if (!s) return null;
  const horarios = await tx.grupo_horario.findMany({ where: { grupo_id: g.id }, select: { dia_semana: true, hora_inicio_min: true } });
  return { id: g.id, cupo_maximo: g.cupo_maximo, programaId: g.programa_id, verticalId: p.vertical_id, sucursalId: p.sucursal_id, zona: s.zona_horaria, horarios };
}

export interface SesionConLugares {
  fechaHora: Date;
  lugares: number;
}

/**
 * Las próximas sesiones del grupo en las que se puede agendar HOY (con la anticipación y el horizonte de la configuración)
 * y que todavía tienen lugar, a lo más `maximo`. Es una lectura: para reservar, `agendarClaseMuestra` vuelve a contar bajo el
 * candado. `incluirLlenas` deja también las que ya no tienen lugar (la interfaz las muestra tachadas).
 */
export async function proximasSesionesConLugar(
  tx: Consultas,
  fuente: FuenteOcupacion,
  grupoId: string,
  ahora: Date,
  o: { maximo: number; incluirLlenas?: boolean; excluirClaseId?: string },
): Promise<SesionConLugares[]> {
  const grupo = await cargarGrupoParaAgenda(tx, grupoId);
  if (!grupo) return [];
  const config = await leerConfiguracion(tx);
  const ocupados = await fuente.ocupados(tx, grupo.id);
  const salida: SesionConLugares[] = [];
  for (const fechaHora of sesionesAgendables({ ahora, horarios: grupo.horarios, zona: grupo.zona, anticipacionMin: config.claseMuestraAnticipacionMin, horizonteDias: config.claseMuestraHorizonteDias })) {
    const muestras = await tx.clase_muestra.count({ where: { grupo_id: grupo.id, fecha_hora: fechaHora, estatus: "agendada", ...(o.excluirClaseId ? { id: { not: o.excluirClaseId } } : {}) } });
    const { lugares } = calcularLugaresDeSesion(grupo.cupo_maximo, ocupados, muestras);
    if (lugares > 0 || o.incluirLlenas) salida.push({ fechaHora, lugares });
    if (salida.length >= o.maximo) break;
  }
  return salida;
}

// ── Validación y reserva ─────────────────────────────────────────────────────────────────────────────────

/**
 * Lo común de agendar y reprogramar, YA bajo el candado de los grupos: comprueba la vertical, que la fecha sea una sesión
 * agendable y que haya lugar. `excluirClaseId` es la clase que se está reemplazando (no cuenta como duplicada ni ocupa lugar).
 */
async function comprobarSesion(
  tx: Consultas,
  c: ContextoDeAgenda,
  e: { prospecto: { id: string; vertical_interes_id: string }; grupo: GrupoParaAgenda; fechaHora: Date; excluirClaseId?: string },
): Promise<MotivoDeRechazo | null> {
  if (e.grupo.verticalId !== e.prospecto.vertical_interes_id) return "grupo_de_otra_vertical";
  const config = await leerConfiguracion(tx);
  const problema = problemaDeFecha(e.fechaHora, { ahora: c.ahora, horarios: e.grupo.horarios, zona: e.grupo.zona, anticipacionMin: config.claseMuestraAnticipacionMin, horizonteDias: config.claseMuestraHorizonteDias });
  if (problema) return problema;
  const repetida = await tx.clase_muestra.findFirst({
    where: { prospecto_id: e.prospecto.id, grupo_id: e.grupo.id, estatus: "agendada", ...(e.excluirClaseId ? { id: { not: e.excluirClaseId } } : {}) },
    select: { id: true },
  });
  if (repetida) return "ya_tiene_clase";
  const ocupados = await c.fuente.ocupados(tx, e.grupo.id);
  const muestras = await tx.clase_muestra.count({ where: { grupo_id: e.grupo.id, fecha_hora: e.fechaHora, estatus: "agendada", ...(e.excluirClaseId ? { id: { not: e.excluirClaseId } } : {}) } });
  return calcularLugaresDeSesion(e.grupo.cupo_maximo, ocupados, muestras).lugares >= 1 ? null : "sin_lugar";
}

/** Toma el candado de cada grupo, en orden de id (dos reprogramaciones cruzadas no se interbloquean). false si alguno no existe. */
async function bloquearGrupos(tx: Consultas, ids: readonly string[]): Promise<boolean> {
  for (const id of [...new Set(ids)].sort()) if (!(await bloquearCupoDeGrupo(tx, id))) return false;
  return true;
}

async function crearClase(
  tx: Consultas,
  c: ContextoDeAgenda,
  e: { prospecto: { id: string; lead_id: string }; grupo: GrupoParaAgenda; fechaHora: Date; notas?: string | null; reprogramadaDeId?: string },
): Promise<ClaseAgendada> {
  const origen = c.origen.tipo === "bot" ? { agendada_por: "bot" as const, conversacion_id: c.origen.conversacionId } : { agendada_por: "usuario" as const, agendada_por_usuario_id: c.origen.usuarioId };
  const creada = await tx.clase_muestra.create({
    data: altaConAlcance({
      lead_id: e.prospecto.lead_id,
      prospecto_id: e.prospecto.id,
      grupo_id: e.grupo.id,
      fecha_hora: e.fechaHora,
      notas: e.notas ?? null,
      ...(e.reprogramadaDeId ? { reprogramada_de_id: e.reprogramadaDeId } : {}),
      ...origen,
    }),
    select: { id: true },
  });
  // El lead queda en la sucursal de la clase: de ahí sale su horario de envío (invariante 14) y quién lo atiende.
  await tx.lead.updateMany({ where: { id: e.prospecto.lead_id, OR: [{ sucursal_interes_id: null }, { sucursal_interes_id: { not: e.grupo.sucursalId } }] }, data: { sucursal_interes_id: e.grupo.sucursalId } });
  return { id: creada.id, leadId: e.prospecto.lead_id, prospectoId: e.prospecto.id, grupoId: e.grupo.id, sucursalId: e.grupo.sucursalId, fechaHora: e.fechaHora, zonaHoraria: e.grupo.zona, reprogramadaDeId: e.reprogramadaDeId ?? null };
}

// ── Agendar ──────────────────────────────────────────────────────────────────────────────────────────────

export interface EntradaDeAgenda {
  prospectoId: string;
  grupoId: string;
  fechaHora: Date;
  notas?: string | null;
}

/** Agenda la clase muestra de un prospecto en una sesión de un grupo. Mueve al lead a la etapa «clase muestra agendada». */
export async function agendarClaseMuestra(tx: Consultas, c: ContextoDeAgenda, entrada: EntradaDeAgenda): Promise<ResultadoDeAgenda> {
  const prospecto = await tx.prospecto.findFirst({ where: { id: entrada.prospectoId }, select: { id: true, lead_id: true, vertical_interes_id: true } });
  if (!prospecto) return { ok: false, motivo: "prospecto_inexistente" };
  if (!(await bloquearCupoDeGrupo(tx, entrada.grupoId))) return { ok: false, motivo: "grupo_inexistente" };
  const grupo = await cargarGrupoParaAgenda(tx, entrada.grupoId);
  if (!grupo) return { ok: false, motivo: "grupo_inexistente" };
  const motivo = await comprobarSesion(tx, c, { prospecto, grupo, fechaHora: entrada.fechaHora });
  if (motivo) return { ok: false, motivo };

  const clase = await crearClase(tx, c, { prospecto, grupo, fechaHora: entrada.fechaHora, notas: entrada.notas ?? null });
  await moverLeadAEtapa(tx, prospecto.lead_id, "muestra_agendada", { motivo: "clase_muestra_agendada", ahora: c.ahora });
  await crearAvisoMaestro(tx, { claseId: clase.id, tipo: "agendada", ahora: c.ahora }); // D2: al instructor del grupo
  await programarRecordatoriosDeClase(tx, clase.id, c.ahora); // D3: 24 h y 2 h antes, al lead
  await darPorRecuperadoAlProspecto(tx, prospecto.id, c.ahora); // D4: si antes no llegó, ya volvió a agendar: la recuperación sobra
  return { ok: true, clase };
}

// ── Reprogramar ──────────────────────────────────────────────────────────────────────────────────────────

export interface EntradaDeReprogramacion {
  claseId: string;
  fechaHora: Date;
  /** Otro grupo (por omisión, el mismo). */
  grupoId?: string;
  notas?: string | null;
}

/**
 * Cancela la clase vigente y agenda la nueva en la misma transacción. Si la nueva no cabe (no es sesión, sin lugar…) NO se
 * escribe nada: la anterior sigue agendada. La anterior queda `reagendada` y la nueva apunta a ella.
 */
export async function reprogramarClaseMuestra(tx: Consultas, c: ContextoDeAgenda, entrada: EntradaDeReprogramacion): Promise<ResultadoDeAgenda & { anterior?: ClaseAnterior }> {
  const vieja = await tx.clase_muestra.findFirst({ where: { id: entrada.claseId }, select: { id: true, estatus: true, lead_id: true, prospecto_id: true, grupo_id: true, fecha_hora: true } });
  if (!vieja || vieja.estatus !== "agendada") return { ok: false, motivo: "clase_no_vigente" };
  const grupoId = entrada.grupoId ?? vieja.grupo_id;
  if (grupoId === vieja.grupo_id && entrada.fechaHora.getTime() === vieja.fecha_hora.getTime()) return { ok: false, motivo: "misma_sesion" };

  const prospecto = await tx.prospecto.findFirst({ where: { id: vieja.prospecto_id }, select: { id: true, lead_id: true, vertical_interes_id: true } });
  if (!prospecto) return { ok: false, motivo: "prospecto_inexistente" };
  if (!(await bloquearGrupos(tx, [vieja.grupo_id, grupoId]))) return { ok: false, motivo: "grupo_inexistente" };
  // ED-07: con los candados en la mano, la clase se vuelve a leer: otra reprogramación o cancelación simultánea pudo cerrarla mientras esperábamos, y
  // entonces el motivo verdadero es que «ya no está agendada» (no que el prospecto «ya tiene una clase» en ese grupo, que es la que dejó la ganadora).
  if (!(await tx.clase_muestra.findFirst({ where: { id: vieja.id, estatus: "agendada" }, select: { id: true } }))) return { ok: false, motivo: "clase_no_vigente" };
  const grupo = await cargarGrupoParaAgenda(tx, grupoId);
  if (!grupo) return { ok: false, motivo: "grupo_inexistente" };
  const motivo = await comprobarSesion(tx, c, { prospecto, grupo, fechaHora: entrada.fechaHora, excluirClaseId: vieja.id });
  if (motivo) return { ok: false, motivo };

  // Todo cabe: ahora sí se escribe. El cambio de estatus es condicional: si otra operación cerró la clase mientras tanto, no se pisa.
  const cerrada = await tx.clase_muestra.updateMany({ where: { id: vieja.id, estatus: "agendada" }, data: { estatus: "reagendada" } });
  if (cerrada.count !== 1) return { ok: false, motivo: "clase_no_vigente" };
  const clase = await crearClase(tx, c, { prospecto, grupo, fechaHora: entrada.fechaHora, notas: entrada.notas ?? null, reprogramadaDeId: vieja.id });
  await trasladarRegistroDeClase(tx, vieja.id, clase.id); // D5: lo capturado es del alumno, no de la fecha
  // D2: el instructor del grupo nuevo recibe «reprogramada» (con la fecha anterior); si la clase cambió de instructor, el de antes recibe «cancelada».
  const grupoViejo = await tx.grupo.findFirst({ where: { id: vieja.grupo_id }, select: { instructor_id: true, programa: { select: { sucursal: { select: { zona_horaria: true } } } } } });
  const zonaVieja = grupoViejo?.programa.sucursal.zona_horaria ?? grupo.zona;
  if (grupoViejo?.instructor_id && grupoViejo.instructor_id !== (await instructorDe(tx, grupo.id))) await crearAvisoMaestro(tx, { claseId: vieja.id, tipo: "cancelada", ahora: c.ahora });
  await crearAvisoMaestro(tx, { claseId: clase.id, tipo: "reprogramada", ahora: c.ahora, anterior: { fechaHora: vieja.fecha_hora, zonaHoraria: zonaVieja } });
  // D3: los recordatorios pendientes de la anterior se cancelan y se programan los de la nueva.
  await cancelarRecordatoriosDeClase(tx, vieja.id, "clase_reprogramada");
  await programarRecordatoriosDeClase(tx, clase.id, c.ahora);
  return { ok: true, clase, anterior: { id: vieja.id, grupoId: vieja.grupo_id, fechaHora: vieja.fecha_hora, prospectoId: vieja.prospecto_id, leadId: vieja.lead_id } };
}

/** Lo que se sabía de la clase que una reprogramación reemplazó. */
export interface ClaseAnterior {
  id: string;
  grupoId: string;
  fechaHora: Date;
  prospectoId: string;
  leadId: string;
}

async function instructorDe(tx: Consultas, grupoId: string): Promise<string | null> {
  return (await tx.grupo.findFirst({ where: { id: grupoId }, select: { instructor_id: true } }))?.instructor_id ?? null;
}

// ── Cancelar ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Cancela una clase vigente: libera el lugar. Si era la única clase vigente del lead y estaba en la etapa «clase muestra
 * agendada», vuelve a «contactado» (si la organización la tiene configurada).
 */
export async function cancelarClaseMuestra(tx: Consultas, claseId: string, motivo: string | null, ahora: Date): Promise<{ ok: true; clase: ClaseAnterior } | { ok: false; motivo: "clase_no_vigente" }> {
  const vieja = await tx.clase_muestra.findFirst({ where: { id: claseId }, select: { id: true, estatus: true, lead_id: true, prospecto_id: true, grupo_id: true, fecha_hora: true } });
  if (!vieja || vieja.estatus !== "agendada") return { ok: false, motivo: "clase_no_vigente" };
  const cambio = await tx.clase_muestra.updateMany({ where: { id: vieja.id, estatus: "agendada" }, data: { estatus: "cancelada", motivo_cancelacion: motivo } });
  if (cambio.count !== 1) return { ok: false, motivo: "clase_no_vigente" };
  const otras = await tx.clase_muestra.count({ where: { lead_id: vieja.lead_id, estatus: "agendada" } });
  if (otras === 0 && (await tipoDeEtapaDelLead(tx, vieja.lead_id)) === "muestra_agendada" && (await etapaDeSistema(tx, "contactado"))) {
    await moverLeadAEtapa(tx, vieja.lead_id, "contactado", { motivo: "clase_muestra_cancelada", permitirRetroceso: true, ahora });
  }
  await crearAvisoMaestro(tx, { claseId: vieja.id, tipo: "cancelada", ahora }); // D2
  await cancelarRecordatoriosDeClase(tx, vieja.id, "clase_cancelada"); // D3
  return { ok: true, clase: { id: vieja.id, grupoId: vieja.grupo_id, fechaHora: vieja.fecha_hora, prospectoId: vieja.prospecto_id, leadId: vieja.lead_id } };
}
