// Motor de automatizaciones. Hoy un solo disparador: `lead_sin_respuesta` (reenganche), el lead
// que dejó de contestar a mitad de la captura.
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

import { altaConAlcance, conAlcance, type BaseDatos } from "../datos/alcance.ts";
import type { PrismaClient } from "../datos/prisma.ts";
import { listarOrganizaciones } from "../datos/sistema.ts";
import { log } from "../lib/log.ts";
import { ENVIO_INCIERTO, ENVIO_INCIERTO_MS, asegurarTareaAsesor, type MessagingProvider } from "../mensajeria/index.ts";
import { dentroDeHorario, recorrerODescartar, siguienteHorarioValido, type VentanaHoraria } from "../mensajeria/reglas.ts";
import { zonaHorariaDeContacto } from "../mensajeria/zona-horaria.ts";

const MINUTO_MS = 60_000;
const POR_CORRIDA = 200;

/** Cuánto puede llevar una ejecución reclamada sin resultado antes de darla por abandonada. */
export const RECLAMO_VENCE_MS = 10 * MINUTO_MS;

export interface DepsMotor {
  prisma: PrismaClient;
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
    // Cada fase va aislada (EA-07): si programar falla, la recuperación de lo que un proceso muerto
    // dejó a medias (F1-01) y el envío de lo ya programado corren igual, y otra organización también.
    await aislado(resumen, { organizacionId: org.id, fase: "recuperar" }, () => recuperarAbandonadas(deps, db, ahora, resumen));
    await aislado(resumen, { organizacionId: org.id, fase: "programar" }, async () => {
      resumen.programadas += await programarReenganches(db, ahora, resumen);
    });
    await aislado(resumen, { organizacionId: org.id, fase: "ejecutar" }, () => ejecutarVencidas(deps, db, ahora, resumen));
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

async function programarReenganches(db: BaseDatos, ahora: Date, resumen: ResumenMotor): Promise<number> {
  let programadas = 0;
  const automatizaciones = await db.automatizacion.findMany({
    where: { activo: true, evento_disparador: "lead_sin_respuesta" },
    orderBy: { creado_en: "asc" },
  });

  // Una automatización defectuosa (zona horaria inválida, etc.) no detiene a las demás (EA-07).
  for (const a of automatizaciones) {
    await aislado(resumen, { automatizacionId: a.id, fase: "programar" }, async () => {
      programadas += await programarUna(db, a, ahora, resumen);
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
      paso_captacion: { in: ["nombre", "edad", "sucursal"] },
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

async function ejecutarVencidas(deps: DepsMotor, db: BaseDatos, ahora: Date, resumen: ResumenMotor): Promise<void> {
  for (const e of await leerVencidas(db, ahora)) {
    // Reclamar antes de actuar: solo quien gana el reclamo manda (invariante 8).
    const reclamo = await db.automatizacion_ejecucion.updateMany({
      where: { id: e.id, estatus: "programado", ejecutado_en: null },
      data: { ejecutado_en: ahora },
    });
    if (reclamo.count !== 1) continue;
    const progreso: Progreso = {};
    try {
      await ejecutarUna(deps, db, e, ahora, resumen, progreso);
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

async function ejecutarUna(deps: DepsMotor, db: BaseDatos, e: Vencida, ahora: Date, resumen: ResumenMotor, progreso: Progreso): Promise<void> {
  const omitir = async (motivo: string): Promise<void> => {
    await db.automatizacion_ejecucion.update({ where: { id: e.id }, data: { estatus: "omitido", motivo_omision: motivo } });
    resumen.omitidas++;
    log.info("automatizacion_omitida", { ejecucionId: e.id, motivo });
  };

  if (e.entidad_tipo !== "conversacion") return omitir("entidad_no_soportada");

  const conv = await db.conversacion.findFirst({
    where: { id: e.entidad_id },
    include: { lead: true, bandeja_chatwoot: { include: { canal_whatsapp: { include: { vertical: true } } } } },
  });
  if (!conv) return omitir("conversacion_inexistente");
  // El include no filtra lo borrado: un lead con eliminado_en no recibe nada (F1-05).
  if (conv.lead.eliminado_en) return omitir("lead_eliminado");

  // Omisión por un problema de configuración o de datos: no se manda y una persona decide
  // (invariante 5). Una sola tarea pendiente por conversación.
  const omitirConTarea = async (motivo: string): Promise<void> => {
    await omitir(motivo);
    await asegurarTareaAsesor(db, {
      leadId: conv.lead_id,
      conversacionId: conv.id,
      tipo: "revision_manual",
      descripcion: `La automatización «${e.automatizacion.nombre}» no se le mandó a este contacto (${motivo}). Revisa su configuración o escríbele tú.`,
    });
  };

  const plantilla = e.automatizacion.plantilla;
  if (!plantilla) return omitirConTarea("sin_plantilla");

  // Revalidar: el contacto pudo escribir después de que se programó (o se recorrió al horario).
  // La condición es la misma con la que se programó: silencio de `ocurrencia × offset` desde su último mensaje.
  if (e.automatizacion.evento_disparador === "lead_sin_respuesta") {
    const desde = conv.ultimo_mensaje_entrante_en;
    const silencioCumplidoEn = desde ? desde.getTime() + e.ocurrencia * e.automatizacion.offset_minutos * MINUTO_MS : null;
    if (silencioCumplidoEn === null || silencioCumplidoEn > ahora.getTime()) return omitir("contacto_respondio");
  }

  const zona = await zonaHorariaDeContacto(db, conv.lead.sucursal_interes_id, conv.bandeja_chatwoot.canal_whatsapp.sucursal_id, conv.lead.vertical_interes_id);
  // Lo programado fuera de rango se recorre; si con eso llegaría después del evento, se descarta.
  const reprogramarODescartar = async (ventana?: VentanaHoraria): Promise<void> => {
    const siguiente = zona ? recorrerODescartar(ahora, zona, deps.limiteDe?.(e) ?? null, ventana) : null;
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

  const variables = await resolverVariables(db, plantilla.variables, conv);
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
  // Quien gana este reclamo (mismo ejecutado_en que se leyó) resuelve; los demás motores la saltan.
  const reclamo = await db.automatizacion_ejecucion.updateMany({
    where: { id: e.id, estatus: "programado", ejecutado_en: e.ejecutado_en },
    data: { ejecutado_en: ahora },
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
      await deps.mensajeria.recuperarEnviosInciertos(db, { desde: ahora, mensajeId: mensaje.id });
      await cierre("fallido", ENVIO_INCIERTO);
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
        valor = (await db.prospecto.findFirst({ where: { lead_id: conv.lead.id, origen: "bot" } }))?.nombre;
        break;
      case "nombre_sucursal":
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
