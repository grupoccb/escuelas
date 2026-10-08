// Código de rastreo en el primer mensaje de WhatsApp (E2). El enlace de la landing (E1) y el QR de una campaña (E3) mandan a la persona a WhatsApp con un
// mensaje prellenado que lleva un código corto («Mi código es ABCD-EFGH»). Cuando ese mensaje llega, este módulo:
//
//   1. lo ENCUENTRA en el texto (mayúsculas o minúsculas, con espacio, guion, punto o sin separador, rodeado de signos);
//   2. lo LIMPIA del texto que ve el bot, para que nunca lo tome por el nombre, la edad o la sucursal que está preguntando;
//   3. lo busca en la tabla de la organización: uno que no existe, de otra organización, apagado, vencido o agotado se IGNORA para la atribución, sin romper nada;
//   4. si sirve, deja la atribución (campaña, sucursal, fuente) en el lead y lo CONSUME (cuenta un uso, con tope).
//
// Reglas de atribución. El lead conserva su PRIMERA atribución: la de un anuncio Click-to-WhatsApp (vía de A7), o la de la landing, o la primera que recibió; un lead que
// todavía no tiene ninguna (llegó orgánico) sí la recibe del código. Si el primer mensaje trae a la vez la atribución del anuncio y un código, manda el anuncio (el
// adaptador de atribución no se toca) y el código no se cuenta. Un mensaje SIN código sigue exactamente como antes.

import { type Consultas } from "../datos/alcance.ts";
import type { ValorJson } from "../datos/tipos.ts";
import { campanaVigenteParaElCodigo, esCodigoValido, SELECCION_DE_CAMPANA, type CampanaDelCodigo, type CodigoVigente } from "./codigos.ts";

export interface CandidatoDeCodigo {
  codigo: string;
  inicio: number;
  fin: number;
}

// Cuatro caracteres, un separador opcional (espacio, guion, raya, punto, guion bajo, punto medio) y cuatro más; que no sean parte de una palabra más larga.
const PATRON = /(?<![\p{L}\p{N}])([A-Za-z2-9]{4})[\s\-‐-―._·]?([A-Za-z2-9]{4})(?![\p{L}\p{N}])/gu;
/** «Mi código es», «código:», «codigo» justo antes del código: se va con él. */
const ANTES_DEL_CODIGO = /(?:\bmi\s+)?c[oó]digo(?:\s+es)?\s*[:=]?\s*$/iu;

/** Los códigos con forma de código que hay en el texto, en orden. Que tengan la forma no quiere decir que existan: eso lo dice la tabla. PURA. */
export function candidatosDeCodigo(texto: string): CandidatoDeCodigo[] {
  const salida: CandidatoDeCodigo[] = [];
  for (const m of texto.matchAll(PATRON)) {
    const codigo = `${m[1]}${m[2]}`.toUpperCase();
    if (esCodigoValido(codigo)) salida.push({ codigo, inicio: m.index, fin: m.index + m[0].length });
  }
  return salida;
}

/** El texto sin esos fragmentos (y sin el «Mi código es» que los precede), con los espacios compactados. PURA. */
export function sinCodigos(texto: string, quitar: readonly CandidatoDeCodigo[]): string {
  let salida = "";
  let cursor = 0;
  for (const c of [...quitar].sort((a, b) => a.inicio - b.inicio)) {
    if (c.inicio < cursor) continue;
    let antes = texto.slice(cursor, c.inicio);
    antes = antes.replace(ANTES_DEL_CODIGO, "");
    salida += antes;
    cursor = c.fin;
  }
  salida += texto.slice(cursor);
  return salida.replace(/\s+/g, " ").trim();
}

export interface RastreoDelMensaje {
  /** Lo que ve el bot: el texto sin los códigos que la organización conoce. */
  textoLimpio: string;
  /** El primer código del texto que se puede usar ahora, o null. */
  usable: CodigoVigente | null;
  /** Cuántos códigos con forma de código había (para el registro). */
  encontrados: number;
}

const SELECCION = { id: true, codigo: true, tipo: true, campana_id: true, sucursal_id: true, vertical_id: true, lead_id: true, usos: true, max_usos: true, activo: true, vigente_desde: true, vigente_hasta: true, campana: { select: SELECCION_DE_CAMPANA } } as const;

/** EE-16: a lo más tantos candidatos por mensaje se buscan en la tabla (un mensaje de WhatsApp no llega ni a 4 096 caracteres; esto acota la consulta). */
export const MAX_CANDIDATOS_POR_MENSAJE = 10;

/**
 * Busca los códigos del texto en la organización. Quita del texto los que ella CONOCE (existan en su tabla aunque ya no sirvan) y deja intacto lo demás: una
 * palabra que solo se parece a un código («casa 2345») no se toca. `usable` es el primero que sirve ahora. Una sola consulta.
 */
export async function resolverCodigosDeMensaje(tx: Consultas, texto: string, ahora: Date): Promise<RastreoDelMensaje> {
  const candidatos = candidatosDeCodigo(texto).slice(0, MAX_CANDIDATOS_POR_MENSAJE);
  if (candidatos.length === 0) return { textoLimpio: texto, usable: null, encontrados: 0 };
  const filas = await tx.codigo_rastreo.findMany({ where: { codigo: { in: [...new Set(candidatos.map((c) => c.codigo))] } }, select: SELECCION });
  const conocidos = new Map(filas.map((f) => [f.codigo, f]));
  const sirve = async (f: (typeof filas)[number]): Promise<boolean> =>
    f.activo &&
    (f.vigente_desde === null || f.vigente_desde.getTime() <= ahora.getTime()) &&
    (f.vigente_hasta === null || f.vigente_hasta.getTime() > ahora.getTime()) &&
    (f.max_usos === null || f.usos < f.max_usos) &&
    // EE-03: una campaña apagada, dada de baja o fuera de sus fechas apaga sus códigos.
    (await campanaVigenteParaElCodigo(tx, { sucursal_id: f.sucursal_id, vertical_id: f.vertical_id, campana: f.campana as CampanaDelCodigo | null }, ahora));
  let usable: CodigoVigente | null = null;
  for (const c of candidatos) {
    const f = conocidos.get(c.codigo);
    if (f && (await sirve(f))) {
      usable = { id: f.id, codigo: f.codigo, tipo: f.tipo, campanaId: f.campana_id, sucursalId: f.sucursal_id, verticalId: f.vertical_id, leadId: f.lead_id, usos: f.usos, maxUsos: f.max_usos };
      break;
    }
  }
  return { textoLimpio: sinCodigos(texto, candidatos.filter((c) => conocidos.has(c.codigo))), usable, encontrados: candidatos.length };
}

/** Cuenta un uso del código, con tope y sin pasarse bajo concurrencia (cambio condicional): true si se pudo. */
export async function consumirCodigo(tx: Consultas, c: Pick<CodigoVigente, "id" | "maxUsos">): Promise<boolean> {
  const r = await tx.codigo_rastreo.updateMany({
    where: { id: c.id, activo: true, ...(c.maxUsos !== null ? { usos: { lt: c.maxUsos } } : {}) },
    data: { usos: { increment: 1 } },
  });
  return r.count === 1;
}

export interface LeadParaAtribuir {
  id: string;
  campana_id: string | null;
  atribucion: unknown;
  sucursal_interes_id: string | null;
  vertical_interes_id: string;
}

export type ResultadoDeAtribucion = "aplicado" | "ya_tenia_atribucion" | "agotado" | "no_aplica";

/** La atribución que deja un código en el lead. */
export function atribucionDeCodigo(c: CodigoVigente, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { fuente: c.tipo === "lead" ? "codigo_de_lead" : "codigo", codigo_rastreo: c.codigo, ...(c.campanaId ? { campana_id: c.campanaId } : {}), ...(c.sucursalId ? { sucursal_del_codigo_id: c.sucursalId } : {}), ...extra };
}

const tieneAtribucion = (l: Pick<LeadParaAtribuir, "campana_id" | "atribucion">): boolean => l.campana_id !== null || (l.atribucion !== null && l.atribucion !== undefined);

/**
 * Aplica un código usable a un lead YA existente (o recién creado, sin atribución): lo consume y deja campaña, sucursal (si el lead no tiene) y fuente. El lead que ya
 * tenía atribución la conserva y el código no se cuenta; un código de otra vertical, tampoco. Un código de LEAD (de la landing) del propio lead se consume sin cambiar nada
 * (ya tiene su atribución); el de OTRO lead (escribió desde otro teléfono) deja la campaña de aquel y la liga (`lead_de_landing_id`).
 */
export async function aplicarCodigoAlLead(tx: Consultas, lead: LeadParaAtribuir, c: CodigoVigente): Promise<ResultadoDeAtribucion> {
  if (c.verticalId !== null && c.verticalId !== lead.vertical_interes_id) return "no_aplica";
  if (c.tipo === "lead" && c.leadId === lead.id) return (await consumirCodigo(tx, c)) ? "aplicado" : "agotado";
  if (tieneAtribucion(lead)) return "ya_tenia_atribucion";
  const origen = c.tipo === "lead" && c.leadId ? await tx.lead.findFirst({ where: { id: c.leadId }, select: { id: true, campana_id: true, sucursal_interes_id: true, atribucion: true } }) : null;
  if (c.tipo === "lead" && !origen) return "no_aplica";
  if (!(await consumirCodigo(tx, c))) return "agotado";
  const campanaId = origen ? origen.campana_id : c.campanaId;
  const atribucion = origen
    ? { ...(typeof origen.atribucion === "object" && origen.atribucion !== null && !Array.isArray(origen.atribucion) ? (origen.atribucion as Record<string, unknown>) : {}), ...atribucionDeCodigo(c), lead_de_landing_id: origen.id }
    : atribucionDeCodigo(c);
  await tx.lead.updateMany({
    where: { id: lead.id, campana_id: null },
    data: { campana_id: campanaId, atribucion: atribucion as ValorJson, ...(lead.sucursal_interes_id === null ? { sucursal_interes_id: origen ? origen.sucursal_interes_id : c.sucursalId } : {}) },
  });
  return "aplicado";
}
