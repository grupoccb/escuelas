// Cliente mínimo de Chatwoot para las herramientas de desarrollo (aprovisionar la demo y
// simular al contacto). No es parte del producto: el producto habla con Chatwoot solo a
// través de MessagingProvider (src/mensajeria/).

export interface ConfigCliente {
  url: string;
  tokenAdmin: string;
}

export interface Bandeja {
  id: number;
  name: string;
  channel_type: string;
  inbox_identifier?: string;
}

export interface MensajePublico {
  id: number;
  content: string | null;
  /** 0 entrante (contacto), 1 saliente (bot o asesor), 2 actividad, 3 plantilla. */
  message_type: number;
  created_at: number;
}

export class ClienteChatwoot {
  private readonly url: string;
  private readonly tokenAdmin: string;

  constructor(config: ConfigCliente) {
    this.url = config.url.replace(/\/+$/, "");
    this.tokenAdmin = config.tokenAdmin;
  }

  // ── API de administración (token del asesor administrador) ────────────────────────────

  async cuentaPorNombre(nombre: string): Promise<number> {
    const perfil = (await this.admin("GET", "/api/v1/profile")) as { accounts: { id: number; name: string }[] };
    const cuenta = perfil.accounts.find((a) => a.name === nombre);
    if (!cuenta) throw new Error(`El administrador no pertenece a la cuenta "${nombre}". ¿Corrió chatwoot-setup?`);
    return cuenta.id;
  }

  async botPorNombre(cuenta: number, nombre: string): Promise<number> {
    const bots = (await this.admin("GET", `/api/v1/accounts/${cuenta}/agent_bots`)) as { id: number; name: string }[];
    const bot = bots.find((b) => b.name === nombre);
    if (!bot) throw new Error(`No existe el Agent Bot "${nombre}". ¿Corrió chatwoot-setup?`);
    return bot.id;
  }

  async bandejas(cuenta: number): Promise<Bandeja[]> {
    return ((await this.admin("GET", `/api/v1/accounts/${cuenta}/inboxes`)) as { payload: Bandeja[] }).payload;
  }

  async crearBandejaApi(cuenta: number, nombre: string): Promise<Bandeja> {
    return (await this.admin("POST", `/api/v1/accounts/${cuenta}/inboxes`, {
      name: nombre,
      channel: { type: "api", webhook_url: "" },
      // Atender es que una PERSONA la tome (A3): la asignación automática de Chatwoot le pondría
      // asesor a una conversación que nadie escogió y apagaría al bot sin que nadie la atienda.
      enable_auto_assignment: false,
    })) as Bandeja;
  }

  /** Apaga la asignación automática de una bandeja que ya existe (ver crearBandejaApi). */
  async sinAsignacionAutomatica(cuenta: number, bandeja: number): Promise<void> {
    await this.admin("PATCH", `/api/v1/accounts/${cuenta}/inboxes/${bandeja}`, { enable_auto_assignment: false });
  }

  async asignarBot(cuenta: number, bandeja: number, bot: number): Promise<void> {
    await this.admin("POST", `/api/v1/accounts/${cuenta}/inboxes/${bandeja}/set_agent_bot`, { agent_bot: bot });
  }

  async estadoConversacion(cuenta: number, conversacion: number): Promise<string> {
    return ((await this.admin("GET", `/api/v1/accounts/${cuenta}/conversations/${conversacion}`)) as { status: string }).status;
  }

  // ── API pública de una bandeja tipo API (hace de contacto) ───────────────────────────

  async crearContacto(identificador: string, datos: { name: string; phone_number: string }): Promise<string> {
    const r = (await this.publica("POST", `/public/api/v1/inboxes/${identificador}/contacts`, datos)) as { source_id: string };
    return r.source_id;
  }

  async crearConversacion(identificador: string, contacto: string): Promise<number> {
    const r = (await this.publica("POST", `/public/api/v1/inboxes/${identificador}/contacts/${contacto}/conversations`, {})) as { id: number };
    return r.id;
  }

  async escribirComoContacto(identificador: string, contacto: string, conversacion: number, contenido: string): Promise<void> {
    await this.publica("POST", `/public/api/v1/inboxes/${identificador}/contacts/${contacto}/conversations/${conversacion}/messages`, { content: contenido });
  }

  async mensajesDeConversacion(identificador: string, contacto: string, conversacion: number): Promise<MensajePublico[]> {
    return (await this.publica("GET", `/public/api/v1/inboxes/${identificador}/contacts/${contacto}/conversations/${conversacion}/messages`)) as MensajePublico[];
  }

  // ─────────────────────────────────────────────────────────────────────────────────────

  private admin(metodo: string, ruta: string, cuerpo?: unknown): Promise<unknown> {
    return this.pedir(metodo, ruta, cuerpo, { api_access_token: this.tokenAdmin });
  }

  private publica(metodo: string, ruta: string, cuerpo?: unknown): Promise<unknown> {
    return this.pedir(metodo, ruta, cuerpo, {});
  }

  private async pedir(metodo: string, ruta: string, cuerpo: unknown, encabezados: Record<string, string>): Promise<unknown> {
    const res = await fetch(`${this.url}${ruta}`, {
      method: metodo,
      headers: { "content-type": "application/json", ...encabezados },
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    const texto = await res.text();
    if (!res.ok) throw new Error(`Chatwoot ${metodo} ${ruta} → ${res.status}: ${texto}`);
    return texto ? JSON.parse(texto) : null;
  }
}

export function clienteDesdeEntorno(url = process.env["CHATWOOT_URL"]): ClienteChatwoot {
  const tokenAdmin = process.env["CHATWOOT_ADMIN_TOKEN"];
  if (!url || !tokenAdmin) throw new Error("Faltan CHATWOOT_URL o CHATWOOT_ADMIN_TOKEN (ver config/demo-local.env)");
  return new ClienteChatwoot({ url, tokenAdmin });
}
