// App HTTP (Express 5). La crea una fábrica con dependencias inyectadas para que los tests
// no necesiten base ni red.

import express, { type Express } from "express";

export interface AppDeps {
  /** Verifica que la base responde. Lanza si no. */
  pingDb(): Promise<void>;
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

  return app;
}
