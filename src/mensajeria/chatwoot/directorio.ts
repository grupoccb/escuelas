// Directorio de agentes sobre la API real de Chatwoot: GET /api/v1/accounts/:id/agents.
// Requiere el token de un administrador de la cuenta (el del Agent Bot no puede listar agentes).

import { ErrorDirectorio, type AgenteChatwoot, type DirectorioAgentes } from "../directorio.ts";

export interface ConfigDirectorioChatwoot {
  url: string;
  tokenAdmin: string;
  timeoutMs?: number;
}

export class DirectorioAgentesChatwoot implements DirectorioAgentes {
  private readonly url: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(config: ConfigDirectorioChatwoot) {
    this.url = config.url.replace(/\/+$/, "");
    this.token = config.tokenAdmin;
    this.timeoutMs = config.timeoutMs ?? 5000;
  }

  async listarAgentes(chatwootAccountId: number): Promise<AgenteChatwoot[]> {
    let res: Response;
    try {
      res = await fetch(`${this.url}/api/v1/accounts/${chatwootAccountId}/agents`, {
        headers: { api_access_token: this.token, accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ErrorDirectorio("No se pudo consultar Chatwoot");
    }
    if (!res.ok) throw new ErrorDirectorio(`Chatwoot respondió ${res.status} al listar agentes`);
    let cuerpo: unknown;
    try {
      cuerpo = await res.json();
    } catch {
      throw new ErrorDirectorio("Chatwoot devolvió una lista de agentes ilegible");
    }
    if (!Array.isArray(cuerpo)) throw new ErrorDirectorio("Chatwoot devolvió una lista de agentes ilegible");
    const agentes: AgenteChatwoot[] = [];
    for (const a of cuerpo as unknown[]) {
      const o = typeof a === "object" && a !== null ? (a as Record<string, unknown>) : {};
      const id = o["id"];
      const correo = o["email"];
      if (typeof id !== "number" || !Number.isInteger(id) || typeof correo !== "string") continue;
      const nombre = typeof o["name"] === "string" ? o["name"] : typeof o["available_name"] === "string" ? o["available_name"] : correo;
      agentes.push({ id, correo: correo.trim().toLowerCase(), nombre });
    }
    return agentes;
  }
}
