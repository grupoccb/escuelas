// Payload de Chatwoot para tests: la forma de un message_created que manda el Agent Bot.
// Calcado de uno real de Chatwoot 4.18 (Message#webhook_data, serializado con to_json) y
// recortado. Ojo: en el real, `sender` NO trae `type`; `conversation.meta.sender` sí.

export interface OpcionesPayload {
  id?: number;
  content?: string | null;
  message_type?: string;
  private?: boolean;
  cuenta?: number;
  bandeja?: number;
  conversacion?: number;
  estado?: string;
  telefono?: string | null;
  nombre?: string;
}

export function payloadMensajeEntrante(o: OpcionesPayload = {}): Record<string, unknown> {
  const contacto = {
    id: 5,
    name: o.nombre ?? "Contacto de prueba",
    phone_number: o.telefono === undefined ? "+5215512345678" : o.telefono,
    email: null,
    identifier: null,
  };
  return {
    event: "message_created",
    id: o.id ?? 1,
    content: o.content === undefined ? "Hola" : o.content,
    content_type: "text",
    message_type: o.message_type ?? "incoming",
    private: o.private ?? false,
    created_at: "2026-10-07T17:59:58.769Z",
    source_id: null,
    account: { id: o.cuenta ?? 1, name: "Demo local" },
    inbox: { id: o.bandeja ?? 1, name: "Bandeja" },
    sender: { ...contacto, account: { id: o.cuenta ?? 1, name: "Demo local" } },
    conversation: {
      id: o.conversacion ?? 10,
      inbox_id: o.bandeja ?? 1,
      status: o.estado ?? "pending",
      meta: { sender: { ...contacto, type: "contact" } },
    },
  };
}
