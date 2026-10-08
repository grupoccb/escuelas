// App HTTP (Express 5). La crea una fábrica con dependencias inyectadas para que los tests
// no necesiten base ni red.

import express, { type Express } from "express";
import { log } from "../lib/log.ts";
import {
  interpretarEventoChatwoot,
  verificarWebhookChatwoot,
  type CambioDeEstado,
  type EventoEntrante,
  type FuenteEstadosEntrega,
} from "../mensajeria/index.ts";

export interface AppDeps {
  /** Verifica que la base responde. Lanza si no. */
  pingDb(): Promise<void>;
  /** Secreto del Agent Bot de Chatwoot. Sin él, el webhook rechaza todo. */
  secretoWebhookChatwoot: string | null;
  procesarEntrante(evento: EventoEntrante): Promise<{ resultado: string }>;
  /** De dónde salen los estados de entrega (enviado, entregado, leído, fallido). */
  estadosEntrega: FuenteEstadosEntrega;
  registrarEstadoEntrega(cambio: CambioDeEstado): Promise<string>;
  reloj?: () => Date;
}

export function crearApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");

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
  app.post("/webhooks/chatwoot", express.raw({ type: () => true, limit: "1mb" }), async (req, res) => {
    const cuerpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!verificarWebhookChatwoot(req, cuerpo, deps.secretoWebhookChatwoot, deps.reloj?.())) {
      log.warn("webhook_chatwoot_rechazado");
      res.status(401).json({ ok: false });
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
      // No es un mensaje del contacto: puede ser un cambio de estado de entrega de un saliente.
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

  return app;
}
