// `npm run ensayo:diagnostico` (V9): en pocos segundos dice qué está bien y qué no del ensayo con WhatsApp real, con ✔ / ✘ y qué hacer. No manda ningún mensaje: la
// "firma de prueba" va a `/webhooks/twilio/diagnostico`, que solo valida la firma y contesta 200. Los efectos de fuera (Docker, la base) entran por puertos para
// probarlo sin nada real.

import { leerEntornoEnsayo, urlsDeEnsayo } from "./entorno.ts";
import { calcularFirmaTwilio } from "../twilio/firma.ts";

export interface Comprobacion {
  nombre: string;
  /** true ✔ · false ✘ · null «revisar a mano» (no se puede comprobar desde aquí). */
  ok: boolean | null;
  detalle: string;
  queHacer?: string;
}

export interface PuertosDiagnostico {
  fetch: typeof fetch;
  /** ¿Existe la bandeja de Twilio en Chatwoot, y el número en el canal de la base? null = no se pudo consultar. */
  bandejaTwilio(numero: string): Promise<{ enChatwoot: boolean; enBase: boolean } | null>;
  /** Lo que ve el contenedor de Chatwoot: a qué IP resuelve api.twilio.com y su FRONTEND_URL. null = no hay Docker o no responde. */
  dentroDeChatwoot(): Promise<{ ipDeApiTwilio: string | null; frontendUrl: string | null } | null>;
  plazoMs?: number;
}

export interface OpcionesDiagnostico {
  backendUrl: string;
}

const hay = (c: Comprobacion[], nombre: string, ok: boolean | null, detalle: string, queHacer?: string): void => void c.push({ nombre, ok, detalle, ...(queHacer ? { queHacer } : {}) });

export async function diagnosticar(env: NodeJS.ProcessEnv, p: PuertosDiagnostico, o: OpcionesDiagnostico): Promise<Comprobacion[]> {
  const salida: Comprobacion[] = [];
  const plazo = p.plazoMs ?? 3000;
  const pedir = async (url: string, init: RequestInit = {}): Promise<{ status: number } | { error: string }> => {
    try {
      const r = await p.fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(plazo) });
      await r.arrayBuffer().catch(() => undefined);
      return { status: r.status };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  };

  // 1. Variables.
  const lectura = leerEntornoEnsayo(env);
  if (lectura.problemas.length === 0) hay(salida, "Variables de .env", true, "completas y con buena forma");
  else lectura.problemas.forEach((problema, i) => hay(salida, "Variables de .env", false, problema, i === 0 ? "Complétalas en .env (copia config/ensayo.env.example si no lo tienes) y vuelve a correr el diagnóstico." : undefined));
  const entorno = lectura.entorno;
  const chatwootUrl = (env["CHATWOOT_URL_HOST"] ?? "http://localhost:3001").replace(/\/+$/, "");

  const [backend, chatwoot, dentro, bandeja] = await Promise.all([
    pedir(`${o.backendUrl.replace(/\/+$/, "")}/salud`),
    pedir(`${chatwootUrl}/api`),
    p.dentroDeChatwoot().catch(() => null),
    entorno ? p.bandejaTwilio(entorno.twilio.numero).catch(() => null) : Promise.resolve(null),
  ]);

  // 2 y 3. Backend y Chatwoot.
  if ("status" in backend && backend.status === 200) hay(salida, "Backend", true, `responde en ${o.backendUrl}`);
  else hay(salida, "Backend", false, "no responde", "Levanta la demo: docker compose --profile ensayo up -d --wait");
  if ("status" in chatwoot && chatwoot.status < 500) hay(salida, "Chatwoot", true, `responde en ${chatwootUrl}`);
  else hay(salida, "Chatwoot", false, "no responde", "Tarda un minuto en arrancar; si ya pasó, mira: docker compose logs chatwoot");

  // 4. Chatwoot puede hablar con Twilio y sabe la URL pública.
  if (dentro === null) hay(salida, "Chatwoot sin el bloqueo de Twilio", null, "no se pudo mirar dentro de Chatwoot (¿Docker corre?)", "Si Docker corre, repite en unos segundos.");
  else if (dentro.ipDeApiTwilio === null || dentro.ipDeApiTwilio === "127.0.0.1") {
    hay(salida, "Chatwoot sin el bloqueo de Twilio", false, "Chatwoot sigue con los dominios de Twilio bloqueados (apuntan a esta misma máquina)", "Pon ENSAYO_TWILIO_BLOQUEO_PREFIJO=apagado- en .env y corre: docker compose --profile ensayo up -d");
  } else hay(salida, "Chatwoot sin el bloqueo de Twilio", true, "Chatwoot alcanza la API de Twilio");
  if (entorno && dentro) {
    if (dentro.frontendUrl?.replace(/\/+$/, "") === entorno.origen) hay(salida, "Chatwoot conoce la URL pública", true, "los estados de entrega volverán por el túnel");
    else hay(salida, "Chatwoot conoce la URL pública", false, `Chatwoot tiene otra URL (${dentro.frontendUrl ?? "ninguna"}): los estados de entrega no llegarían`, "Corre: npm run ensayo:preparar -- --url " + entorno.origen);
  }

  // 5. La bandeja.
  if (!entorno) hay(salida, "Bandeja de WhatsApp", null, "no se revisa sin las variables");
  else if (bandeja === null) hay(salida, "Bandeja de WhatsApp", null, "no se pudo consultar Chatwoot o la base");
  else if (bandeja.enChatwoot && bandeja.enBase) hay(salida, "Bandeja de WhatsApp", true, `existe en Chatwoot y el canal tiene el número ${entorno.twilio.numero}`);
  else hay(salida, "Bandeja de WhatsApp", false, bandeja.enChatwoot ? "la bandeja existe en Chatwoot pero el canal de la base no tiene el número" : "no hay bandeja de WhatsApp-por-Twilio en Chatwoot", "Corre: npm run ensayo:preparar");

  // 6 y 7. El túnel y la firma contra la URL pública.
  if (entorno) {
    const urls = urlsDeEnsayo(entorno.origen);
    const tunel = await pedir(`${entorno.origen}/salud`);
    if ("status" in tunel && tunel.status === 200) hay(salida, "Túnel", true, `${entorno.origen} llega al backend`);
    else if ("status" in tunel && tunel.status === 404) hay(salida, "Túnel", false, "el túnel responde pero no es el borde del ensayo", "El túnel debe apuntar a http://localhost:3100 (el servicio ensayo-borde), no al 3000.");
    else hay(salida, "Túnel", false, "la dirección del túnel no responde", "¿Sigue abierto el comando del túnel? Cada vez que se reinicia cambia la dirección: ábrelo de nuevo y corre npm run ensayo:preparar -- --url <la nueva>");
    if ("status" in tunel && tunel.status === 200) {
      const params = { Diagnostico: "1" };
      const firma = calcularFirmaTwilio(entorno.twilio.token, urls.diagnostico, params);
      const r = await pedir(urls.diagnostico, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": firma }, body: new URLSearchParams(params).toString() });
      if ("status" in r && r.status === 200) hay(salida, "Firma contra la URL pública", true, "el backend valida una firma de prueba hecha con tu token y esta URL");
      else if ("status" in r && r.status === 403) hay(salida, "Firma contra la URL pública", false, "el backend rechazó la firma de prueba: no usa esta URL o este token para firmar", "Corre: npm run ensayo:preparar -- --url " + entorno.origen + " (recrea el backend con esa URL y tu token). Mira el motivo exacto: docker compose logs backend | grep webhook_twilio_rechazado");
      else hay(salida, "Firma contra la URL pública", false, "status" in r ? `el backend contestó ${r.status}` : "no se pudo llamar", "Revisa que el backend se levantó con el perfil: docker compose --profile ensayo up -d --wait");
    }
    // 8. Lo que no se puede ver desde aquí.
    hay(salida, "Consola de Twilio (a mano)", null, `en Sandbox settings: «When a message comes in» = ${urls.entrantes} (POST) y «Status callback URL» = ${urls.estados}`, "Compara con lo que tiene la consola, letra por letra, y pulsa Save.");
  }
  return salida;
}

export function formatearDiagnostico(c: Comprobacion[]): { texto: string; todoBien: boolean } {
  const lineas = c.map((x) => {
    const marca = x.ok === true ? "✔" : x.ok === false ? "✘" : "•";
    return `${marca} ${x.nombre}: ${x.detalle}${x.ok !== true && x.queHacer ? `\n    → ${x.queHacer}` : ""}`;
  });
  const fallas = c.filter((x) => x.ok === false).length;
  lineas.push("", fallas === 0 ? "Todo lo que se puede comprobar desde aquí está bien. Sigue con el paso 5 de docs/ENSAYO-WHATSAPP-REAL.md." : `Hay ${fallas} cosa${fallas === 1 ? "" : "s"} por arreglar (las marcadas con ✘).`);
  return { texto: lineas.join("\n"), todoBien: fallas === 0 };
}
