// Quién ve qué inscripciones (F3): el administrador todas; asesor y recepción las de grupos de SUS sucursales; el maestro las de SUS grupos.

import { filtroDeSucursal } from "../api/alcance.ts";
import type { ContextoApi } from "../api/contexto.ts";

export async function dondeInscripcionVisible(ctx: Pick<ContextoApi, "usuario" | "alcance">): Promise<Record<string, unknown>> {
  if (ctx.usuario.rol === "administrador") return {};
  if (ctx.usuario.rol === "maestro") return { grupo: { instructor: { usuario_id: ctx.usuario.id, eliminado_en: null } } };
  const filtro = filtroDeSucursal(await ctx.alcance());
  return filtro ? { grupo: { programa: { sucursal_id: filtro } } } : {};
}
