// Avisos a un INSTRUCTOR por WhatsApp (D2, decisión 13). Quien los manda es MessagingProvider (invariante 4); este archivo
// es su parte para destinatarios que no son un lead.
//
// DISEÑO. Un instructor no es un lead: no entra al embudo ni corre el bot. Tiene su propia conversación de WhatsApp
// (`conversacion_instructor`, ligada a la bandeja de la vertical del grupo), que se abre con la primera plantilla porque él
// no escribió primero, y que registra cuándo responde (su ventana de servicio de 24 h). Cada aviso (`aviso_maestro`) es a la vez la lista de
// la aplicación y la unidad de envío, y pasa por LAS MISMAS reglas que un saliente a un contacto (`evaluarReglas`):
//   · baja del teléfono (opt-out) → bloqueado;
//   · ventana de servicio: dentro, mensaje libre; fuera, SOLO plantilla aprobada; sin plantilla apta no se manda y se crea tarea;
//   · horario 09:00–20:00 hora local de la sucursal del grupo: lo programado fuera se recorre al siguiente horario válido, y
//     si con eso llegaría a la hora de la clase o después, se descarta y se registra;
//   · frecuencia: el tope de automáticos por día (por teléfono);
//   · `en_atencion_humana` NO aplica: no hay una persona atendiendo al instructor.
// Idempotencia (invariante 8): uno por (clase, tipo) en la base; el envío se reclama con un cambio condicional de
// `pendiente` a `enviando` bajo el candado del teléfono, así que un reintento no manda dos veces.

import { leerConfiguracion } from "../configuracion/index.ts";
import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import { OPCIONES_BLOQUEO, transaccionConBloqueo, transaccionConBloqueoDeTelefono } from "../datos/bloqueos.ts";
import { log } from "../lib/log.ts";
import { estaDadoDeBaja } from "./consentimiento.ts";
import { evaluarReglas, recorrerODescartar, type MotivoBloqueo } from "./reglas.ts";
import { EnvioIncierto, type DestinoConversacion, type TransporteConversaciones } from "./transporte.ts";

/** Los códigos de las plantillas de cada tipo de aviso (viven en `plantilla_mensaje`; el texto es de la escuela). */
export const PLANTILLA_DE_AVISO = {
  agendada: "aviso_maestro_agendada",
  reprogramada: "aviso_maestro_reprogramada",
  cancelada: "aviso_maestro_cancelada",
} as const;

export type TipoDeAviso = keyof typeof PLANTILLA_DE_AVISO;

/** Cuánto puede quedarse un aviso en `enviando` sin id del proveedor antes de darlo por envío incierto. */
export const AVISO_INCIERTO_MS = 5 * 60 * 1000;

const DIA_MS = 24 * 60 * 60 * 1000;
const ERROR_INCIERTO = "envio_incierto";

export type ResultadoDeAviso =
  | { resultado: "enviado" }
  | { resultado: "pendiente"; motivo: "aun_no_es_su_hora" | "fuera_de_horario" }
  | { resultado: "bloqueado" | "descartado" | "fallido" | "sin_telefono"; motivo: string }
  | { resultado: "ya_procesado" };

/** Lo que se avisa, ya redactado para mostrarse (la zona horaria ya se aplicó al crear el aviso). Nunca datos de salud. */
export interface DatosDeAviso {
  nombre_alumno: string;
  nombre_grupo: string;
  nombre_sucursal: string;
  fecha_clase: string;
  hora_clase: string;
  /** El instante de la clase (ISO). */
  fecha_hora: string;
  /** Solo en `reprogramada`: cuándo era antes («lunes 5 de octubre a las 16:00»). */
  fecha_anterior?: string;
}

const ORDEN_DE_VARIABLES = ["nombre_alumno", "nombre_grupo", "nombre_sucursal", "fecha_clase", "hora_clase", "fecha_anterior"] as const;

/** El aviso como texto libre (cuando la ventana de servicio está abierta y no hay plantilla propia que lo redacte). */
export function textoDeAviso(tipo: TipoDeAviso, d: DatosDeAviso): string {
  if (tipo === "cancelada") return `Se canceló la clase muestra de ${d.nombre_alumno} en ${d.nombre_grupo} (${d.nombre_sucursal}) del ${d.fecha_clase} a las ${d.hora_clase}.`;
  if (tipo === "reprogramada") return `Se cambió la clase muestra de ${d.nombre_alumno} en ${d.nombre_grupo} (${d.nombre_sucursal}): era ${d.fecha_anterior ?? "otra fecha"}, ahora es el ${d.fecha_clase} a las ${d.hora_clase}.`;
  return `Nueva clase muestra: ${d.nombre_alumno} en ${d.nombre_grupo} (${d.nombre_sucursal}), el ${d.fecha_clase} a las ${d.hora_clase}.`;
}

function comoDatos(valor: unknown): DatosDeAviso | null {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return null;
  const v = valor as Record<string, unknown>;
  for (const k of ["nombre_alumno", "nombre_grupo", "nombre_sucursal", "fecha_clase", "hora_clase", "fecha_hora"]) if (typeof v[k] !== "string") return null;
  return v as unknown as DatosDeAviso;
}

interface DepsEnvioAInstructores {
  transporte: TransporteConversaciones;
  reloj: () => Date;
}

export class EnvioAInstructores {
  private readonly transporte: TransporteConversaciones;
  private readonly reloj: () => Date;

  constructor(deps: DepsEnvioAInstructores) {
    this.transporte = deps.transporte;
    this.reloj = deps.reloj;
  }

  /** Manda (o decide no mandar) UN aviso pendiente. Idempotente: un aviso que ya no está pendiente devuelve `ya_procesado`. */
  async avisar(db: BaseDatos, avisoId: string): Promise<ResultadoDeAviso> {
    const a = await db.aviso_maestro.findFirst({
      where: { id: avisoId },
      select: {
        id: true,
        instructor_id: true,
        clase_muestra_id: true,
        tipo: true,
        datos: true,
        entrega: true,
        programado_para: true,
        instructor: { select: { id: true, nombre: true, telefono: true, activo: true } },
        clase_muestra: { select: { fecha_hora: true, estatus: true, lead_id: true, grupo: { select: { programa: { select: { vertical_id: true, sucursal: { select: { zona_horaria: true } } } } } } } },
      },
    });
    if (!a || a.entrega !== "pendiente") return { resultado: "ya_procesado" };
    // El candado necesita la organización explícita; sale del propio alcance (la fila `organizacion` que el scope deja ver).
    const organizacionId = (await db.organizacion.findFirstOrThrow({ select: { id: true } })).id;
    const ahora = this.reloj();
    if (a.programado_para.getTime() > ahora.getTime()) return { resultado: "pendiente", motivo: "aun_no_es_su_hora" };
    const datos = comoDatos(a.datos);
    const clase = a.clase_muestra;
    const cerrar = async (entrega: "bloqueado" | "descartado" | "fallido" | "sin_telefono", motivo: string, conTarea: string | null): Promise<ResultadoDeAviso> => {
      const r = await db.aviso_maestro.updateMany({ where: { id: a.id, entrega: { in: ["pendiente", "enviando"] } }, data: { entrega, motivo_entrega: motivo } });
      if (r.count === 1 && conTarea) await this.tarea(db, { leadId: clase.lead_id, claseId: a.clase_muestra_id, descripcion: conTarea });
      return { resultado: entrega, motivo };
    };

    if (!datos) return cerrar("fallido", "datos_invalidos", `El aviso al maestro de una clase muestra no tiene datos legibles (${a.id}); avísale tú.`);
    const nombreMaestro = a.instructor.nombre;
    const sinWhatsApp = (porque: string): string => `No se le avisó por WhatsApp al maestro ${nombreMaestro} de la clase muestra de ${datos.nombre_alumno} en ${datos.nombre_grupo} (${datos.fecha_clase} a las ${datos.hora_clase}): ${porque}. El aviso sí está en su lista de la aplicación; avísale tú.`;
    if (!a.instructor.activo || !a.instructor.telefono) return cerrar("sin_telefono", "sin_telefono", sinWhatsApp("no tiene teléfono registrado"));
    // Un aviso de una clase que ya no existe como tal no tiene caso: agendada/reprogramada de una clase que se canceló o se movió.
    if (a.tipo !== "cancelada" && clase.estatus !== "agendada") return cerrar("descartado", "clase_ya_no_vigente", null);
    if (clase.fecha_hora.getTime() <= ahora.getTime()) return cerrar("descartado", "evento_pasado", null);

    const telefono = a.instructor.telefono;
    const verticalId = clase.grupo.programa.vertical_id;
    const zona = clase.grupo.programa.sucursal.zona_horaria;
    const tipo = a.tipo;

    // 1. Reclamar y decidir, bajo el candado del teléfono (contar y reclamar son una sola cosa: invariante 14, frecuencia).
    const decision = await transaccionConBloqueoDeTelefono(db, organizacionId, telefono, async (tx) => {
      const reclamo = await tx.aviso_maestro.updateMany({ where: { id: a.id, entrega: "pendiente" }, data: { entrega: "enviando", motivo_entrega: null } });
      if (reclamo.count !== 1) return { estado: "tomado" as const };
      const ci = await tx.conversacion_instructor.findFirst({ where: { instructor_id: a.instructor_id }, orderBy: { creado_en: "desc" }, select: { ventana_servicio_hasta: true } });
      const plantilla = await tx.plantilla_mensaje.findFirst({
        where: { codigo: PLANTILLA_DE_AVISO[tipo], activo: true, estado_aprobacion: "aprobada", OR: [{ vertical_id: null }, { vertical_id: verticalId }] },
        orderBy: [{ vertical_id: "desc" }, { creado_en: "asc" }],
        select: { codigo: true, idioma: true, content_sid: true, categoria: true, variables: true, cuerpo_referencia: true },
      });
      const config = await leerConfiguracion(tx);
      const motivo = evaluarReglas({
        // `en_atencion_humana` no aplica a un instructor: la conversación es siempre del sistema.
        conv: { estado: "bot", ventana_servicio_hasta: ci?.ventana_servicio_hasta ?? null, dado_de_baja: await estaDadoDeBaja(tx, telefono, "todo"), dado_de_baja_marketing: false },
        tipo: "mensaje",
        origen: "automatizacion",
        ahora,
        plantilla: plantilla ? { enviable: true, categoria: plantilla.categoria } : null,
        zonaHoraria: zona,
        automaticosRecientes: await this.enviadosAlTelefono(tx, telefono, a.id, new Date(ahora.getTime() - DIA_MS)),
        limiteFrecuencia: config.maxAutomaticosPorDia,
      });
      if (motivo === "fuera_de_horario") {
        // Se recorre al siguiente horario válido; si con eso llegaría a la hora de la clase o después, se descarta (invariante 14).
        const siguiente = recorrerODescartar(ahora, zona, clase.fecha_hora, undefined, true);
        if (siguiente) await tx.aviso_maestro.updateMany({ where: { id: a.id, entrega: "enviando" }, data: { entrega: "pendiente", programado_para: siguiente } });
        else await tx.aviso_maestro.updateMany({ where: { id: a.id, entrega: "enviando" }, data: { entrega: "descartado", motivo_entrega: "evento_pasado" } });
        return { estado: "frenado" as const, resultado: siguiente ? ({ resultado: "pendiente", motivo: "fuera_de_horario" } as const) : ({ resultado: "descartado", motivo: "evento_pasado" } as const) };
      }
      if (motivo) {
        await tx.aviso_maestro.updateMany({ where: { id: a.id, entrega: "enviando" }, data: { entrega: "bloqueado", motivo_entrega: motivo } });
        return { estado: "bloqueado" as const, motivo };
      }
      return { estado: "reclamado" as const, plantilla, ventanaAbierta: (ci?.ventana_servicio_hasta?.getTime() ?? 0) > ahora.getTime() };
    });

    if (decision.estado === "tomado") return { resultado: "ya_procesado" };
    if (decision.estado === "frenado") return decision.resultado;
    if (decision.estado === "bloqueado") {
      log.info("aviso_maestro_bloqueado", { avisoId: a.id, motivo: decision.motivo });
      // Fuera de la ventana de servicio y sin plantilla apta: no se manda y una persona decide (invariante 5).
      const sinPlantilla: MotivoBloqueo[] = ["fuera_de_ventana", "plantilla_no_apta"];
      if (sinPlantilla.includes(decision.motivo)) await this.tarea(db, { leadId: clase.lead_id, claseId: a.clase_muestra_id, descripcion: sinWhatsApp("no hay una plantilla aprobada que se pueda usar fuera de la ventana de 24 h") });
      return { resultado: "bloqueado", motivo: decision.motivo };
    }

    // 2. Fuera de la transacción: la conversación del instructor (se abre si no existe) y el envío.
    const cuerpoPlantilla = decision.plantilla?.cuerpo_referencia ?? null;
    const variables = variablesDe(decision.plantilla?.variables, datos);
    const cuerpo = cuerpoPlantilla ? renderizar(cuerpoPlantilla, variables) : textoDeAviso(tipo, datos);
    try {
      const destino = await this.conversacionDe(db, organizacionId, { id: a.instructor_id, nombre: nombreMaestro, telefono }, verticalId);
      const { idExterno } = decision.ventanaAbierta
        ? await this.transporte.enviarMensaje(destino, cuerpo)
        : await this.transporte.enviarPlantilla(destino, { codigo: decision.plantilla!.codigo, idioma: decision.plantilla!.idioma, contentSid: decision.plantilla!.content_sid, variables, cuerpo });
      await db.aviso_maestro.updateMany({ where: { id: a.id, entrega: "enviando" }, data: { entrega: "enviado", id_externo: idExterno, enviado_en: this.reloj(), motivo_entrega: null } });
      log.info("aviso_maestro_enviado", { avisoId: a.id });
      return { resultado: "enviado" };
    } catch (e) {
      const incierto = e instanceof EnvioIncierto;
      // Incierto: pudo haber salido; NUNCA se reenvía. Definitivo: no salió y tampoco se reintenta sola.
      const motivo = incierto ? ERROR_INCIERTO : "envio_fallido";
      const r = await db.aviso_maestro.updateMany({ where: { id: a.id, entrega: "enviando" }, data: { entrega: "fallido", motivo_entrega: motivo } });
      if (r.count === 1) await this.tarea(db, { leadId: clase.lead_id, claseId: a.clase_muestra_id, descripcion: sinWhatsApp(incierto ? "el envío quedó a medias y no se sabe si salió; no se reenvió para no duplicarlo" : "el envío falló") });
      log.error("aviso_maestro_fallido", { avisoId: a.id, motivo, error: (e as Error).message });
      return { resultado: "fallido", motivo };
    }
  }

  /**
   * ED-01: confirma UNA vez la baja que un instructor acaba de pedir. Es la única respuesta que sale a quien se dio de baja: contesta a su
   * mensaje, así que va dentro de su ventana de servicio de 24 h (recién abierta) y sin restricción de horario; si la ventana no está abierta
   * o el transporte falla, no se manda (la baja ya quedó registrada y los avisos siguientes se bloquean). Nunca lanza.
   */
  async confirmarBaja(db: BaseDatos, conversacionInstructorId: string, texto: string): Promise<"enviado" | "bloqueado" | "fallido"> {
    const ci = await db.conversacion_instructor.findFirst({
      where: { id: conversacionInstructorId },
      select: { ventana_servicio_hasta: true, chatwoot_conversacion_id: true, bandeja_chatwoot: { select: { chatwoot_account_id: true } } },
    });
    const cuenta = ci?.bandeja_chatwoot.chatwoot_account_id ?? null;
    if (!ci || cuenta === null) return "fallido";
    const motivo = evaluarReglas({
      conv: { estado: "bot", ventana_servicio_hasta: ci.ventana_servicio_hasta, dado_de_baja: true, dado_de_baja_marketing: false },
      tipo: "mensaje",
      origen: "confirmacion_baja",
      ahora: this.reloj(),
      plantilla: null,
      zonaHoraria: null,
      automaticosRecientes: 0,
      limiteFrecuencia: 1,
    });
    if (motivo) return "bloqueado";
    try {
      await this.transporte.enviarMensaje({ chatwootAccountId: cuenta, chatwootConversacionId: ci.chatwoot_conversacion_id }, texto);
      return "enviado";
    } catch (e) {
      log.error("baja_instructor_confirmacion_fallida", { conversacionInstructorId, error: (e as Error).message });
      return "fallido";
    }
  }

  /**
   * Recuperación de avisos que quedaron en `enviando` sin id del proveedor (el proceso murió entre mandar y guardar): pudieron salir o
   * no, así que NUNCA se reenvían; se marcan `fallido` / `envio_incierto` y se deja una tarea. Idempotente. Devuelve cuántos.
   */
  async recuperarInciertos(db: BaseDatos, desde = new Date(this.reloj().getTime() - AVISO_INCIERTO_MS)): Promise<number> {
    const colgados = await db.aviso_maestro.findMany({
      where: { entrega: "enviando", id_externo: null, actualizado_en: { lt: desde } },
      select: { id: true, clase_muestra_id: true, clase_muestra: { select: { lead_id: true } }, instructor: { select: { nombre: true } } },
    });
    let n = 0;
    for (const c of colgados) {
      const r = await db.aviso_maestro.updateMany({ where: { id: c.id, entrega: "enviando", id_externo: null }, data: { entrega: "fallido", motivo_entrega: ERROR_INCIERTO } });
      if (r.count !== 1) continue;
      n++;
      await this.tarea(db, { leadId: c.clase_muestra.lead_id, claseId: c.clase_muestra_id, descripcion: `Un aviso al maestro ${c.instructor.nombre} sobre una clase muestra quedó a medias y no se sabe si salió por WhatsApp. No se reenvió para no duplicarlo; avísale tú si hace falta.` });
    }
    return n;
  }

  /** La tarea para el asesor cuando el aviso no salió por WhatsApp. */
  private async tarea(db: Consultas, t: { leadId: string; claseId: string; descripcion: string }): Promise<void> {
    await db.tarea_asesor.create({ data: altaConAlcance({ lead_id: t.leadId, clase_muestra_id: t.claseId, tipo: "aviso_maestro_no_enviado" as const, descripcion: t.descripcion }) });
  }

  /** Avisos que se le mandaron a este teléfono desde `desde` (enviados, inciertos o en curso): el tope diario cuenta todos. */
  private async enviadosAlTelefono(tx: Consultas, telefono: string, excluirId: string, desde: Date): Promise<number> {
    const avisos = await tx.aviso_maestro.count({
      where: {
        id: { not: excluirId },
        instructor: { telefono },
        OR: [{ entrega: "enviado", enviado_en: { gt: desde } }, { entrega: "enviando", actualizado_en: { gt: desde } }, { entrega: "fallido", motivo_entrega: ERROR_INCIERTO, actualizado_en: { gt: desde } }],
      },
    });
    // Si ese mismo teléfono también es de un contacto, sus automáticos cuentan en el mismo tope.
    const aContactos = await tx.mensaje.count({
      where: {
        direccion: "saliente",
        OR: [{ origen: "automatizacion" }, { plantilla_id: { not: null } }],
        AND: [{ OR: [{ estatus: { in: ["enviado", "entregado", "leido"] }, enviado_en: { gt: desde } }, { estatus: "enviando", actualizado_en: { gt: desde } }] }],
        conversacion: { lead: { telefono } },
      },
    });
    return avisos + aContactos;
  }

  /**
   * El destino de la conversación de este instructor. Si no tiene (nunca ha hablado con la escuela) se abre una en la bandeja de la
   * vertical del grupo; todo bajo un candado por instructor para que dos avisos a la vez no abran dos.
   */
  private async conversacionDe(db: BaseDatos, organizacionId: string, instructor: { id: string; nombre: string; telefono: string }, verticalId: string): Promise<DestinoConversacion> {
    return transaccionConBloqueo(db, organizacionId, `conversacion_instructor:${instructor.id}`, async (tx) => {
      const existente = await tx.conversacion_instructor.findFirst({
        where: { instructor_id: instructor.id },
        orderBy: { creado_en: "desc" },
        select: { chatwoot_conversacion_id: true, bandeja_chatwoot: { select: { chatwoot_account_id: true } } },
      });
      if (existente && existente.bandeja_chatwoot.chatwoot_account_id !== null) {
        return { chatwootAccountId: existente.bandeja_chatwoot.chatwoot_account_id, chatwootConversacionId: existente.chatwoot_conversacion_id };
      }
      const bandeja = await tx.bandeja_chatwoot.findFirst({
        where: { canal_whatsapp: { vertical_id: verticalId }, chatwoot_account_id: { not: null }, chatwoot_inbox_id: { not: null } },
        orderBy: { creado_en: "asc" },
        select: { id: true, chatwoot_account_id: true, chatwoot_inbox_id: true },
      });
      if (!bandeja || bandeja.chatwoot_account_id === null || bandeja.chatwoot_inbox_id === null) throw new Error("La vertical del grupo no tiene una bandeja de WhatsApp aprovisionada para avisarle al instructor");
      const { chatwootConversacionId } = await this.transporte.iniciarConversacion(bandeja.chatwoot_account_id, bandeja.chatwoot_inbox_id, { telefono: instructor.telefono, nombre: instructor.nombre });
      await tx.conversacion_instructor.create({ data: altaConAlcance({ instructor_id: instructor.id, bandeja_chatwoot_id: bandeja.id, chatwoot_conversacion_id: chatwootConversacionId }) });
      return { chatwootAccountId: bandeja.chatwoot_account_id, chatwootConversacionId };
    }, { ...OPCIONES_BLOQUEO, timeout: 20_000 });
  }
}

/** Las variables de la plantilla por posición, desde los datos del aviso. Lo que falta va vacío (la plantilla de la escuela decide qué usa). */
function variablesDe(definidas: unknown, d: DatosDeAviso): Record<string, string> {
  const salida: Record<string, string> = {};
  if (!Array.isArray(definidas)) return salida;
  for (const def of definidas) {
    if (typeof def !== "object" || def === null) continue;
    const { pos, nombre } = def as { pos?: unknown; nombre?: unknown };
    if (typeof pos !== "number" || typeof nombre !== "string") continue;
    if ((ORDEN_DE_VARIABLES as readonly string[]).includes(nombre)) salida[String(pos)] = (d as unknown as Record<string, string | undefined>)[nombre] ?? "";
  }
  return salida;
}

const renderizar = (cuerpo: string, variables: Record<string, string>): string => cuerpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, pos: string) => variables[pos] ?? "");
