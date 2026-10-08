// Punto de entrada de la mensajería. Las integraciones reales se activan por variables de
// entorno; sin ellas se usa el transporte falso (invariante 11).

import { log } from "../lib/log.ts";
import { TransporteChatwoot } from "./chatwoot/transporte.ts";
import { TransporteFalso } from "./fake.ts";
import { MessagingProvider } from "./provider.ts";

export { MessagingProvider, ENVIO_INCIERTO, ENVIO_INCIERTO_MS, type Saliente, type ResumenDespacho } from "./provider.ts";
export { asegurarTareaAsesor, asegurarTareaDeMensaje, asegurarTareaEnTransaccion, resumirTexto, type TareaDeMensaje, type TareaParaAsesor } from "./tareas.ts";
export { TransporteFalso, type EnvioRegistrado } from "./fake.ts";
export { EnvioIncierto, ErrorTransporte, type TransporteConversaciones } from "./transporte.ts";
export { ventanaServicioDesde, ventanaGratisDesde } from "./reglas.ts";
export {
  bordeTwilioDesdeEntorno,
  crearBordeTwilio,
  normalizarFromEnCuerpo,
  ReenviadorTwilioFalso,
  ReenviadorTwilioHttp,
  urlPublicaDe,
  verificarWebhookTwilio,
  type BordeTwilio,
  type EntradaBorde,
  type ReenviadorTwilio,
  type ResultadoBorde,
  type TwilioConfigurado,
} from "./twilio/index.ts";
export { AtribucionSimulada, SinAtribucion, type Atribucion, type FuenteAtribucion } from "./atribucion.ts";
export { AtribucionDesdeChatwoot } from "./chatwoot/atribucion.ts";
export { EstadosEntregaChatwoot } from "./chatwoot/estados.ts";
export {
  barrerEventosEntrega,
  conciliarEventosPendientes,
  registrarEstadoEntrega,
  siguienteEstatus,
  type CambioDeEstado,
  type EstadoDeEntrega,
  type FuenteEstadosEntrega,
  type ResultadoEstado,
} from "./estados.ts";
export {
  interpretarEventoChatwoot,
  interpretarTomaDeConversacion,
  verificarWebhookChatwoot,
  type EventoEntrante,
  type EventoTomaDeConversacion,
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
  // En producción un secreto mal puesto no puede dar un backend "sano" que registra mensajes como
  // enviados sin entregar nada (F1-11): mejor que no arranque.
  if (env["NODE_ENV"] === "production") {
    throw new Error(
      "Faltan CHATWOOT_URL o CHATWOOT_BOT_TOKEN: con NODE_ENV=production no se usa el transporte falso, porque marcaría mensajes como enviados sin entregarlos.",
    );
  }
  log.warn("mensajeria_transporte_falso", { motivo: "faltan CHATWOOT_URL o CHATWOOT_BOT_TOKEN" });
  return {
    provider: new MessagingProvider({ transporte: new TransporteFalso() }),
    secretoWebhookChatwoot: secreto,
    transporte: "falso",
  };
}
