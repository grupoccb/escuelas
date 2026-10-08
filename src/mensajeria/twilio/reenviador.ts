// Reenvío del webhook de Twilio a Chatwoot (el "borde" de A7). El cuerpo viaja BYTE A BYTE,
// sin modificar: incluye todos los `Referral*` y `ReferralCtwaClid`. Detrás de una interfaz con
// implementación falsa (invariante 11).

export type TipoWebhookTwilio = "entrante" | "estado";

export interface PeticionReenvio {
  tipo: TipoWebhookTwilio;
  /** El cuerpo recibido, sin tocar. */
  cuerpo: Buffer;
  cabeceras: Record<string, string>;
}

export interface ReenviadorTwilio {
  /** Entrega el webhook a Chatwoot. Lanza si no lo aceptó: el evento no se da por procesado. */
  reenviar(peticion: PeticionReenvio): Promise<void>;
}

export class ErrorReenvio extends Error {}

/** Falso: registra lo que habría reenviado. Los tests lo configuran para fallar o tardar. */
export class ReenviadorTwilioFalso implements ReenviadorTwilio {
  readonly enviados: PeticionReenvio[] = [];
  /** Si se define y devuelve true, el reenvío falla (como un Chatwoot caído). */
  fallarSi: ((p: PeticionReenvio) => boolean) | undefined;
  demoraMs = 0;

  async reenviar(peticion: PeticionReenvio): Promise<void> {
    if (this.demoraMs > 0) await new Promise((resolver) => setTimeout(resolver, this.demoraMs));
    if (this.fallarSi?.(peticion)) throw new ErrorReenvio("reenvío fallido (simulado)");
    // Copia: lo registrado no cambia si alguien reutiliza el buffer.
    this.enviados.push({ ...peticion, cuerpo: Buffer.from(peticion.cuerpo), cabeceras: { ...peticion.cabeceras } });
  }
}

export interface ConfigReenviadorHttp {
  /** A dónde reenviar los mensajes entrantes (en Chatwoot, la ruta del callback del canal de Twilio). */
  urlEntrantes: string;
  /** A dónde reenviar los estados de entrega. */
  urlEstados: string;
  timeoutMs?: number;
}

/**
 * Real: POST con el mismo cuerpo y las cabeceras que se permiten. Solo un 2xx es éxito.
 *
 * Una redirección NO se sigue (EA-04): `fetch` convertiría el POST en GET sin cuerpo y, si el
 * destino respondiera 200, el mensaje se daría por reenviado habiéndose perdido. Una 3xx es un fallo
 * de configuración (p. ej. CHATWOOT_URL en http detrás de un balanceador que redirige a https).
 */
export class ReenviadorTwilioHttp implements ReenviadorTwilio {
  private readonly config: ConfigReenviadorHttp;

  constructor(config: ConfigReenviadorHttp) {
    this.config = config;
  }

  async reenviar(p: PeticionReenvio): Promise<void> {
    const url = p.tipo === "entrante" ? this.config.urlEntrantes : this.config.urlEstados;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { ...p.cabeceras, "x-reenviado-por": "borde-inscripciones" },
        // Blob y no un buffer: ante un 401 undici reintenta el envío y un buffer ya cedido queda «detached».
        body: new Blob([new Uint8Array(p.cuerpo)]),
        redirect: "manual",
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 10_000),
      });
    } catch (e) {
      throw new ErrorReenvio(`No se pudo reenviar a Chatwoot: ${(e as Error).message}`);
    }
    // Se vacía el cuerpo para liberar la conexión.
    await res.arrayBuffer().catch(() => undefined);
    if (res.status >= 300 && res.status < 400) {
      throw new ErrorReenvio(`Chatwoot respondió ${res.status} (redirección): no se sigue, el cuerpo del POST se perdería. Revisa la URL de reenvío`);
    }
    if (res.status < 200 || res.status >= 300) throw new ErrorReenvio(`Chatwoot respondió ${res.status} al reenvío`);
  }
}
