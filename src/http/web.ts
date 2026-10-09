// Interfaz web (J1): sirve el build estático de Vite (`web/dist`) en `/` con fallback de SPA.
//
// - Nunca toma lo que es del backend: `/api`, `/webhooks`, `/l` (landing) y `/salud` pasan de largo (`next("router")`).
// - `/assets/*` son archivos con huella en el nombre: caché larga e inmutable. Un asset que no existe es 404, nunca el HTML.
// - Cualquier otra ruta sin extensión (`/hoy`, `/leads/123`) devuelve `index.html` y la resuelve el enrutador del navegador; con extensión (`/x.js`) y sin archivo, 404.
// - `index.html` va sin caché y con su propia CSP: solo scripts y estilos propios (sin inline), conexiones al propio origen y nada incrustable.
//   La interfaz no llama a ningún dominio externo (ni fuentes, ni CDN, ni analítica): todo se sirve desde aquí.

import express, { Router } from "express";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";

export const CSP_WEB = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join("; ");

/** Rutas del backend que la interfaz nunca debe tapar. */
const PREFIJOS_DEL_BACKEND = ["/api", "/webhooks", "/l", "/salud", "/metricas"];

/** El enrutador de la interfaz, o `null` si el directorio no tiene un build (`index.html`): entonces el backend sigue sin interfaz. */
export function rutasDeWeb(directorio: string): Router | null {
  const raiz = resolve(directorio);
  const indice = join(raiz, "index.html");
  if (!existsSync(indice)) return null;

  const r = Router();
  r.use((req, _res, next) => {
    const esDelBackend = PREFIJOS_DEL_BACKEND.some((p) => req.path === p || req.path.startsWith(`${p}/`));
    if (esDelBackend) next("router");
    else next();
  });
  r.use("/assets", express.static(join(raiz, "assets"), { fallthrough: false, immutable: true, maxAge: "365d", index: false, dotfiles: "ignore" }));
  r.use(express.static(raiz, { index: false, maxAge: "1h", dotfiles: "ignore" }));
  r.use((req, res, next) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || extname(req.path) !== "") {
      next();
      return;
    }
    res.setHeader("Content-Security-Policy", CSP_WEB);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    res.sendFile(indice, { dotfiles: "allow" }, (err) => {
      if (err) next(err);
    });
  });
  return r;
}
