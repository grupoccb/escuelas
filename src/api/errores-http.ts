// Manejador global de errores de /api: todo sale con la convención de errores.ts y nada interno
// se filtra (ni mensajes de la base, ni trazas).

import type { NextFunction, Request, Response } from "express";
import { log } from "../lib/log.ts";
import { ErrorApi, cuerpoMuyGrande, validacion } from "./errores.ts";

interface ErrorDeCuerpo {
  type?: string;
  status?: number;
}

/** Describe un error para el log SIN sus textos cuando pueden traer datos (los errores de Prisma citan los valores). */
function describir(error: unknown): Record<string, unknown> {
  if (typeof error !== "object" || error === null) return { tipo: typeof error };
  const e = error as { name?: unknown; code?: unknown; clientVersion?: unknown; message?: unknown };
  if (typeof e.clientVersion === "string") return { tipo: String(e.name), codigo: typeof e.code === "string" ? e.code : null };
  return { tipo: String(e.name), mensaje: typeof e.message === "string" ? e.message.slice(0, 300) : null };
}

export function manejadorDeErroresApi(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }
  let error: ErrorApi;
  if (err instanceof ErrorApi) {
    error = err;
  } else {
    const cuerpo = err as ErrorDeCuerpo;
    if (cuerpo?.type === "entity.too.large") error = cuerpoMuyGrande();
    else if (cuerpo?.type === "entity.parse.failed") error = validacion([{ mensaje: "El cuerpo no es JSON válido" }]);
    else if (typeof cuerpo?.type === "string" && cuerpo.type.startsWith("encoding.") ) error = validacion([{ mensaje: "Codificación no admitida" }]);
    else {
      log.error("api_error_interno", { metodo: req.method, ruta: req.path, ...describir(err) });
      error = new ErrorApi("interno", "Ocurrió un error. Inténtalo de nuevo.");
    }
  }
  for (const [k, v] of Object.entries(error.cabeceras)) res.setHeader(k, v);
  res.status(error.estado).json(error.cuerpo());
}
