// Middlewares de límite de peticiones (B6) sobre `LimitadorDeTasa`.

import type { NextFunction, Request, RequestHandler, Response } from "express";
import { demasiadasPeticiones } from "../api/errores.ts";
import { log } from "../lib/log.ts";
import { llaveDeIp } from "./ip.ts";
import type { ConfigLimites } from "./config-limites.ts";
import type { LimitadorDeTasa, PerfilLimite } from "./limite.ts";

const llave = (nombre: string, req: Request): string => `${nombre}|${llaveDeIp(req.ip)}`;

/**
 * Límite por IP para rutas de la API: al excederlo lanza `limite_excedido` (429 con Retry-After en
 * la convención de errores, que atrapa el manejador de /api).
 */
export function limitarApiPorIp(limitador: LimitadorDeTasa, nombre: string, perfil: PerfilLimite): RequestHandler {
  return (req, _res, next) => {
    const d = limitador.consumir(llave(nombre, req), perfil);
    if (!d.permitido) {
      log.warn("limite_excedido", { limite: nombre });
      throw demasiadasPeticiones(d.reintentarEnSegundos);
    }
    next();
  };
}

function rechazar429(res: Response, reintentarEnSegundos: number): void {
  res.status(429).set("Retry-After", String(reintentarEnSegundos)).end();
}

/**
 * Protección de un webhook público (cuerpo vacío en el 429, como el resto de los webhooks):
 *   1. si la IP agotó su cupo de FIRMAS INVÁLIDAS, se rechaza antes de leer el cuerpo;
 *   2. un techo generoso por IP frena una inundación sin estorbar al tráfico legítimo.
 * El tráfico firmado y legítimo no gasta nada del cupo de fallos: solo cuentan las firmas inválidas
 * (`registrarFirmaInvalida`), así que una ráfaga normal de Twilio o de Chatwoot no se ahoga.
 */
export function protegerWebhook(limitador: LimitadorDeTasa, config: ConfigLimites, nombre: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const fallos = limitador.espiar(llave(`${nombre}:fallos`, req), config.webhookFallos);
    if (!fallos.permitido) {
      log.warn("webhook_ip_bloqueada", { ruta: nombre });
      rechazar429(res, fallos.reintentarEnSegundos);
      return;
    }
    const techo = limitador.consumir(llave(`${nombre}:techo`, req), config.webhook);
    if (!techo.permitido) {
      log.warn("webhook_techo_excedido", { ruta: nombre });
      rechazar429(res, techo.reintentarEnSegundos);
      return;
    }
    next();
  };
}

/** Anota una firma inválida de esa IP. */
export function registrarFirmaInvalida(limitador: LimitadorDeTasa | undefined, config: ConfigLimites | undefined, nombre: string, req: Request): void {
  if (limitador && config) limitador.consumir(llave(`${nombre}:fallos`, req), config.webhookFallos);
}
