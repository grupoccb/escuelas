// De dónde vino un lead (I1, I2): la FUENTE de un reporte. PURA.
//
//   1. si el lead tiene campaña: el origen de la campaña (`facebook`, `instagram`, `tiktok`, `google`, `referido`, `presencial` —el QR en sucursal— u `otro`);
//   2. si no, y su atribución dice que entró por la landing: `landing`; por un código de rastreo suelto: `codigo`;
//   3. si no, y trae un anuncio de Click-to-WhatsApp (`anuncio_id` o `ctwa_clid`): `anuncio`;
//   4. si no: `directo` (escribió sin que sepamos de dónde).

export const FUENTES_FIJAS = ["facebook", "instagram", "tiktok", "google", "referido", "presencial", "otro", "landing", "codigo", "anuncio", "directo"] as const;
export type Fuente = (typeof FUENTES_FIJAS)[number];

export interface LeadParaFuente {
  campana: { origen: string } | null;
  anuncio_id: string | null;
  ctwa_clid: string | null;
  atribucion: unknown;
}

export function fuenteDe(l: LeadParaFuente): Fuente {
  if (l.campana) return (FUENTES_FIJAS as readonly string[]).includes(l.campana.origen) ? (l.campana.origen as Fuente) : "otro";
  const at = typeof l.atribucion === "object" && l.atribucion !== null && !Array.isArray(l.atribucion) ? (l.atribucion as Record<string, unknown>) : {};
  if (at["fuente"] === "landing") return "landing";
  if (at["fuente"] === "codigo" || at["fuente"] === "codigo_de_lead") return "codigo";
  if (l.anuncio_id || l.ctwa_clid || typeof at["anuncio_id"] === "string") return "anuncio";
  return "directo";
}
