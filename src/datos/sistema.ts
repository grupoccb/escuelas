// Las únicas consultas sin scope de organización. Cada una existe porque hay que averiguar la
// organización a partir de un identificador externo, antes de poder abrir el scope.
// Agregar otra aquí es una decisión explícita, no un atajo.

import type { PrismaClient } from "../generated/prisma/client.ts";

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
  prisma: PrismaClient,
  chatwootAccountId: number,
  chatwootInboxId: number,
): Promise<BandejaResuelta | null> {
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

/** Organizaciones vivas. Lo usa el aprovisionamiento de la demo para recorrerlas una por una. */
export async function listarOrganizaciones(prisma: PrismaClient): Promise<{ id: string; nombre: string }[]> {
  return prisma.organizacion.findMany({
    where: { eliminado_en: null },
    select: { id: true, nombre: true },
    orderBy: { creado_en: "asc" },
  });
}

/** Verifica que la base responde. */
export async function pingBaseDatos(prisma: PrismaClient): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
