// WH, regla 5 de Eduardo: «un webhook nunca responde 500 por un dato inesperado». UNA sola función decide qué hacer con un error que lanzó el
// procesamiento de un evento público (webhook de Chatwoot o de Twilio, landing, barrido del borde):
//
//   · TRANSITORIO — falla de infraestructura o del momento: base caída o saturada, tiempo agotado, interbloqueo o fallo de serialización, conexión
//     rota, contención agotada tras reintentar. Repetir la operación puede resolverla → 5xx, el proveedor reintenta.
//   · INESPERADO — todo lo demás: el evento trae algo que el sistema no puede procesar (forma rara, tipos incorrectos, valor fuera de rango, texto con NUL,
//     llave foránea o restricción por datos, registro borrado o inexistente, bandeja sin aprovisionar, un error propio de programación). Reintentar daría
//     el MISMO resultado (un bucle del proveedor) → se atrapa, se deja constancia + tarea para el asesor y se responde 2xx.
//
// Ante la duda es INESPERADO: queda constancia y una persona lo ve. Lo único que impide la constancia es la propia infraestructura (si la base no deja
// guardarla, vuelve a ser transitorio y se pide el reintento: nada se pierde en silencio).
//
// Pura: no toca base ni red. El `detalle` que devuelve es seguro para guardarlo y loguearlo (sin valores del evento, sin teléfonos).

import { ErrorTransitorio } from "../lib/transitorio.ts";
import { BandejaSinAprovisionar } from "../mensajeria/provider.ts";

export type CausaInesperada =
  | "json_invalido"
  | "forma_inesperada"
  | "sin_identificador"
  | "dato_invalido"
  | "texto_con_nul"
  | "restriccion_base"
  | "registro_inexistente"
  | "bandeja_sin_aprovisionar"
  | "reenvio_abandonado"
  | "error_interno";

export type Clasificacion = { clase: "transitorio"; detalle: string } | { clase: "inesperado"; causa: CausaInesperada; detalle: string };

/** Códigos de Prisma que son del momento, no del dato. */
const PRISMA_TRANSITORIOS = new Set([
  "P1001", // no se alcanza el servidor de la base
  "P1002", // se agotó el tiempo al alcanzar el servidor
  "P1008", // tiempo agotado de la operación
  "P1017", // el servidor cerró la conexión
  "P2024", // tiempo agotado esperando una conexión del pool
  "P2028", // error de la API de transacciones (tiempo agotado, transacción cerrada)
  "P2034", // la transacción falló por un conflicto de escritura o un interbloqueo
]);

/** SQLSTATE exactos que son del momento. */
const SQLSTATE_TRANSITORIOS = new Set(["40001", "40P01", "55P03", "57014", "57P01", "57P02", "57P03"]);

/** Clases de SQLSTATE que son del momento: 08 conexión, 53 recursos insuficientes, 58 error del sistema, XX interno. */
const CLASES_SQLSTATE_TRANSITORIAS = ["08", "53", "58", "XX"];

const NODE_TRANSITORIOS = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "EAI_AGAIN", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH"]);

const TEXTO_TRANSITORIO =
  /can't reach database server|connection (?:terminated|refused|reset|closed|lost)|timed out fetching|timeout exceeded when trying to connect|too many (?:clients|connections)|deadlock detected|could not serialize access|terminating connection|database system is (?:starting up|shutting down|in recovery)|server closed the connection|conexión rota/i;

const TEXTO_CON_NUL = /invalid byte sequence for encoding|0x00|\\u0000|null bytes?|nul byte/i;

type Objeto = Record<string, unknown>;

const esObjeto = (v: unknown): v is Objeto => typeof v === "object" && v !== null;

/** Todos los códigos que un error (y su causa encadenada) deja ver: de Prisma, del adaptador de Postgres, del controlador y de Node. */
function codigosDe(error: unknown): string[] {
  const salida: string[] = [];
  const vistos = new Set<unknown>();
  const visitar = (valor: unknown, profundidad: number): void => {
    if (!esObjeto(valor) || vistos.has(valor) || profundidad > 5) return;
    vistos.add(valor);
    for (const k of ["code", "originalCode", "sqlState", "errno", "kind"]) {
      const c = valor[k];
      if (typeof c === "string" || typeof c === "number") salida.push(String(c));
    }
    for (const k of ["cause", "meta", "driverAdapterError", "error"]) visitar(valor[k], profundidad + 1);
  };
  visitar(error, 0);
  return salida;
}

/** Nombres de las clases del error (Prisma las distingue por `name`). */
function nombresDe(error: unknown): string[] {
  const nombres: string[] = [];
  const vistos = new Set<unknown>();
  const visitar = (valor: unknown, profundidad: number): void => {
    if (!esObjeto(valor) || vistos.has(valor) || profundidad > 4) return;
    vistos.add(valor);
    if (typeof valor["name"] === "string") nombres.push(valor["name"]);
    visitar(valor["cause"], profundidad + 1);
  };
  visitar(error, 0);
  return nombres;
}

/**
 * Descripción del error segura para guardar y loguear: su clase y su código, sin los valores que lleve el mensaje. Los mensajes de Prisma incluyen la
 * invocación entera con sus argumentos (nombres, teléfonos…) y los de Postgres citan el valor rechazado: aquí solo se conserva la primera línea sin
 * comillas ni cifras largas.
 */
export function detalleSeguro(error: unknown): string {
  const nombres = nombresDe(error);
  const codigos = codigosDe(error).filter((c) => /^[A-Za-z0-9]{2,8}$/.test(c));
  const base = [nombres[0] ?? typeof error, ...new Set(codigos.slice(0, 3))].join(" ");
  // Prisma: el mensaje es una invocación con datos; solo se confía en el nombre y el código.
  if (nombres.some((n) => n.startsWith("Prisma"))) return base.slice(0, 200);
  const mensaje = error instanceof Error ? error.message : "";
  const primera = (mensaje.split("\n")[0] ?? "")
    .replaceAll("\u0000", "")
    .replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "…")
    .replace(/\+?\d[\d\s().-]{5,}\d/g, "#")
    .replace(/\s+/g, " ")
    .trim();
  return `${base}${primera ? `: ${primera}` : ""}`.slice(0, 200);
}

export function clasificarError(error: unknown): Clasificacion {
  const detalle = detalleSeguro(error);
  if (error instanceof ErrorTransitorio) return { clase: "transitorio", detalle };

  const codigos = codigosDe(error);
  const mensaje = error instanceof Error ? error.message : "";
  if (
    codigos.some((c) => PRISMA_TRANSITORIOS.has(c) || SQLSTATE_TRANSITORIOS.has(c) || NODE_TRANSITORIOS.has(c) || CLASES_SQLSTATE_TRANSITORIAS.some((k) => c.length === 5 && c.startsWith(k))) ||
    TEXTO_TRANSITORIO.test(mensaje)
  ) {
    return { clase: "transitorio", detalle };
  }

  const inesperado = (causa: CausaInesperada): Clasificacion => ({ clase: "inesperado", causa, detalle });
  if (error instanceof BandejaSinAprovisionar) return inesperado("bandeja_sin_aprovisionar");
  if (TEXTO_CON_NUL.test(mensaje) || codigos.includes("22021") || codigos.includes("22P05")) return inesperado("texto_con_nul");
  // Restricciones: P2002 único, P2003 llave foránea, P2004 restricción, P2011 nulo, P2012 falta un valor, SQLSTATE clase 23.
  if (codigos.some((c) => ["P2002", "P2003", "P2004", "P2011", "P2012", "P2014"].includes(c) || (c.length === 5 && c.startsWith("23")))) return inesperado("restriccion_base");
  if (codigos.some((c) => ["P2001", "P2025"].includes(c))) return inesperado("registro_inexistente");
  // Datos fuera de rango o de otro tipo: P2000 demasiado largo, P2005/P2006/P2007 valores inválidos, P2020 fuera de rango, P2023, SQLSTATE clase 22.
  if (
    nombresDe(error).some((n) => n.startsWith("Prisma") && n.endsWith("ValidationError")) ||
    codigos.some((c) => ["P2000", "P2005", "P2006", "P2007", "P2008", "P2009", "P2020", "P2023"].includes(c) || (c.length === 5 && c.startsWith("22")))
  ) {
    return inesperado("dato_invalido");
  }
  return inesperado("error_interno");
}
