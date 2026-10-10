// La única puerta pública del ensayo con WhatsApp real (V9). El túnel (cloudflared, localhost.run…) apunta aquí y no al backend: así, aunque la dirección del
// túnel la conozca cualquiera, desde internet solo se alcanza lo que Twilio necesita llamar. La interfaz, `/api` (con las contraseñas públicas de la demo),
// `/metricas` y Chatwoot NO pasan: 404 sin cuerpo.
//
// Deja pasar, y nada más:
//   POST /webhooks/twilio/entrantes · /webhooks/twilio/estados · /webhooks/twilio/diagnostico · /twilio/delivery_status   (con su query, si la trae)
//   GET  /salud
// No valida la firma (eso lo hace el backend, contra la URL pública, invariante 9): reenvía el cuerpo SIN tocar y las cabeceras que la firma y la idempotencia
// necesitan. No guarda nada y no loguea cuerpos ni cabeceras: solo método, ruta (sin query) y estado.

import { request as pedirHttp, createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { log } from "../../lib/log.ts";

export const RUTAS_PUBLICAS_POST = ["/webhooks/twilio/entrantes", "/webhooks/twilio/estados", "/webhooks/twilio/diagnostico", "/twilio/delivery_status"] as const;
export const RUTAS_PUBLICAS_GET = ["/salud"] as const;
/** Igual que el backend (LIMITE_CUERPO_TWILIO): más que esto no es de Twilio. */
export const LIMITE_CUERPO_BORDE = 100 * 1024;
const CABECERAS_QUE_PASAN = ["content-type", "x-twilio-signature", "i-twilio-idempotency-token", "user-agent"] as const;

export interface ConfigBordePublico {
  /** El backend, por la red interna: http://backend:3000 */
  destino: string;
  plazoMs?: number;
}

export function esRutaPublica(metodo: string | undefined, ruta: string): boolean {
  if (metodo === "POST") return (RUTAS_PUBLICAS_POST as readonly string[]).includes(ruta);
  if (metodo === "GET") return (RUTAS_PUBLICAS_GET as readonly string[]).includes(ruta);
  return false;
}

async function leerCuerpo(req: IncomingMessage): Promise<Buffer | "grande"> {
  const trozos: Buffer[] = [];
  let total = 0;
  for await (const t of req) {
    total += (t as Buffer).length;
    if (total > LIMITE_CUERPO_BORDE) return "grande";
    trozos.push(t as Buffer);
  }
  return Buffer.concat(trozos);
}

export function crearBordePublico(config: ConfigBordePublico): Server {
  const destino = new URL(config.destino);
  const plazoMs = config.plazoMs ?? 15_000;

  const terminar = (req: IncomingMessage, res: ServerResponse, status: number): void => {
    log.info("borde_publico", { metodo: req.method ?? "?", ruta: (req.url ?? "").split("?")[0], status });
    res.statusCode = status;
    res.end();
  };

  return createServer((req, res) => {
    res.setHeader("Connection", "close");
    const url = new URL(req.url ?? "/", "http://borde");
    if (!esRutaPublica(req.method, url.pathname)) return terminar(req, res, 404);

    void (async () => {
      const cuerpo = req.method === "POST" ? await leerCuerpo(req) : Buffer.alloc(0);
      if (cuerpo === "grande") return terminar(req, res, 413);

      const cabeceras: Record<string, string> = {};
      for (const nombre of CABECERAS_QUE_PASAN) {
        const v = req.headers[nombre];
        if (typeof v === "string") cabeceras[nombre] = v;
      }
      // V13-fix (EV-41): el X-Forwarded-For del cliente NO pasa: cualquiera podía mandar uno inventado y, con TRUST_PROXY encendido, el backend lo habría tomado por su IP (saltándose el límite
      // por IP). La borde dice lo que él mismo ve: quién le habló (el túnel).
      cabeceras["x-forwarded-for"] = (req.socket.remoteAddress ?? "").replace(/^::ffff:/, "") || "desconocida";
      // Lo que el túnel avisó, tal cual (el backend solo lo cree si se configuró TRUST_PROXY); si no avisó nada, https: el túnel termina el TLS.
      cabeceras["x-forwarded-proto"] = typeof req.headers["x-forwarded-proto"] === "string" ? req.headers["x-forwarded-proto"] : "https";
      if (typeof req.headers["host"] === "string") cabeceras["x-forwarded-host"] = req.headers["host"];
      cabeceras["content-length"] = String(cuerpo.length);

      const saliente = pedirHttp(
        { protocol: destino.protocol, hostname: destino.hostname, port: destino.port, method: req.method ?? "GET", path: `${url.pathname}${url.search}`, headers: cabeceras, timeout: plazoMs },
        (respuesta) => {
          const partes: Buffer[] = [];
          respuesta.on("data", (t: Buffer) => partes.push(t));
          respuesta.on("end", () => {
            const tipo = respuesta.headers["content-type"];
            res.statusCode = respuesta.statusCode ?? 502;
            if (typeof tipo === "string") res.setHeader("content-type", tipo);
            const retry = respuesta.headers["retry-after"];
            if (typeof retry === "string") res.setHeader("retry-after", retry);
            log.info("borde_publico", { metodo: req.method ?? "?", ruta: url.pathname, status: res.statusCode });
            res.end(Buffer.concat(partes));
          });
        },
      );
      saliente.on("timeout", () => saliente.destroy(new Error("plazo")));
      saliente.on("error", () => {
        if (!res.headersSent) terminar(req, res, 502);
        else res.destroy();
      });
      saliente.end(cuerpo);
    })().catch(() => {
      if (!res.headersSent) terminar(req, res, 502);
    });
  });
}
