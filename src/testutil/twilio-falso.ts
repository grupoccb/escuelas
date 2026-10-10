// Twilio FALSO para el ensayo (V9) y sus pruebas: sin credenciales ni red real (invariante 11).
//
// Hace de las dos mitades de Twilio que el sistema ve:
//  1. SU API REST (la que usa Chatwoot para mandar y `ensayo:preparar` para validar las credenciales): crear un mensaje, ver la cuenta. Autenticada con Basic
//     (SID:token) como la real; con FALLAS INYECTABLES (el próximo envío falla con el código que se diga).
//  2. SUS LLAMADAS al sistema (webhooks): entrantes y estados de entrega, FIRMADOS con el token como los firma Twilio, contra la URL PÚBLICA. El túnel se
//     modela con `tunel`: la firma se calcula con la URL pública (`https://…`) y la petición viaja a la dirección local. Si la prueba se equivoca de URL, la firma
//     no cuadra, igual que con el túnel real.

import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { calcularFirmaTwilio } from "../mensajeria/twilio/firma.ts";

export interface MensajeEnTwilio {
  sid: string;
  to: string;
  from: string;
  body: string;
  statusCallback: string | null;
  contentSid: string | null;
  /** Estados que ya se avisaron por callback. */
  estados: string[];
}

export interface FallaInyectada {
  /** Estado HTTP de la respuesta de la API (por ejemplo 400 para un número no válido, 500 para una caída). */
  status: number;
  /** Código de error de Twilio (por ejemplo 63016: fuera de la ventana de 24 h). */
  codigo: number;
  mensaje: string;
}

export interface ConfigTwilioFalso {
  sid: string;
  token: string;
  /** El número de la escuela (formato `whatsapp:+…`). */
  numero: string;
}

/** Cómo el túnel hace llegar lo público a lo local. */
export interface Tunel {
  /** La URL pública (https, sin puerto): la que Twilio tiene configurada y con la que firma. */
  publica: string;
  /** A dónde llega de verdad (http://127.0.0.1:puerto). */
  local: string;
}

const nuevoSid = (prefijo: string): string => `${prefijo}${randomBytes(16).toString("hex")}`;

async function leerCuerpo(req: IncomingMessage): Promise<string> {
  const trozos: Buffer[] = [];
  for await (const t of req) trozos.push(t as Buffer);
  return Buffer.concat(trozos).toString("utf8");
}

export class TwilioFalso {
  readonly config: ConfigTwilioFalso;
  readonly mensajes: MensajeEnTwilio[] = [];
  /** Cada vez que alguien pide un recurso con credenciales (para comprobar que se usaron y no se imprimieron). */
  readonly autenticaciones: { ruta: string; ok: boolean }[] = [];
  tunel: Tunel | null = null;
  private server: Server | null = null;
  private fallas: FallaInyectada[] = [];

  constructor(config: ConfigTwilioFalso) {
    this.config = config;
  }

  /** Arranca la API REST en un puerto libre de 127.0.0.1 y devuelve su URL base. */
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
    if (!a || typeof a !== "object") throw new Error("El Twilio falso no está iniciado");
    return `http://127.0.0.1:${a.port}`;
  }

  async cerrar(): Promise<void> {
    const s = this.server;
    this.server = null;
    if (s) await new Promise<void>((ok) => s.close(() => ok()));
  }

  /** El PRÓXIMO envío por la API REST falla así (y los siguientes ya no). */
  fallarProximoEnvio(falla: FallaInyectada): void {
    this.fallas.push(falla);
  }

  private autenticado(req: IncomingMessage): boolean {
    const esperado = `Basic ${Buffer.from(`${this.config.sid}:${this.config.token}`).toString("base64")}`;
    return req.headers.authorization === esperado;
  }

  private async atender(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://falso");
    const json = (status: number, cuerpo: unknown): void => {
      res.statusCode = status;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(cuerpo));
    };
    const m = /^\/2010-04-01\/Accounts\/([^/]+?)(\.json|\/Messages\.json)$/.exec(url.pathname);
    if (!m) return json(404, { code: 20404, message: "No existe", status: 404 });
    const ok = this.autenticado(req) && m[1] === this.config.sid;
    this.autenticaciones.push({ ruta: url.pathname, ok });
    if (!ok) return json(401, { code: 20003, message: "Authenticate", status: 401 });

    if (m[2] === ".json" && req.method === "GET") return json(200, { sid: this.config.sid, friendly_name: "Cuenta falsa del ensayo", status: "active" });
    if (m[2] === "/Messages.json" && req.method === "GET") return json(200, { messages: this.mensajes.slice(-1).map((x) => ({ sid: x.sid })) });
    if (m[2] === "/Messages.json" && req.method === "POST") {
      const p = new URLSearchParams(await leerCuerpo(req));
      const falla = this.fallas.shift();
      if (falla) return json(falla.status, { code: falla.codigo, message: falla.mensaje, status: falla.status });
      if (!p.get("To") || !p.get("From")) return json(400, { code: 21604, message: "A 'To' phone number is required.", status: 400 });
      const mensaje: MensajeEnTwilio = {
        sid: nuevoSid("SM"),
        to: p.get("To")!,
        from: p.get("From")!,
        body: p.get("Body") ?? "",
        statusCallback: p.get("StatusCallback"),
        contentSid: p.get("ContentSid"),
        estados: [],
      };
      this.mensajes.push(mensaje);
      return json(201, { sid: mensaje.sid, status: "queued", to: mensaje.to, from: mensaje.from, body: mensaje.body });
    }
    return json(405, { code: 20004, message: "Método no permitido", status: 405 });
  }

  // ── Lo que Twilio le hace al sistema (firmado) ──────────────────────────────────────────

  /** Firma con la URL PÚBLICA y manda a la dirección LOCAL equivalente. `firmarCon` permite equivocarse a propósito (otra URL u otro token). */
  async llamar(
    urlPublicaCompleta: string,
    params: Record<string, string>,
    opciones: { firmarCon?: string; token?: string; sinFirma?: boolean; cabeceras?: Record<string, string> } = {},
  ): Promise<{ status: number; texto: string }> {
    if (!this.tunel) throw new Error("Falta definir el túnel del Twilio falso");
    const destino = urlPublicaCompleta.startsWith(this.tunel.publica) ? `${this.tunel.local}${urlPublicaCompleta.slice(this.tunel.publica.length)}` : urlPublicaCompleta;
    const cuerpo = new URLSearchParams(params).toString();
    const firma = calcularFirmaTwilio(opciones.token ?? this.config.token, opciones.firmarCon ?? urlPublicaCompleta, params);
    const res = await fetch(destino, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...(opciones.sinFirma ? {} : { "x-twilio-signature": firma }), ...opciones.cabeceras },
      body: cuerpo,
      redirect: "manual",
    });
    return { status: res.status, texto: await res.text() };
  }

  /** Un mensaje de WhatsApp de una persona a la escuela (como lo llama Twilio a «When a message comes in»). */
  entrante(o: { desde: string; cuerpo: string; sid?: string; ruta?: string; extra?: Record<string, string>; firmarCon?: string; token?: string; sinFirma?: boolean }): Promise<{ status: number; texto: string; sid: string }> {
    if (!this.tunel) throw new Error("Falta definir el túnel del Twilio falso");
    const sid = o.sid ?? nuevoSid("SM");
    const desde = o.desde.startsWith("whatsapp:") ? o.desde : `whatsapp:${o.desde}`;
    const params: Record<string, string> = {
      SmsMessageSid: sid,
      NumMedia: "0",
      ProfileName: "Mamá de prueba",
      MessageType: "text",
      SmsSid: sid,
      WaId: desde.replace(/^whatsapp:\+/, ""),
      SmsStatus: "received",
      Body: o.cuerpo,
      To: this.config.numero,
      NumSegments: "1",
      MessageSid: sid,
      AccountSid: this.config.sid,
      From: desde,
      ApiVersion: "2010-04-01",
      ...(o.extra ?? {}),
    };
    return this.llamar(`${this.tunel.publica}${o.ruta ?? "/webhooks/twilio/entrantes"}`, params, {
      ...(o.firmarCon ? { firmarCon: o.firmarCon } : {}),
      ...(o.token ? { token: o.token } : {}),
      ...(o.sinFirma ? { sinFirma: true } : {}),
    }).then((r) => ({ ...r, sid }));
  }

  /** Un aviso de estado de un mensaje que la escuela mandó por la API REST, a la URL que ese mensaje pidió (`StatusCallback`). */
  estado(sid: string, estado: "queued" | "sent" | "delivered" | "read" | "failed" | "undelivered", o: { codigoError?: number; urlPublica?: string; firmarCon?: string } = {}): Promise<{ status: number; texto: string }> {
    const m = this.mensajes.find((x) => x.sid === sid);
    if (!m) throw new Error(`El Twilio falso no tiene un mensaje ${sid}`);
    const url = o.urlPublica ?? m.statusCallback;
    if (!url) throw new Error("Ese mensaje no pidió StatusCallback");
    m.estados.push(estado);
    const params: Record<string, string> = {
      SmsSid: sid,
      SmsStatus: estado,
      MessageStatus: estado,
      To: m.to,
      MessageSid: sid,
      AccountSid: this.config.sid,
      From: m.from,
      ApiVersion: "2010-04-01",
      ...(o.codigoError ? { ErrorCode: String(o.codigoError) } : {}),
    };
    return this.llamar(url, params, o.firmarCon ? { firmarCon: o.firmarCon } : {});
  }
}
