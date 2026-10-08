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
  /**
   * Estado de la conversación en Chatwoot: pending, open, resolved, snoozed. OJO: NO indica que
   * una persona la atienda. El propio sistema la abre (open) al pasarla a los asesores o al
   * mostrarla a los 30 min; esa apertura queda `open` sin asesor.
   */
  estadoConversacion: string;
  /**
   * La conversación está asignada a una PERSONA (`meta.assignee_type == "User"`), no a un bot.
   * Es el respaldo de la señal de asignación por si se perdió el evento `conversation_updated`.
   */
  asignadaAPersona?: boolean;
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
// Enteros SEGUROS: un número como 1e300 «es entero» para JavaScript pero ninguna columna lo guarda (WH).
const entero = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) ? v : null);
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
    asignadaAPersona: texto(objeto(conversacion?.["meta"])?.["assignee_type"]) === "User",
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

/**
 * Una persona tomó la conversación en Chatwoot. Eso (y no que esté "abierta") es lo que activa
 * `en_atencion_humana`. Chatwoot 4.18 lo avisa de dos maneras al Agent Bot (payloads reales en
 * `payload-conversacion-asignada.json` y `payload-mensaje-asesor.json`):
 * - `conversation_updated` con `changed_attributes` que trae `assignee_id` y `meta.assignee_type`
 *   `User` (asignación a un asesor);
 * - `message_created` saliente cuyo `sender.type` es `user` (un asesor escribió, sea al contacto
 *   o una nota privada). Lo que manda el propio sistema trae `sender.type` `agent_bot`.
 * Todo lo demás (abrir, resolver, cambios de estado, asignar al bot, desasignar) devuelve null.
 */
export interface EventoTomaDeConversacion {
  chatwootAccountId: number;
  chatwootInboxId: number;
  chatwootConversacionId: number;
  via: "asignacion" | "mensaje";
  /** Id del agente en Chatwoot, si el evento lo trae. */
  agenteId: number | null;
  crudo: unknown;
}

/** El cambio de un atributo en `changed_attributes` (una lista de objetos de una clave, o un objeto). */
function cambioDe(cambios: unknown, clave: string): Objeto | null {
  if (Array.isArray(cambios)) {
    for (const c of cambios) {
      const cambio = objeto(objeto(c)?.[clave]);
      if (cambio) return cambio;
    }
    return null;
  }
  return objeto(objeto(cambios)?.[clave]);
}

export function interpretarTomaDeConversacion(payload: unknown): EventoTomaDeConversacion | null {
  const p = objeto(payload);
  if (!p) return null;
  const cuenta = entero(objeto(p["account"])?.["id"]);
  if (cuenta === null) return null;

  if (p["event"] === "conversation_updated") {
    const nuevoAsesor = entero(cambioDe(p["changed_attributes"], "assignee_id")?.["current_value"]);
    if (nuevoAsesor === null) return null; // sin cambio de asesor, o se desasignó
    if (texto(objeto(p["meta"])?.["assignee_type"]) !== "User") return null; // asignada a un bot no cuenta
    const bandeja = entero(p["inbox_id"]);
    const conversacion = entero(p["id"]);
    if (bandeja === null || conversacion === null) return null;
    return { chatwootAccountId: cuenta, chatwootInboxId: bandeja, chatwootConversacionId: conversacion, via: "asignacion", agenteId: nuevoAsesor, crudo: payload };
  }

  if (p["event"] === "message_created") {
    if (p["message_type"] !== "outgoing") return null;
    const remitente = objeto(p["sender"]);
    if (texto(remitente?.["type"]) !== "user") return null; // el bot (agent_bot) y el contacto no cuentan
    const bandeja = entero(objeto(p["inbox"])?.["id"]);
    const conversacion = entero(objeto(p["conversation"])?.["id"]);
    if (bandeja === null || conversacion === null) return null;
    return { chatwootAccountId: cuenta, chatwootInboxId: bandeja, chatwootConversacionId: conversacion, via: "mensaje", agenteId: entero(remitente?.["id"]), crudo: payload };
  }

  return null;
}

/**
 * La conversación se quedó sin asesor: `conversation_updated` cuyo `assignee_id` pasó a null
 * (payload real en `payload-conversacion-desasignada.json`). NO es una toma y no cambia el estado
 * de atención: solo hace que el sistema deje de creer que la tiene un asesor.
 */
export interface EventoDesasignacion {
  chatwootAccountId: number;
  chatwootInboxId: number;
  chatwootConversacionId: number;
}

export function interpretarDesasignacion(payload: unknown): EventoDesasignacion | null {
  const p = objeto(payload);
  if (!p || p["event"] !== "conversation_updated") return null;
  const cuenta = entero(objeto(p["account"])?.["id"]);
  const cambio = cambioDe(p["changed_attributes"], "assignee_id");
  if (cuenta === null || !cambio || !("current_value" in cambio) || cambio["current_value"] !== null) return null;
  if (entero(cambio["previous_value"]) === null) return null; // null → null no es un cambio
  const bandeja = entero(p["inbox_id"]);
  const conversacion = entero(p["id"]);
  if (bandeja === null || conversacion === null) return null;
  return { chatwootAccountId: cuenta, chatwootInboxId: bandeja, chatwootConversacionId: conversacion };
}

/**
 * ¿Es un mensaje entrante de un contacto (no privado) que `interpretarEventoChatwoot` NO pudo leer? Es un dato inesperado (faltan campos o traen otro
 * tipo): ignorarlo en silencio perdería el mensaje de una familia, así que el webhook deja constancia y una tarea (WH).
 */
export function esMensajeEntranteIlegible(payload: unknown): boolean {
  const p = objeto(payload);
  if (!p || p["event"] !== "message_created" || p["message_type"] !== "incoming" || p["private"] === true) return false;
  return interpretarEventoChatwoot(payload) === null;
}

/** Cuenta, bandeja y conversación de un payload de Chatwoot, si vienen como enteros seguros. Para ubicar la organización y la conversación de una constancia. */
export function contextoChatwootDe(payload: unknown): { cuenta: number; bandeja: number; conversacion?: number } | undefined {
  const p = objeto(payload);
  if (!p) return undefined;
  const cuenta = entero(objeto(p["account"])?.["id"]);
  const bandeja = entero(objeto(p["inbox"])?.["id"]) ?? entero(p["inbox_id"]);
  if (cuenta === null || bandeja === null) return undefined;
  // En `conversation_updated` el id de la conversación es el del propio payload; en un mensaje, el de `conversation`.
  const conversacion = entero(objeto(p["conversation"])?.["id"]) ?? (p["event"] === "conversation_updated" ? entero(p["id"]) : null);
  return { cuenta, bandeja, ...(conversacion !== null ? { conversacion } : {}) };
}

/** Identificador estable de un payload de Chatwoot que no se pudo procesar: el del mensaje si lo trae, o `null` (quien llama usa la huella del cuerpo). */
export function idDeMensajeChatwoot(payload: unknown): string | null {
  const p = objeto(payload);
  if (!p || p["event"] !== "message_created") return null;
  const id = entero(p["id"]);
  return id === null ? null : `msg:${id}`;
}
