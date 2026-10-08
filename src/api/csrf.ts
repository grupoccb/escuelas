// Defensa contra CSRF para /api (B1). Tres capas:
//   1. La cookie de sesión es SameSite=Lax: el navegador no la manda en un POST de otro sitio.
//   2. Todo método que cambia algo (POST, PUT, PATCH, DELETE) debe traer `Content-Type:
//      application/json` o `X-Requested-With`. Un formulario de otro sitio no puede poner ninguno de
//      los dos sin un permiso CORS previo, que esta API nunca concede.
//   3. Si la petición trae `Origin` (o, en su defecto, `Referer`) debe ser el origen público
//      configurado (`ORIGEN_PUBLICO`); sin configurar, el del propio host de la petición.
// Los clientes que no son navegadores (scripts, pruebas) no mandan Origin ni Referer y pasan por la
// capa 2; un navegador siempre manda Origin en un POST cruzado.

import type { NextFunction, Request, Response } from "express";
import { prohibido } from "./errores.ts";

const MUTANTES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function origenDe(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** Orígenes permitidos a partir de `ORIGEN_PUBLICO` (separados por comas) o, de respaldo, `PUBLIC_BASE_URL`. */
export function origenesPermitidosDesdeEntorno(env: NodeJS.ProcessEnv = process.env): string[] {
  const crudo = env["ORIGEN_PUBLICO"] ?? env["PUBLIC_BASE_URL"] ?? "";
  return crudo
    .split(",")
    .map((s) => origenDe(s.trim()))
    .filter((o): o is string => o !== null);
}

function esJson(req: Request): boolean {
  const tipo = (req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
  return tipo === "application/json";
}

export function proteccionCsrf(origenesPermitidos: readonly string[]) {
  const permitidos = new Set(origenesPermitidos);
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!MUTANTES.has(req.method)) {
      next();
      return;
    }
    const aceptado = (origen: string | null): boolean => {
      if (!origen) return false;
      if (permitidos.size > 0) return permitidos.has(origen);
      // Sin origen configurado: solo el mismo host que recibió la petición.
      const host = req.get("host");
      return host !== undefined && new URL(origen).host === host;
    };
    const origin = req.get("origin");
    const referer = req.get("referer");
    if (origin !== undefined) {
      if (!aceptado(origenDe(origin))) throw prohibido("Origen no permitido");
    } else if (referer !== undefined) {
      if (!aceptado(origenDe(referer))) throw prohibido("Origen no permitido");
    }
    if (!esJson(req) && req.get("x-requested-with") === undefined) {
      throw prohibido("La petición debe ser JSON o llevar X-Requested-With");
    }
    next();
  };
}
