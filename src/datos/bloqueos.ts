// Candados consultivos (advisory locks) de Postgres, para lo que no se puede proteger con una
// restricción de la base: contar y reservar tienen que ser una sola cosa (EA-11).
//
// `transaccionConBloqueo` abre una transacción, toma `pg_advisory_xact_lock` sobre
// (organización, clave) y corre `fn` con alcance dentro de ella. Quien pida el mismo candado se
// espera a que la transacción termine (commit o rollback); el candado se suelta solo. El SQL crudo
// vive en alcance.ts, dentro de src/datos/, con la organización explícita.

import type { BaseDatos, Consultas, OpcionesTransaccion } from "./alcance.ts";

/** Tiempo para esperar el candado y para la sección crítica. Las secciones son de unos cuantos ms. */
export const OPCIONES_BLOQUEO: OpcionesTransaccion = { maxWait: 10_000, timeout: 15_000 };

/**
 * Corre `fn` en una transacción con el candado (organización, clave). La clave es un texto libre
 * de quien llama (p. ej. `telefono:+5255…`): dos claves distintas no se estorban.
 */
export function transaccionConBloqueo<R>(
  db: BaseDatos,
  organizacionId: string,
  clave: string,
  fn: (tx: Consultas) => Promise<R>,
  opciones: OpcionesTransaccion = OPCIONES_BLOQUEO,
): Promise<R> {
  return db.$conBloqueoDeClave(organizacionId, clave, fn, opciones);
}

/** El candado de un teléfono dentro de una organización: el de la frecuencia de envíos (invariante 14). */
export function transaccionConBloqueoDeTelefono<R>(
  db: BaseDatos,
  organizacionId: string,
  telefono: string,
  fn: (tx: Consultas) => Promise<R>,
): Promise<R> {
  return transaccionConBloqueo(db, organizacionId, `telefono:${telefono}`, fn);
}
