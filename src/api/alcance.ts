// Alcance de datos por rol y sucursal (B2). Los PERMISOS (permisos.ts) dicen qué acciones puede
// hacer un rol; el ALCANCE dice sobre qué filas:
//
//   administrador       todas las sucursales de su organización
//   asesor, recepción   solo las sucursales asignadas (tabla usuario_sucursal)
//   maestro             sus grupos: los que imparte el instructor ligado a su usuario
//
// Todo recurso con sucursal usa `filtroDeSucursal()` para armar su `where`; nadie arma el filtro a
// mano. La organización la pone el scope (`ctx.db`), no este archivo.

import type { BaseDatos } from "../datos/alcance.ts";
import type { UsuarioDeSesion } from "../auth/sesiones.ts";
import { noEncontrado } from "./errores.ts";

export type AlcanceDeSucursales = { todas: true } | { todas: false; sucursalIds: string[] };

/** Las sucursales que ve el usuario. El administrador las ve todas sin necesidad de filas. */
export async function alcanceDeSucursales(db: BaseDatos, usuario: Pick<UsuarioDeSesion, "id" | "rol">): Promise<AlcanceDeSucursales> {
  if (usuario.rol === "administrador") return { todas: true };
  const filas = await db.usuario_sucursal.findMany({
    where: { usuario_id: usuario.id, sucursal: { eliminado_en: null } },
    select: { sucursal_id: true },
    orderBy: { sucursal_id: "asc" },
  });
  return { todas: false, sucursalIds: filas.map((f) => f.sucursal_id) };
}

/**
 * Sucursales cuyo CATÁLOGO ve el usuario (salones, instructores, precios, promociones). Administrador:
 * todas. Asesor y recepción: las suyas (`usuario_sucursal`). Maestro: las de los programas de sus
 * grupos (no tiene sucursales asignadas; ve la oferta donde da clases).
 */
export async function alcanceDeCatalogo(db: BaseDatos, usuario: Pick<UsuarioDeSesion, "id" | "rol">): Promise<AlcanceDeSucursales> {
  if (usuario.rol === "administrador") return { todas: true };
  if (usuario.rol !== "maestro") return alcanceDeSucursales(db, usuario);
  const grupos = await db.grupo.findMany({
    where: { instructor: { usuario_id: usuario.id, eliminado_en: null } },
    select: { programa: { select: { sucursal_id: true } } },
  });
  return { todas: false, sucursalIds: [...new Set(grupos.map((g) => g.programa.sucursal_id))].sort() };
}

/**
 * Condición de Prisma sobre una columna de sucursal (`sucursal_interes_id`, `sucursal_id`…); `undefined`
 * (sin restricción) para el administrador. Una fila SIN sucursal (un lead que aún no la elige) no
 * cae dentro de ningún `in`: solo la ve el administrador (mínimo privilegio; decisión documentada en
 * la bitácora de B2).
 */
export function filtroDeSucursal(alcance: AlcanceDeSucursales): { in: string[] } | undefined {
  return alcance.todas ? undefined : { in: alcance.sucursalIds };
}

/** ¿Puede ver esta sucursal? Para validar un id que llega por parámetro. */
export function veSucursal(alcance: AlcanceDeSucursales, sucursalId: string | null): boolean {
  if (alcance.todas) return true;
  return sucursalId !== null && alcance.sucursalIds.includes(sucursalId);
}

/** Lanza 404 si el recurso no existe o queda fuera del alcance (nunca 403: no se confirma que exista). */
export function exigirVisible<T>(recurso: T | null | undefined): T {
  if (recurso === null || recurso === undefined) throw noEncontrado();
  return recurso;
}
