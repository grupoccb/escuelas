// Autorización por permiso (B2). Se usa DESPUÉS de `autenticar`:
//
//   router.get("/leads", requierePermiso("leads:leer"), handler)
//
// Sin el permiso → 403 `prohibido`. Un rol que no está en la matriz no tiene nada.

import type { NextFunction, Request, Response } from "express";
import { contextoDe } from "./contexto.ts";
import { prohibido } from "./errores.ts";
import { tienePermiso, type Permiso } from "./permisos.ts";

export function requierePermiso(...permisos: [Permiso, ...Permiso[]]) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const { usuario } = contextoDe(res);
    if (!permisos.every((p) => tienePermiso(usuario.rol, p))) throw prohibido();
    next();
  };
}
