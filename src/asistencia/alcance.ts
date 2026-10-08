// Quién ve y toma el pase de qué grupos (G1): el administrador todos; asesor y recepción los de SUS sucursales; el maestro SUS grupos (los que imparte el
// instructor ligado a su usuario). Es el mismo alcance de las inscripciones, aplicado al grupo.

import type { ContextoApi } from "../api/contexto.ts";
import { dondeInscripcionVisible } from "../inscripciones/alcance.ts";

/** Condición de Prisma sobre `grupo` para lo que el usuario puede ver. */
export async function dondeGrupoVisible(ctx: Pick<ContextoApi, "usuario" | "alcance">): Promise<Record<string, unknown>> {
  return ((await dondeInscripcionVisible(ctx))["grupo"] as Record<string, unknown> | undefined) ?? {};
}
