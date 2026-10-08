// Autorización por permiso (B2) y declaración de acceso de cada ruta (EB-09).
//
// DENEGAR POR OMISIÓN. Todo lo que cuelga de /api después del inicio de sesión pasa primero por
// `autenticar` (montado una sola vez en `crearApiRouter`) y cada ruta DEBE declarar su acceso:
//
//   router.get("/leads", requierePermiso("leads:leer"), handler)   // un permiso de la matriz
//   router.get("/yo", soloSesion(), handler)                         // cualquiera con sesión (explícito)
//
// Sin esa declaración `contextoDe(res)` lanza (500) y el handler no puede tocar la base. Además, el
// test `rutas.test.ts` recorre el router REAL de Express y falla si una ruta no está en la tabla
// escrita a mano o declara otro permiso. Las declaraciones se marcan en la función del middleware
// (ver `declaracionDe`) para que ese test las lea.
//
// Sin el permiso → 403 `prohibido`. Un rol que no está en la matriz no tiene nada.

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { contextoParaAutorizar } from "./contexto.ts";
import { prohibido } from "./errores.ts";
import { tienePermiso, type Permiso } from "./permisos.ts";

const DECLARACION = Symbol.for("inscripciones.declaracion-de-acceso");

export type DeclaracionDeAcceso = { tipo: "permisos"; permisos: readonly Permiso[] } | { tipo: "sesion" };

function marcar<T extends RequestHandler>(manejador: T, declaracion: DeclaracionDeAcceso): T {
  Object.defineProperty(manejador, DECLARACION, { value: declaracion, enumerable: false });
  return manejador;
}

/** La declaración de acceso de un middleware, o undefined si no es de los que declaran. */
export function declaracionDe(manejador: unknown): DeclaracionDeAcceso | undefined {
  return typeof manejador === "function" ? ((manejador as unknown as Record<symbol, DeclaracionDeAcceso | undefined>)[DECLARACION]) : undefined;
}

export function requierePermiso(...permisos: [Permiso, ...Permiso[]]): RequestHandler {
  return marcar((_req: Request, res: Response, next: NextFunction): void => {
    const ctx = contextoParaAutorizar(res);
    if (!permisos.every((p) => tienePermiso(ctx.usuario.rol, p))) throw prohibido();
    ctx.accesoDeclarado = true;
    next();
  }, { tipo: "permisos", permisos });
}

/**
 * Como `requierePermiso`, pero antes de negar llama a `alDenegar` (para dejar constancia: p. ej. el
 * registro de accesos a salud, EB-01). Si `alDenegar` falla, igual se niega.
 */
export function requierePermisoConRastro(permiso: Permiso, alDenegar: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return marcar(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ctx = contextoParaAutorizar(res);
    if (!tienePermiso(ctx.usuario.rol, permiso)) {
      try {
        await alDenegar(req, res);
      } catch {
        // No registrar no cambia la respuesta; el error propio ya lo anotó quien registra.
      }
      throw prohibido();
    }
    ctx.accesoDeclarado = true;
    next();
  }, { tipo: "permisos", permisos: [permiso] });
}

/** Cualquier usuario con sesión (la sesión la exige `autenticar`). Es una declaración explícita, no un olvido. */
export function soloSesion(): RequestHandler {
  return marcar((_req: Request, res: Response, next: NextFunction): void => {
    contextoParaAutorizar(res).accesoDeclarado = true;
    next();
  }, { tipo: "sesion" });
}
