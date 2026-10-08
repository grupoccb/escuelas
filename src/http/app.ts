// App HTTP (Express 5). La crea una fábrica con dependencias inyectadas para que los tests
// no necesiten base ni red.

import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { cabecerasDeSeguridad, hstsActivo } from "../api/cabeceras.ts";
import { crearApiRouter, resolverDepsApi, type ApiDepsEntrada } from "../api/index.ts";
import { LIMITE_CUERPO_CHATWOOT, LIMITE_CUERPO_TWILIO } from "../api/cuerpos.ts";
import { log } from "../lib/log.ts";
import type { ConfigLimites } from "./config-limites.ts";
import type { LimitadorDeTasa } from "./limite.ts";
import { admitirWebhookValido, rechazar429, registrarFirmaInvalida } from "./limite-http.ts";
import { rutasDeLanding } from "./landing.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import {
  interpretarDesasignacion,
  interpretarEventoChatwoot,
  interpretarTomaDeConversacion,
  urlPublicaDe,
  verificarWebhookChatwoot,
  verificarWebhookTwilio,
  type BordeTwilio,
  type CambioDeEstado,
  type EventoDesasignacion,
  type EventoEntrante,
  type EventoTomaDeConversacion,
  type FuenteEstadosEntrega,
} from "../mensajeria/index.ts";

/** Lo que el borde de Twilio necesita (A7). Sin token o sin URL pública, sus rutas rechazan todo. */
export interface AppTwilio {
  /** Auth token de la cuenta de Twilio: la clave con la que Twilio firma sus peticiones. */
  authToken: string | null;
  /** URL pública del backend tal como la ve Twilio (https://host, sin ruta). */
  publicBaseUrl: string | null;
  borde: BordeTwilio;
}

export { LIMITE_CUERPO_TWILIO };

export interface AppDeps {
  /** Verifica que la base responde. Lanza si no. */
  pingDb(): Promise<void>;
  /** Secreto del Agent Bot de Chatwoot. Sin él, el webhook rechaza todo. */
  secretoWebhookChatwoot: string | null;
  procesarEntrante(evento: EventoEntrante): Promise<{ resultado: string }>;
  /** Una persona tomó la conversación en Chatwoot (se la asignó o escribió): activa la atención humana. */
  registrarTomaDeConversacion(evento: EventoTomaDeConversacion): Promise<string>;
  /** La conversación se quedó sin asesor en Chatwoot: se borra la asignación anotada (B5). */
  registrarDesasignacion?(evento: EventoDesasignacion): Promise<string>;
  /** De dónde salen los estados de entrega (enviado, entregado, leído, fallido). */
  estadosEntrega: FuenteEstadosEntrega;
  registrarEstadoEntrega(cambio: CambioDeEstado): Promise<string>;
  /** Borde de Twilio. Sin él, las rutas /webhooks/twilio/* rechazan todo. */
  twilio?: AppTwilio;
  /** API de la aplicación (/api). Sin ella, /api no existe. */
  api?: ApiDepsEntrada;
  /** Landing pública por vertical (/l/:vertical, E1). Sin ella, /l no existe. */
  landing?: { prisma: PrismaRaiz; origenesPermitidos?: readonly string[] };
  /** Límites de peticiones (B6). Sin ellos no se limita nada: `server.ts` siempre los pasa. */
  limites?: ConfigLimites;
  limitador?: LimitadorDeTasa;
  /** `trust proxy` de Express: cuántos saltos de proxy creer para leer la IP real. Por omisión ninguno. */
  confiarEnProxy?: boolean | number | string;
  /** Variables de entorno (por omisión `process.env`): de ahí salen la cookie segura y HSTS si no se pasan. */
  entorno?: NodeJS.ProcessEnv;
  reloj?: () => Date;
}

export function crearApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  // La IP del cliente (req.ip) sale de la conexión, salvo que se configure confiar en un proxy.
  app.set("trust proxy", deps.confiarEnProxy ?? false);
  const { limites, limitador } = deps;
  // HSTS con la MISMA resolución de la cookie segura que usa la API (no un valor aparte que nadie pasa, EB-05).
  const entorno = deps.entorno ?? process.env;
  const cookieSegura = deps.api ? resolverDepsApi({ ...deps.api, entorno: deps.api.entorno ?? entorno }).cookieSegura : false;
  app.use(cabecerasDeSeguridad(hstsActivo(cookieSegura, deps.api?.entorno ?? entorno)));

  // API de la aplicación (B1-B3): sesiones, permisos y recursos. Ver src/api/index.ts y docs/API.md.
  if (deps.api) app.use("/api", crearApiRouter({ ...(limites ? { limites } : {}), ...(limitador ? { limitador } : {}), entorno, ...deps.api }));

  // Landing pública (E1): sin sesión; su propia protección contra abuso (límite por IP, honeypot, tope de cuerpo) vive en src/http/landing.ts.
  if (deps.landing) app.use("/l", rutasDeLanding({ prisma: deps.landing.prisma, ...(deps.landing.origenesPermitidos ? { origenesPermitidos: deps.landing.origenesPermitidos } : {}), ...(deps.reloj ? { reloj: deps.reloj } : {}), ...(limites ? { limites } : {}), ...(limitador ? { limitador } : {}) }));

  app.get("/salud", async (_req, res) => {
    try {
      await deps.pingDb();
      res.json({ ok: true, db: "ok" });
    } catch {
      res.status(503).json({ ok: false, db: "sin conexión" });
    }
  });

  // Webhook del Agent Bot. La firma se valida sobre el cuerpo crudo antes de parsear nada
  // (invariante 9). Un 500 hace que Chatwoot reintente; el procesamiento es idempotente.
  // La protección por IP (B6, EB-04) se aplica DESPUÉS de verificar la firma: los rechazos gastan un cupo
  // propio y solo lo firmado y legítimo gasta el techo; ver src/http/limite-http.ts.
  app.post("/webhooks/chatwoot", express.raw({ type: () => true, limit: LIMITE_CUERPO_CHATWOOT }), async (req, res) => {
    const cuerpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!verificarWebhookChatwoot(req, cuerpo, deps.secretoWebhookChatwoot, deps.reloj?.())) {
      const fallos = registrarFirmaInvalida(limitador, limites, "chatwoot", req);
      log.warn("webhook_chatwoot_rechazado");
      if (!fallos.permitido) rechazar429(res, fallos.reintentarEnSegundos);
      else res.status(401).json({ ok: false });
      return;
    }
    const techo = admitirWebhookValido(limitador, limites, "chatwoot", req);
    if (!techo.permitido) {
      rechazar429(res, techo.reintentarEnSegundos);
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(cuerpo.toString("utf8"));
    } catch {
      res.status(400).json({ ok: false });
      return;
    }

    const evento = interpretarEventoChatwoot(payload);
    if (!evento) {
      // No es un mensaje del contacto. Puede ser que una persona tome la conversación...
      const toma = interpretarTomaDeConversacion(payload);
      if (toma) {
        try {
          res.json({ ok: true, resultado: await deps.registrarTomaDeConversacion(toma) });
        } catch (e) {
          log.error("webhook_chatwoot_toma_error", { error: (e as Error).message });
          res.status(500).json({ ok: false });
        }
        return;
      }
      // ...o que la conversación se quede sin asesor (B5)...
      const desasignacion = interpretarDesasignacion(payload);
      if (desasignacion && deps.registrarDesasignacion) {
        try {
          res.json({ ok: true, resultado: await deps.registrarDesasignacion(desasignacion) });
        } catch (e) {
          log.error("webhook_chatwoot_desasignacion_error", { error: (e as Error).message });
          res.status(500).json({ ok: false });
        }
        return;
      }
      // ...o un cambio de estado de entrega de un saliente.
      const cambio = deps.estadosEntrega.interpretar(payload);
      if (!cambio) {
        res.json({ ok: true, resultado: "ignorado" });
        return;
      }
      try {
        res.json({ ok: true, resultado: await deps.registrarEstadoEntrega(cambio) });
      } catch (e) {
        log.error("webhook_chatwoot_estado_error", { error: (e as Error).message });
        res.status(500).json({ ok: false });
      }
      return;
    }

    try {
      const { resultado } = await deps.procesarEntrante(evento);
      res.json({ ok: true, resultado });
    } catch (e) {
      log.error("webhook_chatwoot_error", { error: (e as Error).message });
      res.status(500).json({ ok: false });
    }
  });

  // Borde de Twilio (A7): Twilio llama aquí en lugar de a Chatwoot. Se valida la firma de Twilio
  // sobre el cuerpo CRUDO (invariante 9), se descartan los reintentos por MessageSid y se reenvía
  // el cuerpo sin modificar. Rechazos: 403 sin firma válida, 5xx si el reenvío falla (Twilio
  // reintenta). Nunca se devuelve nada interno.
  const TWIML_VACIO = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>";
  for (const [ruta, tipo] of [
    ["/webhooks/twilio/entrantes", "entrante"],
    ["/webhooks/twilio/estados", "estado"],
  ] as const) {
    const nombreLimite = `twilio${tipo === "entrante" ? "" : "-estados"}`;
    app.post(ruta, express.raw({ type: () => true, limit: LIMITE_CUERPO_TWILIO }), async (req, res) => {
      const cuerpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const t = deps.twilio;
      const verificado = verificarWebhookTwilio(req, cuerpo, t?.authToken, t?.publicBaseUrl ? urlPublicaDe(t.publicBaseUrl, req.originalUrl) : null);
      if (!t || !verificado) {
        const fallos = registrarFirmaInvalida(limitador, limites, nombreLimite, req);
        log.warn("webhook_twilio_rechazado", { ruta });
        if (!fallos.permitido) rechazar429(res, fallos.reintentarEnSegundos);
        else res.status(403).end();
        return;
      }
      const techo = admitirWebhookValido(limitador, limites, nombreLimite, req);
      if (!techo.permitido) {
        rechazar429(res, techo.reintentarEnSegundos);
        return;
      }
      try {
        const resultado = await t.borde.procesar({ tipo, cuerpo, params: verificado.params, cabeceras: verificado.cabeceras });
        switch (resultado) {
          case "sin_identificador":
            res.status(400).end();
            return;
          case "en_curso":
            res.status(503).set("Retry-After", "5").end();
            return;
          case "fallo_reenvio":
            res.status(502).end();
            return;
          default:
            // reenviado, duplicado u organización desconocida: Twilio no debe reintentar.
            if (tipo === "entrante") res.status(200).type("text/xml").send(TWIML_VACIO);
            else res.status(200).end();
        }
      } catch (e) {
        log.error("webhook_twilio_error", { ruta, error: (e as Error).message });
        res.status(500).end();
      }
    });
  }

  // Errores de Express (cuerpo demasiado grande, etc.): sin detalles hacia afuera.
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const estado = typeof err === "object" && err !== null && "status" in err && typeof err.status === "number" ? err.status : 500;
    if (estado >= 500) log.error("http_error", { error: err instanceof Error ? err.message : String(err) });
    res.status(estado >= 400 && estado < 600 ? estado : 500).end();
  });

  return app;
}
