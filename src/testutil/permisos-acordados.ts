// La matriz de permisos ACORDADA, escrita a mano a propósito (no se deriva de `permisos.ts`): es la
// fotografía de lo que se decidió. Si alguien cambia un permiso en `src/api/permisos.ts`,
// `permisos.test.ts` falla y obliga a cambiarlo aquí, a la vista de quien revisa. El test de
// autorización por rol (`autorizacion.itest.ts`) calcula lo esperado de ESTA lista, no de
// `tienePermiso` (que es lo que prueba): así no es tautológico (EB-09).

export const PERMISOS_ACORDADOS = {
  "usuarios:administrar": ["administrador"],
  "leads:leer": ["administrador", "asesor", "recepcion"],
  "leads:escribir": ["administrador", "asesor"],
  "tareas:leer": ["administrador", "asesor"],
  "tareas:resolver": ["administrador", "asesor"],
  "conversaciones:leer": ["administrador", "asesor"],
  "cotizador:leer": ["administrador", "asesor"],
  "lista_espera:leer": ["administrador", "asesor", "recepcion"],
  "lista_espera:escribir": ["administrador", "asesor"],
  "clases_muestra:leer": ["administrador", "asesor", "maestro"],
  "clases_muestra:escribir": ["administrador", "asesor"],
  "clases_muestra:asistencia": ["administrador", "asesor", "maestro"],
  "avisos_maestro:leer": ["administrador", "maestro"],
  "avisos_maestro:escribir": ["administrador", "maestro"],
  "grupos:leer": ["administrador", "asesor", "maestro", "recepcion"],
  "catalogo:leer": ["administrador", "asesor", "maestro", "recepcion"],
  "catalogo:escribir": ["administrador"],
  "registro_cambios:leer": ["administrador"],
  "salud:leer": ["administrador", "maestro"],
  "salud:escribir": ["administrador", "maestro"],
} as const satisfies Record<string, readonly string[]>;
