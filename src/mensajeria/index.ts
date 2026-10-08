// Punto de entrada de la mensajería. Las integraciones reales se activan por variables de
// entorno; sin ellas se usa el transporte falso (invariante 11).

import { log } from "../lib/log.ts";
import { DirectorioAgentesChatwoot } from "./chatwoot/directorio.ts";
import { TransporteChatwoot } from "./chatwoot/transporte.ts";
import { DirectorioAgentesFalso, type DirectorioAgentes } from "./directorio.ts";
import { TransporteFalso } from "./fake.ts";
import { MessagingProvider } from "./provider.ts";

export {
  MessagingProvider,
  ENVIO_INCIERTO,
  ENVIO_INCIERTO_MS,
  PENDIENTE_VIGENCIA_MS,
  ErrorOrigenSaliente,
  confirmacionBajaA,
  respuestaA,
  type PlantillaDeSaliente,
  type Saliente,
  type SalienteDeRespuesta,
  type SalienteDelSistema,
  type ResumenDespacho,
} from "./provider.ts";
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
  type AlertasBorde,
  type BordeTwilio,
  type EntradaBorde,
  type ResumenReenvio,
  type ReenviadorTwilio,
  type ResultadoBorde,
  type TwilioConfigurado,
} from "./twilio/index.ts";
export { DirectorioAgentesFalso, ErrorDirectorio, type AgenteChatwoot, type DirectorioAgentes } from "./directorio.ts";
export { DirectorioAgentesChatwoot } from "./chatwoot/directorio.ts";
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
  interpretarDesasignacion,
  interpretarEventoChatwoot,
  interpretarTomaDeConversacion,
  verificarWebhookChatwoot,
  type EventoDesasignacion,
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

/**
 * Directorio de agentes de Chatwoot: real con `CHATWOOT_URL` + `CHATWOOT_ADMIN_TOKEN` (el token de un
 * administrador de la cuenta); sin ellos, `null` en producción (vincular agentes responde que no está
 * configurado) y un directorio falso VACÍO fuera de producción (invariante 11).
 */
export function directorioAgentesDesdeEntorno(env: NodeJS.ProcessEnv = process.env): DirectorioAgentes | null {
  const url = env["CHATWOOT_URL"];
  const tokenAdmin = env["CHATWOOT_ADMIN_TOKEN"];
  if (url && tokenAdmin) return new DirectorioAgentesChatwoot({ url, tokenAdmin });
  if (env["NODE_ENV"] === "production") {
    log.warn("directorio_agentes_sin_configurar", { motivo: "faltan CHATWOOT_URL o CHATWOOT_ADMIN_TOKEN" });
    return null;
  }
  log.warn("directorio_agentes_falso", { motivo: "faltan CHATWOOT_URL o CHATWOOT_ADMIN_TOKEN" });
  return new DirectorioAgentesFalso();
}
