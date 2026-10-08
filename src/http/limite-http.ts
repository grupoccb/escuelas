// Middlewares de límite de peticiones (B6) sobre `LimitadorDeTasa`.

import type { Request, RequestHandler, Response } from "express";
import { demasiadasPeticiones } from "../api/errores.ts";
import { log } from "../lib/log.ts";
import { llaveDeIp } from "./ip.ts";
import type { ConfigLimites } from "./config-limites.ts";
import type { Decision, LimitadorDeTasa, PerfilLimite } from "./limite.ts";

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

/** 429 sin cuerpo (los webhooks no hablan JSON de errores) con Retry-After. */
export function rechazar429(res: Response, reintentarEnSegundos: number): void {
  res.status(429).set("Retry-After", String(reintentarEnSegundos)).end();
}

const PERMITIDO: Decision = { permitido: true, reintentarEnSegundos: 0 };

/**
 * Protección de un webhook público. Se aplica DESPUÉS de verificar la firma, con DOS cubetas
 * separadas por IP y ruta (EB-04):
 *
 *   - `registrarFirmaInvalida`: cada rechazo gasta del cupo de FALLOS. Agotado, los siguientes
 *     rechazos responden 429 en vez de 401/403 (quien insiste no recibe más información).
 *   - `admitirWebhookValido`: solo el tráfico con firma VÁLIDA gasta del techo generoso.
 *
 * Así nadie puede agotar el cupo del tráfico legítimo mandando firmas inválidas, ni siquiera desde
 * la misma IP (la de un balanceador mal configurado, o la de una oficina con NAT): lo legítimo
 * nunca depende de los fallos de otros. Costo: el cuerpo (acotado por ruta) se lee y se verifica
 * antes de decidir; verificar una firma es barato y el tamaño de cuerpo está limitado.
 */
export function admitirWebhookValido(limitador: LimitadorDeTasa | undefined, config: ConfigLimites | undefined, nombre: string, req: Request): Decision {
  if (!limitador || !config) return PERMITIDO;
  const techo = limitador.consumir(llave(`${nombre}:techo`, req), config.webhook);
  if (!techo.permitido) log.warn("webhook_techo_excedido", { ruta: nombre });
  return techo;
}

/** Anota una firma inválida de esa IP. Devuelve si todavía le queda cupo de fallos (false = ya agotó: responder 429). */
export function registrarFirmaInvalida(limitador: LimitadorDeTasa | undefined, config: ConfigLimites | undefined, nombre: string, req: Request): Decision {
  if (!limitador || !config) return PERMITIDO;
  const d = limitador.consumir(llave(`${nombre}:fallos`, req), config.webhookFallos);
  if (!d.permitido) log.warn("webhook_ip_bloqueada", { ruta: nombre });
  return d;
}
