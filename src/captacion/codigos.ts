// Códigos de rastreo de WhatsApp (E1, E2). Un código corto viaja en la URL de la landing o en el primer mensaje de WhatsApp y dice de dónde viene
// el contacto: campaña, sucursal y, si llenó la landing, qué lead es. Formato: 8 caracteres de un alfabeto SIN ambiguos (sin I, L, O, 0 ni 1) y con
// al menos un dígito (lo impone también un CHECK), que se escribe `ABCD-EFGH` pero se acepta en minúsculas, con espacios o signos de por medio.

import { randomInt } from "node:crypto";
import { altaConAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import { fechaLocal } from "../lib/horario.ts";
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

/** La campaña de un código, con lo que hace falta para saber si sigue vigente (EE-03). */
export const SELECCION_DE_CAMPANA = { activo: true, fecha_inicio: true, fecha_fin: true, eliminado_en: true, sucursal_id: true, vertical_id: true } as const;
export interface CampanaDelCodigo {
  activo: boolean;
  fecha_inicio: Date | null;
  fecha_fin: Date | null;
  eliminado_en: Date | null;
  sucursal_id: string | null;
  vertical_id: string | null;
}

/** La zona horaria con la que se cuentan los días de una campaña: la de su sucursal, o la primera sucursal activa de su vertical, o la primera de la organización. */
async function zonaParaFechas(tx: Consultas | BaseDatos, sucursalId: string | null, verticalId: string | null): Promise<string | null> {
  if (sucursalId) return (await tx.sucursal.findFirst({ where: { id: sucursalId }, select: { zona_horaria: true } }))?.zona_horaria ?? null;
  if (verticalId) {
    const fila = await tx.sucursal_vertical.findFirst({ where: { vertical_id: verticalId, activo: true, sucursal: { activo: true, eliminado_en: null } }, orderBy: { creado_en: "asc" }, select: { sucursal: { select: { zona_horaria: true } } } });
    if (fila) return fila.sucursal.zona_horaria;
  }
  return (await tx.sucursal.findFirst({ where: { activo: true }, orderBy: { creado_en: "asc" }, select: { zona_horaria: true } }))?.zona_horaria ?? null;
}

/**
 * EE-03: ¿la campaña del código sigue valiendo? Un código sin campaña (el de un lead) sí. Una campaña apagada o dada de baja apaga sus códigos; una con
 * fechas solo vale de su primer a su último día (inclusive), contados en la zona de la sucursal del código (o la de la campaña).
 */
export async function campanaVigenteParaElCodigo(tx: Consultas | BaseDatos, f: { sucursal_id: string | null; vertical_id: string | null; campana: CampanaDelCodigo | null }, ahora: Date): Promise<boolean> {
  const c = f.campana;
  if (c === null) return true;
  if (!c.activo || c.eliminado_en !== null) return false;
  if (c.fecha_inicio === null && c.fecha_fin === null) return true;
  const zona = await zonaParaFechas(tx, f.sucursal_id ?? c.sucursal_id, f.vertical_id ?? c.vertical_id);
  const hoy = fechaLocal(ahora, zona ?? "UTC");
  const dia = (d: Date): string => d.toISOString().slice(0, 10);
  return (c.fecha_inicio === null || dia(c.fecha_inicio) <= hoy) && (c.fecha_fin === null || hoy <= dia(c.fecha_fin));
}

const SELECCION = { id: true, codigo: true, tipo: true, campana_id: true, sucursal_id: true, vertical_id: true, lead_id: true, usos: true, max_usos: true } as const;
type Fila = { id: string; codigo: string; tipo: "campana" | "lead"; campana_id: string | null; sucursal_id: string | null; vertical_id: string | null; lead_id: string | null; usos: number; max_usos: number | null };
const aCodigo = (f: Fila): CodigoVigente => ({ id: f.id, codigo: f.codigo, tipo: f.tipo, campanaId: f.campana_id, sucursalId: f.sucursal_id, verticalId: f.vertical_id, leadId: f.lead_id, usos: f.usos, maxUsos: f.max_usos });

/**
 * El código, si EXISTE en esta organización y se puede usar ahora: activo, dentro de su vigencia, con usos disponibles y con su campaña vigente (EE-03). Un código de otra
 * organización no aparece (el scope), uno apagado, vencido o agotado tampoco: el que llama lo ignora sin romper nada.
 */
export async function buscarCodigoUsable(db: Consultas | BaseDatos, codigo: string, ahora: Date): Promise<CodigoVigente | null> {
  const f = (await db.codigo_rastreo.findFirst({
    where: {
      codigo,
      activo: true,
      AND: [{ OR: [{ vigente_desde: null }, { vigente_desde: { lte: ahora } }] }, { OR: [{ vigente_hasta: null }, { vigente_hasta: { gt: ahora } }] }],
    },
    select: { ...SELECCION, campana: { select: SELECCION_DE_CAMPANA } },
  })) as (Fila & { campana: CampanaDelCodigo | null }) | null;
  if (!f) return null;
  if (f.max_usos !== null && f.usos >= f.max_usos) return null;
  return (await campanaVigenteParaElCodigo(db, f, ahora)) ? aCodigo(f) : null;
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
