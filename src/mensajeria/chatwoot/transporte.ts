// Transporte real contra la API de Chatwoot, autenticado con el token del Agent Bot.
// Chatwoot solo deja al bot crear mensajes y cambiar el estado de la conversación, que es
// justo lo que se usa aquí.

import { ErrorTransporte, type DestinoConversacion, type PlantillaAEnviar, type TransporteConversaciones } from "../transporte.ts";

export interface ConfigChatwoot {
  url: string;
  tokenBot: string;
  timeoutMs?: number;
}

export class TransporteChatwoot implements TransporteConversaciones {
  private readonly url: string;
  private readonly tokenBot: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigChatwoot) {
    this.url = config.url.replace(/\/+$/, "");
    this.tokenBot = config.tokenBot;
    this.timeoutMs = config.timeoutMs ?? 4000;
  }

  async enviarMensaje(destino: DestinoConversacion, texto: string): Promise<{ idExterno: string }> {
    return this.crearMensaje(destino, texto, false);
  }

  /**
   * Plantilla de Twilio (Content Template) vía Chatwoot: `template_params` con el nombre, el
   * idioma y las variables por posición. Chatwoot la busca por `friendly_name` entre las
   * plantillas aprobadas que sincronizó del canal (Twilio::TemplateProcessorService, 4.18).
   */
  async enviarPlantilla(destino: DestinoConversacion, plantilla: PlantillaAEnviar): Promise<{ idExterno: string }> {
    return this.crearMensaje(destino, plantilla.cuerpo, false, {
      name: plantilla.codigo,
      language: plantilla.idioma,
      processed_params: plantilla.variables,
    });
  }

  async enviarNotaInterna(destino: DestinoConversacion, texto: string): Promise<{ idExterno: string }> {
    return this.crearMensaje(destino, texto, true);
  }

  async abrirConversacion(destino: DestinoConversacion): Promise<void> {
    await this.post(`${this.rutaConversacion(destino)}/toggle_status`, { status: "open" });
  }

  private async crearMensaje(
    destino: DestinoConversacion,
    texto: string,
    privado: boolean,
    plantilla?: Record<string, unknown>,
  ): Promise<{ idExterno: string }> {
    const r = (await this.post(`${this.rutaConversacion(destino)}/messages`, {
      content: texto,
      message_type: "outgoing",
      private: privado,
      ...(plantilla ? { template_params: plantilla } : {}),
    })) as { id?: unknown };
    if (r.id === undefined || r.id === null) throw new ErrorTransporte("Chatwoot no devolvió id de mensaje");
    return { idExterno: String(r.id) };
  }

  private rutaConversacion(d: DestinoConversacion): string {
    return `/api/v1/accounts/${d.chatwootAccountId}/conversations/${d.chatwootConversacionId}`;
  }

  private async post(ruta: string, cuerpo: unknown): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${this.url}${ruta}`, {
        method: "POST",
        headers: { "content-type": "application/json", api_access_token: this.tokenBot },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw new ErrorTransporte(`Chatwoot no respondió: ${(e as Error).message}`);
    }
    if (!res.ok) throw new ErrorTransporte(`Chatwoot respondió ${res.status}: ${await res.text()}`, res.status);
    return res.json();
  }
}
