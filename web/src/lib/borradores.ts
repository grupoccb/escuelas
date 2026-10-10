// Borradores en MEMORIA de la página (V7, maestro): lo que se escribió y todavía no se guardó sobrevive a cambiar de pantalla dentro de la aplicación (la barra de abajo,
// «Volver», el botón de atrás del teléfono) y a una sesión que vence a media jornada, que vuelve a la pantalla de acceso sin cerrar la pestaña.
//
// NO es almacenamiento del navegador (nada en `localStorage`, `sessionStorage` ni `indexedDB`): recargar o cerrar la pestaña lo borra, y cerrar sesión por decisión de la persona
// lo borra también. Son datos de menores. Aquí nunca entran los datos de salud (viven solo dentro de su formulario, `web/src/salud/`).
// Cada borrador es de UNA persona (`usuarioId`): quien entre después en el mismo teléfono no ve los de otra.

const guardados = new Map<string, unknown>();
const llave = (usuarioId: string, clave: string): string => `${usuarioId}|${clave}`;

export function leerBorrador<T>(usuarioId: string, clave: string): T | undefined {
  return guardados.get(llave(usuarioId, clave)) as T | undefined;
}

/** Guarda el borrador; `undefined` (nada que conservar) lo quita. */
export function ponerBorrador(usuarioId: string, clave: string, valor: unknown): void {
  if (valor === undefined) guardados.delete(llave(usuarioId, clave));
  else guardados.set(llave(usuarioId, clave), valor);
}

/** Cerrar sesión a propósito: no queda nada de lo que se escribió. */
export function olvidarBorradores(): void {
  guardados.clear();
}
