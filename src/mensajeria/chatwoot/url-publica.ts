// La URL pública de Chatwoot (la que abre el NAVEGADOR de una persona, no la red interna de los servicios): la interfaz web la usa para armar el enlace
// «abrir la conversación» de la ficha del lead. Solo lee una variable de entorno: no llama a Chatwoot.

/** `CHATWOOT_URL_PUBLICA` (o, en la demo, `CHATWOOT_URL_HOST`): solo http(s), sin barra final ni credenciales; lo raro se ignora. */
export function urlPublicaDeChatwoot(entorno: NodeJS.ProcessEnv): string | null {
  const bruta = (entorno["CHATWOOT_URL_PUBLICA"] ?? entorno["CHATWOOT_URL_HOST"] ?? "").trim();
  if (!bruta) return null;
  try {
    const u = new URL(bruta);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || u.username || u.password) return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}
