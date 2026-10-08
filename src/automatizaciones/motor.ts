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
// Una ejecución reclamada que se queda a medias (el proceso murió) no se reintenta sola: es
// preferible no mandar a mandar dos veces.

import { altaConAlcance, conAlcance, type BaseDatos } from "../datos/alcance.ts";
import type { PrismaClient } from "../datos/prisma.ts";
import { listarOrganizaciones } from "../datos/sistema.ts";
import { log } from "../lib/log.ts";
import type { MessagingProvider } from "../mensajeria/index.ts";
import { dentroDeHorario, recorrerODescartar, siguienteHorarioValido, type VentanaHoraria } from "../mensajeria/reglas.ts";
import { zonaHorariaDeContacto } from "../mensajeria/zona-horaria.ts";

const MINUTO_MS = 60_000;
const POR_CORRIDA = 200;

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
}

export interface ResumenMotor {
  programadas: number;
  enviadas: number;
  reprogramadas: number;
  omitidas: number;
  descartadas: number;
  fallidas: number;
}

export async function correrAutomatizaciones(deps: DepsMotor): Promise<ResumenMotor> {
  const resumen: ResumenMotor = { programadas: 0, enviadas: 0, reprogramadas: 0, omitidas: 0, descartadas: 0, fallidas: 0 };
  const ahora = deps.reloj?.() ?? new Date();
  const organizaciones = (await listarOrganizaciones(deps.prisma)).filter(
    (o) => deps.organizacionId === undefined || o.id === deps.organizacionId,
  );
  for (const org of organizaciones) {
    const db = conAlcance(deps.prisma, org.id);
    resumen.programadas += await programarReenganches(db, ahora);
    await ejecutarVencidas(deps, db, ahora, resumen);
  }
  return resumen;
}

// ---------------------------------------------------------------------------------------------
// 1. Programar

async function programarReenganches(db: BaseDatos, ahora: Date): Promise<number> {
  let programadas = 0;
  const automatizaciones = await db.automatizacion.findMany({ where: { activo: true, evento_disparador: "lead_sin_respuesta" } });

  for (const a of automatizaciones) {
    const corte = new Date(ahora.getTime() - a.offset_minutos * MINUTO_MS);
    const conversaciones = await db.conversacion.findMany({
      where: {
        estado: "bot",
        pasar_a_asesor_pendiente: false,
        paso_captacion: { in: ["nombre", "edad", "sucursal"] },
        ultimo_mensaje_entrante_en: { lte: corte },
        lead: {
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
    });

    for (const c of conversaciones) {
      if (!c.ultimo_mensaje_entrante_en) continue;
      const previas = await db.automatizacion_ejecucion.findMany({
        where: { automatizacion_id: a.id, entidad_tipo: "conversacion", entidad_id: c.id },
        orderBy: { ocurrencia: "desc" },
        take: 1,
        select: { ocurrencia: true, estatus: true },
      });
      const ultima = previas[0];
      const n = ultima ? ultima.ocurrencia + 1 : 1;
      if (n > a.max_intentos) continue;
      // Otro intento solo después de que el anterior salió.
      if (ultima && ultima.estatus !== "enviado") continue;

      const nominal = new Date(c.ultimo_mensaje_entrante_en.getTime() + n * a.offset_minutos * MINUTO_MS);
      if (nominal.getTime() > ahora.getTime()) continue;

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
    }
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

async function ejecutarVencidas(deps: DepsMotor, db: BaseDatos, ahora: Date, resumen: ResumenMotor): Promise<void> {
  for (const e of await leerVencidas(db, ahora)) {
    // Reclamar antes de actuar: solo quien gana el reclamo manda (invariante 8).
    const reclamo = await db.automatizacion_ejecucion.updateMany({
      where: { id: e.id, estatus: "programado", ejecutado_en: null },
      data: { ejecutado_en: ahora },
    });
    if (reclamo.count !== 1) continue;
    try {
      await ejecutarUna(deps, db, e, ahora, resumen);
    } catch (err) {
      await db.automatizacion_ejecucion.update({ where: { id: e.id }, data: { estatus: "fallido", motivo_omision: "error_interno" } });
      resumen.fallidas++;
      log.error("automatizacion_error", { ejecucionId: e.id, error: (err as Error).message });
    }
  }
}

async function ejecutarUna(deps: DepsMotor, db: BaseDatos, e: Vencida, ahora: Date, resumen: ResumenMotor): Promise<void> {
  const omitir = async (motivo: string): Promise<void> => {
    await db.automatizacion_ejecucion.update({ where: { id: e.id }, data: { estatus: "omitido", motivo_omision: motivo } });
    resumen.omitidas++;
    log.info("automatizacion_omitida", { ejecucionId: e.id, motivo });
  };

  const plantilla = e.automatizacion.plantilla;
  if (!plantilla) return omitir("sin_plantilla");
  if (e.entidad_tipo !== "conversacion") return omitir("entidad_no_soportada");

  const conv = await db.conversacion.findFirst({
    where: { id: e.entidad_id },
    include: { lead: true, bandeja_chatwoot: { include: { canal_whatsapp: { include: { vertical: true } } } } },
  });
  if (!conv) return omitir("conversacion_inexistente");

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
  if (typeof variables === "string") return omitir(variables);
  const cuerpo = (plantilla.cuerpo_referencia ?? "").replace(/\{\{\s*(\d+)\s*\}\}/g, (_, pos: string) => variables[pos] ?? "");
  if (cuerpo.trim() === "") return omitir("plantilla_sin_cuerpo");

  const [mensajeId] = await db.$transaction((tx) =>
    deps.mensajeria.encolar(tx, conv.id, [{ tipo: "mensaje", cuerpo, origen: "automatizacion", plantilla: { id: plantilla.id, variables } }]),
  );
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
  await db.automatizacion_ejecucion.update({ where: { id: e.id }, data: { estatus: "fallido", motivo_omision: r ? "envio_fallido" : "sin_resultado", mensaje_id: mensajeId ?? null } });
  resumen.fallidas++;
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
