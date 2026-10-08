// La URL pública de la landing de una vertical (E1) con su código de rastreo: lo que codifica el QR de una campaña (E3). Pura.

export interface PartesDeLanding {
  /** El origen público del backend (`https://escuela.ejemplo.mx`). Se toma solo el origen: la ruta y la consulta que traiga se descartan. */
  base: string;
  verticalSlug: string;
  /** El slug de la organización, solo si el de la vertical se repite entre organizaciones. */
  orgSlug?: string | null;
  codigo?: string | null;
  sucursalId?: string | null;
}

/** `https://base/l/<vertical>?org=…&c=…&s=…` (los parámetros que no vienen se omiten; todo codificado). */
export function urlDeLanding(p: PartesDeLanding): string {
  const origen = new URL(p.base).origin;
  const parametros = new URLSearchParams();
  if (p.orgSlug) parametros.set("org", p.orgSlug);
  if (p.codigo) parametros.set("c", p.codigo);
  if (p.sucursalId) parametros.set("s", p.sucursalId);
  const consulta = parametros.toString();
  return `${origen}/l/${encodeURIComponent(p.verticalSlug)}${consulta ? `?${consulta}` : ""}`;
}

/**
 * De dónde sale la base pública. En orden: el primer origen configurado (`ORIGEN_PUBLICO`), `PUBLIC_BASE_URL` y, fuera de producción, el host de la
 * petición. En producción NO se confía en el encabezado `Host`: un QR impreso con una URL envenenada seguiría vivo para siempre; si falta la configuración,
 * devuelve null y quien llama pide configurarla.
 */
export function resolverBaseUrl(o: { origenesPermitidos: readonly string[]; publicBaseUrl: string | undefined; protocolo: string; host: string | undefined; produccion: boolean }): string | null {
  const valido = (u: string | undefined): string | null => {
    if (!u) return null;
    try {
      const url = new URL(u);
      return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
    } catch {
      return null;
    }
  };
  const configurado = valido(o.origenesPermitidos[0]) ?? valido(o.publicBaseUrl);
  if (configurado) return configurado;
  if (o.produccion || !o.host) return null;
  return valido(`${o.protocolo}://${o.host}`);
}

/** Un nombre seguro para un archivo descargable: solo letras ASCII, dígitos y guiones. */
export function nombreDeArchivo(...partes: string[]): string {
  const limpio = partes
    .map((p) => p.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter((p) => p !== "")
    .join("-")
    .slice(0, 80);
  return limpio || "qr";
}
