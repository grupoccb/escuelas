// Las únicas consultas sin scope de organización. Cada una existe porque hay que averiguar la
// organización a partir de un identificador externo, antes de poder abrir el scope.
// Agregar otra aquí es una decisión explícita, no un atajo.
//
// Excepciones de inicio de sesión (B1): antes de abrir un alcance hay que saber de qué organización
// es quien llega. Son tres y solo devuelven lo mínimo:
// - `resolverOrganizacionPorSlug`: el identificador corto que escribe quien inicia sesión.
// - `unicaOrganizacion`: si solo existe UNA organización viva, el login puede omitir el slug.
// - `buscarSesionPorHash`: la cookie trae un token; su SHA-256 es la única llave para llegar a la
//   sesión, y la sesión dice la organización. Después de esto TODO va con `conAlcance`.

import { clienteSinAlcance, type PrismaRaiz } from "./prisma.ts";
import { normalizarNumeroWhatsapp } from "../lib/telefono.ts";

export interface BandejaResuelta {
  id: string;
  organizacion_id: string;
  canal_whatsapp_id: string;
  /** Vertical del canal: lo que el contacto quiere. */
  vertical_id: string;
  /** Sucursal fija del canal; nulo si el canal atiende todas. */
  sucursal_id: string | null;
}

/** Bandeja de Chatwoot de la que viene un evento del Agent Bot. */
export async function resolverBandejaChatwoot(
  raiz: PrismaRaiz,
  chatwootAccountId: number,
  chatwootInboxId: number,
): Promise<BandejaResuelta | null> {
  const prisma = clienteSinAlcance(raiz);
  const b = await prisma.bandeja_chatwoot.findFirst({
    where: {
      chatwoot_account_id: chatwootAccountId,
      chatwoot_inbox_id: chatwootInboxId,
      eliminado_en: null,
      organizacion: { eliminado_en: null },
      canal_whatsapp: { eliminado_en: null },
    },
    select: {
      id: true,
      organizacion_id: true,
      canal_whatsapp_id: true,
      canal_whatsapp: { select: { vertical_id: true, sucursal_id: true } },
    },
  });
  if (!b) return null;
  return {
    id: b.id,
    organizacion_id: b.organizacion_id,
    canal_whatsapp_id: b.canal_whatsapp_id,
    vertical_id: b.canal_whatsapp.vertical_id,
    sucursal_id: b.canal_whatsapp.sucursal_id,
  };
}

/**
 * Bandeja del canal de WhatsApp que tiene ese número receptor. El número se normaliza antes de
 * buscar (invariante 7). Sirve a las fuentes que traen el número receptor en el evento.
 */
export async function resolverBandejaPorNumero(raiz: PrismaRaiz, numeroReceptor: string): Promise<BandejaResuelta | null> {
  const prisma = clienteSinAlcance(raiz);
  const numero = normalizarNumeroWhatsapp(numeroReceptor);
  if (!numero) return null;
  const canal = await prisma.canal_whatsapp.findFirst({
    where: { numero_whatsapp: numero, eliminado_en: null, activo: true, organizacion: { eliminado_en: null } },
    select: {
      id: true,
      organizacion_id: true,
      vertical_id: true,
      sucursal_id: true,
      bandejas_chatwoot: { where: { eliminado_en: null }, select: { id: true }, take: 1 },
    },
  });
  const bandeja = canal?.bandejas_chatwoot[0];
  if (!canal || !bandeja) return null;
  return {
    id: bandeja.id,
    organizacion_id: canal.organizacion_id,
    canal_whatsapp_id: canal.id,
    vertical_id: canal.vertical_id,
    sucursal_id: canal.sucursal_id,
  };
}

/** Organizaciones vivas. Lo usa el aprovisionamiento de la demo para recorrerlas una por una. */
export async function listarOrganizaciones(raiz: PrismaRaiz): Promise<{ id: string; nombre: string }[]> {
  return clienteSinAlcance(raiz).organizacion.findMany({
    where: { eliminado_en: null },
    select: { id: true, nombre: true },
    orderBy: { creado_en: "asc" },
  });
}

/** Verifica que la base responde. */
export async function pingBaseDatos(raiz: PrismaRaiz): Promise<void> {
  await clienteSinAlcance(raiz).$queryRaw`SELECT 1`;
}

/** Organización a partir del identificador corto del login (`slug`). Solo organizaciones vivas. */
export async function resolverOrganizacionPorSlug(raiz: PrismaRaiz, slug: string): Promise<{ id: string } | null> {
  return clienteSinAlcance(raiz).organizacion.findFirst({ where: { slug, eliminado_en: null }, select: { id: true } });
}

/** La organización, si y solo si existe exactamente una viva (con slug o sin él); si no, null. */
export async function unicaOrganizacion(raiz: PrismaRaiz): Promise<{ id: string } | null> {
  const vivas = await clienteSinAlcance(raiz).organizacion.findMany({ where: { eliminado_en: null }, select: { id: true }, take: 2 });
  return vivas.length === 1 ? (vivas[0] ?? null) : null;
}

/** Lo que dice una sesión guardada. El token nunca se guarda: se busca por su SHA-256. */
export interface SesionGuardada {
  id: string;
  organizacion_id: string;
  usuario_id: string;
  expira_en: Date;
  ultima_actividad_en: Date;
  revocada_en: Date | null;
}

/** Sesión por el SHA-256 (hex) de su token. No filtra por organización: es de donde se obtiene. */
export async function buscarSesionPorHash(raiz: PrismaRaiz, tokenHash: string): Promise<SesionGuardada | null> {
  return clienteSinAlcance(raiz).sesion.findFirst({
    where: { token_hash: tokenHash, eliminado_en: null },
    select: { id: true, organizacion_id: true, usuario_id: true, expira_en: true, ultima_actividad_en: true, revocada_en: true },
  });
}
