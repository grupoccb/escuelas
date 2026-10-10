// Interfaz web (J1): sirve el build estático de Vite (`web/dist`) en `/` con fallback de SPA.
//
// - Nunca toma lo que es del backend: `/api`, `/webhooks`, `/twilio` (estados de entrega, V9), `/l` (landing) y `/salud` pasan de largo (`next("router")`).
// - `/assets/*` son archivos con huella en el nombre: caché larga e inmutable. Un asset que no existe es 404, nunca el HTML.
// - Cualquier otra ruta sin extensión (`/hoy`, `/leads/123`) devuelve `index.html` y la resuelve el enrutador del navegador; con extensión (`/x.js`) y sin archivo, 404.
// - `index.html` va sin caché y con su propia CSP: solo scripts y estilos propios (sin inline), conexiones al propio origen y nada incrustable.
//   La interfaz no llama a ningún dominio externo (ni fuentes, ni CDN, ni analítica): todo se sirve desde aquí.

import express, { type Router } from "express";
import { crearRouter } from "./enrutador.ts";
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
const PREFIJOS_DEL_BACKEND = ["/api", "/webhooks", "/twilio", "/l", "/salud", "/metricas"];

/** El enrutador de la interfaz, o `null` si el directorio no tiene un build (`index.html`): entonces el backend sigue sin interfaz. */
export function rutasDeWeb(directorio: string): Router | null {
  const raiz = resolve(directorio);
  const indice = join(raiz, "index.html");
  if (!existsSync(indice)) return null;

  const r = crearRouter();
  r.use((req, _res, next) => {
    // Sin distinguir mayúsculas: `/API/x` no es una pantalla de la interfaz (el backend lo contesta como ruta inexistente), aunque el router de la API sí distinga.
    const ruta = req.path.toLowerCase();
    const esDelBackend = PREFIJOS_DEL_BACKEND.some((p) => ruta === p || ruta.startsWith(`${p}/`));
    if (esDelBackend) next("router");
    else next();
  });
  r.use("/assets", express.static(join(raiz, "assets"), { fallthrough: false, immutable: true, maxAge: "365d", index: false, dotfiles: "ignore" }));
  // EK-I05: `/index.html` pedido por su nombre también lleva la CSP y no se guarda en caché (antes salía de aquí sin ninguna de las dos).
  const cabecerasDelHtml = (res: express.Response): void => {
    res.setHeader("Content-Security-Policy", CSP_WEB);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  };
  r.use(
    express.static(raiz, {
      index: false,
      maxAge: "1h",
      dotfiles: "ignore",
      setHeaders: (res, ruta) => {
        if (extname(ruta).toLowerCase() === ".html") cabecerasDelHtml(res);
      },
    }),
  );
  r.use((req, res, next) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || extname(req.path) !== "") {
      next();
      return;
    }
    cabecerasDelHtml(res);
    res.sendFile(indice, { dotfiles: "allow" }, (err) => {
      if (err) next(err);
    });
  });
  return r;
}
