// Códigos de rastreo de WhatsApp (E1, E2). Un código corto viaja en la URL de la landing o en el primer mensaje de WhatsApp y dice de dónde viene
// el contacto: campaña, sucursal y, si llenó la landing, qué lead es. Formato: 8 caracteres de un alfabeto SIN ambiguos (sin I, L, O, 0 ni 1) y con
// al menos un dígito (lo impone también un CHECK), que se escribe `ABCD-EFGH` pero se acepta en minúsculas, con espacios o signos de por medio.

import { randomInt } from "node:crypto";
import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import { normalizarNombre } from "../sensibles/campos.ts";

export const ALFABETO_DE_CODIGOS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LONGITUD_DE_CODIGO = 8;
const DIGITOS = "23456789";

/** Un código nuevo al azar (criptográfico) con al menos un dígito. */
export function generarCodigo(azar: (maximo: number) => number = (n) => randomInt(n)): string {
  for (;;) {
    let c = "";
    for (let i = 0; i < LONGITUD_DE_CODIGO; i++) c += ALFABETO_DE_CODIGOS[azar(ALFABETO_DE_CODIGOS.length)]!;
    if ([...c].some((x) => DIGITOS.includes(x))) return c;
  }
}

/** `ABCD-EFGH`: como se imprime y se manda. */
export const formatearCodigo = (codigo: string): string => `${codigo.slice(0, 4)}-${codigo.slice(4)}`;

/** ¿Tiene la forma de un código? (no si existe) */
export const esCodigoValido = (c: string): boolean => /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$/.test(c) && /[2-9]/.test(c);

/**
 * Lo que alguien escribió → un código, o null. Mayúsculas, sin acentos y sin signos ni espacios (`ab3d-ef7h`, `AB3D EF7H`, `ab3d.ef7h` valen igual).
 * El texto tiene que ser SOLO el código: para buscarlo dentro de un mensaje, `extraerCodigoDeMensaje` (E2).
 */
export function normalizarCodigoEscrito(texto: string): string | null {
  const limpio = normalizarNombre(texto).replaceAll("_", "").toUpperCase();
  return esCodigoValido(limpio) ? limpio : null;
}

export interface CodigoVigente {
  id: string;
  codigo: string;
  tipo: "campana" | "lead";
  campanaId: string | null;
  sucursalId: string | null;
  verticalId: string | null;
  leadId: string | null;
  usos: number;
  maxUsos: number | null;
}

const SELECCION = { id: true, codigo: true, tipo: true, campana_id: true, sucursal_id: true, vertical_id: true, lead_id: true, usos: true, max_usos: true } as const;
type Fila = { id: string; codigo: string; tipo: "campana" | "lead"; campana_id: string | null; sucursal_id: string | null; vertical_id: string | null; lead_id: string | null; usos: number; max_usos: number | null };
const aCodigo = (f: Fila): CodigoVigente => ({ id: f.id, codigo: f.codigo, tipo: f.tipo, campanaId: f.campana_id, sucursalId: f.sucursal_id, verticalId: f.vertical_id, leadId: f.lead_id, usos: f.usos, maxUsos: f.max_usos });

/**
 * El código, si EXISTE en esta organización y se puede usar ahora: activo, dentro de su vigencia y con usos disponibles. Un código de otra
 * organización no aparece (el scope), uno apagado, vencido o agotado tampoco: el que llama lo ignora sin romper nada.
 */
export async function buscarCodigoUsable(db: Consultas | BaseDatos, codigo: string, ahora: Date): Promise<CodigoVigente | null> {
  const f = (await db.codigo_rastreo.findFirst({
    where: {
      codigo,
      activo: true,
      AND: [{ OR: [{ vigente_desde: null }, { vigente_desde: { lte: ahora } }] }, { OR: [{ vigente_hasta: null }, { vigente_hasta: { gt: ahora } }] }],
    },
    select: SELECCION,
  })) as Fila | null;
  if (!f) return null;
  return f.max_usos !== null && f.usos >= f.max_usos ? null : aCodigo(f);
}

/** Días que vale el código de un lead que llenó la landing (si no escribe a WhatsApp en ese tiempo, deja de servir). */
export const VIGENCIA_DEL_CODIGO_DE_LEAD_DIAS = 30;

/** El código sin usar y vigente de un lead, o uno nuevo. Un lead tiene a lo más uno a la vez (índice único). Dentro de una transacción con candado por teléfono. */
export async function codigoDeLead(
  tx: Consultas,
  l: { leadId: string; campanaId: string | null; sucursalId: string | null; verticalId: string },
  ahora: Date,
): Promise<string> {
  const vivo = (await tx.codigo_rastreo.findFirst({
    where: { lead_id: l.leadId, tipo: "lead", usos: 0, activo: true, OR: [{ vigente_hasta: null }, { vigente_hasta: { gt: ahora } }] },
    select: { codigo: true },
  })) as { codigo: string } | null;
  if (vivo) return vivo.codigo;
  // Uno vencido sin usar estorba al índice «uno vivo sin usar por lead»: se apaga.
  await tx.codigo_rastreo.updateMany({ where: { lead_id: l.leadId, tipo: "lead", usos: 0, activo: true }, data: { activo: false } });
  for (let intento = 0; intento < 10; intento++) {
    const codigo = generarCodigo();
    if (await tx.codigo_rastreo.findFirst({ where: { codigo }, select: { id: true } })) continue;
    await tx.codigo_rastreo.create({
      data: altaConAlcance({
        codigo,
        tipo: "lead" as const,
        lead_id: l.leadId,
        campana_id: l.campanaId,
        sucursal_id: l.sucursalId,
        vertical_id: l.verticalId,
        max_usos: 1,
        vigente_desde: ahora,
        vigente_hasta: new Date(ahora.getTime() + VIGENCIA_DEL_CODIGO_DE_LEAD_DIAS * 24 * 60 * 60 * 1000),
      }),
    });
    return codigo;
  }
  throw new Error("No se pudo generar un código de rastreo único");
}
