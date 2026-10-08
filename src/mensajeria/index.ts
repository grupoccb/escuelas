// Punto de entrada de la mensajería. Las integraciones reales se activan por variables de
// entorno; sin ellas se usa el transporte falso (invariante 11).

import { log } from "../lib/log.ts";
import { TransporteChatwoot } from "./chatwoot/transporte.ts";
import { TransporteFalso } from "./fake.ts";
import { MessagingProvider } from "./provider.ts";

export { MessagingProvider, type Saliente, type ResumenDespacho } from "./provider.ts";
export { TransporteFalso, type EnvioRegistrado } from "./fake.ts";
export { ventanaServicioDesde, ventanaGratisDesde } from "./reglas.ts";
export { AtribucionSimulada, SinAtribucion, type Atribucion, type FuenteAtribucion } from "./atribucion.ts";
export { AtribucionDesdeChatwoot } from "./chatwoot/atribucion.ts";
export {
  interpretarEventoChatwoot,
  verificarWebhookChatwoot,
  type EventoEntrante,
} from "./chatwoot/webhook.ts";

export interface MensajeriaConfigurada {
  provider: MessagingProvider;
  /** Secreto del Agent Bot. Sin él, todo webhook de Chatwoot se rechaza. */
  secretoWebhookChatwoot: string | null;
  transporte: "chatwoot" | "falso";
}

export function mensajeriaDesdeEntorno(env: NodeJS.ProcessEnv = process.env): MensajeriaConfigurada {
  const url = env["CHATWOOT_URL"];
  const tokenBot = env["CHATWOOT_BOT_TOKEN"];
  const secreto = env["CHATWOOT_WEBHOOK_SECRETO"] || null;

  if (url && tokenBot) {
    return {
      provider: new MessagingProvider({ transporte: new TransporteChatwoot({ url, tokenBot }) }),
      secretoWebhookChatwoot: secreto,
      transporte: "chatwoot",
    };
  }
  log.warn("mensajeria_transporte_falso", { motivo: "faltan CHATWOOT_URL o CHATWOOT_BOT_TOKEN" });
  return {
    provider: new MessagingProvider({ transporte: new TransporteFalso() }),
    secretoWebhookChatwoot: secreto,
    transporte: "falso",
  };
}
