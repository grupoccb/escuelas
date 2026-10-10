// Ensayo con WhatsApp real (V9, docs/ENSAYO-WHATSAPP-REAL.md): lectura y validación de las variables de entorno, en español y diciendo QUÉ falta y DÓNDE
// conseguirlo. Nada de esto toca la red. Los secretos viven solo en `.env` (gitignored): este módulo nunca los devuelve completos para mostrarlos.

import { normalizarNumeroWhatsapp } from "../../lib/telefono.ts";

/** SID de cuenta de Twilio: «AC» + 32 caracteres hexadecimales. */
const FORMA_SID = /^AC[0-9a-f]{32}$/i;

/** Valores con los que `--simulado` ensaya sin credenciales (inválidos para Twilio real; el Twilio falso local los acepta). */
export const SIMULADO = {
  sid: `AC${"0".repeat(32)}`,
  token: "token-falso-del-ensayo-simulado",
  numero: "whatsapp:+15005550006",
  origen: "https://ensayo-simulado.example.test",
} as const;

export interface EntornoEnsayo {
  twilio: { sid: string; token: string; numero: string };
  /** La URL pública del túnel (https, sin barra final ni ruta): la que Twilio llama y contra la que firma. */
  origen: string;
  chatwoot: { url: string; cuenta: string; tokenAdmin: string; botNombre: string; secretoWebhook: string };
  /** Nombre público del canal que recibe el número (opcional: por omisión, el primero de la organización). */
  canal: string | null;
  /** Prefijo que apaga el bloqueo de los dominios de Twilio en Chatwoot (docker-compose.yml, `ENSAYO_TWILIO_BLOQUEO_PREFIJO`). */
  bloqueoPrefijo: string;
}

export interface LecturaDeEntorno {
  entorno: EntornoEnsayo | null;
  /** Cada problema dice qué falta o qué está mal y qué hacer. Vacío = listo. */
  problemas: string[];
}

const vacio = (v: string | undefined): boolean => v === undefined || v.trim() === "";

/** `****1234`: nunca el secreto completo. Con 8 caracteres o menos no se muestra nada de él. */
export function enmascararSecreto(secreto: string | undefined | null): string {
  if (!secreto) return "(vacío)";
  return secreto.length <= 8 ? "****" : `****${secreto.slice(-4)}`;
}

/** Quita de un texto cualquier aparición de los secretos dados (para mensajes de error de terceros que podrían repetirlos). */
export function sinSecretos(texto: string, secretos: readonly (string | undefined | null)[]): string {
  let salida = texto;
  for (const s of secretos) if (s && s.length >= 6) salida = salida.split(s).join(enmascararSecreto(s));
  return salida;
}

/** Valida la URL pública del túnel. Devuelve la URL normalizada o el problema. */
export function validarOrigenPublico(crudo: string | undefined, { permitirNoHttps = false }: { permitirNoHttps?: boolean } = {}): { origen: string } | { problema: string } {
  if (vacio(crudo)) {
    return { problema: "Falta ORIGEN_PUBLICO: es la URL https que te dio el túnel (por ejemplo https://algo.trycloudflare.com). Ábrelo primero (docs/ENSAYO-WHATSAPP-REAL.md, paso 3) y vuelve a correr el comando con `--url <esa dirección>`." };
  }
  const texto = crudo!.trim();
  // V13-fix (EV-40): `new URL` borra en silencio los saltos de línea y tabuladores («https://a.example\nX=1» se volvía «https://a.exampleX=1») y acepta `$(…)` y comillas invertidas dentro del
  // nombre. Esta dirección acaba en un archivo `.env` que otras herramientas leen como texto de shell: lo raro se RECHAZA con un mensaje, no se limpia.
  if (/\s/.test(texto) || [...texto].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return { problema: "ORIGEN_PUBLICO tiene espacios o saltos de línea. Debe ser una sola dirección, por ejemplo https://algo.trycloudflare.com" };
  if (/[`$"'\\;|&<>(){}*!]/.test(texto)) return { problema: `ORIGEN_PUBLICO trae caracteres que no son de una dirección (comillas, «$», paréntesis, «;»…). Copia solo la dirección que te dio el túnel, por ejemplo https://algo.trycloudflare.com` };
  let u: URL;
  try {
    u = new URL(texto);
  } catch {
    return { problema: `ORIGEN_PUBLICO no es una dirección válida («${crudo}»). Debe verse como https://algo.trycloudflare.com` };
  }
  if (u.protocol !== "https:" && !permitirNoHttps) return { problema: `ORIGEN_PUBLICO debe empezar con https:// (recibí «${u.protocol}//»): Twilio solo llama a direcciones https.` };
  if (/^(?:localhost|127\.|0\.0\.0\.0|\[?::1)/i.test(u.hostname) && !permitirNoHttps) return { problema: "ORIGEN_PUBLICO apunta a esta misma máquina (localhost): Twilio no puede llamarla. Usa la dirección pública del túnel." };
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i.test(u.hostname)) return { problema: `ORIGEN_PUBLICO no tiene un nombre de dirección válido («${u.hostname}»): solo letras, números, guiones y puntos.` };
  if (u.port) return { problema: `ORIGEN_PUBLICO no debe llevar puerto (recibí :${u.port}): Twilio firma con la dirección del túnel, que no lleva el puerto local.` };
  if (u.username || u.password) return { problema: "ORIGEN_PUBLICO no debe llevar usuario ni contraseña." };
  if ((u.pathname !== "/" && u.pathname !== "") || u.search || u.hash) return { problema: `ORIGEN_PUBLICO debe ser solo la dirección, sin ruta (recibí «${u.pathname}${u.search}»): las rutas las agrega el sistema.` };
  return { origen: u.origin };
}

export function leerEntornoEnsayo(env: NodeJS.ProcessEnv, { simulado = false }: { simulado?: boolean } = {}): LecturaDeEntorno {
  const problemas: string[] = [];

  if (!simulado && (env["ENSAYO_LOCAL"] ?? "").trim().toLowerCase() !== "si") {
    problemas.push("Falta ENSAYO_LOCAL=si en .env: es la marca de que ESTA máquina hace el ensayo (y que el backend lo avise). Copia config/ensayo.env.example a .env y llénalo.");
  }

  let sid = env["TWILIO_ACCOUNT_SID"]?.trim() ?? "";
  if (simulado && !sid) sid = SIMULADO.sid;
  if (!sid) problemas.push("Falta TWILIO_ACCOUNT_SID: cópialo de la consola de Twilio (Account Info; empieza con AC).");
  else if (!FORMA_SID.test(sid)) problemas.push("TWILIO_ACCOUNT_SID no tiene la forma de un identificador de cuenta (AC y 32 letras o números). Cópialo completo de la consola de Twilio.");

  let token = env["TWILIO_AUTH_TOKEN"]?.trim() ?? "";
  if (simulado && !token) token = SIMULADO.token;
  if (!token) problemas.push("Falta TWILIO_AUTH_TOKEN: cópialo de la consola de Twilio (Account Info → Auth Token → mostrar). Solo va en .env, nunca en un archivo del repositorio.");
  else if (/\s/.test(token) || token.length < 16) problemas.push(`TWILIO_AUTH_TOKEN no parece un token (${token.length} caracteres, ${/\s/.test(token) ? "con espacios" : "muy corto"}). Cópialo completo y sin espacios.`);

  let numero: string | null = null;
  const numeroCrudo = env["TWILIO_WHATSAPP_NUMERO"]?.trim() ?? "";
  if (!numeroCrudo) {
    if (simulado) numero = SIMULADO.numero;
    else problemas.push("Falta TWILIO_WHATSAPP_NUMERO: el número del sandbox de WhatsApp que muestra la consola de Twilio (Messaging → Try it out → Send a WhatsApp message), con el signo +, por ejemplo +14155238886.");
  } else {
    numero = normalizarNumeroWhatsapp(numeroCrudo);
    if (!numero) problemas.push(`TWILIO_WHATSAPP_NUMERO no es un número válido («${numeroCrudo}»). Escríbelo con el signo + y el código de país, por ejemplo +14155238886.`);
  }

  let origen: string | null = null;
  const crudoOrigen = env["ORIGEN_PUBLICO"]?.trim() ?? "";
  if (simulado && !crudoOrigen) origen = SIMULADO.origen;
  else {
    const o = validarOrigenPublico(crudoOrigen, { permitirNoHttps: simulado });
    if ("problema" in o) problemas.push(o.problema);
    else origen = o.origen;
  }

  const url = (env["CHATWOOT_URL_HOST"] ?? env["CHATWOOT_URL"] ?? "").trim();
  if (!url) problemas.push("Falta la dirección de Chatwoot (CHATWOOT_URL_HOST): viene en config/demo-local.env; corre el comando con `npm run ensayo:preparar`, que lo carga");
  const tokenAdmin = env["CHATWOOT_ADMIN_TOKEN"]?.trim() ?? "";
  if (!tokenAdmin) problemas.push("Falta CHATWOOT_ADMIN_TOKEN (el token del asesor administrador de Chatwoot; viene en config/demo-local.env).");
  const cuenta = env["CHATWOOT_CUENTA"]?.trim() ?? "";
  if (!cuenta) problemas.push("Falta CHATWOOT_CUENTA (el nombre de la cuenta de Chatwoot; viene en config/demo-local.env).");
  const botNombre = env["CHATWOOT_BOT_NOMBRE"]?.trim() ?? "";
  if (!botNombre) problemas.push("Falta CHATWOOT_BOT_NOMBRE (el Agent Bot de Chatwoot; viene en config/demo-local.env).");
  const secretoWebhook = env["CHATWOOT_WEBHOOK_SECRETO"]?.trim() ?? "";
  if (!secretoWebhook) problemas.push("Falta CHATWOOT_WEBHOOK_SECRETO (el secreto compartido del Agent Bot; viene en config/demo-local.env).");

  const bloqueoPrefijo = env["ENSAYO_TWILIO_BLOQUEO_PREFIJO"]?.trim() ?? "";
  if (!simulado && !bloqueoPrefijo) {
    problemas.push("Falta ENSAYO_TWILIO_BLOQUEO_PREFIJO en .env (por ejemplo apagado-): sin él, Chatwoot sigue con los dominios de Twilio bloqueados y no podría mandar tus respuestas al celular.");
  }

  if (problemas.length > 0 || !numero || !origen) return { entorno: null, problemas };
  return {
    entorno: {
      twilio: { sid, token, numero },
      origen,
      chatwoot: { url, cuenta, tokenAdmin, botNombre, secretoWebhook },
      canal: env["ENSAYO_CANAL"]?.trim() || null,
      bloqueoPrefijo,
    },
    problemas,
  };
}

/** Las direcciones que Twilio debe llamar, a partir de la URL pública del túnel. */
export function urlsDeEnsayo(origen: string): { entrantes: string; estados: string; estadosDeChatwoot: string; diagnostico: string } {
  const base = origen.replace(/\/+$/, "");
  return {
    // Lo que se pega en la consola de Twilio (sandbox): «When a message comes in» y «Status callback URL».
    entrantes: `${base}/webhooks/twilio/entrantes`,
    estados: `${base}/webhooks/twilio/estados`,
    // Lo que Chatwoot pone en cada mensaje que manda (su FRONTEND_URL + esta ruta): el backend la atiende con la misma firma.
    estadosDeChatwoot: `${base}/twilio/delivery_status`,
    diagnostico: `${base}/webhooks/twilio/diagnostico`,
  };
}
