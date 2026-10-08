// Quién ve qué de la familia (F1). Los permisos dicen qué acciones puede hacer un rol (permisos.ts); esto dice sobre qué filas:
//
//   administrador       todo
//   asesor y recepción  la familia que dieron de alta en SUS sucursales, o que tiene una inscripción en un grupo de SUS sucursales
//   maestro             los alumnos inscritos en SUS grupos (los que imparte el instructor ligado a su usuario); ningún tutor
//
// Una fila sin sucursal (alta sin elegirla) solo la ve el administrador, como los leads. Lo ajeno es 404, nunca 403.

import { filtroDeSucursal } from "../api/alcance.ts";
import type { ContextoApi } from "../api/contexto.ts";

type Donde = Record<string, unknown>;

/** Condición de Prisma sobre `alumno` para lo que el usuario puede ver. */
export async function dondeAlumnoVisible(ctx: Pick<ContextoApi, "usuario" | "alcance">): Promise<Donde> {
  if (ctx.usuario.rol === "administrador") return {};
  if (ctx.usuario.rol === "maestro") return { inscripciones: { some: { estatus: { in: ["activa", "congelada"] }, grupo: { instructor: { usuario_id: ctx.usuario.id, eliminado_en: null } } } } };
  const filtro = filtroDeSucursal(await ctx.alcance());
  if (!filtro) return {};
  return { OR: [{ sucursal_id: filtro }, { inscripciones: { some: { grupo: { programa: { sucursal_id: filtro } } } } }] };
}

/** Condición de Prisma sobre `tutor`: visible por su sucursal de alta o porque alguno de sus alumnos lo es. El maestro no ve tutores. */
export async function dondeTutorVisible(ctx: Pick<ContextoApi, "usuario" | "alcance">): Promise<Donde> {
  if (ctx.usuario.rol === "administrador") return {};
  if (ctx.usuario.rol === "maestro") return { id: { in: [] } };
  const filtro = filtroDeSucursal(await ctx.alcance());
  if (!filtro) return {};
  return { OR: [{ sucursal_id: filtro }, { alumnos: { some: { eliminado_en: null, alumno: { OR: [{ sucursal_id: filtro }, { inscripciones: { some: { grupo: { programa: { sucursal_id: filtro } } } } }] } } } }] };
}
