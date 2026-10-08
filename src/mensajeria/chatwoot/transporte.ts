// Transporte real contra la API de Chatwoot, autenticado con el token del Agent Bot.
// Chatwoot solo deja al bot crear mensajes y cambiar el estado de la conversación, que es
// justo lo que se usa aquí.

import { EnvioIncierto, ErrorTransporte, type DestinoConversacion, type PlantillaAEnviar, type TransporteConversaciones } from "../transporte.ts";

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
    })) as { id?: unknown } | null;
    // Respondió bien pero sin id: el mensaje se creó y no sabemos cuál es. No se reintenta.
    if (r?.id === undefined || r.id === null) throw new EnvioIncierto("Chatwoot no devolvió id de mensaje");
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
      throw clasificarFalloDeRed(e);
    }
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      const mensaje = `Chatwoot respondió ${res.status}: ${detalle}`;
      // Un 408/502/504 es "se acabó el tiempo en el camino": el mensaje pudo haberse creado.
      // Cualquier otro error HTTP es una respuesta de Chatwoot de que NO lo hizo.
      throw ESTADOS_HTTP_INCIERTOS.has(res.status) ? new EnvioIncierto(mensaje, res.status) : new ErrorTransporte(mensaje, res.status);
    }
    try {
      return await res.json();
    } catch {
      // Respondió 2xx pero no se pudo leer: el mensaje se creó y no sabemos con qué id.
      throw new EnvioIncierto("Chatwoot respondió bien pero la respuesta no se pudo leer", res.status);
    }
  }
}

/** Respuestas HTTP que no dicen si el mensaje se creó. */
const ESTADOS_HTTP_INCIERTOS = new Set([408, 502, 504]);

/** Errores de red que garantizan que la petición nunca llegó a Chatwoot. */
const CODIGOS_SIN_CONTACTO = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"]);

function codigosDe(e: unknown): string[] {
  if (typeof e !== "object" || e === null) return [];
  const o = e as { code?: unknown; cause?: unknown; errors?: unknown };
  const propios = typeof o.code === "string" ? [o.code] : [];
  const deLaCausa = codigosDe(o.cause);
  const deLosAgregados = Array.isArray(o.errors) ? o.errors.flatMap(codigosDe) : [];
  return [...propios, ...deLaCausa, ...deLosAgregados];
}

/**
 * Separa "no se pudo contactar a Chatwoot" (nunca salió: ErrorTransporte) de "no sabemos si salió"
 * (EnvioIncierto): el tiempo de espera agotado, una conexión cortada a media petición o cualquier
 * error que no podamos probar que ocurrió antes de enviar. Ante la duda, incierto: no se reenvía.
 */
export function clasificarFalloDeRed(e: unknown): ErrorTransporte {
  const motivo = e instanceof Error ? e.message : String(e);
  const codigos = codigosDe(e);
  if (codigos.length > 0 && codigos.every((c) => CODIGOS_SIN_CONTACTO.has(c))) {
    return new ErrorTransporte(`No se pudo contactar a Chatwoot: ${motivo}`);
  }
  return new EnvioIncierto(`Chatwoot no respondió y no se sabe si recibió el mensaje: ${motivo}`);
}
