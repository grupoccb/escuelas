// Cabeceras de seguridad básicas, sin dependencias (B3).

import type { NextFunction, Request, Response } from "express";

/** En TODA respuesta del backend. */
export function cabecerasDeSeguridad(hsts: boolean) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (hsts) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    next();
  };
}

/**
 * Solo en /api: una API devuelve JSON, no documentos. La CSP lo prohíbe todo (ni scripts, ni
 * imágenes, ni que otro sitio la incruste) y las respuestas no se guardan en cachés compartidas.
 * Cuando exista la interfaz web (J1) se servirá con SU propia política, fuera de /api.
 */
export function cabecerasDeApi(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  next();
}
