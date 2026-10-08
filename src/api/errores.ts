// Convención de errores de la API (B3). TODO error que sale de /api tiene esta forma:
//
//   { "error": { "codigo": "validacion", "mensaje": "Texto en español", "detalles": [ { "campo": "correo", "mensaje": "…" } ] } }
//
// Los códigos son estables (los clientes ramifican por ellos; el mensaje es para personas):
//
//   no_autenticado  401  falta la sesión, expiró o está revocada
//   prohibido       403  hay sesión pero el rol no tiene el permiso
//   no_encontrado   404  no existe (o es de otra organización o sucursal: nunca se distingue)
//   validacion      400  la entrada no cumple el esquema (detalles = qué campo y por qué)
//   conflicto       409  choca con el estado actual (duplicado, ya resuelto, regla de negocio)
//   limite_excedido 429  demasiadas peticiones o intentos (con Retry-After); 413 si el cuerpo es muy grande
//   interno         500  fallo propio; nunca lleva trazas ni textos de la base
//
// `detalles` solo aparece en `validacion` (y en `conflicto` cuando ayuda). Nunca se filtra un mensaje
// de la base de datos, una ruta de archivo ni una traza.

export const CODIGOS_DE_ERROR = {
  no_autenticado: 401,
  prohibido: 403,
  no_encontrado: 404,
  validacion: 400,
  conflicto: 409,
  limite_excedido: 429,
  interno: 500,
} as const;

export type CodigoDeError = keyof typeof CODIGOS_DE_ERROR;

export interface DetalleDeError {
  campo?: string;
  mensaje: string;
}

export interface CuerpoDeError {
  error: { codigo: CodigoDeError; mensaje: string; detalles?: DetalleDeError[] };
}

export class ErrorApi extends Error {
  readonly codigo: CodigoDeError;
  readonly estado: number;
  readonly detalles: DetalleDeError[] | undefined;
  readonly cabeceras: Record<string, string>;

  constructor(
    codigo: CodigoDeError,
    mensaje: string,
    opciones: { detalles?: DetalleDeError[]; estado?: number; cabeceras?: Record<string, string> } = {},
  ) {
    super(mensaje);
    this.codigo = codigo;
    this.estado = opciones.estado ?? CODIGOS_DE_ERROR[codigo];
    this.detalles = opciones.detalles;
    this.cabeceras = opciones.cabeceras ?? {};
  }

  cuerpo(): CuerpoDeError {
    return { error: { codigo: this.codigo, mensaje: this.message, ...(this.detalles ? { detalles: this.detalles } : {}) } };
  }
}

export const noAutenticado = (mensaje = "Inicia sesión para continuar"): ErrorApi => new ErrorApi("no_autenticado", mensaje);
export const prohibido = (mensaje = "No tienes permiso para esto"): ErrorApi => new ErrorApi("prohibido", mensaje);
export const noEncontrado = (mensaje = "No se encontró lo que buscas"): ErrorApi => new ErrorApi("no_encontrado", mensaje);
export const conflicto = (mensaje: string, detalles?: DetalleDeError[]): ErrorApi => new ErrorApi("conflicto", mensaje, detalles ? { detalles } : {});
export const validacion = (detalles: DetalleDeError[], mensaje = "Los datos enviados no son válidos"): ErrorApi =>
  new ErrorApi("validacion", mensaje, { detalles });
/** 429 con Retry-After (en segundos). */
export const demasiadasPeticiones = (reintentarEnSegundos: number, mensaje = "Demasiadas peticiones. Inténtalo de nuevo en un momento."): ErrorApi =>
  new ErrorApi("limite_excedido", mensaje, { cabeceras: { "Retry-After": String(Math.max(1, Math.ceil(reintentarEnSegundos))) } });
export const cuerpoMuyGrande = (): ErrorApi => new ErrorApi("limite_excedido", "El cuerpo de la petición es demasiado grande", { estado: 413 });
