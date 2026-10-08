// Middleware de autenticación: lee la cookie, valida la sesión y deja el contexto en la petición.

import type { NextFunction, Request, Response } from "express";
import { validarSesion } from "../auth/sesiones.ts";
import { borrarCookieSesion, leerCookie, NOMBRE_COOKIE_SESION } from "./cookies.ts";
import { fijarContexto, type DepsApi } from "./contexto.ts";
import { noAutenticado } from "./errores.ts";

export function autenticar(deps: DepsApi) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = leerCookie(req, NOMBRE_COOKIE_SESION);
    const sesion = token ? await validarSesion(deps.prisma, token, deps.acceso.sesion, deps.reloj()) : null;
    if (!sesion) {
      if (token) borrarCookieSesion(res, deps.cookieSegura);
      throw noAutenticado();
    }
    fijarContexto(res, req, deps, sesion.usuario, sesion.sesionId);
    next();
  };
}
