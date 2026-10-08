// Configuración de los límites de peticiones y de la confianza en el proxy (B6), por variables de entorno.
//
//   LIMITE_LOGIN_POR_MINUTO            inicio de sesión, por IP             (10)
//   LIMITE_API_POR_MINUTO              el resto de /api, por IP             (600)
//   LIMITE_LANDING_POR_MINUTO          la landing pública (E1), por IP      (30)
//   LIMITE_WEBHOOK_FALLOS_POR_MINUTO   webhooks con firma INVÁLIDA, por IP  (30)
//   LIMITE_WEBHOOK_POR_MINUTO          techo de webhooks por IP             (6000)
//   LIMITE_MAX_CLAVES                  tope de memoria del limitador        (50000)
//   TRUST_PROXY                        cuántos proxys confiar para la IP    (ninguno)
//
// TRUST_PROXY: sin definir, la IP es la de la conexión. Detrás de un balanceador pon el NÚMERO de
// saltos de confianza (`1`) o una lista de redes (`loopback, 10.0.0.0/8`); así se lee la IP real de
// X-Forwarded-For. `true` confía en TODA la cadena y cualquiera puede falsificar su IP: no lo uses.

import { perfilPorMinuto, type PerfilLimite } from "./limite.ts";

export interface ConfigLimites {
  login: PerfilLimite;
  api: PerfilLimite;
  landing: PerfilLimite;
  /** Firmas inválidas en webhooks: pasado el tope, la IP se bloquea hasta que se rellene. */
  webhookFallos: PerfilLimite;
  /** Techo para el tráfico de webhooks (válido o no): no estorba al normal, frena una inundación. */
  webhook: PerfilLimite;
  maxClaves: number;
}

function entero(env: NodeJS.ProcessEnv, nombre: string, defecto: number): number {
  const crudo = env[nombre];
  if (crudo === undefined || crudo === "") return defecto;
  const n = Number(crudo);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${nombre} debe ser un entero positivo (recibí «${crudo}»)`);
  return n;
}

export function limitesDesdeEntorno(env: NodeJS.ProcessEnv = process.env): ConfigLimites {
  return {
    login: perfilPorMinuto(entero(env, "LIMITE_LOGIN_POR_MINUTO", 10)),
    api: perfilPorMinuto(entero(env, "LIMITE_API_POR_MINUTO", 600)),
    landing: perfilPorMinuto(entero(env, "LIMITE_LANDING_POR_MINUTO", 30)),
    webhookFallos: perfilPorMinuto(entero(env, "LIMITE_WEBHOOK_FALLOS_POR_MINUTO", 30)),
    webhook: perfilPorMinuto(entero(env, "LIMITE_WEBHOOK_POR_MINUTO", 6000)),
    maxClaves: entero(env, "LIMITE_MAX_CLAVES", 50_000),
  };
}

/**
 * Aviso fuerte (EB-04) si el backend corre en producción SIN decidir `TRUST_PROXY`. Detrás de un
 * balanceador, sin él todos los clientes parecen una sola IP: cinco intentos fallidos bloquean el
 * login de cualquiera y los límites de IP caen sobre todos. Poner un valor EXPLÍCITO (`1` para un
 * balanceador; `false` si el puerto está expuesto directamente) lo silencia. null = nada que avisar.
 */
export function avisoDeTrustProxy(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env["NODE_ENV"] !== "production") return null;
  if ((env["TRUST_PROXY"] ?? "").trim() !== "") return null;
  return "TRUST_PROXY no está definido en producción: sin él X-Forwarded-For se ignora y, detrás de un balanceador, todos los clientes comparten una IP (el bloqueo de login y los límites de IP caen sobre todos). Defínelo: 1 con un balanceador, false si el puerto está expuesto directamente.";
}

/** Valor para `app.set("trust proxy", …)`. */
export function confianzaProxyDesdeEntorno(env: NodeJS.ProcessEnv = process.env): boolean | number | string {
  const crudo = env["TRUST_PROXY"]?.trim();
  if (!crudo || crudo === "false") return false;
  if (crudo === "true") return true;
  if (/^\d+$/.test(crudo)) return Number(crudo);
  return crudo;
}
