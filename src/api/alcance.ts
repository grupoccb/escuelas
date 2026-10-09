// Alcance de datos por rol y sucursal (B2). Los PERMISOS (permisos.ts) dicen qué acciones puede
// hacer un rol; el ALCANCE dice sobre qué filas:
//
//   administrador       todas las sucursales de su organización
//   asesor, recepción   solo las sucursales asignadas (tabla usuario_sucursal)
//   maestro             sus grupos: los que imparte el instructor ligado a su usuario
//
// Todo recurso con sucursal usa `filtroDeSucursal()` para armar su `where`; nadie arma el filtro a
// mano. La organización la pone el scope (`ctx.db`), no este archivo.
//
// UN LEAD SIN SUCURSAL (V2, decisión 5). Un lead que todavía no eligió sucursal (`sucursal_interes_id` nulo) lo ven y atienden TODOS los asesores de la organización hasta
// que tenga una; en cuanto la tiene, solo los asesores de esa sucursal (y el administrador). Es una excepción del ASESOR y solo de los leads (y lo que cuelga de ellos:
// prospectos, cotizaciones, tareas del lead, historial, conversaciones, exportación): recepción y maestro conservan su alcance, y lo demás con sucursal (grupos, cargos,
// inscripciones, familias) no cambia. Vive en UN solo lugar: `condicionDeLead()`; las rutas de leads no arman `sucursal_interes_id: { in }` a mano.

import type { BaseDatos } from "../datos/alcance.ts";
import type { UsuarioDeSesion } from "../auth/sesiones.ts";
import { noEncontrado } from "./errores.ts";

export type AlcanceDeSucursales =
  | { todas: true }
  /** `leadsSinSucursal`: el asesor también ve y atiende los leads que aún no tienen sucursal (V2, decisión 5). Ausente = no. */
  | { todas: false; sucursalIds: string[]; leadsSinSucursal?: boolean };

/** Las sucursales que ve el usuario. El administrador las ve todas sin necesidad de filas. */
export async function alcanceDeSucursales(db: BaseDatos, usuario: Pick<UsuarioDeSesion, "id" | "rol">): Promise<AlcanceDeSucursales> {
  if (usuario.rol === "administrador") return { todas: true };
  const filas = await db.usuario_sucursal.findMany({
    where: { usuario_id: usuario.id, sucursal: { eliminado_en: null } },
    select: { sucursal_id: true },
    orderBy: { sucursal_id: "asc" },
  });
  return { todas: false, sucursalIds: filas.map((f) => f.sucursal_id), ...(usuario.rol === "asesor" ? { leadsSinSucursal: true } : {}) };
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

/**
 * Condición de Prisma sobre un `lead` para lo que el usuario puede ver; `undefined` (sin restricción) para el administrador. Es la única forma de acotar leads por sucursal:
 * el asesor ve los de sus sucursales MÁS los que todavía no tienen sucursal (decisión 5 de V2); recepción y maestro, solo los de sus sucursales.
 * Para una relación (`conversacion.lead`, `tarea_asesor.lead`, `prospecto.lead`): `{ lead: condicionDeLead(alcance) }`.
 */
export function condicionDeLead(alcance: AlcanceDeSucursales): Record<string, unknown> | undefined {
  if (alcance.todas) return undefined;
  const suyas = { sucursal_interes_id: { in: alcance.sucursalIds } };
  return alcance.leadsSinSucursal ? { OR: [{ sucursal_interes_id: null }, suyas] } : suyas;
}

/** ¿Puede ver (y atender) un lead con esta sucursal de interés (nula si aún no la tiene)? La versión en memoria de `condicionDeLead`, para validar un id que llega por parámetro. */
export function veLeadDeSucursal(alcance: AlcanceDeSucursales, sucursalInteresId: string | null): boolean {
  if (alcance.todas) return true;
  if (sucursalInteresId === null) return alcance.leadsSinSucursal === true;
  return alcance.sucursalIds.includes(sucursalInteresId);
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
