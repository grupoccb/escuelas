// Motor de automatizaciones. Cuatro tipos de entidad: la `conversacion` del lead que dejó de contestar a mitad de la captura
// (`lead_sin_respuesta`, el reenganche), la `clase_muestra` (D3: `clase_muestra_proxima`, el recordatorio de 24 h y de 2 h antes; las
// ejecuciones de esas las crea el alta de la clase, ver src/clases-muestra/recordatorios.ts, y aquí solo se ejecutan), el `lead` sin
// movimiento (D8: `lead_frio`, tarea para el asesor y reenganche de marketing) y el `aviso_promocion` (D8: `promocion_por_vencer`). Estos dos
// últimos los programa este mismo motor (src/automatizaciones/seguimiento.ts) y, como todo, mandan SOLO por MessagingProvider.
//
// Dos pasos, los dos idempotentes:
// 1. programar: por cada conversación que cumple, crea UNA ejecución por (automatización,
//    entidad, ocurrencia). La unicidad es de la base (invariante 8): correr el motor dos veces,
//    o dos motores a la vez, no programa dos veces. Lo programado fuera de horario se recorre al
//    siguiente horario válido (invariante 14).
// 2. ejecutar: toma las ejecuciones vencidas, reclama cada una antes de actuar (un reintento
//    nunca manda dos veces) y manda el mensaje SOLO a través de MessagingProvider, que decide
//    con todas las reglas (ventana, plantilla, horario, baja, frecuencia, atención humana).
//    El motor no repite ninguna regla: traduce el resultado del provider al estado de la ejecución.
//
// Política "a lo sumo una vez": una ejecución reclamada que se queda a medias (el proceso
// murió) NUNCA se reintenta, porque el mensaje pudo haber salido. Pero tampoco queda huérfana:
// el barrido de recuperación (3) la resuelve pasados RECLAMO_VENCE_MS.
// 3. recuperar: ejecuciones reclamadas hace más de RECLAMO_VENCE_MS sin resultado. Si su mensaje
//    ya tiene id del proveedor, queda enviada; si seguía pendiente, se cancela y la ejecución
//    falla; si estaba en `enviando` sin id (envío incierto), falla y se avisa al asesor.

import { PASOS_A_MEDIAS } from "../captacion/maquina.ts";
import { cargarCobro, conversacionDeCobro, hoyDelCobro, type CobroCargado } from "../cobranza/cargar.ts";
import { limiteDeRecordatorioPorVencer, type EventoDeCobranza } from "../cobranza/plan.ts";
import { esEventoDeCobranza, programarCobranza } from "../cobranza/programar.ts";
import { revalidarCobro } from "../cobranza/revalidar.ts";
import { asegurarTareaDeCobro } from "../cobranza/tareas.ts";
import { formatear } from "../lib/dinero.ts";
import { describirSesion } from "../clases-muestra/sesiones.ts";
import { altaConAlcance, conAlcance, type BaseDatos } from "../datos/alcance.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import { listarOrganizaciones } from "../datos/sistema.ts";
import { log } from "../lib/log.ts";
import { eventosEncendidos, leerModulos, moduloDeEvento, type ModulosEncendidos } from "../modulos/index.ts";
import { ENVIO_INCIERTO, ENVIO_INCIERTO_MS, asegurarTareaAsesor, type MessagingProvider } from "../mensajeria/index.ts";
import { dentroDeHorario, recorrerODescartar, siguienteHorarioValido, type VentanaHoraria } from "../mensajeria/reglas.ts";
import { zonaHorariaDeContacto } from "../mensajeria/zona-horaria.ts";
import { asegurarTareaDeLeadFrio, fechaLarga, programarAvisosDePromocion, programarLeadsFrios, revalidarAvisoDePromocion, revalidarLeadFrio, type AvisoCargado } from "./seguimiento.ts";

const MINUTO_MS = 60_000;
const POR_CORRIDA = 200;

/** Cuánto puede llevar una ejecución reclamada sin resultado antes de darla por abandonada. */
export const RECLAMO_VENCE_MS = 10 * MINUTO_MS;

export interface DepsMotor {
  prisma: PrismaRaiz;
  mensajeria: MessagingProvider;
  reloj?: () => Date;
  /** Limita la corrida a una organización. Sin él, recorre todas. */
  organizacionId?: string;
  /**
   * Fecha del evento al que apunta la ejecución, si lo hay (p. ej. la clase). Si recorrerla al
   * siguiente horario válido la dejaría después del evento, se descarta (invariante 14). El
   * reenganche no tiene evento: nunca se descarta por esto.
   */
  limiteDe?: (ejecucion: { entidad_tipo: string; entidad_id: string }) => Date | null;
  /** Antigüedad a partir de la cual una ejecución reclamada sin resultado se considera abandonada. */
  reclamoVenceMs?: number;
}

export interface ResumenMotor {
  programadas: number;
  enviadas: number;
  reprogramadas: number;
  omitidas: number;
  descartadas: number;
  fallidas: number;
  /** Ejecuciones abandonadas y envíos inciertos que el barrido de recuperación resolvió. */
  recuperadas: number;
  /**
   * Fases, automatizaciones, conversaciones o ejecuciones cuyo trabajo falló y se saltó (EA-07).
   * Un error persistente de UN elemento nunca detiene a los demás ni a otras organizaciones.
   */
  errores: number;
}

export async function correrAutomatizaciones(deps: DepsMotor): Promise<ResumenMotor> {
  const resumen: ResumenMotor = { programadas: 0, enviadas: 0, reprogramadas: 0, omitidas: 0, descartadas: 0, fallidas: 0, recuperadas: 0, errores: 0 };
  const ahora = deps.reloj?.() ?? new Date();
  const organizaciones = (await listarOrganizaciones(deps.prisma)).filter(
    (o) => deps.organizacionId === undefined || o.id === deps.organizacionId,
  );
  for (const org of organizaciones) {
    const db = conAlcance(deps.prisma, org.id);
    // V1: los módulos encendidos de ESTA organización, leídos en cada corrida (encender o apagar surte efecto en el siguiente barrido, sin reiniciar). Si no se pueden
    // leer, no se programa ni se manda nada de esa organización en esta corrida (más vale callar que mandar algo de un módulo que quizá está apagado).
    let modulos: ModulosEncendidos;
    try {
      modulos = await leerModulos(db);
    } catch (e) {
      resumen.errores++;
      log.error("motor_error", { organizacionId: org.id, fase: "modulos", error: (e as Error).message });
      continue;
    }
    // Cada fase va aislada (EA-07): si programar falla, la recuperación de lo que un proceso muerto
    // dejó a medias (F1-01) y el envío de lo ya programado corren igual, y otra organización también.
    await aislado(resumen, { organizacionId: org.id, fase: "recuperar" }, () => recuperarAbandonadas(deps, db, ahora, resumen));
    await aislado(resumen, { organizacionId: org.id, fase: "programar" }, async () => {
      resumen.programadas += await programarReenganches(db, ahora, resumen, modulos);
    });
    await aislado(resumen, { organizacionId: org.id, fase: "ejecutar" }, () => ejecutarVencidas(deps, db, ahora, resumen, modulos));
  }
  return resumen;
}

/** Corre un trabajo; si lanza, lo registra y lo cuenta en vez de detener al resto (EA-07). */
async function aislado(resumen: ResumenMotor, donde: Record<string, unknown>, trabajo: () => Promise<void>): Promise<void> {
  try {
    await trabajo();
  } catch (e) {
    resumen.errores++;
    log.error("motor_error", { ...donde, error: (e as Error).message });
  }
}

// ---------------------------------------------------------------------------------------------
// 1. Programar

async function programarReenganches(db: BaseDatos, ahora: Date, resumen: ResumenMotor, modulos: ModulosEncendidos): Promise<number> {
  let programadas = 0;
  // V1: solo lo de los módulos encendidos. Lo que se apagó no programa nada; al volver a encenderlo programa lo que cumpla ENTONCES (lo que ya pasó lo descartan las reglas de
  // siempre: `evento_pasado`, horario de envío y topes de frecuencia), nunca lo que quedó atrasado durante el apagón.
  const eventos = eventosEncendidos(modulos).filter((e) => ["lead_sin_respuesta", "lead_frio", "promocion_por_vencer", "cargo_por_vencer", "cargo_vencido"].includes(e));
  // Una sola consulta para las automatizaciones que PROGRAMA el motor: el reenganche y, desde D8, el lead frío y la promoción por vencer.
  // (Las de la clase muestra las programa el alta de la clase.)
  const automatizaciones = await db.automatizacion.findMany({
    where: { activo: true, evento_disparador: { in: eventos } },
    orderBy: { creado_en: "asc" },
  });

  // Una automatización defectuosa (zona horaria inválida, etc.) no detiene a las demás (EA-07).
  for (const a of automatizaciones) {
    await aislado(resumen, { automatizacionId: a.id, fase: "programar" }, async () => {
      if (a.evento_disparador === "lead_frio") programadas += await programarLeadsFrios(db, a, ahora);
      else if (a.evento_disparador === "promocion_por_vencer") programadas += await programarAvisosDePromocion(db, a, ahora);
      else if (esEventoDeCobranza(a.evento_disparador)) programadas += await programarCobranza(db, a, ahora);
      else programadas += await programarUna(db, a, ahora, resumen);
    });
  }
  return programadas;
}

type AutomatizacionParaProgramar = Awaited<ReturnType<BaseDatos["automatizacion"]["findMany"]>>[number];

async function programarUna(db: BaseDatos, a: AutomatizacionParaProgramar, ahora: Date, resumen: ResumenMotor): Promise<number> {
  let programadas = 0;
  const corte = new Date(ahora.getTime() - a.offset_minutos * MINUTO_MS);
  const conversaciones = await db.conversacion.findMany({
    where: {
      estado: "bot",
      pasar_a_asesor_pendiente: false,
      paso_captacion: { in: [...PASOS_A_MEDIAS] },
      ultimo_mensaje_entrante_en: { lte: corte },
      lead: {
        eliminado_en: null, // un lead borrado no recibe nada (F1-05)
        ...(a.vertical_id ? { vertical_interes_id: a.vertical_id } : {}),
        ...(a.sucursal_id ? { sucursal_interes_id: a.sucursal_id } : {}),
      },
    },
    select: {
      id: true,
      ultimo_mensaje_entrante_en: true,
      lead: { select: { sucursal_interes_id: true, vertical_interes_id: true } },
      bandeja_chatwoot: { select: { canal_whatsapp: { select: { sucursal_id: true } } } },
    },
    orderBy: { creado_en: "asc" },
  });

  for (const c of conversaciones) {
    // Una conversación con datos defectuosos no detiene a las demás (EA-07).
    await aislado(resumen, { automatizacionId: a.id, conversacionId: c.id, fase: "programar" }, async () => {
      if (!c.ultimo_mensaje_entrante_en) return;
      const previas = await db.automatizacion_ejecucion.findMany({
        where: { automatizacion_id: a.id, entidad_tipo: "conversacion", entidad_id: c.id },
        orderBy: { ocurrencia: "desc" },
        take: 1,
        select: { ocurrencia: true, estatus: true },
      });
      const ultima = previas[0];
      const n = ultima ? ultima.ocurrencia + 1 : 1;
      if (n > a.max_intentos) return;
      // Otro intento solo después de que el anterior salió.
      if (ultima && ultima.estatus !== "enviado") return;

      const nominal = new Date(c.ultimo_mensaje_entrante_en.getTime() + n * a.offset_minutos * MINUTO_MS);
      if (nominal.getTime() > ahora.getTime()) return;

      const zona = await zonaHorariaDeContacto(db, c.lead.sucursal_interes_id, c.bandeja_chatwoot.canal_whatsapp.sucursal_id, c.lead.vertical_interes_id);
      // Dentro del horario de la propia automatización, que solo puede ser más estrecho que 09:00–20:00.
      const programado = zona
        ? siguienteHorarioValido(nominal, zona, { inicioMin: a.hora_inicio_min, finMin: a.hora_fin_min, dias: a.dias_permitidos })
        : nominal;

      const r = await db.automatizacion_ejecucion.createMany({
        data: [altaConAlcance({ automatizacion_id: a.id, entidad_tipo: "conversacion", entidad_id: c.id, ocurrencia: n, programado_para: programado })],
        skipDuplicates: true,
      });
      programadas += r.count;
    });
  }
  return programadas;
}

// ---------------------------------------------------------------------------------------------
// 2. Ejecutar

type Vencida = Awaited<ReturnType<typeof leerVencidas>>[number];

async function leerVencidas(db: BaseDatos, ahora: Date) {
  return db.automatizacion_ejecucion.findMany({
    where: { estatus: "programado", ejecutado_en: null, programado_para: { lte: ahora } },
    orderBy: { programado_para: "asc" },
    take: POR_CORRIDA,
    include: { automatizacion: { include: { plantilla: true } } },
  });
}

/** Lo que ejecutarUna deja a la vista de quien la llamó, para poder limpiar si lanza. */
interface Progreso {
  /** El mensaje ya encolado de esta ejecución, si llegó a encolarse. */
  mensajeId?: string;
}

async function ejecutarVencidas(deps: DepsMotor, db: BaseDatos, ahora: Date, resumen: ResumenMotor, modulos: ModulosEncendidos): Promise<void> {
  for (const e of await leerVencidas(db, ahora)) {
    // Reclamar antes de actuar: solo quien gana el reclamo manda (invariante 8). Se guarda la hora
    // REAL del reclamo, no la del inicio de la corrida: con una corrida larga o con réplicas, un
    // reclamo que luce más viejo de lo que es lo resolvería otro proceso mientras el envío sigue (EA-13).
    const reclamo = await db.automatizacion_ejecucion.updateMany({
      where: { id: e.id, estatus: "programado", ejecutado_en: null },
      data: { ejecutado_en: deps.reloj?.() ?? new Date(), reclamos: { increment: 1 } },
    });
    if (reclamo.count !== 1) continue;
    const progreso: Progreso = {};
    try {
      await ejecutarUna(deps, db, e, ahora, resumen, progreso, modulos);
    } catch (err) {
      log.error("automatizacion_error", { ejecucionId: e.id, error: (err as Error).message });
      try {
        // Si el mensaje ya se encoló y no salió, se cancela ANTES de dar la ejecución por fallida:
        // si no, saldría después, mezclado con otra cosa (F1-01).
        if (progreso.mensajeId) {
          await db.mensaje.updateMany({
            where: { id: progreso.mensajeId, estatus: "pendiente" },
            data: { estatus: "bloqueado", motivo_bloqueo: "ejecucion_fallida" },
          });
        }
        await db.automatizacion_ejecucion.update({ where: { id: e.id }, data: { estatus: "fallido", motivo_omision: "error_interno" } });
        resumen.fallidas++;
      } catch (limpieza) {
        // Si ni esto se pudo (la base cayó), la ejecución queda reclamada y la recupera el barrido.
        log.error("automatizacion_limpieza_fallida", { ejecucionId: e.id, error: (limpieza as Error).message });
      }
    }
  }
}

async function ejecutarUna(deps: DepsMotor, db: BaseDatos, e: Vencida, ahora: Date, resumen: ResumenMotor, progreso: Progreso, modulos: ModulosEncendidos): Promise<void> {
  const omitir = async (motivo: string): Promise<void> => {
    await db.automatizacion_ejecucion.update({ where: { id: e.id }, data: { estatus: "omitido", motivo_omision: motivo } });
    resumen.omitidas++;
    log.info("automatizacion_omitida", { ejecucionId: e.id, motivo });
  };

  // K9 (EK-A2): «apagar» una automatización también frena lo que ya estaba programado (J8 expone el interruptor): se omite, no se manda.
  if (!e.automatizacion.activo) return omitir("automatizacion_apagada");
  // V1: lo ya programado de un módulo que se apagó no se manda: se omite (queda registrado; encender el módulo después no lo revive).
  const modulo = moduloDeEvento(e.automatizacion.evento_disparador);
  if (modulo !== null && !modulos[modulo]) return omitir("modulo_apagado");

  const entidadesSoportadas = ["conversacion", "clase_muestra", "lead", "aviso_promocion", "inscripcion", "cargo"];
  if (!entidadesSoportadas.includes(e.entidad_tipo)) return omitir("entidad_no_soportada");
  const evento = e.automatizacion.evento_disparador;
  // D8: el lead frío (entidad `lead`) y la promoción por vencer (entidad `aviso_promocion`).
  const esLeadFrio = e.entidad_tipo === "lead";
  const esPromocion = e.entidad_tipo === "aviso_promocion";
  // F7: la bienvenida de inscripción (entidad `inscripcion`).
  const esInscripcion = e.entidad_tipo === "inscripcion";
  if ((esLeadFrio && evento !== "lead_frio") || (esPromocion && evento !== "promocion_por_vencer") || (esInscripcion !== (evento === "inscripcion_creada"))) return omitir("evento_no_soportado");
  // H6: el recordatorio de pago (entidad `cargo`).
  const esCobro = e.entidad_tipo === "cargo";
  if (esCobro !== esEventoDeCobranza(evento)) return omitir("evento_no_soportado");
  const cobro = esCobro ? await cargarCobro(db, e.entidad_id) : null;
  if (esCobro) {
    if (!cobro) return omitir("cargo_inexistente");
    // Lo que se programó hace días solo se manda si el cargo sigue abierto y vale lo que decía (la familia pudo pagar, el cargo cancelarse o la inscripción darse de baja).
    const rev = revalidarCobro(evento as EventoDeCobranza, { estatus: cobro.estatus, vencimiento: cobro.vencimiento, inscripcionEstatus: cobro.inscripcionEstatus }, hoyDelCobro(cobro, ahora));
    if (!rev.ok) {
      if (rev.motivo === "evento_pasado") {
        await db.automatizacion_ejecucion.update({ where: { id: e.id }, data: { estatus: "descartado", motivo_omision: "evento_pasado" } });
        resumen.descartadas++;
        log.info("automatizacion_descartada", { ejecucionId: e.id, motivo: "evento_pasado" });
        return;
      }
      return omitir(rev.motivo);
    }
  }
  const inscr = esInscripcion ? await cargarInscripcion(db, e.entidad_id) : null;
  if (esInscripcion) {
    if (!inscr) return omitir("inscripcion_inexistente");
    // Lo que se manda solo vale mientras la inscripción siga vigente (si se dio de baja o se congeló antes de que saliera, ya no).
    if (inscr.estatus !== "activa") return omitir("inscripcion_no_vigente");
  }
  let aviso: AvisoCargado | null = null;
  if (esPromocion) {
    // Antes de nada: ¿sigue valiendo el aviso? (el lead se inscribió o se perdió, la cotización venció, la promoción se apagó o se prorrogó…)
    const rev = await revalidarAvisoDePromocion(db, e.entidad_id, e.automatizacion, ahora);
    if (!rev.ok) return omitir(rev.motivo);
    if (rev.vencida) {
      await db.automatizacion_ejecucion.update({ where: { id: e.id }, data: { estatus: "descartado", motivo_omision: "evento_pasado" } });
      resumen.descartadas++;
      log.info("automatizacion_descartada", { ejecucionId: e.id, motivo: "evento_pasado" });
      return;
    }
    aviso = rev.aviso;
  }

  // D3: la entidad puede ser una clase muestra; entonces el destinatario es el lead de la clase y se le escribe por SU conversación.
  const clase = e.entidad_tipo === "clase_muestra" ? await cargarClase(db, e.entidad_id) : null;
  if (e.entidad_tipo === "clase_muestra" && !clase) return omitir("clase_inexistente");
  const incluir = { lead: true, bandeja_chatwoot: { include: { canal_whatsapp: { include: { vertical: true } } } } } as const;
  const leadDeLaEntidad = esLeadFrio ? e.entidad_id : (aviso?.leadId ?? clase?.lead_id ?? null);
  const conv = cobro
    ? await conversacionDeCobro(db, cobro)
    : inscr
    ? await conversacionDeBienvenida(db, inscr)
    : leadDeLaEntidad
    ? await db.conversacion.findFirst({ where: { lead_id: leadDeLaEntidad }, orderBy: [{ creado_en: "desc" }, { id: "asc" }], include: incluir })
    : await db.conversacion.findFirst({ where: { id: e.entidad_id }, include: incluir });

  // D8, lead frío: la tarea para el asesor es lo principal; la plantilla de reenganche, si procede. El motor NO mira si una persona atiende
  // (invariante 6, INV-6): la tarea es un aviso interno —y con una persona atendiendo es justo cuando conviene: tomó el lead y se enfrió— y
  // la plantilla de marketing la frena MessagingProvider (`atencion_humana`) como cualquier otra.
  if (esLeadFrio) {
    const rev = await revalidarLeadFrio(db, e.entidad_id, e.automatizacion, ahora);
    if (!rev.ok) return omitir(rev.motivo);
    const dias = Math.floor((ahora.getTime() - (rev.lead.ultimaInteraccionEn ?? rev.lead.creadoEn).getTime()) / (24 * 60 * MINUTO_MS));
    await asegurarTareaDeLeadFrio(db, {
      leadId: rev.lead.id,
      conversacionId: conv?.id ?? null,
      descripcion: `El lead${rev.lead.nombre_contacto ? ` «${rev.lead.nombre_contacto}»` : ""} lleva ${dias} ${dias === 1 ? "día" : "días"} sin movimiento en la etapa «${rev.lead.etapaNombre}». Retómalo: llámalo o escríbele.`,
    });
    if (!conv) return omitir("sin_conversacion");
    if (!e.automatizacion.plantilla) return omitir("solo_tarea");
  }
  if (!conv && esPromocion) return omitir("sin_conversacion");
  if (!conv && cobro) {
    // La familia no tiene una conversación de WhatsApp en el canal de esa vertical: no hay por dónde recordarle el pago y una persona cobra.
    await omitir("sin_conversacion");
    await asegurarTareaDeCobro(db, { cargoId: cobro.id, inscripcionId: cobro.inscripcionId, leadId: cobro.leadId, tipo: "cobranza_sin_canal", descripcion: `El recordatorio de pago de ${cobro.alumnoNombre} (${formatear(cobro.saldo)}) no se mandó: la familia no tiene una conversación de WhatsApp en el canal de esa vertical. Cóbrales tú.` });
    return;
  }
  if (!conv && inscr) {
    // El tutor responsable no tiene una conversación de WhatsApp (se dio de alta por mostrador): no hay por dónde mandarle la bienvenida y una persona decide.
    await omitir("sin_conversacion");
    if (inscr.lead_id) await asegurarTareaDeLead(db, { leadId: inscr.lead_id, descripcion: `La bienvenida de inscripción de ${inscr.alumno.nombre} no se mandó: la familia no tiene una conversación de WhatsApp en el canal de esa vertical. Dale la bienvenida tú.` });
    return;
  }
  if (!conv) {
    await omitir(clase ? "sin_conversacion" : "conversacion_inexistente");
    // Una clase cuyo lead nunca escribió por WhatsApp (p. ej. entró por la landing): no hay por dónde mandar el recordatorio y una persona decide.
    if (clase) await asegurarTareaDeClase(db, { leadId: clase.lead_id, claseId: clase.id, descripcion: `El recordatorio «${e.automatizacion.nombre}» de la clase muestra no se mandó: el contacto no tiene una conversación de WhatsApp. Avísale tú de la clase.` });
    return;
  }
  // El include no filtra lo borrado: un lead con eliminado_en no recibe nada (F1-05).
  if (conv.lead.eliminado_en) return omitir("lead_eliminado");

  // Omisión por un problema de configuración o de datos: no se manda y una persona decide
  // (invariante 5). Una sola tarea pendiente por conversación.
  const omitirConTarea = async (motivo: string): Promise<void> => {
    await omitir(motivo);
    await asegurarTareaAsesor(db, {
      leadId: conv.lead_id,
      conversacionId: conv.id,
      tipo: "automatizacion_omitida",
      descripcion: `La automatización «${e.automatizacion.nombre}» no se le mandó a este contacto (${motivo}). Revisa su configuración o escríbele tú.`,
    });
  };

  // D3 y D4: lo que mandan estas automatizaciones solo vale mientras la clase siga como estaba cuando se programó.
  if (clase && evento === "clase_muestra_proxima") {
    // Recordatorio: la clase sigue agendada y no ha empezado.
    if (clase.estatus !== "agendada") return omitir("clase_no_vigente");
    if (clase.fecha_hora.getTime() <= ahora.getTime()) {
      await db.automatizacion_ejecucion.update({ where: { id: e.id }, data: { estatus: "descartado", motivo_omision: "evento_pasado" } });
      resumen.descartadas++;
      log.info("automatizacion_descartada", { ejecucionId: e.id, motivo: "evento_pasado" });
      return;
    }
  } else if (clase && evento === "clase_muestra_no_asistio") {
    // Recuperación: la clase sigue marcada «no asistió» (si se corrigió, no tiene sentido), la familia no volvió a agendar y, del segundo
    // intento en adelante, el anterior salió y el contacto no ha contestado desde entonces.
    if (clase.estatus !== "no_asistio") return omitir("clase_no_vigente");
    if ((await db.clase_muestra.count({ where: { prospecto_id: clase.prospecto_id, estatus: "agendada" } })) > 0) return omitir("ya_reagendo");
    if (e.ocurrencia > 1) {
      const previa = await db.automatizacion_ejecucion.findFirst({
        where: { automatizacion_id: e.automatizacion_id, entidad_tipo: "clase_muestra", entidad_id: clase.id, ocurrencia: e.ocurrencia - 1 },
        select: { estatus: true, mensaje: { select: { enviado_en: true } } },
      });
      if (!previa || previa.estatus !== "enviado") return omitir("intento_anterior_no_salio");
      const salio = previa.mensaje?.enviado_en ?? null;
      if (salio && conv.ultimo_mensaje_entrante_en && conv.ultimo_mensaje_entrante_en.getTime() > salio.getTime()) return omitir("contacto_respondio");
    }
  } else if (clase) {
    return omitir("evento_no_soportado");
  }

  const plantilla = e.automatizacion.plantilla;
  if (!plantilla) return omitirConTarea("sin_plantilla");

  // Revalidar: el contacto pudo escribir después de que se programó (o se recorrió al horario).
  // La condición es la misma con la que se programó: silencio de `ocurrencia × offset` desde su último mensaje.
  if (e.automatizacion.evento_disparador === "lead_sin_respuesta") {
    const desde = conv.ultimo_mensaje_entrante_en;
    const silencioCumplidoEn = desde ? desde.getTime() + e.ocurrencia * e.automatizacion.offset_minutos * MINUTO_MS : null;
    if (silencioCumplidoEn === null || silencioCumplidoEn > ahora.getTime()) return omitir("contacto_respondio");
  }

  const zona = cobro ? cobro.zona : await zonaHorariaDeContacto(db, conv.lead.sucursal_interes_id, conv.bandeja_chatwoot.canal_whatsapp.sucursal_id, conv.lead.vertical_interes_id);
  // Lo programado fuera de rango se recorre; si con eso llegaría después del evento, se descarta.
  const reprogramarODescartar = async (ventana?: VentanaHoraria): Promise<void> => {
    // Un recordatorio tiene la clase como evento: llegar a su hora o después ya no sirve (límite exclusivo). La recuperación de quien no llegó y
    // el reenganche no tienen un evento al cual llegar tarde.
    // Una promoción por vencer tiene también un evento al cual no se debe llegar tarde: el instante en que ya no vale (límite exclusivo).
    const siguiente = zona
      ? clase && evento === "clase_muestra_proxima"
        ? recorrerODescartar(ahora, zona, clase.fecha_hora, ventana, true)
        : cobro && evento === "cargo_por_vencer"
          ? recorrerODescartar(ahora, zona, limiteDeRecordatorioPorVencer(cobro.vencimiento, zona), ventana, true)
        : aviso
          ? recorrerODescartar(ahora, zona, aviso.limite, ventana, true)
          : recorrerODescartar(ahora, zona, clase ? null : (deps.limiteDe?.(e) ?? null), ventana)
      : null;
    if (siguiente) {
      await db.automatizacion_ejecucion.update({ where: { id: e.id }, data: { programado_para: siguiente, ejecutado_en: null } });
      resumen.reprogramadas++;
    } else {
      await db.automatizacion_ejecucion.update({ where: { id: e.id }, data: { estatus: "descartado", motivo_omision: "evento_pasado" } });
      resumen.descartadas++;
      log.info("automatizacion_descartada", { ejecucionId: e.id, motivo: "evento_pasado" });
    }
  };

  // La ventana propia de la automatización puede ser más estrecha que 09:00–20:00 (nunca más ancha).
  const propia: VentanaHoraria = { inicioMin: e.automatizacion.hora_inicio_min, finMin: e.automatizacion.hora_fin_min, dias: e.automatizacion.dias_permitidos };
  if (zona && !dentroDeHorario(ahora, zona, propia)) return reprogramarODescartar(propia);

  // EH-16: el cargo se leyó al empezar; entre eso y el envío pasa la búsqueda de la conversación, el horario y las variables. Una última lectura justo antes de armar el mensaje deja la
  // ventana en los milisegundos de encolar y despachar (un pago en ese instante sigue pudiendo cruzarse; el texto de la plantilla dice «si ya pagaste, ignora este mensaje»), y el monto
  // del mensaje es el saldo de AHORA, no el de hace un momento.
  const cobroVigente = cobro ? await cargarCobro(db, cobro.id) : null;
  if (cobro) {
    if (!cobroVigente) return omitir("cargo_inexistente");
    const rev = revalidarCobro(evento as EventoDeCobranza, { estatus: cobroVigente.estatus, vencimiento: cobroVigente.vencimiento, inscripcionEstatus: cobroVigente.inscripcionEstatus }, hoyDelCobro(cobroVigente, ahora));
    if (!rev.ok) return omitir(rev.motivo);
  }
  const variables = await resolverVariables(db, plantilla.variables, conv, clase, aviso, inscr, cobroVigente);
  if (typeof variables === "string") return omitirConTarea(variables);
  const cuerpo = (plantilla.cuerpo_referencia ?? "").replace(/\{\{\s*(\d+)\s*\}\}/g, (_, pos: string) => variables[pos] ?? "");
  if (cuerpo.trim() === "") return omitirConTarea("plantilla_sin_cuerpo");

  // El mensaje queda ligado a la ejecución en la MISMA transacción que lo encola: si el proceso
  // muere después, la recuperación sabe qué mensaje era y en qué estado quedó.
  const [mensajeId] = await db.$transaction(async (tx) => {
    const ids = await deps.mensajeria.encolar(tx, conv.id, [{ tipo: "mensaje", cuerpo, origen: "automatizacion", plantilla: { id: plantilla.id, variables } }]);
    await tx.automatizacion_ejecucion.update({ where: { id: e.id }, data: { mensaje_id: ids[0] ?? null } });
    return ids;
  });
  if (mensajeId) progreso.mensajeId = mensajeId;
  const despacho = await deps.mensajeria.despachar(db, conv.id);
  const r = despacho.resultados.find((x) => x.mensajeId === mensajeId);

  if (r?.resultado === "enviado") {
    await db.automatizacion_ejecucion.update({ where: { id: e.id }, data: { estatus: "enviado", mensaje_id: mensajeId ?? null } });
    if (clase && evento === "clase_muestra_proxima") await db.clase_muestra.updateMany({ where: { id: clase.id }, data: { ultimo_recordatorio_en: ahora } });
    resumen.enviadas++;
    return;
  }
  if (r?.resultado === "bloqueado" && r.motivo === "fuera_de_horario") return reprogramarODescartar();
  if (r?.resultado === "bloqueado") {
    await db.automatizacion_ejecucion.update({ where: { id: e.id }, data: { estatus: "omitido", motivo_omision: r.motivo ?? "bloqueado", mensaje_id: mensajeId ?? null } });
    resumen.omitidas++;
    return;
  }
  const motivoFallo = r ? (r.motivo === ENVIO_INCIERTO ? ENVIO_INCIERTO : "envio_fallido") : "sin_resultado";
  await db.automatizacion_ejecucion.update({ where: { id: e.id }, data: { estatus: "fallido", motivo_omision: motivoFallo, mensaje_id: mensajeId ?? null } });
  resumen.fallidas++;
}

// ---------------------------------------------------------------------------------------------
// 3. Recuperar

/**
 * Resuelve lo que un proceso muerto dejó a medias. Nunca reenvía: a lo sumo una vez.
 *
 * 1. Mensajes en `enviando` sin id del proveedor (envío incierto) → fallidos + tarea al asesor.
 * 2. Ejecuciones reclamadas hace más de `reclamoVenceMs` que siguen sin resultado.
 */
async function recuperarAbandonadas(deps: DepsMotor, db: BaseDatos, ahora: Date, resumen: ResumenMotor): Promise<void> {
  resumen.recuperadas += await deps.mensajeria.recuperarEnviosInciertos(db, { desde: new Date(ahora.getTime() - ENVIO_INCIERTO_MS) });

  const vence = new Date(ahora.getTime() - (deps.reclamoVenceMs ?? RECLAMO_VENCE_MS));
  const abandonadas = await db.automatizacion_ejecucion.findMany({
    where: { estatus: "programado", ejecutado_en: { lt: vence } },
    orderBy: { ejecutado_en: "asc" },
    take: POR_CORRIDA,
  });
  for (const e of abandonadas) {
    // Una ejecución que no se deja recuperar no detiene a las demás (EA-07).
    await aislado(resumen, { ejecucionId: e.id, fase: "recuperar" }, () => recuperarUna(deps, db, e, ahora, resumen));
  }
}

type EjecucionAbandonada = Awaited<ReturnType<BaseDatos["automatizacion_ejecucion"]["findMany"]>>[number];

async function recuperarUna(deps: DepsMotor, db: BaseDatos, e: EjecucionAbandonada, ahora: Date, resumen: ResumenMotor): Promise<void> {
  // Quien gana este reclamo (mismo contador de reclamos que se leyó) resuelve; los demás motores la
  // saltan. Se compara un contador, no la fecha: `Date` tiene milisegundos y la columna
  // microsegundos, así que una fila escrita por SQL nunca coincidía y no se recuperaba jamás (EA-20).
  const reclamo = await db.automatizacion_ejecucion.updateMany({
    where: { id: e.id, estatus: "programado", reclamos: e.reclamos },
    data: { ejecutado_en: deps.reloj?.() ?? new Date(), reclamos: { increment: 1 } },
  });
  if (reclamo.count !== 1) return;

  const cierre = async (estatus: "enviado" | "fallido" | "omitido", motivo: string | null): Promise<void> => {
    await db.automatizacion_ejecucion.update({ where: { id: e.id }, data: { estatus, motivo_omision: motivo } });
    resumen.recuperadas++;
    log.warn("automatizacion_recuperada", { ejecucionId: e.id, estatus, motivo });
  };

  const mensaje = e.mensaje_id ? await db.mensaje.findFirst({ where: { id: e.mensaje_id } }) : null;
  // Sin mensaje no se puede probar que nada salió (ejecuciones anteriores a que el mensaje se
  // ligara a la ejecución): no se reintenta.
  if (!mensaje) {
    await cierre("fallido", "ejecucion_abandonada");
    return;
  }
  if (mensaje.id_externo !== null || mensaje.estatus === "enviado" || mensaje.estatus === "entregado" || mensaje.estatus === "leido") {
    await cierre("enviado", null);
    return;
  }
  switch (mensaje.estatus) {
    case "pendiente": {
      // Nunca salió ni saldrá: se cancela para que no aparezca después, fuera de contexto.
      await db.mensaje.updateMany({
        where: { id: mensaje.id, estatus: "pendiente" },
        data: { estatus: "bloqueado", motivo_bloqueo: "ejecucion_abandonada" },
      });
      await cierre("fallido", "ejecucion_abandonada");
      break;
    }
    case "enviando": {
      // Solo es incierto si el PROPIO mensaje lleva más de ENVIO_INCIERTO_MS reclamado (EA-13): la
      // ejecución puede lucir vieja mientras su envío acaba de empezar. Si es reciente, está en curso:
      // la ejecución se queda como está y la resuelve un barrido posterior.
      const marcado = await deps.mensajeria.recuperarEnviosInciertos(db, { desde: new Date(ahora.getTime() - ENVIO_INCIERTO_MS), mensajeId: mensaje.id });
      if (marcado > 0) await cierre("fallido", ENVIO_INCIERTO);
      break;
    }
    case "bloqueado":
      await cierre("omitido", mensaje.motivo_bloqueo ?? "bloqueado");
      break;
    default:
      await cierre("fallido", mensaje.error === ENVIO_INCIERTO ? ENVIO_INCIERTO : "envio_fallido");
  }
}

/**
 * Valores de las variables de la plantilla, por posición. Devuelve un texto (el motivo) si no se
 * pueden resolver todas: una variable vacía haría que Meta rechace el envío.
 */
async function resolverVariables(
  db: BaseDatos,
  definidas: unknown,
  conv: { lead: { id: string; nombre_contacto: string | null; sucursal_interes_id: string | null }; bandeja_chatwoot: { canal_whatsapp: { vertical: { nombre: string } } } },
  clase: ClaseDeEjecucion | null = null,
  aviso: AvisoCargado | null = null,
  inscr: InscripcionDeEjecucion | null = null,
  cobro: CobroCargado | null = null,
): Promise<Record<string, string> | string> {
  if (!Array.isArray(definidas)) return "variables_invalidas";
  const resultado: Record<string, string> = {};
  for (const d of definidas) {
    const pos = typeof d === "object" && d !== null ? (d as Record<string, unknown>)["pos"] : undefined;
    const nombre = typeof d === "object" && d !== null ? (d as Record<string, unknown>)["nombre"] : undefined;
    if (typeof pos !== "number" || typeof nombre !== "string") return "variables_invalidas";
    let valor: string | null | undefined;
    switch (nombre) {
      case "nombre_vertical":
        valor = conv.bandeja_chatwoot.canal_whatsapp.vertical.nombre;
        break;
      case "nombre_contacto":
        valor = conv.lead.nombre_contacto;
        break;
      case "nombre_prospecto":
        // De una clase muestra o de un aviso de promoción: el alumno de ESA clase o cotización (el lead puede tener varios hijos).
        valor = cobro ? cobro.alumnoNombre : inscr ? inscr.alumno.nombre : clase ? clase.prospecto.nombre : aviso ? aviso.prospectoNombre : (await db.prospecto.findFirst({ where: { lead_id: conv.lead.id }, orderBy: [{ creado_en: "asc" }, { id: "asc" }] }))?.nombre;
        break;
      case "nombre_promocion":
        if (!aviso) return "variable_desconocida";
        valor = aviso.promocionNombre;
        break;
      case "fecha_vencimiento":
        if (cobro) {
          valor = fechaLarga(cobro.vencimiento);
          break;
        }
        if (!aviso) return "variable_desconocida";
        valor = fechaLarga(aviso.venceEl);
        break;
      case "monto_pendiente":
        // Lo que falta por pagar de ESE cargo (no el saldo de toda la familia): dinero exacto, formateado sin pasar por flotantes.
        if (!cobro) return "variable_desconocida";
        valor = formatear(cobro.saldo);
        break;
      case "concepto_cargo":
        if (!cobro) return "variable_desconocida";
        valor = cobro.descripcion ?? cobro.concepto;
        break;
      case "nombre_grupo":
        if (!clase && !inscr) return "variable_desconocida";
        valor = inscr ? inscr.grupo.nombre : clase!.grupo.nombre;
        break;
      case "fecha_inicio":
        // Primer día de clases de la inscripción, p. ej. «lunes 9 de noviembre».
        if (!inscr) return "variable_desconocida";
        valor = fechaLarga(inscr.fecha_inicio.toISOString().slice(0, 10));
        break;
      case "fecha_clase":
        if (!clase) return "variable_desconocida";
        valor = describirSesion(clase.fecha_hora, clase.grupo.programa.sucursal.zona_horaria).fecha;
        break;
      case "hora_clase":
        if (!clase) return "variable_desconocida";
        valor = describirSesion(clase.fecha_hora, clase.grupo.programa.sucursal.zona_horaria).hora;
        break;
      case "nombre_sucursal":
        if (cobro) {
          valor = cobro.sucursalNombre;
          break;
        }
        if (inscr) {
          valor = inscr.grupo.programa.sucursal.nombre;
          break;
        }
        if (clase) {
          valor = clase.grupo.programa.sucursal.nombre;
          break;
        }
        valor = conv.lead.sucursal_interes_id
          ? (await db.sucursal.findFirst({ where: { id: conv.lead.sucursal_interes_id }, select: { nombre: true } }))?.nombre
          : null;
        break;
      default:
        return "variable_desconocida";
    }
    if (!valor || valor.trim() === "") return "variable_vacia";
    resultado[String(pos)] = valor.trim();
  }
  return resultado;
}

// ---------------------------------------------------------------------------------------------
// Clase muestra (D3)

const SELECCION_CLASE = {
  id: true,
  lead_id: true,
  prospecto_id: true,
  estatus: true,
  fecha_hora: true,
  prospecto: { select: { nombre: true } },
  grupo: { select: { nombre: true, programa: { select: { sucursal: { select: { nombre: true, zona_horaria: true } } } } } },
} as const;

type ClaseDeEjecucion = NonNullable<Awaited<ReturnType<typeof cargarClase>>>;

async function cargarClase(db: BaseDatos, id: string) {
  return db.clase_muestra.findFirst({ where: { id }, select: SELECCION_CLASE });
}

// ── Inscripción (F7) ──

type InscripcionDeEjecucion = NonNullable<Awaited<ReturnType<typeof cargarInscripcion>>>;

async function cargarInscripcion(db: BaseDatos, id: string) {
  return db.inscripcion.findFirst({
    where: { id },
    select: {
      id: true,
      estatus: true,
      lead_id: true,
      fecha_inicio: true,
      alumno: { select: { id: true, nombre: true, tutores: { where: { eliminado_en: null, es_responsable_pago: true, tutor: { eliminado_en: null } }, select: { tutor: { select: { telefono: true } } }, take: 1 } } },
      grupo: { select: { nombre: true, programa: { select: { vertical_id: true, sucursal: { select: { nombre: true } } } } } },
    },
  });
}

const INCLUIR_CONVERSACION = { lead: true, bandeja_chatwoot: { include: { canal_whatsapp: { include: { vertical: true } } } } } as const;

/**
 * La conversación de WhatsApp del TUTOR RESPONSABLE de pago EN LA VERTICAL de la inscripción (la del lead cuyo teléfono es el suyo y cuya vertical es la
 * del programa); si no tiene, la del lead de origen de la inscripción, solo si también es de esa vertical. EF-02: un lead es único por (vertical, teléfono)
 * y cada vertical tiene su canal, así que una familia que escribió a dos verticales tiene dos conversaciones con el mismo teléfono: la bienvenida de una
 * inscripción nunca sale por el canal de la otra. Sin conversación de esa vertical, null (una persona decide).
 */
async function conversacionDeBienvenida(db: BaseDatos, inscr: InscripcionDeEjecucion) {
  const verticalId = inscr.grupo.programa.vertical_id;
  const telefono = inscr.alumno.tutores[0]?.tutor.telefono;
  if (telefono) {
    const c = await db.conversacion.findFirst({ where: { lead: { telefono, vertical_interes_id: verticalId, eliminado_en: null } }, orderBy: [{ creado_en: "desc" }, { id: "asc" }], include: INCLUIR_CONVERSACION });
    if (c) return c;
  }
  return inscr.lead_id ? db.conversacion.findFirst({ where: { lead_id: inscr.lead_id, lead: { vertical_interes_id: verticalId } }, orderBy: [{ creado_en: "desc" }, { id: "asc" }], include: INCLUIR_CONVERSACION }) : null;
}

/** Tarea para el asesor ligada al lead (cuando no hay conversación a la que atarla). Una pendiente por lead y tipo. */
async function asegurarTareaDeLead(db: BaseDatos, t: { leadId: string; descripcion: string }): Promise<void> {
  if (await db.tarea_asesor.findFirst({ where: { lead_id: t.leadId, conversacion_id: null, tipo: "automatizacion_omitida", estado: "pendiente" }, select: { id: true } })) return;
  await db.tarea_asesor.create({ data: altaConAlcance({ lead_id: t.leadId, tipo: "automatizacion_omitida" as const, descripcion: t.descripcion }) });
}

/** Tarea para el asesor ligada a una clase (el lead no tiene conversación a la que atarla). Una pendiente por clase y tipo. */
async function asegurarTareaDeClase(db: BaseDatos, t: { leadId: string; claseId: string; descripcion: string }): Promise<void> {
  const pendiente = await db.tarea_asesor.findFirst({ where: { clase_muestra_id: t.claseId, tipo: "automatizacion_omitida", estado: "pendiente" }, select: { id: true } });
  if (pendiente) return;
  await db.tarea_asesor.create({ data: altaConAlcance({ lead_id: t.leadId, clase_muestra_id: t.claseId, tipo: "automatizacion_omitida" as const, descripcion: t.descripcion }) });
}
