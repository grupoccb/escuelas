// Chatwoot FALSO con la parte de Twilio, para probar el ensayo de punta a punta sin Chatwoot ni Twilio reales (V9, invariante 11).
//
// Imita lo que Chatwoot 4.18 hace con un canal de WhatsApp por Twilio (docs/DECISION-ATRIBUCION.md):
//  - recibe de Twilio (aquí, reenviado por el borde del backend) `POST /twilio/callback`: crea el mensaje entrante y avisa al Agent Bot (webhook firmado con el
//    secreto del bot). NO es idempotente (H2: un reintento duplica el mensaje) y trata `+521…` y `+52…` como contactos distintos (H3): por eso esas dos
//    garantías las tiene que dar el sistema, y las pruebas lo comprueban contra este falso;
//  - recibe `POST /twilio/delivery_status`, avanza el estado del mensaje y avisa al Agent Bot (`message_updated`);
//  - atiende la API que usa el sistema (`POST …/conversations/:id/messages`, `toggle_status`): lo saliente lo manda por la API REST de Twilio con
//    `StatusCallback` = FRONTEND_URL + /twilio/delivery_status; las notas privadas solo quedan en la conversación;
//  - `asesorResponde` hace de un asesor escribiendo desde la bandeja.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { firmarCuerpoChatwoot } from "../mensajeria/chatwoot/webhook.ts";
import { payloadMensajeEntrante } from "../mensajeria/chatwoot/fixtures.ts";

export interface ConfigChatwootFalso {
  cuenta: number;
  bandeja: number;
  tokenBot: string;
  secretoBot: string;
  /** El FRONTEND_URL de Chatwoot (en el ensayo, la URL pública del túnel): de ahí sale el `status_callback` de cada mensaje. */
  frontendUrl: string;
  /** API REST del Twilio falso, y sus credenciales. */
  twilio: { url: string; sid: string; token: string; numero: string };
}

export interface MensajeChatwoot {
  id: number;
  conversacion: number;
  tipo: "entrante" | "saliente" | "nota";
  contenido: string;
  /** El MessageSid de Twilio (entrantes y salientes). */
  sourceId: string | null;
  estado: "sent" | "delivered" | "read" | "failed";
  errorExterno: string | null;
  deAsesor: boolean;
}

export interface ConversacionChatwoot {
  id: number;
  /** El teléfono TAL CUAL llegó de Twilio (`+521…` y `+52…` son contactos distintos para Chatwoot). */
  telefono: string;
  estado: string;
}

const ORDEN = ["sent", "delivered", "read"] as const;

async function leerCuerpo(req: IncomingMessage): Promise<string> {
  const trozos: Buffer[] = [];
  for await (const t of req) trozos.push(t as Buffer);
  return Buffer.concat(trozos).toString("utf8");
}

export class ChatwootFalso {
  readonly config: ConfigChatwootFalso;
  readonly mensajes: MensajeChatwoot[] = [];
  readonly conversaciones: ConversacionChatwoot[] = [];
  /** Lo que llegó por `/twilio/callback` y `/twilio/delivery_status`, para contar reenvíos. */
  readonly recibidoDeTwilio: { ruta: string; params: Record<string, string> }[] = [];
  /** URL del backend (para el webhook del Agent Bot). */
  backendUrl: string | null = null;
  /** Si se pone, el Agent Bot no recibe nada (Chatwoot sin el bot conectado). */
  sinBot = false;
  private server: Server | null = null;
  private siguienteMensaje = 1000;
  private siguienteConversacion = 500;
  private pendientes: Promise<unknown>[] = [];

  constructor(config: ConfigChatwootFalso) {
    this.config = config;
  }

  async iniciar(): Promise<string> {
    this.server = createServer((req, res) => {
      res.setHeader("Connection", "close");
      void this.atender(req, res).catch(() => {
        res.statusCode = 500;
        res.end();
      });
    }).listen(0, "127.0.0.1");
    await new Promise<void>((ok, mal) => {
      this.server!.once("listening", ok);
      this.server!.once("error", mal);
    });
    return this.url;
  }

  get url(): string {
    const a = this.server?.address();
    if (!a || typeof a !== "object") throw new Error("El Chatwoot falso no está iniciado");
    return `http://127.0.0.1:${a.port}`;
  }

  async cerrar(): Promise<void> {
    await this.vaciar();
    const s = this.server;
    this.server = null;
    if (s) await new Promise<void>((ok) => s.close(() => ok()));
  }

  /** Espera a que termine todo lo que Chatwoot hace «en segundo plano» (avisos al bot, envíos a Twilio) y lo que éstos desencadenan. */
  async vaciar(): Promise<void> {
    for (let i = 0; i < 20 && this.pendientes.length > 0; i++) {
      const lote = this.pendientes;
      this.pendientes = [];
      await Promise.allSettled(lote);
    }
  }

  notas(conversacion?: number): string[] {
    return this.mensajes.filter((m) => m.tipo === "nota" && (conversacion === undefined || m.conversacion === conversacion)).map((m) => m.contenido);
  }
  salientes(conversacion?: number): MensajeChatwoot[] {
    return this.mensajes.filter((m) => m.tipo === "saliente" && (conversacion === undefined || m.conversacion === conversacion));
  }
  conversacionDe(telefono: string): ConversacionChatwoot | undefined {
    return this.conversaciones.find((c) => c.telefono === telefono);
  }

  /** Un asesor escribe desde Chatwoot: se manda por Twilio y el Agent Bot se entera (esto es lo que activa la atención humana). */
  async asesorResponde(conversacion: number, texto: string): Promise<MensajeChatwoot> {
    const m = await this.crearSaliente(conversacion, texto, true);
    await this.vaciar();
    return m;
  }

  // ── HTTP ────────────────────────────────────────────────────────────────────────────────

  private async atender(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://falso");
    const cuerpo = await leerCuerpo(req);
    const json = (status: number, datos: unknown): void => {
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(datos));
    };

    if (req.method === "POST" && url.pathname === "/twilio/callback") {
      const params = Object.fromEntries(new URLSearchParams(cuerpo));
      this.recibidoDeTwilio.push({ ruta: url.pathname, params });
      this.pendientes.push(this.recibirEntrante(params));
      res.statusCode = 204;
      res.end();
      return;
    }
    if (req.method === "POST" && url.pathname === "/twilio/delivery_status") {
      const params = Object.fromEntries(new URLSearchParams(cuerpo));
      this.recibidoDeTwilio.push({ ruta: url.pathname, params });
      this.pendientes.push(this.recibirEstado(params));
      res.statusCode = 204;
      res.end();
      return;
    }

    const m = /^\/api\/v1\/accounts\/(\d+)\/conversations\/(\d+)\/(messages|toggle_status)$/.exec(url.pathname);
    if (req.method === "POST" && m) {
      if (req.headers["api_access_token"] !== this.config.tokenBot) return json(401, { error: "token" });
      const conversacion = Number(m[2]);
      if (!this.conversaciones.some((c) => c.id === conversacion)) return json(404, { error: "no existe la conversación" });
      const datos = JSON.parse(cuerpo || "{}") as { content?: string; private?: boolean; status?: string };
      if (m[3] === "toggle_status") {
        this.conversaciones.find((c) => c.id === conversacion)!.estado = datos.status ?? "open";
        return json(200, { payload: { success: true } });
      }
      if (datos.private) {
        const nota: MensajeChatwoot = { id: this.siguienteMensaje++, conversacion, tipo: "nota", contenido: datos.content ?? "", sourceId: null, estado: "sent", errorExterno: null, deAsesor: false };
        this.mensajes.push(nota);
        return json(200, { id: nota.id });
      }
      const saliente = await this.crearSaliente(conversacion, datos.content ?? "", false);
      return json(200, { id: saliente.id });
    }
    json(404, { error: "no existe" });
  }

  // ── Lo que Chatwoot hace con Twilio ─────────────────────────────────────────────────────

  private async recibirEntrante(params: Record<string, string>): Promise<void> {
    if (!params["Body"]) return; // Chatwoot ignora lo que no trae texto ni medios.
    const telefono = (params["From"] ?? "").replace(/^whatsapp:/, "");
    let conv = this.conversacionDe(telefono);
    if (!conv) {
      conv = { id: this.siguienteConversacion++, telefono, estado: "pending" };
      this.conversaciones.push(conv);
    }
    const mensaje: MensajeChatwoot = { id: this.siguienteMensaje++, conversacion: conv.id, tipo: "entrante", contenido: params["Body"], sourceId: params["MessageSid"] ?? null, estado: "sent", errorExterno: null, deAsesor: false };
    this.mensajes.push(mensaje);
    await this.avisarAlBot({
      ...payloadMensajeEntrante({
        id: mensaje.id,
        content: mensaje.contenido,
        cuenta: this.config.cuenta,
        bandeja: this.config.bandeja,
        conversacion: conv.id,
        estado: conv.estado,
        telefono,
        nombre: params["ProfileName"] ?? "Contacto",
        sourceId: mensaje.sourceId,
        canal: "Channel::TwilioSms",
      }),
      // La hora real: el payload de ejemplo trae una fija (de 2026-10-07) y dejaría la ventana de servicio vencida.
      created_at: new Date().toISOString(),
    });
  }

  private async recibirEstado(params: Record<string, string>): Promise<void> {
    const m = this.mensajes.find((x) => x.sourceId === params["MessageSid"] && x.tipo === "saliente");
    if (!m) return; // Chatwoot no hace nada con un MessageSid que no conoce.
    const crudo = params["MessageStatus"] ?? "";
    const nuevo = crudo === "undelivered" || crudo === "failed" ? "failed" : (ORDEN as readonly string[]).includes(crudo) ? (crudo as MensajeChatwoot["estado"]) : null;
    if (!nuevo) return;
    // Solo avanza hacia adelante, salvo `failed`, que entra y sale siempre (Messages::StatusUpdateService).
    const rango = (e: string): number => (ORDEN as readonly string[]).indexOf(e);
    if (nuevo !== "failed" && rango(nuevo) <= rango(m.estado)) return;
    m.estado = nuevo;
    m.errorExterno = nuevo === "failed" ? (params["ErrorMessage"] ? `${params["ErrorCode"] ?? ""} - ${params["ErrorMessage"]}`.trim() : `Error code: ${params["ErrorCode"] ?? "desconocido"}`) : null;
    await this.avisarEstado(m);
  }

  /** Crea un saliente, lo manda por la API REST de Twilio y avisa al bot. */
  private async crearSaliente(conversacion: number, texto: string, deAsesor: boolean): Promise<MensajeChatwoot> {
    const conv = this.conversaciones.find((c) => c.id === conversacion);
    if (!conv) throw new Error(`No existe la conversación ${conversacion}`);
    const m: MensajeChatwoot = { id: this.siguienteMensaje++, conversacion, tipo: "saliente", contenido: texto, sourceId: null, estado: "sent", errorExterno: null, deAsesor };
    this.mensajes.push(m);
    const { url, sid, token, numero } = this.config.twilio;
    try {
      const res = await fetch(`${url}/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
        body: new URLSearchParams({ To: `whatsapp:${conv.telefono}`, From: numero, Body: texto, StatusCallback: `${this.config.frontendUrl.replace(/\/+$/, "")}/twilio/delivery_status` }).toString(),
      });
      const datos = (await res.json()) as { sid?: string; code?: number; message?: string };
      if (res.ok && datos.sid) m.sourceId = datos.sid;
      else {
        m.estado = "failed";
        m.errorExterno = `${datos.code ?? res.status} - ${datos.message ?? "error de Twilio"}`;
      }
    } catch (e) {
      m.estado = "failed";
      m.errorExterno = `No se pudo contactar a Twilio: ${(e as Error).message}`;
    }
    // Lo que Chatwoot avisa al bot: el mensaje creado (de un asesor o del propio bot) y, si falló, el cambio de estado.
    this.pendientes.push(this.avisarSaliente(m, conv));
    return m;
  }

  private async avisarSaliente(m: MensajeChatwoot, conv: ConversacionChatwoot): Promise<void> {
    await this.avisarAlBot({
      event: "message_created",
      id: m.id,
      content: m.contenido,
      content_type: "text",
      message_type: "outgoing",
      private: false,
      created_at: new Date().toISOString(),
      source_id: m.sourceId,
      content_attributes: {},
      account: { id: this.config.cuenta, name: "Demo local" },
      inbox: { id: this.config.bandeja, name: "Bandeja" },
      sender: m.deAsesor ? { id: 2, name: "Asesor demo", type: "user" } : { id: 3, name: "Bot de captación", type: "agent_bot" },
      conversation: { id: conv.id, inbox_id: this.config.bandeja, channel: "Channel::TwilioSms", status: conv.estado, meta: { assignee_type: m.deAsesor ? "User" : "AgentBot" } },
    });
    if (m.estado === "failed") await this.avisarEstado(m);
  }

  private async avisarEstado(m: MensajeChatwoot): Promise<void> {
    const conv = this.conversaciones.find((c) => c.id === m.conversacion)!;
    await this.avisarAlBot({
      event: "message_updated",
      id: m.id,
      content: m.contenido,
      message_type: "outgoing",
      private: false,
      source_id: m.sourceId,
      account: { id: this.config.cuenta, name: "Demo local" },
      inbox: { id: this.config.bandeja, name: "Bandeja" },
      conversation: {
        id: conv.id,
        inbox_id: this.config.bandeja,
        channel: "Channel::TwilioSms",
        status: conv.estado,
        messages: [{ id: m.id, status: m.estado, source_id: m.sourceId, updated_at: new Date().toISOString(), content_attributes: { external_error: m.errorExterno } }],
      },
    });
  }

  private async avisarAlBot(payload: Record<string, unknown>): Promise<void> {
    if (this.sinBot || !this.backendUrl) return;
    const cuerpo = Buffer.from(JSON.stringify(payload));
    const timestamp = String(Math.floor(Date.now() / 1000));
    await fetch(`${this.backendUrl}/webhooks/chatwoot`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-chatwoot-timestamp": timestamp, "x-chatwoot-signature": firmarCuerpoChatwoot(this.config.secretoBot, timestamp, cuerpo) },
      body: new Blob([new Uint8Array(cuerpo)]),
    }).then((r) => r.arrayBuffer());
  }
}
