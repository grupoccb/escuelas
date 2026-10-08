// Adaptador de la vía A (docs/DECISION-ATRIBUCION.md): Chatwoot guarda los parámetros
// Referral* de Twilio en `content_attributes.referral` del mensaje y se los entrega al Agent
// Bot. Probado en N2 contra Chatwoot 4.18. Chatwoot solo conserva el referral si trae
// `source_id` (ReferralSourceId); sin él no hay nada que leer.

import type { Atribucion, FuenteAtribucion } from "../atribucion.ts";
import type { EventoEntrante } from "./webhook.ts";

const objeto = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export class AtribucionDesdeChatwoot implements FuenteAtribucion {
  async obtener(evento: EventoEntrante): Promise<Atribucion | null> {
    const referral = objeto(objeto(objeto(evento.crudo)?.["content_attributes"])?.["referral"]);
    const anuncioId = texto(referral?.["source_id"]);
    if (!referral || !anuncioId) return null;
    return {
      anuncioId,
      ctwaClid: texto(referral["ctwa_clid"]),
      anuncioTitulo: texto(referral["headline"]),
      tipoOrigen: texto(referral["source_type"]),
      urlOrigen: texto(referral["source_url"]),
      crudo: referral,
    };
  }
}
