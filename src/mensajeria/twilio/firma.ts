// Firma de los webhooks de Twilio (invariante 9). Sin el SDK de Twilio: es un HMAC-SHA1.
//
// Twilio firma cada petición así (docs "Validating requests are coming from Twilio"):
//   1. toma la URL COMPLETA con la que llamó (esquema, host, ruta y query string);
//   2. si es un POST de formulario, ordena los parámetros por nombre y agrega a la URL, uno tras
//      otro, `nombre` + `valor` (sin separadores; un nombre repetido agrega cada valor, ordenados);
//   3. calcula HMAC-SHA1 con el auth token de la cuenta como clave y lo manda en base64 en
//      `X-Twilio-Signature`.
// Se compara en tiempo constante. Sin token configurado o sin URL pública, todo se rechaza.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Parámetros del formulario. Un nombre repetido es una lista. */
export type ParametrosTwilio = Record<string, string | string[]>;

export interface PeticionConEncabezados {
  get(nombre: string): string | undefined;
}

/** HMAC-SHA1 en base64 de `url + parámetros ordenados`, tal como lo calcula Twilio. */
export function calcularFirmaTwilio(authToken: string, url: string, params: ParametrosTwilio): string {
  let datos = url;
  for (const nombre of Object.keys(params).sort()) {
    const valor = params[nombre];
    if (Array.isArray(valor)) for (const v of [...new Set(valor)].sort()) datos += nombre + v;
    else datos += nombre + (valor ?? "");
  }
  return createHmac("sha1", authToken).update(Buffer.from(datos, "utf8")).digest("base64");
}

/** Twilio acepta la URL con o sin el puerto por defecto (:443 / :80). Estas son las formas válidas. */
export function variantesDeUrl(url: string): string[] {
  const m = /^(https?:\/\/)([^/?#:@]+)(:\d+)?([/?#].*)?$/i.exec(url);
  if (!m) return [url];
  const [, esquema = "", host = "", puerto, resto = ""] = m;
  const porDefecto = esquema.toLowerCase() === "https://" ? ":443" : ":80";
  const sinPuerto = `${esquema}${host}${resto}`;
  const conPuerto = `${esquema}${host}${puerto ?? porDefecto}${resto}`;
  return [...new Set([url, sinPuerto, conPuerto])];
}

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** true solo si la firma recibida corresponde a alguna forma válida de la URL. Nunca lanza. */
export function verificarFirmaTwilio(authToken: string, url: string, params: ParametrosTwilio, firma: string | undefined): boolean {
  if (!authToken || !firma) return false;
  let valida = false;
  // Se prueban todas las variantes (sin salir antes) para no filtrar cuál coincidió.
  for (const u of variantesDeUrl(url)) if (iguales(calcularFirmaTwilio(authToken, u, params), firma)) valida = true;
  return valida;
}

/** Parámetros de un cuerpo `application/x-www-form-urlencoded`. Un nombre repetido se vuelve lista. */
export function parsearFormulario(cuerpo: Buffer): ParametrosTwilio {
  const params: ParametrosTwilio = Object.create(null) as ParametrosTwilio;
  for (const [nombre, valor] of new URLSearchParams(cuerpo.toString("utf8"))) {
    const actual = params[nombre];
    if (actual === undefined) params[nombre] = valor;
    else params[nombre] = Array.isArray(actual) ? [...actual, valor] : [actual, valor];
  }
  return params;
}

/** La URL pública exacta con la que Twilio llamó: base configurada + ruta y query de la petición. */
export function urlPublicaDe(baseUrl: string, rutaConQuery: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${rutaConQuery}`;
}

export interface WebhookTwilioVerificado {
  params: ParametrosTwilio;
  /** Cabeceras que se reenvían tal cual a Chatwoot. */
  cabeceras: Record<string, string>;
}

/**
 * Valida un webhook de Twilio sobre el cuerpo CRUDO. Devuelve null si la firma no cuadra, si falta
 * la firma, el token o la URL pública configurada. Nunca lanza.
 */
export function verificarWebhookTwilio(
  peticion: PeticionConEncabezados,
  cuerpo: Buffer,
  authToken: string | null | undefined,
  urlPublica: string | null | undefined,
): WebhookTwilioVerificado | null {
  if (!authToken || !urlPublica) return null;
  const firma = peticion.get("x-twilio-signature");
  const params = parsearFormulario(cuerpo);
  if (!verificarFirmaTwilio(authToken, urlPublica, params, firma)) return null;

  const cabeceras: Record<string, string> = {};
  const contentType = peticion.get("content-type");
  if (contentType) cabeceras["content-type"] = contentType;
  if (firma) cabeceras["x-twilio-signature"] = firma;
  const idempotencia = peticion.get("i-twilio-idempotency-token");
  if (idempotencia) cabeceras["i-twilio-idempotency-token"] = idempotencia;
  return { params, cabeceras };
}

/** ¿La petición trae la firma de Twilio? (Para explicar un rechazo; la firma misma nunca se lee ni se guarda aquí.) */
export const traeFirmaDeTwilio = (peticion: PeticionConEncabezados): boolean => Boolean(peticion.get("x-twilio-signature"));

/** Lo que se sabe de cómo llegó una petición rechazada (para explicar el rechazo en el log, sin datos de contacto ni secretos). */
export interface VistaDePeticionTwilio {
  /** Esquema con el que Express vio la petición: solo es `https` detrás de un túnel si se confía en el proxy (`TRUST_PROXY`). */
  protocolo: string;
  /** Host con el que la vio (el túnel puede reescribirlo a `localhost`). */
  host: string;
  rutaConQuery: string;
  confiaEnProxy: boolean;
  traeFirma: boolean;
}

export interface ExplicacionDeRechazo {
  /** La URL contra la que se calculó la firma esperada (null si no hay URL pública configurada). */
  urlEsperada: string | null;
  /** Cómo llegó la petición, tal cual la vio el servidor. */
  urlVista: string;
  pistas: string[];
}

const ES_LOCAL = /^(?:localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|0\.0\.0\.0|host\.docker\.internal)$/i;

/**
 * Por qué se rechazó un webhook de Twilio, en español y para quien está haciendo el ensayo. SOLO lee configuración pública (URL, si hay token, si hay firma):
 * nunca el token, la firma ni el cuerpo. La causa más común con Twilio real es que la URL configurada en la consola no sea EXACTAMENTE la que el
 * backend usa para firmar (esquema, host del túnel, ruta, barra final, query).
 */
export function explicarRechazoDeTwilio(urlBase: string | null | undefined, hayToken: boolean, vista: VistaDePeticionTwilio): ExplicacionDeRechazo {
  const urlEsperada = urlBase ? urlPublicaDe(urlBase, vista.rutaConQuery) : null;
  const urlVista = `${vista.protocolo}://${vista.host}${vista.rutaConQuery}`;
  const pistas: string[] = [];
  if (!hayToken) pistas.push("TWILIO_AUTH_TOKEN no está configurado en el backend: sin él se rechaza todo.");
  if (!urlBase) pistas.push("PUBLIC_BASE_URL (la URL pública, la del túnel) no está configurada en el backend: sin ella se rechaza todo.");
  if (!vista.traeFirma) {
    pistas.push("La petición no trae X-Twilio-Signature: no viene de Twilio, o algo en el camino la quitó.");
  } else if (urlEsperada) {
    pistas.push(`La firma no coincide: revisa que la URL configurada en Twilio sea exactamente ${urlEsperada}`);
    let host = "";
    try {
      const u = new URL(urlEsperada);
      host = u.hostname;
      if (u.protocol !== "https:") pistas.push("La URL pública no es https: Twilio firma con la URL que tiene configurada y WhatsApp exige https.");
    } catch {
      pistas.push("La URL pública configurada no es una URL válida.");
    }
    if (host && ES_LOCAL.test(host)) pistas.push("La URL pública apunta a esta máquina (localhost): Twilio firma con la URL del túnel, no con la local. Pon ORIGEN_PUBLICO con la URL del túnel y vuelve a correr `npm run ensayo:preparar`.");
    if (vista.protocolo !== "https" && !vista.confiaEnProxy) pistas.push("La petición llegó por http: es normal detrás de un túnel (él termina el https). La firma se calcula con la URL pública configurada, no con la que ve el servidor.");
    if (vista.confiaEnProxy && vista.protocolo === "http") pistas.push("Se confía en el proxy pero no avisó https (X-Forwarded-Proto): revisa la configuración del túnel.");
    pistas.push("También revisa que el token sea el de la misma cuenta que el SID y que la URL no cambió desde que se configuró (cada vez que el túnel se reinicia trae otra).");
  }
  return { urlEsperada, urlVista, pistas };
}
