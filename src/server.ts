import { procesarEntrante } from "./captacion/entrante.ts";
import { barrerTiemposDeEspera } from "./captacion/espera.ts";
import { crearPrisma } from "./datos/prisma.ts";
import { pingBaseDatos } from "./datos/sistema.ts";
import { crearApp } from "./http/app.ts";
import { log } from "./lib/log.ts";
import { AtribucionDesdeChatwoot, EstadosEntregaChatwoot, mensajeriaDesdeEntorno, registrarEstadoEntrega } from "./mensajeria/index.ts";

const prisma = crearPrisma();
const mensajeria = mensajeriaDesdeEntorno();
// Vía A de docs/DECISION-ATRIBUCION.md (propuesta). Elegir otra vía = cambiar este adaptador.
const atribucion = new AtribucionDesdeChatwoot();

const app = crearApp({
  pingDb: () => pingBaseDatos(prisma),
  secretoWebhookChatwoot: mensajeria.secretoWebhookChatwoot,
  estadosEntrega: new EstadosEntregaChatwoot(),
  registrarEstadoEntrega: (cambio) => registrarEstadoEntrega({ prisma }, cambio),
  procesarEntrante: (evento) => procesarEntrante({ prisma, mensajeria: mensajeria.provider, atribucion }, evento),
});

const port = Number(process.env["PORT"] ?? 3000);
const server = app.listen(port, () => {
  log.info("backend_escuchando", { port, transporte: mensajeria.transporte });
});

// Tiempo de espera del bot: cada minuto revisa las conversaciones a medio capturar.
const barrido = setInterval(() => {
  barrerTiemposDeEspera({ prisma, mensajeria: mensajeria.provider }).catch((e: unknown) =>
    log.error("barrido_espera_error", { error: (e as Error).message }),
  );
}, 60_000);
barrido.unref();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}
