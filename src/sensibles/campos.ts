// Lista CENTRAL de lo que es sensible (decisión 12: salud de menores y credenciales). Una sola
// fuente para: la redacción automática de los logs (src/lib/log.ts), la lista blanca del registro de
// cambios, la guarda estática `check:sensibles` y la ficha de salud (src/sensibles/ficha.ts).
//
// Para agregar un campo sensible: una entrada aquí. Si además es una columna de `ficha_salud`,
// va en CAMPOS_SENSIBLES (y en el schema); si solo es un nombre que no debe aparecer en logs, notas ni
// mensajes (un alias, un campo futuro), va en RAICES_SENSIBLES.

/** Las columnas de `ficha_salud`. Los valores van cifrados y solo se leen con `leerSensible()`. */
export const CAMPOS_SENSIBLES = ["alergias", "condiciones_medicas", "medicamentos", "contacto_emergencia", "autorizacion_atencion_medica"] as const;
export type CampoSensible = (typeof CAMPOS_SENSIBLES)[number];

export function esCampoSensible(nombre: string): nombre is CampoSensible {
  return (CAMPOS_SENSIBLES as readonly string[]).includes(nombre);
}

/**
 * Trozos de nombre que delatan un dato de salud. Se comparan contra el nombre normalizado (sin
 * acentos, en snake_case, en minúsculas) con `includes`: `alergias`, `alergiaGrave`, `medicamentos`,
 * `contactoEmergenciaTelefono` o `observaciones_medicas` caen todos.
 */
export const RAICES_SENSIBLES = [
  "alergia",
  "condicion_medica",
  "condiciones_medica",
  "medicament",
  "contacto_emergencia",
  "autorizacion_atencion_medica",
  "tipo_sangre",
  "seguro_medico",
  "observacion_medica",
  "observaciones_medica",
  "ficha_salud",
] as const;

/** Credenciales y secretos: tampoco salen en logs ni en el registro de cambios. */
export const RAICES_SECRETAS = ["contrasena", "password", "passwd", "token", "secret", "secreto", "cookie", "authorization", "hash"] as const;

/** Sin acentos, camelCase → snake_case, minúsculas, solo [a-z0-9_]. */
export function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function esClaveSensible(clave: string): boolean {
  const n = normalizarNombre(clave);
  return RAICES_SENSIBLES.some((r) => n.includes(r));
}

export function esClaveSecreta(clave: string): boolean {
  const n = normalizarNombre(clave);
  return RAICES_SECRETAS.some((r) => n.includes(r));
}

/** Campos que no se guardan jamás en `registro_cambio` (credenciales + salud). */
export function esCampoProhibidoEnRegistro(campo: string): boolean {
  return esClaveSensible(campo) || esClaveSecreta(campo);
}
