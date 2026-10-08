// Organización de prueba con una vertical, dos sucursales y una bandeja de Chatwoot. Usa el
// cliente sin scope porque las organizaciones no se crean desde el scope (invariante 1). Los
// ids de Chatwoot son aleatorios para que las corridas no choquen entre sí.

import { randomInt, randomUUID } from "node:crypto";
import type { PrismaClient } from "../datos/prisma.ts";

export interface OrganizacionDePrueba {
  organizacionId: string;
  verticalId: string;
  sucursales: { id: string; nombre: string }[];
  canalId: string;
  bandejaId: string;
  /** Primera etapa del embudo: donde nace todo lead. */
  etapaInicialId: string;
  chatwootAccountId: number;
  chatwootInboxId: number;
}

export async function sembrarOrganizacion(prisma: PrismaClient, nombre = "Organización de prueba"): Promise<OrganizacionDePrueba> {
  const organizacion = await prisma.organizacion.create({ data: { nombre: `${nombre} ${randomUUID().slice(0, 8)}` } });
  const org = organizacion.id;
  const vertical = await prisma.vertical.create({
    data: { organizacion_id: org, nombre: "Vertical Prueba", slug: "vertical-prueba" },
  });
  const sucursales = [];
  for (const nombreSucursal of ["Norte", "Sur"]) {
    const s = await prisma.sucursal.create({
      data: { organizacion_id: org, nombre: nombreSucursal, zona_horaria: "America/Mexico_City" },
    });
    await prisma.sucursal_vertical.create({ data: { organizacion_id: org, sucursal_id: s.id, vertical_id: vertical.id } });
    sucursales.push({ id: s.id, nombre: s.nombre });
  }
  const etapa = await prisma.etapa_pipeline.create({ data: { organizacion_id: org, nombre: "Primera", orden: 1 } });
  const canal = await prisma.canal_whatsapp.create({
    data: { organizacion_id: org, vertical_id: vertical.id, nombre_publico: "Canal de prueba" },
  });
  const chatwootAccountId = randomInt(1_000_000, 2_000_000_000);
  const chatwootInboxId = randomInt(1_000_000, 2_000_000_000);
  const bandeja = await prisma.bandeja_chatwoot.create({
    data: {
      organizacion_id: org,
      canal_whatsapp_id: canal.id,
      nombre: "Vertical Prueba",
      chatwoot_account_id: chatwootAccountId,
      chatwoot_inbox_id: chatwootInboxId,
    },
  });
  return {
    organizacionId: org,
    verticalId: vertical.id,
    sucursales,
    canalId: canal.id,
    bandejaId: bandeja.id,
    etapaInicialId: etapa.id,
    chatwootAccountId,
    chatwootInboxId,
  };
}

/** Crea o actualiza la fila de configuración de la organización (los tests la fijan a su medida). */
export async function fijarConfiguracion(
  prisma: PrismaClient,
  organizacionId: string,
  valores: { max_automaticos_por_dia?: number; max_marketing_por_ventana?: number; ventana_marketing_dias?: number },
): Promise<void> {
  const viva = await prisma.configuracion_organizacion.findFirst({ where: { organizacion_id: organizacionId, eliminado_en: null } });
  if (viva) await prisma.configuracion_organizacion.update({ where: { id: viva.id }, data: valores });
  else await prisma.configuracion_organizacion.create({ data: { organizacion_id: organizacionId, ...valores } });
}
