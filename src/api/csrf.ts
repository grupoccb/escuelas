// Defensa contra CSRF para /api (B1). Tres capas:
//   1. La cookie de sesión es SameSite=Lax: el navegador no la manda en un POST de otro sitio.
//   2. Todo método que cambia algo (POST, PUT, PATCH, DELETE) debe traer `Content-Type:
//      application/json` o `X-Requested-With`. Un formulario de otro sitio no puede poner ninguno de
//      los dos sin un permiso CORS previo, que esta API nunca concede.
//   3. Si la petición trae `Origin` (o, en su defecto, `Referer`) debe ser un origen permitido (`origenAceptado`, abajo).
// Los clientes que no son navegadores (scripts, pruebas) no mandan Origin ni Referer y pasan por la
// capa 2; un navegador siempre manda Origin en un POST cruzado.
//
// QUÉ ORIGEN SE ACEPTA (V2, decisión 7). Una sola regla, la misma para la API y para la landing:
//   · EN PRODUCCIÓN: solo los `ORIGEN_PUBLICO` configurados (comparación exacta de esquema + host + puerto). Ni el propio host de la petición ni `localhost`.
//     El backend ya se niega a arrancar sin `ORIGEN_PUBLICO` (K3, src/seguridad/entorno.ts); si aun así llegara vacío, no se acepta ningún origen de navegador.
//   · EN LOCAL (desarrollo, pruebas o la demo de docker compose: `esEntornoLocal`): además de lo configurado, `http://localhost` y `http://127.0.0.1` con CUALQUIER
//     puerto, sin configurar nada; y, si no hay `ORIGEN_PUBLICO`, el propio host de la petición. Así da igual entrar por `localhost:3000` que por `127.0.0.1:3000`.
// El host se compara ENTERO (`new URL(...).hostname`), no por prefijo: `http://localhost.evil.com` y `http://localhost@evil.com` no son locales.

import type { NextFunction, Request, Response } from "express";
import { esEntornoLocal } from "../seguridad/entorno.ts";
import { prohibido } from "./errores.ts";

const MUTANTES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Los dos nombres con los que se entra a la máquina propia. Con `http` y cualquier puerto. */
const HOSTS_LOCALES = new Set(["localhost", "127.0.0.1"]);

export interface PoliticaDeOrigenes {
  /** Orígenes configurados (`ORIGEN_PUBLICO`), ya normalizados. */
  exactos: readonly string[];
  /** true solo en un entorno local: acepta también localhost y 127.0.0.1 (cualquier puerto) y, sin lo configurado, el propio host. */
  locales: boolean;
}

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

/** La política completa del entorno: lo configurado y si es local. */
export function politicaDeOrigenesDesdeEntorno(env: NodeJS.ProcessEnv = process.env): PoliticaDeOrigenes {
  return { exactos: origenesPermitidosDesdeEntorno(env), locales: esEntornoLocal(env) };
}

/** ¿Es `http://localhost[:puerto]` o `http://127.0.0.1[:puerto]`? Compara el nombre de host completo. */
export function esOrigenLocal(origen: string): boolean {
  try {
    const u = new URL(origen);
    return u.protocol === "http:" && HOSTS_LOCALES.has(u.hostname);
  } catch {
    return false;
  }
}

/**
 * ¿Se acepta este origen (el de `Origin`, o el de `Referer` si no hay `Origin`)? `origen` es la URL tal como llegó; `host` es la cabecera `Host` de la petición,
 * que solo cuenta en un entorno local sin `ORIGEN_PUBLICO`. Nunca lanza: un valor ilegible, `null` o de otro esquema no se acepta.
 */
export function origenAceptado(origen: string | undefined, politica: PoliticaDeOrigenes, host: string | undefined): boolean {
  const o = origen === undefined ? null : origenDe(origen);
  if (!o) return false;
  if (politica.exactos.includes(o)) return true;
  if (!politica.locales) return false;
  if (esOrigenLocal(o)) return true;
  return politica.exactos.length === 0 && host !== undefined && new URL(o).host === host;
}

function esJson(req: Request): boolean {
  const tipo = (req.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
  return tipo === "application/json";
}

export function proteccionCsrf(politica: PoliticaDeOrigenes) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!MUTANTES.has(req.method)) {
      next();
      return;
    }
    const origin = req.get("origin");
    const referer = req.get("referer");
    if (origin !== undefined) {
      if (!origenAceptado(origin, politica, req.get("host"))) throw prohibido("Origen no permitido");
    } else if (referer !== undefined) {
      if (!origenAceptado(referer, politica, req.get("host"))) throw prohibido("Origen no permitido");
    }
    if (!esJson(req) && req.get("x-requested-with") === undefined) {
      throw prohibido("La petición debe ser JSON o llevar X-Requested-With");
    }
    next();
  };
}
