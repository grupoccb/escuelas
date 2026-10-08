// Transporte real contra la API de Chatwoot, autenticado con el token del Agent Bot.
// Chatwoot solo deja al bot crear mensajes y cambiar el estado de la conversación, que es
// justo lo que se usa aquí.

import { EnvioIncierto, ErrorTransporte, type ContactoNuevo, type DestinoConversacion, type PlantillaAEnviar, type TransporteConversaciones } from "../transporte.ts";

export interface ConfigChatwoot {
  url: string;
  tokenBot: string;
  /**
   * Token de un agente administrador. Solo hace falta para `iniciarConversacion` (crear el contacto y la conversación de un
   * instructor, D2): el token del Agent Bot solo puede crear mensajes. Sin él, abrir una conversación nueva falla con un
   * error claro y el aviso al maestro queda solo en la aplicación.
   */
  tokenAdmin?: string;
  timeoutMs?: number;
}

export class TransporteChatwoot implements TransporteConversaciones {
  private readonly url: string;
  private readonly tokenBot: string;
  private readonly timeoutMs: number;
  private readonly tokenAdmin: string | undefined;

  constructor(config: ConfigChatwoot) {
    this.url = config.url.replace(/\/+$/, "");
    this.tokenBot = config.tokenBot;
    this.tokenAdmin = config.tokenAdmin;
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

  /**
   * Abre una conversación con alguien que no ha escrito (D2): crea el contacto en la bandeja (o reutiliza el que ya tiene ese
   * teléfono) y la conversación. La API de Chatwoot (`/contacts` y `/conversations`) pide un token de agente, no el del bot.
   * NO verificado contra una instalación real (no se tocó Chatwoot real esta noche): lo cubren pruebas con un servidor HTTP local.
   */
  async iniciarConversacion(chatwootAccountId: number, chatwootInboxId: number, contacto: ContactoNuevo): Promise<{ chatwootConversacionId: number }> {
    if (!this.tokenAdmin) throw new ErrorTransporte("Falta CHATWOOT_ADMIN_TOKEN: sin él no se puede abrir una conversación nueva con el instructor");
    const base = `/api/v1/accounts/${chatwootAccountId}`;
    let c = (await this.postAdmin(`${base}/contacts`, { inbox_id: chatwootInboxId, name: contacto.nombre, phone_number: contacto.telefono }, true)) as ContactoCreado | null;
    if (c === null) {
      // El teléfono ya existe como contacto: se busca y se usa el suyo.
      const encontrados = (await this.getAdmin(`${base}/contacts/search?q=${encodeURIComponent(contacto.telefono)}`)) as { payload?: unknown } | null;
      const primero = Array.isArray(encontrados?.payload) ? (encontrados.payload[0] as { id?: unknown; contact_inboxes?: unknown } | undefined) : undefined;
      if (!primero) throw new ErrorTransporte("Chatwoot dice que el teléfono ya existe como contacto, pero no lo encontró");
      c = { payload: { contact: primero } };
    }
    const contactoChatwoot = c.payload?.contact;
    const contactId = contactoChatwoot?.id;
    const origen = (Array.isArray(contactoChatwoot?.contact_inboxes) ? (contactoChatwoot.contact_inboxes as { source_id?: unknown; inbox?: { id?: unknown } }[]) : []).find((ci) => ci.inbox?.id === chatwootInboxId) ?? (Array.isArray(contactoChatwoot?.contact_inboxes) ? (contactoChatwoot.contact_inboxes as { source_id?: unknown }[])[0] : undefined);
    if (typeof contactId !== "number" || typeof origen?.source_id !== "string") throw new ErrorTransporte("Chatwoot no devolvió el contacto o su canal para abrir la conversación");
    const conv = (await this.postAdmin(`${base}/conversations`, { source_id: origen.source_id, inbox_id: chatwootInboxId, contact_id: contactId }, false)) as { id?: unknown } | null;
    if (typeof conv?.id !== "number") throw new ErrorTransporte("Chatwoot no devolvió el id de la conversación nueva");
    return { chatwootConversacionId: conv.id };
  }

  /** POST con el token de agente. Con `existeEsNull`, un 422 «ya existe» devuelve null en vez de fallar. */
  private async postAdmin(ruta: string, cuerpo: unknown, existeEsNull: boolean): Promise<unknown> {
    return this.pedirAdmin("POST", ruta, cuerpo, existeEsNull);
  }
  private async getAdmin(ruta: string): Promise<unknown> {
    return this.pedirAdmin("GET", ruta, undefined, false);
  }
  private async pedirAdmin(metodo: "GET" | "POST", ruta: string, cuerpo: unknown, existeEsNull: boolean): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${this.url}${ruta}`, {
        method: metodo,
        headers: { "content-type": "application/json", api_access_token: this.tokenAdmin ?? "" },
        ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      throw clasificarFalloDeRed(e);
    }
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      if (existeEsNull && res.status === 422) return null;
      const mensaje = `Chatwoot respondió ${res.status}: ${detalle}`;
      throw ESTADOS_HTTP_INCIERTOS.has(res.status) ? new EnvioIncierto(mensaje, res.status) : new ErrorTransporte(mensaje, res.status);
    }
    try {
      return await res.json();
    } catch {
      throw new EnvioIncierto("Chatwoot respondió bien pero la respuesta no se pudo leer", res.status);
    }
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

interface ContactoCreado {
  payload?: { contact?: { id?: unknown; contact_inboxes?: unknown } };
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
