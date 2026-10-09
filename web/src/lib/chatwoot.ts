// El enlace a la conversación de un lead en Chatwoot. La URL pública la configura el administrador (`CHATWOOT_URL_PUBLICA`, viene en `GET /api/yo`) y los ids
// los entrega la API del lead. La interfaz solo ARMA el enlace: nunca lo visita ni llama a Chatwoot.

export interface ConversacionDeChatwoot {
  cuenta_id: number | null;
  bandeja_id: number | null;
  conversacion_id: number;
}

/** `<url>/app/accounts/<cuenta>/inbox/<bandeja>/conversations/<conversación>`; null si falta la URL o la cuenta. */
export function urlDeConversacion(base: string | null, c: ConversacionDeChatwoot): string | null {
  if (!base || c.cuenta_id === null) return null;
  const raiz = base.replace(/\/+$/, "");
  const bandeja = c.bandeja_id === null ? "" : `/inbox/${c.bandeja_id}`;
  return `${raiz}/app/accounts/${c.cuenta_id}${bandeja}/conversations/${c.conversacion_id}`;
}
