// Cambios de etapa de un lead con historial (D7). El lead tiene UNA etapa actual (`lead.etapa_id`); cada vez que cambia —una persona con
// `PATCH /api/leads/:id/etapa`, o el sistema (clase agendada, asistió… por `moverLeadAEtapa`)— se anexa una fila a `lead_etapa_historial`
// (solo de anexar). Las reglas de qué movimientos valen están en `transiciones.ts` (puras).
//
// Concurrencia: un movimiento toma el candado `lead_etapa:<lead>` y el cambio es condicional a la etapa leída; quien trae `desde_etapa_id`
// (la etapa que vio en pantalla) recibe 409 si el lead ya se movió. Dos movimientos simultáneos del mismo lead se serializan: gana uno y el
// otro ve el resultado del primero (o, con `desde_etapa_id`, un 409).

import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import { transaccionConBloqueo } from "../datos/bloqueos.ts";
import { evaluarTransicion, tiempoPorEtapa, tramosEnEtapa, type MotivoDeRechazoDeTransicion, type ReglaDeMatriz, type TipoDeMovimiento } from "./transiciones.ts";

export const claveDeCandadoDeLead = (leadId: string): string => `lead_etapa:${leadId}`;

/** El alta del lead es la primera fila del historial (sin etapa anterior). Dentro de la transacción que crea al lead. */
export async function registrarAltaDeLead(tx: Consultas, leadId: string, etapaId: string, ahora?: Date): Promise<void> {
  await tx.lead_etapa_historial.create({
    data: altaConAlcance({ lead_id: leadId, etapa_anterior_id: null, etapa_nueva_id: etapaId, origen: "sistema" as const, motivo: "alta", ...(ahora ? { creado_en: ahora } : {}) }),
  });
}

const SELECCION_ETAPA = { id: true, nombre: true, orden: true, es_ganado: true, es_perdido: true, tipo_sistema: true } as const;
type FilaEtapa = { id: string; nombre: string; orden: number; es_ganado: boolean; es_perdido: boolean; tipo_sistema: string | null };
/** Una etapa «de cierre» lo es por su bandera o por su papel para el sistema (la escuela puede haber puesto solo una de las dos). */
export const aEtapaParaTransicion = (e: FilaEtapa) => ({ id: e.id, orden: e.orden, esGanado: e.es_ganado || e.tipo_sistema === "inscrito", esPerdido: e.es_perdido || e.tipo_sistema === "perdido" });

export interface EntradaDeMovimiento {
  leadId: string;
  haciaEtapaId: string;
  motivoPerdidaId?: string | null;
  nota?: string | null;
  /** La etapa en que el cliente VIO al lead: si ya cambió, el movimiento se rechaza (409). */
  desdeEtapaId?: string | null;
}

export interface ActorDeMovimiento {
  usuarioId: string;
  organizacionId: string;
  esAdministrador: boolean;
  ahora: Date;
}

export type MotivoDeRechazoDeMovimiento = MotivoDeRechazoDeTransicion | "lead_inexistente" | "etapa_inexistente" | "motivo_inexistente" | "el_lead_ya_cambio";

export type ResultadoDeMovimiento =
  | { ok: true; cambio: false; etapaId: string }
  | { ok: true; cambio: true; tipo: TipoDeMovimiento; desdeEtapaId: string; haciaEtapaId: string; historialId: string; recuperaciones: number; etapaAnterior: { id: string; nombre: string }; etapaNueva: { id: string; nombre: string } }
  | { ok: false; motivo: MotivoDeRechazoDeMovimiento; etapaActualId?: string };

/** Lo que cambió en el lead (ED-13): se entrega a `alCambiar` DENTRO de la transacción del movimiento, para registrarlo sin que pueda quedar fuera. */
export interface CambioDeLead {
  antes: { etapa_id: string; motivo_perdida_id: string | null; recuperaciones: number };
  despues: { etapa_id: string; motivo_perdida_id: string | null; recuperaciones: number };
}

/**
 * Mueve un lead de etapa por decisión de una persona. No lanza por reglas de negocio: devuelve `{ ok: false, motivo }`. `alCambiar` corre en la
 * MISMA transacción, solo si hubo cambio (el registro de quién cambió qué, ED-13): si falla, el movimiento no se confirma.
 */
export async function moverEtapaDeLead(db: BaseDatos, actor: ActorDeMovimiento, e: EntradaDeMovimiento, alCambiar?: (tx: Consultas, cambio: CambioDeLead) => Promise<void>): Promise<ResultadoDeMovimiento> {
  return transaccionConBloqueo(db, actor.organizacionId, claveDeCandadoDeLead(e.leadId), async (tx): Promise<ResultadoDeMovimiento> => {
    const lead = await tx.lead.findFirst({ where: { id: e.leadId }, select: { id: true, etapa_id: true, motivo_perdida_id: true, recuperaciones: true, etapa: { select: SELECCION_ETAPA } } });
    if (!lead) return { ok: false, motivo: "lead_inexistente" };
    const hacia = (await tx.etapa_pipeline.findFirst({ where: { id: e.haciaEtapaId }, select: SELECCION_ETAPA })) as FilaEtapa | null;
    if (!hacia) return { ok: false, motivo: "etapa_inexistente" };
    if (e.desdeEtapaId && e.desdeEtapaId !== lead.etapa_id) return { ok: false, motivo: "el_lead_ya_cambio", etapaActualId: lead.etapa_id };
    if (hacia.id === lead.etapa_id) return { ok: true, cambio: false, etapaId: lead.etapa_id };

    const motivoPerdidaId = e.motivoPerdidaId ?? null;
    if (motivoPerdidaId && !(await tx.motivo_perdida.findFirst({ where: { id: motivoPerdidaId, activo: true }, select: { id: true } }))) return { ok: false, motivo: "motivo_inexistente" };
    const nota = e.nota?.trim() ? e.nota.trim() : null;
    const regla = await tx.transicion_etapa.findFirst({ where: { desde_etapa_id: lead.etapa_id, hacia_etapa_id: hacia.id }, select: { regla: true } });
    const decision = evaluarTransicion({
      desde: aEtapaParaTransicion(lead.etapa),
      hacia: aEtapaParaTransicion(hacia),
      esAdministrador: actor.esAdministrador,
      regla: (regla?.regla ?? null) as ReglaDeMatriz | null,
      conMotivoDePerdida: motivoPerdidaId !== null,
      conNota: nota !== null,
    });
    if (!decision.ok) return { ok: false, motivo: decision.motivo };

    const recupera = decision.tipo === "recuperacion";
    const cambio = await tx.lead.updateMany({
      where: { id: lead.id, etapa_id: lead.etapa_id },
      data: {
        etapa_id: hacia.id,
        ultima_interaccion_en: actor.ahora,
        ...(decision.tipo === "perdida" ? { motivo_perdida_id: motivoPerdidaId } : {}),
        ...(recupera ? { motivo_perdida_id: null, recuperaciones: { increment: 1 } } : {}),
      },
    });
    if (cambio.count !== 1) return { ok: false, motivo: "el_lead_ya_cambio" };
    const fila = await tx.lead_etapa_historial.create({
      data: altaConAlcance({
        lead_id: lead.id,
        etapa_anterior_id: lead.etapa_id,
        etapa_nueva_id: hacia.id,
        origen: "usuario" as const,
        usuario_id: actor.usuarioId,
        motivo: decision.tipo,
        motivo_perdida_id: decision.tipo === "perdida" ? motivoPerdidaId : null,
        nota,
        es_recuperacion: recupera,
        creado_en: actor.ahora,
      }),
      select: { id: true },
    });
    await tx.interaccion.create({
      data: altaConAlcance({
        lead_id: lead.id,
        tipo: "cambio_etapa" as const,
        contenido: `Etapa: ${hacia.nombre}`,
        datos: { desde_etapa_id: lead.etapa_id, hacia_etapa_id: hacia.id, movimiento: decision.tipo, usuario_id: actor.usuarioId },
      }),
    });
    const actual = await tx.lead.findFirstOrThrow({ where: { id: lead.id }, select: { recuperaciones: true, motivo_perdida_id: true } });
    const recuperaciones = actual.recuperaciones;
    await alCambiar?.(tx, {
      antes: { etapa_id: lead.etapa_id, motivo_perdida_id: lead.motivo_perdida_id, recuperaciones: lead.recuperaciones },
      despues: { etapa_id: hacia.id, motivo_perdida_id: actual.motivo_perdida_id, recuperaciones },
    });
    return { ok: true, cambio: true, tipo: decision.tipo, desdeEtapaId: lead.etapa_id, haciaEtapaId: hacia.id, historialId: fila.id, recuperaciones, etapaAnterior: { id: lead.etapa.id, nombre: lead.etapa.nombre }, etapaNueva: { id: hacia.id, nombre: hacia.nombre } };
  });
}

// ── Historial y tiempo en cada etapa ───────────────────────────────────────────────────────────────────

export interface HistorialDeLead {
  leadId: string;
  etapaActual: { id: string; nombre: string };
  recuperaciones: number;
  motivoPerdida: { id: string; codigo: string; nombre: string } | null;
  cambios: {
    id: string;
    desde: { id: string; nombre: string | null } | null;
    hacia: { id: string; nombre: string | null };
    origen: "usuario" | "sistema";
    usuario: { id: string; nombre: string } | null;
    motivo: string | null;
    motivoPerdida: { id: string; codigo: string; nombre: string } | null;
    nota: string | null;
    esRecuperacion: boolean;
    creadoEn: Date;
    /** Cuánto estuvo en la etapa a la que entró en este cambio (hasta el siguiente cambio, o hasta ahora). */
    segundosEnLaEtapa: number;
  }[];
  tiempoPorEtapa: { etapa: { id: string; nombre: string | null }; segundos: number; veces: number }[];
}

/** El historial del lead (más antiguo primero) y cuánto tiempo pasó en cada etapa. null si el lead no existe o no es de este alcance. */
export async function historialDeLead(db: BaseDatos, leadId: string, ahora: Date, dondeLead: Record<string, unknown> = {}): Promise<HistorialDeLead | null> {
  const lead = await db.lead.findFirst({
    where: { id: leadId, ...dondeLead },
    select: { id: true, creado_en: true, etapa_id: true, recuperaciones: true, etapa: { select: { id: true, nombre: true } }, motivo_perdida: { select: { id: true, codigo: true, nombre: true } } },
  });
  if (!lead) return null;
  const filas = await db.lead_etapa_historial.findMany({
    where: { lead_id: lead.id },
    orderBy: [{ secuencia: "asc" }],
    select: { id: true, etapa_anterior_id: true, etapa_nueva_id: true, origen: true, motivo: true, nota: true, es_recuperacion: true, creado_en: true, usuario: { select: { id: true, nombre: true } }, motivo_perdida: { select: { id: true, codigo: true, nombre: true } } },
  });
  const ids = [...new Set(filas.flatMap((f) => [f.etapa_anterior_id, f.etapa_nueva_id]).filter((x): x is string => x !== null))];
  const nombres = new Map((await db.etapa_pipeline.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } })).map((e) => [e.id, e.nombre]));
  const tramos = tramosEnEtapa(lead.creado_en, lead.etapa_id, filas.map((f) => ({ etapaAnteriorId: f.etapa_anterior_id, etapaNuevaId: f.etapa_nueva_id, creadoEn: f.creado_en })), ahora);
  // El tramo que empieza en cada cambio: el primero es el de la creación (si el historial empieza con un movimiento), los demás van uno por cambio.
  const tramoDeCambio = tramos.length === filas.length + 1 ? tramos.slice(1) : tramos;
  return {
    leadId: lead.id,
    etapaActual: lead.etapa,
    recuperaciones: lead.recuperaciones,
    motivoPerdida: lead.motivo_perdida,
    cambios: filas.map((f, i) => ({
      id: f.id,
      desde: f.etapa_anterior_id ? { id: f.etapa_anterior_id, nombre: nombres.get(f.etapa_anterior_id) ?? null } : null,
      hacia: { id: f.etapa_nueva_id, nombre: nombres.get(f.etapa_nueva_id) ?? null },
      origen: f.origen,
      usuario: f.usuario,
      motivo: f.motivo,
      motivoPerdida: f.motivo_perdida,
      nota: f.nota,
      esRecuperacion: f.es_recuperacion,
      creadoEn: f.creado_en,
      segundosEnLaEtapa: tramoDeCambio[i]?.segundos ?? 0,
    })),
    tiempoPorEtapa: tiempoPorEtapa(tramos).map((t) => ({ etapa: { id: t.etapaId, nombre: nombres.get(t.etapaId) ?? (t.etapaId === lead.etapa_id ? lead.etapa.nombre : null) }, segundos: t.segundos, veces: t.veces })),
  };
}
