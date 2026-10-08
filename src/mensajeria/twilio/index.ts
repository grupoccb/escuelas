// Punto de entrada del borde de Twilio. Se activa por variables de entorno (invariante 11): sin
// TWILIO_AUTH_TOKEN o sin PUBLIC_BASE_URL las rutas existen pero rechazan todo (403), como el
// webhook de Chatwoot sin secreto.
//
//   TWILIO_AUTH_TOKEN                   auth token de la cuenta de Twilio (valida X-Twilio-Signature)
//   PUBLIC_BASE_URL                     URL pública del backend, tal como la ve Twilio (https://…, sin ruta)
//   TWILIO_REENVIO_ENTRANTES_URL        a dónde se reenvían los entrantes (por defecto $CHATWOOT_URL/twilio/callback)
//   TWILIO_REENVIO_ESTADOS_URL          a dónde se reenvían los estados (por defecto $CHATWOOT_URL/twilio/delivery_status)
//   TWILIO_NORMALIZAR_FROM_AL_REENVIAR  "true" para normalizar `From` antes de reenviar (apagado por defecto)

import type { PrismaRaiz } from "../../datos/prisma.ts";
import { log } from "../../lib/log.ts";
import { crearBordeTwilio, type BordeTwilio } from "./borde.ts";
import { ReenviadorTwilioFalso, ReenviadorTwilioHttp, type ReenviadorTwilio } from "./reenviador.ts";

export { calcularFirmaTwilio, verificarFirmaTwilio, verificarWebhookTwilio, urlPublicaDe, parsearFormulario, variantesDeUrl, type ParametrosTwilio } from "./firma.ts";
export {
  crearBordeTwilio,
  normalizarFromEnCuerpo,
  MAX_INTENTOS_REENVIO,
  RECLAMO_TWILIO_VENCE_MS,
  type AlertasBorde,
  type BordeTwilio,
  type EntradaBorde,
  type ResultadoBorde,
  type ResumenReenvio,
} from "./borde.ts";
export { ReenviadorTwilioFalso, ReenviadorTwilioHttp, ErrorReenvio, type PeticionReenvio, type ReenviadorTwilio, type TipoWebhookTwilio } from "./reenviador.ts";

export interface TwilioConfigurado {
  /** Sin token, todo webhook de Twilio se rechaza. */
  authToken: string | null;
  /** Sin URL pública no hay contra qué firmar: todo se rechaza. */
  publicBaseUrl: string | null;
  borde: BordeTwilio;
  reenvio: "http" | "falso";
}

export function bordeTwilioDesdeEntorno(prisma: PrismaRaiz, env: NodeJS.ProcessEnv = process.env): TwilioConfigurado {
  const authToken = env["TWILIO_AUTH_TOKEN"] || null;
  const publicBaseUrl = env["PUBLIC_BASE_URL"] || null;
  const chatwoot = env["CHATWOOT_URL"]?.replace(/\/+$/, "");
  const urlEntrantes = env["TWILIO_REENVIO_ENTRANTES_URL"] || (chatwoot ? `${chatwoot}/twilio/callback` : null);
  const urlEstados = env["TWILIO_REENVIO_ESTADOS_URL"] || (chatwoot ? `${chatwoot}/twilio/delivery_status` : null);

  let reenviador: ReenviadorTwilio;
  let reenvio: "http" | "falso";
  if (urlEntrantes && urlEstados) {
    reenviador = new ReenviadorTwilioHttp({ urlEntrantes, urlEstados });
    reenvio = "http";
  } else {
    // Con el borde encendido en producción, un reenvío "falso" daría 200 a Twilio sin entregar nada.
    if (authToken && env["NODE_ENV"] === "production") {
      throw new Error("Con TWILIO_AUTH_TOKEN en producción hace falta CHATWOOT_URL o las URLs de reenvío (TWILIO_REENVIO_*_URL).");
    }
    if (authToken) log.warn("twilio_reenvio_falso", { motivo: "faltan CHATWOOT_URL o TWILIO_REENVIO_*_URL" });
    reenviador = new ReenviadorTwilioFalso();
    reenvio = "falso";
  }
  if (authToken && !publicBaseUrl) log.warn("twilio_sin_url_publica", { motivo: "PUBLIC_BASE_URL no está configurada: se rechazará todo" });

  return {
    authToken,
    publicBaseUrl,
    reenvio,
    borde: crearBordeTwilio({
      prisma,
      reenviador,
      normalizarFromAlReenviar: env["TWILIO_NORMALIZAR_FROM_AL_REENVIAR"] === "true",
      // Con destino de reenvío configurado, un receptor sin organización se reenvía igual (EA-05).
      reenviarSinOrganizacion: reenvio === "http",
    }),
  };
}
