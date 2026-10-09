import type { Yo } from "../api/tipos.ts";

export const tiene = (yo: Yo | null, permiso: string): boolean => yo !== null && yo.permisos.includes(permiso);
export const tieneAlguno = (yo: Yo | null, permisos: readonly string[]): boolean => permisos.some((p) => tiene(yo, p));
