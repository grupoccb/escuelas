// Quién ve qué en finanzas (H1): el administrador todo; asesor y recepción lo de SUS sucursales; el maestro nada de dinero (sin permiso de finanzas;
// aquí además se le niega por si una ruta se equivocara). Lo ajeno es 404, nunca 403.

import { filtroDeSucursal } from "../api/alcance.ts";
import type { ContextoApi } from "../api/contexto.ts";

type Donde = Record<string, unknown>;

/** Condición de Prisma sobre `cargo`: el cargo pertenece a una sucursal que el usuario ve. */
export async function dondeCargoVisible(ctx: Pick<ContextoApi, "usuario" | "alcance">): Promise<Donde> {
  if (ctx.usuario.rol === "administrador") return {};
  if (ctx.usuario.rol === "maestro") return { id: { in: [] } };
  const filtro = filtroDeSucursal(await ctx.alcance());
  return filtro ? { sucursal_id: filtro } : {};
}
