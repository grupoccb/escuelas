// Reglas puras del catálogo que se administra desde la interfaz (J7): el identificador de una vertical (que va en la URL de la landing y en los QR impresos) y
// la zona horaria de una sucursal (que decide el horario de envío, invariante 14).

/** Un identificador para URL: minúsculas, dígitos y guiones, sin acentos («Artes marciales» → «artes-marciales»). Vacío si el nombre no tiene letras ni dígitos. */
export function slugDe(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export const PATRON_DE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Una zona IANA que el runtime conoce («America/Mexico_City», «UTC»). Rechaza abreviaturas ambiguas («CST») y cualquier otro texto. */
export function esZonaHorariaValida(zona: string): boolean {
  if (!/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/.test(zona)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

/** Un color de marca `#RRGGBB` (el CHECK de la base lo repite). */
export const PATRON_DE_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** ¿La dirección es una URL https sin credenciales? Para el logotipo de una vertical (se muestra en la landing). */
export function esUrlHttpsPublica(valor: string): boolean {
  try {
    const u = new URL(valor);
    return u.protocol === "https:" && u.username === "" && u.password === "" && u.hostname.includes(".");
  } catch {
    return false;
  }
}
