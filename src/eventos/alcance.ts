// Quién ve qué eventos (G4): el administrador todos; asesor y recepción los de SUS sucursales; el maestro los de las sucursales donde da clase.

import { filtroDeSucursal } from "../api/alcance.ts";
import type { ContextoApi } from "../api/contexto.ts";

/** Condición de Prisma sobre `evento`. */
export async function dondeEventoVisible(ctx: Pick<ContextoApi, "usuario" | "alcance" | "alcanceCatalogo">): Promise<Record<string, unknown>> {
  if (ctx.usuario.rol === "administrador") return {};
  const filtro = filtroDeSucursal(ctx.usuario.rol === "maestro" ? await ctx.alcanceCatalogo() : await ctx.alcance());
  return filtro ? { sucursal_id: filtro } : {};
}
