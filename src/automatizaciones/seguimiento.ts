// Lead frío y promoción por vencer (D8): lo que el motor necesita saber para PROGRAMAR y para REVALIDAR estas dos automatizaciones. Este módulo
// no manda nada: el motor (`motor.ts`) arma el mensaje y lo entrega a MessagingProvider, que aplica TODAS las reglas (baja, ventana de servicio y
// plantilla, horario 09:00–20:00 de la sucursal, máximo de marketing por ventana, tope diario de automáticos, atención humana).
//
// LEAD FRÍO (evento `lead_frio`, entidad `lead`). Un lead está frío cuando lleva en su etapa sin movimiento los días de
// `etapa_pipeline.dias_alerta_sin_movimiento` (+ `automatizacion.offset_minutos` extra, 0 por omisión). Etapas de cierre, sin umbral o de un
// lead borrado: nunca. Solo se atiende lo que se enfrió RECIENTEMENTE (`condiciones.max_atraso_dias`, 14 por omisión): al encender la
// automatización no se le escribe de golpe a todos los leads viejos (esos se ven en `GET /api/leads/estancados`). La ocurrencia es el
// EPISODIO de frío: el segundo solo existe si el lead tuvo movimiento después de detectado el anterior, y hay a lo más `max_intentos`.
// Al ejecutarse: una tarea para el asesor (una pendiente por lead) y, si la automatización tiene plantilla y el lead una conversación de
// WhatsApp, la plantilla de reenganche (categoría `marketing`). Un lead atendido por una persona se omite entero (invariante 6).
//
// PROMOCIÓN POR VENCER (evento `promocion_por_vencer`, entidad `aviso_promocion`). Para cada lead con una cotización vigente cuyo snapshot
// aplica una promoción: el aviso sale `-offset_minutos` antes de que acabe la promoción (`-4320` = 3 días antes), recorrido al siguiente
// horario válido; si con eso llegaría cuando ya venció, se descarta y queda registrado (invariante 14). UN aviso por (automatización, lead,
// promoción): lo impone un índice único, así que el mismo aviso nunca se repite. Se cancela si el lead se inscribió o se perdió, si la
// cotización ya no vale o si la promoción dejó de estar vigente.

import { altaConAlcance, type BaseDatos } from "../datos/alcance.ts";
import { esViolacionUnica } from "../datos/prisma.ts";
import { fechaLocal } from "../lib/horario.ts";
import { estrechar, horarioDeEnvio, type HorarioDeEnvio } from "../mensajeria/horario-envio.ts";
import { instanteLocal, recorrerODescartar, type VentanaHoraria } from "../mensajeria/reglas.ts";
import { zonaHorariaDeContacto } from "../mensajeria/zona-horaria.ts";

const MINUTO_MS = 60_000;
const DIA_MS = 24 * 60 * MINUTO_MS;
export const ATRASO_MAXIMO_POR_OMISION_DIAS = 14;
const CANDIDATOS_POR_CORRIDA = 500;

export interface AutomatizacionDeSeguimiento {
  id: string;
  vertical_id: string | null;
  sucursal_id: string | null;
  offset_minutos: number;
  max_intentos: number;
  condiciones: unknown;
  hora_inicio_min: number;
  hora_fin_min: number;
  dias_permitidos: number[];
}

/** La ventana de la automatización recortada al horario de envío de la escuela (V5): nunca sale fuera de ninguna de las dos. */
const ventanaDe = (a: AutomatizacionDeSeguimiento, h: HorarioDeEnvio): VentanaHoraria => {
  const e = estrechar(a, h);
  return { inicioMin: e.hora_inicio_min, finMin: e.hora_fin_min, dias: a.dias_permitidos };
};

/** `condiciones.max_atraso_dias` (1 a 90) o el valor por omisión. */
export function atrasoMaximoDias(condiciones: unknown): number {
  const v = typeof condiciones === "object" && condiciones !== null && !Array.isArray(condiciones) ? (condiciones as Record<string, unknown>)["max_atraso_dias"] : undefined;
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 90 ? v : ATRASO_MAXIMO_POR_OMISION_DIAS;
}

// ── Lead frío: reglas puras ────────────────────────────────────────────────────────────────────────────

export interface ReferenciaDeLead {
  ultimaInteraccionEn: Date | null;
  creadoEn: Date;
}

/** Cuándo se enfría un lead: su última interacción (o su creación) + los días de su etapa + el offset extra. */
export function momentoDeFrio(l: ReferenciaDeLead, diasDeLaEtapa: number, offsetMinutos: number): Date {
  return new Date((l.ultimaInteraccionEn ?? l.creadoEn).getTime() + diasDeLaEtapa * DIA_MS + offsetMinutos * MINUTO_MS);
}

/**
 * ¿Hay que programar el aviso de lead frío? Sí si ya se enfrió (`momento <= ahora`) y se enfrió hace menos de `atrasoDias`: lo que se
 * enfrió hace más no se persigue (para eso está la lista de estancados). PURA.
 */
export function esFrioReciente(l: ReferenciaDeLead, diasDeLaEtapa: number, offsetMinutos: number, atrasoDias: number, ahora: Date): boolean {
  const momento = momentoDeFrio(l, diasDeLaEtapa, offsetMinutos).getTime();
  return momento <= ahora.getTime() && ahora.getTime() - momento <= atrasoDias * DIA_MS;
}

/**
 * La ocurrencia (episodio de frío) que toca, o null si no toca ninguna. La primera siempre; la siguiente solo si el lead tuvo movimiento
 * DESPUÉS de que se detectó el episodio anterior (si no, es el mismo frío), y sin pasar de `maxIntentos`. PURA.
 */
export function siguienteOcurrenciaDeFrio(previa: { ocurrencia: number; detectadoEn: Date } | null, ultimaInteraccionEn: Date | null, maxIntentos: number): number | null {
  if (!previa) return maxIntentos >= 1 ? 1 : null;
  if (previa.ocurrencia >= maxIntentos) return null;
  if (!ultimaInteraccionEn || ultimaInteraccionEn.getTime() <= previa.detectadoEn.getTime()) return null;
  return previa.ocurrencia + 1;
}

const ETAPAS_DE_CIERRE = ["inscrito", "perdido"] as const;

/** Programa las ejecuciones de lead frío de UNA automatización. Devuelve cuántas creó. Idempotente (índice único de la ejecución). */
export async function programarLeadsFrios(db: BaseDatos, a: AutomatizacionDeSeguimiento, ahora: Date): Promise<number> {
  const atraso = atrasoMaximoDias(a.condiciones);
  const ventana = ventanaDe(a, await horarioDeEnvio(db));
  const etapas = await db.etapa_pipeline.findMany({
    where: { dias_alerta_sin_movimiento: { not: null }, es_ganado: false, es_perdido: false, OR: [{ tipo_sistema: null }, { tipo_sistema: { notIn: [...ETAPAS_DE_CIERRE] } }] },
    select: { id: true, dias_alerta_sin_movimiento: true },
  });
  let creadas = 0;
  for (const etapa of etapas) {
    const dias = etapa.dias_alerta_sin_movimiento!;
    // La ventana de «frío reciente» en términos de la última interacción: ya cumplió los días y no se enfrió hace más de `atraso`.
    const hasta = new Date(ahora.getTime() - dias * DIA_MS - a.offset_minutos * MINUTO_MS);
    const desde = new Date(hasta.getTime() - atraso * DIA_MS);
    const leads = await db.lead.findMany({
      where: {
        etapa_id: etapa.id,
        ...(a.vertical_id ? { vertical_interes_id: a.vertical_id } : {}),
        ...(a.sucursal_id ? { sucursal_interes_id: a.sucursal_id } : {}),
        OR: [
          { ultima_interaccion_en: { lte: hasta, gte: desde } },
          { ultima_interaccion_en: null, creado_en: { lte: hasta, gte: desde } },
        ],
      },
      select: { id: true, ultima_interaccion_en: true, creado_en: true, sucursal_interes_id: true, vertical_interes_id: true },
      orderBy: [{ ultima_interaccion_en: { sort: "asc", nulls: "first" } }, { id: "asc" }],
      take: CANDIDATOS_POR_CORRIDA,
    });
    if (leads.length === 0) continue;
    const previas = await db.automatizacion_ejecucion.findMany({
      where: { automatizacion_id: a.id, entidad_tipo: "lead", entidad_id: { in: leads.map((l) => l.id) } },
      orderBy: { ocurrencia: "desc" },
      select: { entidad_id: true, ocurrencia: true, creado_en: true },
    });
    const ultimaPrevia = new Map<string, { ocurrencia: number; detectadoEn: Date }>();
    for (const p of previas) if (!ultimaPrevia.has(p.entidad_id)) ultimaPrevia.set(p.entidad_id, { ocurrencia: p.ocurrencia, detectadoEn: p.creado_en });
    for (const l of leads) {
      const ocurrencia = siguienteOcurrenciaDeFrio(ultimaPrevia.get(l.id) ?? null, l.ultima_interaccion_en, a.max_intentos);
      if (ocurrencia === null) continue;
      const zona = await zonaHorariaDeContacto(db, l.sucursal_interes_id, null, l.vertical_interes_id);
      const nominal = momentoDeFrio({ ultimaInteraccionEn: l.ultima_interaccion_en, creadoEn: l.creado_en }, dias, a.offset_minutos);
      // Fuera de horario se recorre al siguiente horario válido (invariante 14); sin evento al cual llegar tarde, nunca se descarta.
      const programado = zona ? recorrerODescartar(nominal, zona, null, ventana) : nominal;
      const r = await db.automatizacion_ejecucion.createMany({
        // `creado_en` es el reloj del motor: con él se sabe si el lead se movió DESPUÉS de detectado este episodio.
        data: [altaConAlcance({ automatizacion_id: a.id, entidad_tipo: "lead", entidad_id: l.id, ocurrencia, programado_para: programado ?? nominal, creado_en: ahora })],
        skipDuplicates: true,
      });
      creadas += r.count;
    }
  }
  return creadas;
}

export type MotivoDeCancelacionDeLeadFrio = "lead_inexistente" | "lead_inscrito" | "lead_perdido" | "lead_se_movio" | "etapa_sin_umbral";

/** Antes de ejecutar: el lead sigue vivo, en una etapa abierta y SIGUE frío (si se movió, el aviso ya no tiene sentido). */
export async function revalidarLeadFrio(
  db: BaseDatos,
  leadId: string,
  a: { offset_minutos: number },
  ahora: Date,
): Promise<{ ok: true; lead: { id: string; nombre_contacto: string | null; etapaNombre: string; dias: number; ultimaInteraccionEn: Date | null; creadoEn: Date } } | { ok: false; motivo: MotivoDeCancelacionDeLeadFrio }> {
  const lead = await db.lead.findFirst({
    where: { id: leadId },
    select: { id: true, nombre_contacto: true, ultima_interaccion_en: true, creado_en: true, etapa: { select: { nombre: true, es_ganado: true, es_perdido: true, tipo_sistema: true, dias_alerta_sin_movimiento: true } } },
  });
  if (!lead) return { ok: false, motivo: "lead_inexistente" };
  if (lead.etapa.es_ganado || lead.etapa.tipo_sistema === "inscrito") return { ok: false, motivo: "lead_inscrito" };
  if (lead.etapa.es_perdido || lead.etapa.tipo_sistema === "perdido") return { ok: false, motivo: "lead_perdido" };
  const dias = lead.etapa.dias_alerta_sin_movimiento;
  if (dias === null) return { ok: false, motivo: "etapa_sin_umbral" };
  if (momentoDeFrio({ ultimaInteraccionEn: lead.ultima_interaccion_en, creadoEn: lead.creado_en }, dias, a.offset_minutos).getTime() > ahora.getTime()) return { ok: false, motivo: "lead_se_movio" };
  return { ok: true, lead: { id: lead.id, nombre_contacto: lead.nombre_contacto, etapaNombre: lead.etapa.nombre, dias, ultimaInteraccionEn: lead.ultima_interaccion_en, creadoEn: lead.creado_en } };
}

/** La tarea para el asesor: una pendiente por lead (índice único parcial). Devuelve true si la creó. */
export async function asegurarTareaDeLeadFrio(db: BaseDatos, t: { leadId: string; conversacionId: string | null; descripcion: string }): Promise<boolean> {
  if (await db.tarea_asesor.findFirst({ where: { lead_id: t.leadId, tipo: "lead_frio", estado: "pendiente" }, select: { id: true } })) return false;
  try {
    await db.tarea_asesor.create({ data: altaConAlcance({ lead_id: t.leadId, conversacion_id: t.conversacionId, tipo: "lead_frio" as const, descripcion: t.descripcion }) });
    return true;
  } catch (e) {
    if (!esViolacionUnica(e)) throw e;
    return false;
  }
}

// ── Promoción por vencer: reglas puras ─────────────────────────────────────────────────────────────────

/** Los ids de las promociones que aplicó una cotización guardada (del snapshot congelado). Vacío si el JSON no tiene la forma esperada. */
export function promocionesDeSnapshot(snapshot: unknown): string[] {
  const obj = (x: unknown): Record<string, unknown> | null => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
  const aplicadas = obj(obj(obj(snapshot)?.["programa"])?.["promociones"])?.["aplicadas"];
  if (!Array.isArray(aplicadas)) return [];
  const ids = new Set<string>();
  for (const a of aplicadas) {
    const id = obj(a)?.["promocion_id"];
    if (typeof id === "string") ids.add(id);
  }
  return [...ids];
}

/** El instante en que la promoción YA no vale: las 00:00 del día siguiente a su último día (`AAAA-MM-DD`), en la zona de la sucursal. */
export function finDePromocion(venceEl: string, zona: string): Date {
  const [anio, mes, dia] = venceEl.split("-").map(Number) as [number, number, number];
  const siguiente = new Date(Date.UTC(anio, mes - 1, dia + 1));
  return instanteLocal(siguiente.getUTCFullYear(), siguiente.getUTCMonth() + 1, siguiente.getUTCDate(), 0, zona);
}

export type PlanDeAvisoDePromocion =
  | { estado: "aun_no"; abreEn: Date }
  | { estado: "vencida" }
  | { estado: "programar"; programadoPara: Date; limite: Date }
  | { estado: "descartar"; limite: Date };

/**
 * Cuándo sale el aviso de una promoción que vale hasta `venceEl`. El momento nominal es el fin de la promoción + `offset` (negativo). Antes
 * de él: «aún no». Ya vencida: no hay aviso. Dentro de la ventana: el siguiente horario válido de la sucursal, o descartado si ese horario
 * llegaría cuando ya venció (límite EXCLUSIVO: el instante en que vence ya no sirve). PURA.
 */
export function planearAvisoDePromocion(e: { venceEl: string; zona: string; offsetMinutos: number; ventana: VentanaHoraria; ahora: Date }): PlanDeAvisoDePromocion {
  const limite = finDePromocion(e.venceEl, e.zona);
  if (e.ahora.getTime() >= limite.getTime()) return { estado: "vencida" };
  const nominal = new Date(limite.getTime() + e.offsetMinutos * MINUTO_MS);
  if (e.ahora.getTime() < nominal.getTime()) return { estado: "aun_no", abreEn: nominal };
  const programado = recorrerODescartar(nominal, e.zona, limite, e.ventana, true);
  return programado ? { estado: "programar", programadoPara: programado, limite } : { estado: "descartar", limite };
}

const aIsoDia = (d: Date): string => d.toISOString().slice(0, 10);

/** Crea los avisos de promoción por vencer de UNA automatización y sus ejecuciones. Devuelve cuántos avisos nuevos creó. */
export async function programarAvisosDePromocion(db: BaseDatos, a: AutomatizacionDeSeguimiento, ahora: Date): Promise<number> {
  const ventana = ventanaDe(a, await horarioDeEnvio(db));
  // Un día de margen sobre la fecha UTC: la fecha local de cada sucursal se comprueba abajo.
  const ayer = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate() - 1));
  const cotizaciones = await db.cotizacion.findMany({
    where: {
      estatus: "vigente",
      vigente_hasta: { gte: ayer },
      lead: {
        ...(a.vertical_id ? { vertical_interes_id: a.vertical_id } : {}),
        ...(a.sucursal_id ? { sucursal_interes_id: a.sucursal_id } : {}),
        etapa: { es_ganado: false, es_perdido: false, OR: [{ tipo_sistema: null }, { tipo_sistema: { notIn: [...ETAPAS_DE_CIERRE] } }] },
      },
    },
    select: { id: true, lead_id: true, prospecto_id: true, sucursal_id: true, vigente_hasta: true, snapshot: true },
    orderBy: [{ creado_en: "asc" }, { id: "asc" }],
    take: CANDIDATOS_POR_CORRIDA,
  });
  if (cotizaciones.length === 0) return 0;
  const idsDePromocion = [...new Set(cotizaciones.flatMap((c) => promocionesDeSnapshot(c.snapshot)))];
  if (idsDePromocion.length === 0) return 0;
  const promociones = new Map((await db.promocion.findMany({ where: { id: { in: idsDePromocion }, activo: true, vigencia_hasta: { not: null } }, select: { id: true, vigencia_hasta: true } })).map((p) => [p.id, aIsoDia(p.vigencia_hasta!)]));
  const zonas = new Map((await db.sucursal.findMany({ where: { id: { in: [...new Set(cotizaciones.map((c) => c.sucursal_id))] } }, select: { id: true, zona_horaria: true } })).map((s) => [s.id, s.zona_horaria]));
  const existentes = await db.aviso_promocion.findMany({ where: { automatizacion_id: a.id, lead_id: { in: [...new Set(cotizaciones.map((c) => c.lead_id))] }, promocion_id: { in: idsDePromocion } }, select: { lead_id: true, promocion_id: true } });
  const yaAvisado = new Set(existentes.map((x) => `${x.lead_id}|${x.promocion_id}`));
  let nuevos = 0;
  for (const c of cotizaciones) {
    const zona = zonas.get(c.sucursal_id);
    if (!zona || fechaLocal(ahora, zona) > aIsoDia(c.vigente_hasta)) continue; // la cotización ya no vale en su calendario
    for (const promocionId of promocionesDeSnapshot(c.snapshot)) {
      const venceEl = promociones.get(promocionId);
      const llave = `${c.lead_id}|${promocionId}`;
      if (!venceEl || yaAvisado.has(llave)) continue;
      const plan = planearAvisoDePromocion({ venceEl, zona, offsetMinutos: a.offset_minutos, ventana, ahora });
      if (plan.estado === "aun_no" || plan.estado === "vencida") continue;
      yaAvisado.add(llave);
      try {
        await db.$transaction(async (tx) => {
          const aviso = await tx.aviso_promocion.create({
            data: altaConAlcance({ automatizacion_id: a.id, lead_id: c.lead_id, prospecto_id: c.prospecto_id, cotizacion_id: c.id, promocion_id: promocionId, vence_el: new Date(`${venceEl}T00:00:00.000Z`), creado_en: ahora }),
            select: { id: true },
          });
          await tx.automatizacion_ejecucion.create({
            data: altaConAlcance({
              automatizacion_id: a.id,
              entidad_tipo: "aviso_promocion",
              entidad_id: aviso.id,
              ocurrencia: 1,
              programado_para: plan.estado === "programar" ? plan.programadoPara : ahora,
              creado_en: ahora,
              // Si salir llegaría cuando ya venció, queda registrado como descartado (no se manda tarde, invariante 14).
              ...(plan.estado === "descartar" ? { estatus: "descartado" as const, motivo_omision: "evento_pasado" } : {}),
            }),
          });
        });
        nuevos++;
      } catch (e) {
        // Otro motor creó el mismo aviso al mismo tiempo: el índice único lo dejó pasar una sola vez.
        if (!esViolacionUnica(e)) throw e;
      }
    }
  }
  return nuevos;
}

export type MotivoDeCancelacionDeAviso = "aviso_inexistente" | "lead_inexistente" | "lead_inscrito" | "lead_perdido" | "cotizacion_no_vigente" | "promocion_no_vigente" | "promocion_extendida";

export interface AvisoCargado {
  id: string;
  leadId: string;
  prospectoNombre: string | null;
  promocionNombre: string;
  venceEl: string;
  zona: string;
  /** El instante en que la promoción ya no vale (el evento al que no se debe llegar tarde). */
  limite: Date;
}

/**
 * Antes de ejecutar el aviso: sigue todo vigente. Devuelve el aviso con los datos vivos (la promoción puede haberse prorrogado o
 * apagado) o el motivo por el que ya no procede. `vencida` no es un motivo de omisión: el motor la descarta (`evento_pasado`).
 */
export async function revalidarAvisoDePromocion(
  db: BaseDatos,
  avisoId: string,
  a: { offset_minutos: number },
  ahora: Date,
): Promise<{ ok: true; aviso: AvisoCargado; vencida: boolean } | { ok: false; motivo: MotivoDeCancelacionDeAviso }> {
  const aviso = await db.aviso_promocion.findFirst({
    where: { id: avisoId },
    select: {
      id: true,
      lead_id: true,
      cotizacion: { select: { estatus: true, vigente_hasta: true, sucursal: { select: { zona_horaria: true } }, prospecto: { select: { nombre: true } } } },
      promocion: { select: { nombre: true, activo: true, vigencia_hasta: true } },
      lead: { select: { eliminado_en: true, etapa: { select: { es_ganado: true, es_perdido: true, tipo_sistema: true } } } },
    },
  });
  if (!aviso) return { ok: false, motivo: "aviso_inexistente" };
  if (aviso.lead.eliminado_en) return { ok: false, motivo: "lead_inexistente" };
  if (aviso.lead.etapa.es_ganado || aviso.lead.etapa.tipo_sistema === "inscrito") return { ok: false, motivo: "lead_inscrito" };
  if (aviso.lead.etapa.es_perdido || aviso.lead.etapa.tipo_sistema === "perdido") return { ok: false, motivo: "lead_perdido" };
  const zona = aviso.cotizacion.sucursal.zona_horaria;
  if (aviso.cotizacion.estatus !== "vigente" || fechaLocal(ahora, zona) > aIsoDia(aviso.cotizacion.vigente_hasta)) return { ok: false, motivo: "cotizacion_no_vigente" };
  if (!aviso.promocion.activo || !aviso.promocion.vigencia_hasta) return { ok: false, motivo: "promocion_no_vigente" };
  const venceEl = aIsoDia(aviso.promocion.vigencia_hasta);
  const limite = finDePromocion(venceEl, zona);
  // Si la prorrogaron, ya no está «por vencer» dentro de la ventana de esta automatización.
  if (ahora.getTime() < limite.getTime() + a.offset_minutos * MINUTO_MS) return { ok: false, motivo: "promocion_extendida" };
  return { ok: true, vencida: ahora.getTime() >= limite.getTime(), aviso: { id: aviso.id, leadId: aviso.lead_id, prospectoNombre: aviso.cotizacion.prospecto.nombre, promocionNombre: aviso.promocion.nombre, venceEl, zona, limite } };
}

/** «viernes 20 de noviembre»: la fecha (`AAAA-MM-DD`) en español de México, para las plantillas. */
export function fechaLarga(venceEl: string): string {
  const [anio, mes, dia] = venceEl.split("-").map(Number) as [number, number, number];
  const partes = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).formatToParts(new Date(Date.UTC(anio, mes - 1, dia)));
  const de = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${de("weekday")} ${de("day")} de ${de("month")}`;
}
