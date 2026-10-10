// Cliente de la API (docs/API.md): pequeño y sin dependencias.
//
// - Cookie de sesión (`credentials: "include"`): el token nunca pasa por el JavaScript de la página.
// - CSRF: toda escritura lleva `Content-Type: application/json` (y `X-Requested-With`); el navegador agrega el `Origin`.
// - Errores UNIFORMES: todo lo que falla lanza `ErrorDeApi` con `estado`, `codigo` (el de la API o uno propio: `sin_red`, `respuesta_invalida`),
//   `mensaje` en español, `detalles` por campo y, en un 429, `reintentarEn` (segundos, de `Retry-After`).
// - Un 401 con sesión (no el del inicio de sesión) avisa a la aplicación (`alExpirarLaSesion`) para volver al login.
// - Nada de datos en `console`, `localStorage` ni la URL: este módulo no registra nada.

export interface DetalleDeError {
  campo?: string;
  mensaje: string;
}

export class ErrorDeApi extends Error {
  readonly estado: number;
  readonly codigo: string;
  readonly detalles: DetalleDeError[];
  readonly reintentarEn: number | null;

  constructor(estado: number, codigo: string, mensaje: string, detalles: DetalleDeError[] = [], reintentarEn: number | null = null) {
    super(mensaje);
    this.name = "ErrorDeApi";
    this.estado = estado;
    this.codigo = codigo;
    this.detalles = detalles;
    this.reintentarEn = reintentarEn;
  }

  /** Mensajes por campo (`alumno.fecha_nacimiento` → «Falta…»). Si un campo trae varios, el primero. */
  porCampo(): Record<string, string> {
    const salida: Record<string, string> = {};
    for (const d of this.detalles) if (d.campo && !(d.campo in salida)) salida[d.campo] = d.mensaje;
    return salida;
  }

  get esConflicto(): boolean {
    return this.estado === 409;
  }
}

type Consulta = Record<string, string | number | boolean | null | undefined>;

export interface OpcionesDePeticion {
  consulta?: Consulta;
  cuerpo?: unknown;
  /** Para `AbortController`: cancelar lo que ya no se necesita. */
  senal?: AbortSignal;
  /** Un 401 de esta llamada NO cierra la sesión de la aplicación (el inicio de sesión mismo). */
  sinAvisoDeSesion?: boolean;
  cabeceras?: Record<string, string>;
}

let alExpirar: (() => void) | null = null;
/** La aplicación se registra aquí para enterarse de que la sesión ya no vale. */
export function alExpirarLaSesion(f: (() => void) | null): void {
  alExpirar = f;
}

export function armarConsulta(consulta: Consulta | undefined): string {
  if (!consulta) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(consulta)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const t = p.toString();
  return t ? `?${t}` : "";
}

/** Lo que se le dice a una persona cuando algo no existe O no es de su alcance (el servidor no distingue las dos cosas a propósito). */
export const MENSAJE_NO_ENCONTRADO = "No se encontró lo que buscas. Puede que no sea de tus grupos o de tu sucursal, o que ya no exista.";

const MENSAJES: Record<number, string> = {
  401: "Tu sesión terminó. Inicia sesión de nuevo.",
  403: "No tienes permiso para hacer esto.",
  404: MENSAJE_NO_ENCONTRADO,
  413: "Lo que enviaste es demasiado grande.",
  429: "Demasiados intentos. Espera un momento.",
};

async function leerCuerpo(res: Response): Promise<unknown> {
  const texto = await res.text();
  if (texto === "") return null;
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return undefined;
  }
}

export async function pedir<T>(metodo: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", ruta: string, o: OpcionesDePeticion = {}): Promise<T> {
  const cabeceras: Record<string, string> = { Accept: "application/json", ...o.cabeceras };
  let body: string | undefined;
  if (metodo !== "GET") {
    cabeceras["Content-Type"] = "application/json";
    cabeceras["X-Requested-With"] = "interfaz-web";
    if (o.cuerpo !== undefined) body = JSON.stringify(o.cuerpo);
  }
  let res: Response;
  try {
    res = await fetch(`${ruta}${armarConsulta(o.consulta)}`, { method: metodo, headers: cabeceras, credentials: "include", cache: "no-store", ...(body !== undefined ? { body } : {}), ...(o.senal ? { signal: o.senal } : {}) });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ErrorDeApi(0, "sin_red", "No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.");
  }
  const json = await leerCuerpo(res);
  if (res.ok) {
    if (json === undefined) throw new ErrorDeApi(res.status, "respuesta_invalida", "El servidor respondió algo que no se entiende.");
    return json as T;
  }
  const e = json && typeof json === "object" && "error" in json ? (json as { error?: { codigo?: string; mensaje?: string; detalles?: DetalleDeError[] } }).error : undefined;
  const reintento = Number(res.headers.get("Retry-After"));
  const error = new ErrorDeApi(res.status, e?.codigo ?? (res.status >= 500 ? "interno" : "error"), e?.mensaje ?? MENSAJES[res.status] ?? "Algo salió mal. Inténtalo de nuevo.", Array.isArray(e?.detalles) ? e.detalles : [], res.status === 429 && Number.isFinite(reintento) && reintento > 0 ? reintento : null);
  if (res.status === 401 && !o.sinAvisoDeSesion) alExpirar?.();
  throw error;
}

export const api = {
  get: <T>(ruta: string, consulta?: Consulta, senal?: AbortSignal) => pedir<T>("GET", ruta, { ...(consulta ? { consulta } : {}), ...(senal ? { senal } : {}) }),
  post: <T>(ruta: string, cuerpo?: unknown, o: Omit<OpcionesDePeticion, "cuerpo"> = {}) => pedir<T>("POST", ruta, { ...o, cuerpo: cuerpo ?? {} }),
  put: <T>(ruta: string, cuerpo: unknown) => pedir<T>("PUT", ruta, { cuerpo }),
  patch: <T>(ruta: string, cuerpo: unknown) => pedir<T>("PATCH", ruta, { cuerpo }),
  delete: <T>(ruta: string) => pedir<T>("DELETE", ruta),
  /**
   * Una consulta de salud: el motivo viaja en una cabecera (con `encodeURIComponent`, porque una cabecera no lleva acentos) y NUNCA en la dirección, que queda en los registros
   * del navegador, del balanceador y de cualquier intermediario (EB-21).
   */
  getConMotivo: <T>(ruta: string, motivo: string) => pedir<T>("GET", ruta, { cabeceras: { "X-Motivo-De-Consulta": encodeURIComponent(motivo.trim()) } }),
};

export interface Pagina<T> {
  datos: T[];
  paginacion: { pagina: number; limite: number; total: number };
}

/** Todas las páginas de una lista (hasta `maximo` filas), de 100 en 100. `truncado`: hubo más de las que se trajeron. */
export async function traerTodo<T>(ruta: string, consulta: Consulta = {}, maximo = 500): Promise<{ datos: T[]; total: number; truncado: boolean }> {
  const datos: T[] = [];
  let total = 0;
  for (let pagina = 1; datos.length < maximo; pagina++) {
    const r = await api.get<Pagina<T>>(ruta, { ...consulta, limite: 100, pagina });
    datos.push(...r.datos);
    total = r.paginacion.total;
    if (datos.length >= total || r.datos.length === 0) break;
  }
  return { datos, total, truncado: datos.length < total };
}
