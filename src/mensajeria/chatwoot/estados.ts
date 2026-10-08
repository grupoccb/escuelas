// Fuente de estados de entrega vía Chatwoot (P3 de docs/DECISION-ATRIBUCION.md): por cada
// cambio de estado de un saliente, Chatwoot manda al Agent Bot un `message_updated`. El estado
// viaja en `conversation.messages[]` (no en el nivel superior) y el error de entrega en
// `content_attributes.external_error`, como "63016 - texto" o "Error code: 63024".

import type { CambioDeEstado, EstadoDeEntrega, FuenteEstadosEntrega } from "../estados.ts";

type Objeto = Record<string, unknown>;
const objeto = (v: unknown): Objeto | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Objeto) : null);
const entero = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

const ESTADOS: Record<string, EstadoDeEntrega> = {
  sent: "enviado",
  delivered: "entregado",
  read: "leido",
  failed: "fallido",
};

/** Código numérico de un error de entrega ("63016 - …", "Error code: 63024"), o null. */
export function codigoDeError(externalError: string | null): number | null {
  if (!externalError) return null;
  const m = /^(\d{3,6})\b/.exec(externalError.trim()) ?? /error code:?\s*(\d{3,6})\b/i.exec(externalError);
  return m ? Number(m[1]) : null;
}

export class EstadosEntregaChatwoot implements FuenteEstadosEntrega {
  interpretar(payload: unknown): CambioDeEstado | null {
    const p = objeto(payload);
    if (!p || p["event"] !== "message_updated") return null;
    if (p["message_type"] !== "outgoing" || p["private"] === true) return null;

    const id = entero(p["id"]);
    const cuenta = entero(objeto(p["account"])?.["id"]);
    const bandeja = entero(objeto(p["inbox"])?.["id"]);
    if (id === null || cuenta === null || bandeja === null) return null;

    // El estado del mensaje está en la lista de mensajes de la conversación.
    const mensajes = objeto(p["conversation"])?.["messages"];
    const mensaje = Array.isArray(mensajes) ? mensajes.map(objeto).find((m) => m && entero(m["id"]) === id) : null;
    const estado = mensaje ? ESTADOS[texto(mensaje["status"]) ?? ""] : undefined;
    if (!mensaje || !estado) return null;

    const errorTexto = texto(objeto(mensaje["content_attributes"])?.["external_error"]);
    const actualizado = texto(mensaje["updated_at"]);
    const ocurrioEn = actualizado ? new Date(actualizado) : null;

    return {
      proveedor: "chatwoot",
      idExterno: String(id),
      idProveedor: texto(p["source_id"]) ?? texto(mensaje["source_id"]),
      estado,
      ocurrioEn: ocurrioEn && !Number.isNaN(ocurrioEn.getTime()) ? ocurrioEn : null,
      errorCodigo: estado === "fallido" ? codigoDeError(errorTexto) : null,
      errorTexto: estado === "fallido" ? errorTexto : null,
      bandeja: { chatwootAccountId: cuenta, chatwootInboxId: bandeja },
    };
  }
}
