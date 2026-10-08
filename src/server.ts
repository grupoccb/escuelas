import { procesarEntrante } from "./captacion/entrante.ts";
import { crearPrisma } from "./datos/prisma.ts";
import { pingBaseDatos } from "./datos/sistema.ts";
import { crearApp } from "./http/app.ts";
import { log } from "./lib/log.ts";
import { mensajeriaDesdeEntorno } from "./mensajeria/index.ts";

const prisma = crearPrisma();
const mensajeria = mensajeriaDesdeEntorno();

const app = crearApp({
  pingDb: () => pingBaseDatos(prisma),
  secretoWebhookChatwoot: mensajeria.secretoWebhookChatwoot,
  procesarEntrante: (evento) => procesarEntrante({ prisma, mensajeria: mensajeria.provider }, evento),
});

const port = Number(process.env["PORT"] ?? 3000);
const server = app.listen(port, () => {
  log.info("backend_escuchando", { port, transporte: mensajeria.transporte });
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
