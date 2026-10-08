// Matriz de permisos: el ÚNICO lugar donde se decide qué rol puede qué (B2).
//
// Un permiso se nombra `recurso:acción`. La matriz dice, por permiso, qué roles lo tienen. Un rol
// que no aparece NO lo tiene (se niega por omisión). Las rutas no preguntan por roles: declaran un
// permiso con `requierePermiso("leads:leer")`.
//
// Para agregar un permiso: una fila aquí. El test de `permisos.test.ts` y el de la tabla de rutas
// (`autorizacion.itest.ts`) recorren la matriz completa, así que una fila nueva sin ruta o una ruta
// con un permiso inexistente (no compila) se notan.
//
// Alcance (qué sucursales o grupos ve cada quien dentro de un permiso) NO se decide aquí: lo
// resuelve `alcance.ts` con los datos del usuario.

import { ROLES, type Rol } from "../auth/roles.ts";

export const MATRIZ_DE_PERMISOS = {
  // Personas y accesos
  "usuarios:administrar": ["administrador"],
  // Embudo y atención
  "leads:leer": ["administrador", "asesor", "recepcion"],
  "leads:escribir": ["administrador", "asesor"],
  "tareas:leer": ["administrador", "asesor"],
  "tareas:resolver": ["administrador", "asesor"],
  "conversaciones:leer": ["administrador", "asesor"],
  // Cotizador (C5): programa, grupos con lugar, precio y promociones para una edad. Lo usan quienes atienden al lead.
  "cotizador:leer": ["administrador", "asesor"],
  // Lista de espera (C9): quién espera un lugar en un grupo lleno. Quitar y mover es del asesor y el administrador.
  "lista_espera:leer": ["administrador", "asesor", "recepcion"],
  "lista_espera:escribir": ["administrador", "asesor"],
  // Clase muestra (D1): agendar, reprogramar y cancelar es del asesor y el administrador; el maestro solo lee las de SUS grupos.
  "clases_muestra:leer": ["administrador", "asesor", "maestro"],
  "clases_muestra:escribir": ["administrador", "asesor"],
  // Avisos al maestro (D2): los suyos. El administrador los tiene por regla (todos los permisos), pero solo ve los de su propio instructor, si lo es.
  "avisos_maestro:leer": ["administrador", "maestro"],
  "avisos_maestro:escribir": ["administrador", "maestro"],
  // Oferta
  "grupos:leer": ["administrador", "asesor", "maestro", "recepcion"],
  "catalogo:leer": ["administrador", "asesor", "maestro", "recepcion"],
  "catalogo:escribir": ["administrador"],
  // Auditoría
  "registro_cambios:leer": ["administrador"],
  // Salud de menores (decisión 12). Recepción y asesor NO la leen ni la escriben: quien la necesita
  // es el maestro del grupo y el administrador. Ver src/sensibles/.
  "salud:leer": ["administrador", "maestro"],
  "salud:escribir": ["administrador", "maestro"],
} as const satisfies Record<string, readonly Rol[]>;

export type Permiso = keyof typeof MATRIZ_DE_PERMISOS;

export const PERMISOS = Object.keys(MATRIZ_DE_PERMISOS) as Permiso[];

export function tienePermiso(rol: Rol, permiso: Permiso): boolean {
  return (MATRIZ_DE_PERMISOS[permiso] as readonly Rol[]).includes(rol);
}

/** Todos los permisos de un rol, en el orden de la matriz. */
export function permisosDe(rol: Rol): Permiso[] {
  return PERMISOS.filter((p) => tienePermiso(rol, p));
}

export { ROLES, type Rol };
