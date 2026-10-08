// Asistió / no asistió a la clase muestra, y la recuperación de quien no llegó (D4).
//
// Transiciones VÁLIDAS (todo lo demás se rechaza):
//   agendada ──► asistio | no_asistio        solo desde la hora de la clase (no antes)
//   asistio  ◄─► no_asistio                  CORRECCIÓN de un error, dentro de `clase_muestra_correccion_horas` desde que se marcó
//   (marcar lo mismo otra vez no hace nada: idempotente)    reagendada y cancelada ya no se marcan
// El cambio es condicional al estatus que se leyó: dos marcas simultáneas no se pisan (una gana y la otra ve el resultado de la primera).
//
//   asistio     → el lead pasa a la etapa de tipo `muestra_asistida`; se cancelan la recuperación pendiente y la tarea de llamar.
//   no_asistio  → se programan los intentos de recuperación (`clase_muestra_no_asistio`) y se deja UNA tarea «llamar a quien no llegó».
//   corregir un no_asistio a asistio  → además de lo de «asistió», se cancela lo que quedara pendiente de la recuperación;
//   corregir un asistio a no_asistio  → el lead vuelve a la etapa `muestra_agendada` y se programa la recuperación.
// Quien llama registra el cambio (`registrarCambio`) en la misma transacción.

import { leerConfiguracion } from "../configuracion/index.ts";
import { altaConAlcance, type Consultas } from "../datos/alcance.ts";
import { moverLeadAEtapa, tipoDeEtapaDelLead } from "../embudo/etapas.ts";
import { describirSesion } from "./sesiones.ts";
import { cancelarRecuperacionDeClase, programarRecuperacionDeClase } from "./recuperacion.ts";

const HORA_MS = 3_600_000;

export type EstatusDeAsistencia = "asistio" | "no_asistio";

export type MotivoDeRechazoDeAsistencia = "clase_inexistente" | "no_se_puede_marcar" | "aun_no_empieza" | "fuera_de_la_ventana_de_correccion" | "cambio_concurrente";

export interface ResultadoDeAsistencia {
  ok: true;
  /** false si ya estaba así (idempotente). */
  cambio: boolean;
  estatus: EstatusDeAsistencia;
}

export async function marcarAsistencia(tx: Consultas, e: { claseId: string; estatus: EstatusDeAsistencia; usuarioId: string; ahora: Date }): Promise<ResultadoDeAsistencia | { ok: false; motivo: MotivoDeRechazoDeAsistencia }> {
  const clase = await tx.clase_muestra.findFirst({
    where: { id: e.claseId },
    select: {
      id: true,
      estatus: true,
      fecha_hora: true,
      lead_id: true,
      asistencia_marcada_en: true,
      prospecto: { select: { nombre: true } },
      grupo: { select: { nombre: true, programa: { select: { sucursal: { select: { zona_horaria: true } } } } } },
    },
  });
  if (!clase) return { ok: false, motivo: "clase_inexistente" };
  if (clase.estatus === e.estatus) return { ok: true, cambio: false, estatus: e.estatus };
  if (clase.estatus !== "agendada" && clase.estatus !== "asistio" && clase.estatus !== "no_asistio") return { ok: false, motivo: "no_se_puede_marcar" };
  const corrige = clase.estatus !== "agendada";
  if (!corrige && e.ahora.getTime() < clase.fecha_hora.getTime()) return { ok: false, motivo: "aun_no_empieza" };
  if (corrige) {
    const config = await leerConfiguracion(tx);
    const desde = clase.asistencia_marcada_en ?? clase.fecha_hora;
    if (e.ahora.getTime() > desde.getTime() + config.claseMuestraCorreccionHoras * HORA_MS) return { ok: false, motivo: "fuera_de_la_ventana_de_correccion" };
  }

  // Condicional al estatus leído: si otra marca ganó primero, no se pisa.
  const cambio = await tx.clase_muestra.updateMany({ where: { id: clase.id, estatus: clase.estatus }, data: { estatus: e.estatus, asistencia_marcada_en: e.ahora, asistencia_marcada_por_usuario_id: e.usuarioId } });
  if (cambio.count !== 1) {
    const ahora = await tx.clase_muestra.findFirst({ where: { id: clase.id }, select: { estatus: true } });
    return ahora?.estatus === e.estatus ? { ok: true, cambio: false, estatus: e.estatus } : { ok: false, motivo: "cambio_concurrente" };
  }

  const sesion = describirSesion(clase.fecha_hora, clase.grupo.programa.sucursal.zona_horaria).completa;
  const alumno = clase.prospecto.nombre ?? "El alumno";
  if (e.estatus === "asistio") {
    await moverLeadAEtapa(tx, clase.lead_id, "muestra_asistida", { motivo: "clase_muestra_asistida" });
    await cancelarRecuperacionDeClase(tx, clase.id, "asistencia_corregida");
    await cerrarTareaDeLlamar(tx, clase.id, e.ahora);
  } else {
    // Corregir un «asistió»: el lead que se había adelantado por esta clase vuelve a la etapa de clase agendada.
    if (corrige && (await tipoDeEtapaDelLead(tx, clase.lead_id)) === "muestra_asistida") await moverLeadAEtapa(tx, clase.lead_id, "muestra_agendada", { motivo: "asistencia_corregida", permitirRetroceso: true });
    await programarRecuperacionDeClase(tx, clase.id, e.ahora);
    await tareaDeLlamar(tx, { claseId: clase.id, leadId: clase.lead_id, descripcion: `Llamar a la familia de ${alumno}: no llegó a su clase muestra del ${sesion} (${clase.grupo.nombre}). Ofrécele reagendar; si el sistema ya le escribió y contesta, la conversación te llega a ti.`, venceEn: new Date(e.ahora.getTime() + 24 * HORA_MS) });
  }
  await tx.interaccion.create({
    data: altaConAlcance({
      lead_id: clase.lead_id,
      tipo: "nota" as const,
      contenido: e.estatus === "asistio" ? `${alumno} asistió a la clase muestra del ${sesion}.` : `${alumno} no asistió a la clase muestra del ${sesion}.`,
      datos: { clase_muestra_id: clase.id, estatus: e.estatus, correccion: corrige },
    }),
  });
  return { ok: true, cambio: true, estatus: e.estatus };
}

/** Una tarea «llamar a quien no llegó» pendiente por clase. */
async function tareaDeLlamar(tx: Consultas, t: { claseId: string; leadId: string; descripcion: string; venceEn: Date }): Promise<void> {
  const pendiente = await tx.tarea_asesor.findFirst({ where: { clase_muestra_id: t.claseId, tipo: "llamar_no_asistio", estado: "pendiente" }, select: { id: true } });
  if (pendiente) return;
  await tx.tarea_asesor.create({ data: altaConAlcance({ lead_id: t.leadId, clase_muestra_id: t.claseId, tipo: "llamar_no_asistio" as const, descripcion: t.descripcion, vence_en: t.venceEn }) });
}

/** La tarea de llamar ya no tiene sentido (asistió, o volvió a agendar): se descarta, sin borrar nada. */
export async function cerrarTareaDeLlamar(tx: Consultas, claseId: string, ahora: Date): Promise<number> {
  const r = await tx.tarea_asesor.updateMany({ where: { clase_muestra_id: claseId, tipo: "llamar_no_asistio", estado: "pendiente" }, data: { estado: "descartada", resuelta_en: ahora } });
  return r.count;
}

/**
 * La familia volvió a agendar una clase muestra (D1): lo que quedaba de la recuperación de sus clases anteriores a las que no llegó
 * ya no hace falta. Dentro de la transacción de agendar. Devuelve cuántas ejecuciones canceló.
 */
export async function darPorRecuperadoAlProspecto(tx: Consultas, prospectoId: string, ahora: Date): Promise<number> {
  const previas = await tx.clase_muestra.findMany({ where: { prospecto_id: prospectoId, estatus: "no_asistio" }, select: { id: true } });
  let n = 0;
  for (const p of previas) {
    n += await cancelarRecuperacionDeClase(tx, p.id, "volvio_a_agendar");
    await cerrarTareaDeLlamar(tx, p.id, ahora);
  }
  return n;
}
