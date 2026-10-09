// Un servidor HTTP en 127.0.0.1 (nunca en el comodín: EG-08) para las herramientas de línea de comandos.

import { createServer, type Server } from "node:http";
import type { Express } from "express";

export function escucharServidor(app: Express, puerto = 0): Promise<{ server: Server; puerto: number }> {
  return new Promise((resolver, rechazar) => {
    const server = createServer(app);
    server.once("error", rechazar);
    server.listen(puerto, "127.0.0.1", () => {
      const a = server.address();
      if (a === null || typeof a !== "object") rechazar(new Error("El servidor no escucha"));
      else resolver({ server, puerto: a.port });
    });
  });
}
