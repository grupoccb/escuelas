// Webhooks del Agent Bot de Chatwoot: autenticación (invariante 9) e interpretación.
//
// Chatwoot (4.18) firma cada webhook del bot con el secreto del bot:
//   X-Chatwoot-Timestamp: <segundos unix>
//   X-Chatwoot-Signature: sha256=<hex de HMAC-SHA256(secreto, "<timestamp>.<cuerpo crudo>")>
// Ver lib/webhooks/trigger.rb en Chatwoot. Se valida sobre el cuerpo crudo, antes de parsear.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Antigüedad máxima aceptada de un webhook firmado, contra reenvíos de uno capturado. */
const TOLERANCIA_SEGUNDOS = 300;

export interface PeticionConEncabezados {
  get(nombre: string): string | undefined;
}

export function firmarCuerpoChatwoot(secreto: string, timestamp: string, cuerpo: Buffer): string {
  const hmac = createHmac("sha256", secreto);
  hmac.update(`${timestamp}.`);
  hmac.update(cuerpo);
  return `sha256=${hmac.digest("hex")}`;
}

/** true solo si la firma es válida y el timestamp es reciente. Nunca lanza. */
export function verificarWebhookChatwoot(
  peticion: PeticionConEncabezados,
  cuerpo: Buffer,
  secreto: string | null | undefined,
  ahora: Date = new Date(),
): boolean {
  if (!secreto) return false;
  const firma = peticion.get("x-chatwoot-signature");
  const timestamp = peticion.get("x-chatwoot-timestamp");
  if (!firma || !timestamp || !/^\d{1,12}$/.test(timestamp)) return false;
  if (Math.abs(ahora.getTime() / 1000 - Number(timestamp)) > TOLERANCIA_SEGUNDOS) return false;

  const esperada = Buffer.from(firmarCuerpoChatwoot(secreto, timestamp, cuerpo));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

/** Mensaje entrante del contacto, ya extraído del payload de Chatwoot. */
export interface EventoEntrante {
  chatwootAccountId: number;
  chatwootInboxId: number;
  /** display_id: el número de conversación que usan la API y la interfaz de Chatwoot. */
  chatwootConversacionId: number;
  /** Id del mensaje en Chatwoot. Llave de idempotencia (invariante 8). */
  idMensaje: string;
  contenido: string;
  /** Estado de la conversación en Chatwoot: pending (bot), open (asesor), resolved, snoozed. */
  estadoConversacion: string;
  contacto: { nombre: string | null; telefono: string | null };
  creadoEn: Date | null;
  /**
   * Llave de idempotencia (invariante 8): el id del proveedor (`source_id`, el MessageSid de
   * Twilio) cuando existe; si no, el id de Chatwoot. Chatwoot no es idempotente ante un
   * reintento de Twilio (DECISION-ATRIBUCION, H2), así que no se puede usar solo su id.
   */
  llave: { proveedor: string; id: string };
  /** Número de WhatsApp que recibió el mensaje, si el transporte lo trae. Chatwoot no lo manda. */
  numeroReceptor: string | null;
  /** El payload tal como llegó. Lo leen los adaptadores (p. ej. la atribución). */
  crudo: unknown;
}

type Objeto = Record<string, unknown>;

const objeto = (v: unknown): Objeto | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Objeto) : null);
const entero = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/**
 * Devuelve el evento si es un mensaje nuevo del contacto. Todo lo demás (mensajes del bot o
 * de asesores, notas privadas, cambios de estado) devuelve null y se ignora.
 */
export function interpretarEventoChatwoot(payload: unknown): EventoEntrante | null {
  const p = objeto(payload);
  if (!p || p["event"] !== "message_created") return null;
  if (p["message_type"] !== "incoming" || p["private"] === true) return null;

  const cuenta = entero(objeto(p["account"])?.["id"]);
  const bandeja = entero(objeto(p["inbox"])?.["id"]);
  const conversacion = objeto(p["conversation"]);
  const idConversacion = entero(conversacion?.["id"]);
  const idMensaje = entero(p["id"]);
  if (cuenta === null || bandeja === null || idConversacion === null || idMensaje === null) return null;

  // En un mensaje entrante el remitente es el contacto. `sender` no trae `type`;
  // conversation.meta.sender es el respaldo.
  const contacto = objeto(p["sender"]) ?? objeto(objeto(conversacion?.["meta"])?.["sender"]);

  const creado = texto(p["created_at"]);
  const creadoEn = creado ? new Date(creado) : null;

  // Los canales de Twilio traen en `source_id` el MessageSid del proveedor.
  const idProveedor = texto(p["source_id"]);
  const esTwilio = texto(conversacion?.["channel"]) === "Channel::TwilioSms";
  const llave =
    idProveedor && esTwilio
      ? { proveedor: "twilio", id: idProveedor }
      : { proveedor: "chatwoot", id: String(idMensaje) };

  return {
    chatwootAccountId: cuenta,
    chatwootInboxId: bandeja,
    chatwootConversacionId: idConversacion,
    idMensaje: String(idMensaje),
    contenido: typeof p["content"] === "string" ? p["content"] : "",
    estadoConversacion: texto(conversacion?.["status"]) ?? "",
    contacto: {
      nombre: texto(contacto?.["name"]),
      telefono: texto(contacto?.["phone_number"]),
    },
    creadoEn: creadoEn && !Number.isNaN(creadoEn.getTime()) ? creadoEn : null,
    llave,
    numeroReceptor: null,
    crudo: payload,
  };
}
