// Puerto real de Twilio para `ensayo:preparar`: SOLO comprueba que el SID y el token son de una cuenta (GET de la cuenta). La base es configurable
// (`TWILIO_API_BASE`) para que `--simulado` y las pruebas hablen con el Twilio falso local; sin ella es la API de Twilio, y esa llamada la hace Eduardo en su
// máquina con sus credenciales, nunca el código de las pruebas. El token solo va en la cabecera de autorización; nunca en un mensaje de error.

import type { PuertoTwilioEnsayo, ResultadoCredenciales } from "./preparar.ts";

export const API_TWILIO_REAL = "https://api.twilio.com";

export class TwilioApiHttp implements PuertoTwilioEnsayo {
  private readonly base: string;
  private readonly plazoMs: number;

  constructor(base = API_TWILIO_REAL, plazoMs = 8000) {
    this.base = base.replace(/\/+$/, "");
    this.plazoMs = plazoMs;
  }

  async verificarCredenciales(sid: string, token: string): Promise<ResultadoCredenciales> {
    let res: Response;
    try {
      res = await fetch(`${this.base}/2010-04-01/Accounts/${encodeURIComponent(sid)}.json`, {
        headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
        redirect: "manual",
        signal: AbortSignal.timeout(this.plazoMs),
      });
    } catch {
      return { ok: false, motivo: `no se pudo contactar a ${new URL(this.base).host} (¿hay internet?)` };
    }
    if (res.status === 401 || res.status === 403) {
      await res.arrayBuffer().catch(() => undefined);
      return { ok: false, motivo: "el SID y el token no corresponden a una cuenta (Twilio contestó 401)" };
    }
    if (res.status === 404) {
      await res.arrayBuffer().catch(() => undefined);
      return { ok: false, motivo: "no existe una cuenta con ese SID (Twilio contestó 404)" };
    }
    if (!res.ok) {
      await res.arrayBuffer().catch(() => undefined);
      return { ok: false, motivo: `Twilio contestó ${res.status}` };
    }
    const cuerpo = (await res.json().catch(() => null)) as { friendly_name?: unknown; status?: unknown } | null;
    if (cuerpo?.status && cuerpo.status !== "active") return { ok: false, motivo: `la cuenta de Twilio no está activa (estado «${String(cuerpo.status)}»)` };
    return { ok: true, nombreCuenta: typeof cuerpo?.friendly_name === "string" ? cuerpo.friendly_name : null };
  }
}
