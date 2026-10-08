// Cookie de sesión. HttpOnly (el JavaScript de la página no la ve), SameSite=Lax (no viaja en
// peticiones cruzadas que no sean navegación de nivel superior) y Secure según el entorno.
// Sin librería para leerla: se parsea la cabecera `Cookie`.
//
// Con cookie segura el nombre lleva el prefijo `__Host-` (EB-24): el navegador solo la acepta si es
// Secure, de Path=/ y SIN Domain, y NO deja que un subdominio hermano (cookie tossing) ponga una
// con ese nombre. Sin cookie segura (demo en http) no se puede usar el prefijo y el nombre es `sesion`.

import type { Request, Response } from "express";

export const NOMBRE_COOKIE_SESION = "sesion";
export const NOMBRE_COOKIE_SESION_SEGURA = "__Host-sesion";

/** El nombre de la cookie de sesión según la configuración. */
export const nombreCookieSesion = (segura: boolean): string => (segura ? NOMBRE_COOKIE_SESION_SEGURA : NOMBRE_COOKIE_SESION);

export function leerCookie(req: Request, nombre: string): string | null {
  const cabecera = req.headers.cookie;
  if (!cabecera) return null;
  for (const trozo of cabecera.split(";")) {
    const i = trozo.indexOf("=");
    if (i < 0) continue;
    if (trozo.slice(0, i).trim() !== nombre) continue;
    const valor = trozo.slice(i + 1).trim();
    try {
      return decodeURIComponent(valor.replace(/^"(.*)"$/, "$1"));
    } catch {
      return null;
    }
  }
  return null;
}

export function fijarCookieSesion(res: Response, token: string, expiraEn: Date, segura: boolean): void {
  res.cookie(nombreCookieSesion(segura), token, { httpOnly: true, sameSite: "lax", secure: segura, path: "/", expires: expiraEn });
}

export function borrarCookieSesion(res: Response, segura: boolean): void {
  res.clearCookie(nombreCookieSesion(segura), { httpOnly: true, sameSite: "lax", secure: segura, path: "/" });
}

/** `Secure` por defecto en producción; se puede forzar con `COOKIE_SEGURA=true|false`. */
export function cookieSeguraDesdeEntorno(env: NodeJS.ProcessEnv = process.env): boolean {
  const forzada = env["COOKIE_SEGURA"];
  if (forzada === "true") return true;
  if (forzada === "false") return false;
  return env["NODE_ENV"] === "production";
}
