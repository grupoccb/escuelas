import { iniciarBarrido } from "./barrido.ts";
import { crearCierre } from "./cierre.ts";
import { correrCiclo } from "./ciclo.ts";
import { procesarEntrante } from "./captacion/entrante.ts";
import { registrarTomaDeConversacion } from "./captacion/toma.ts";
import { crearPrisma } from "./datos/prisma.ts";
import { pingBaseDatos } from "./datos/sistema.ts";
import { crearApp } from "./http/app.ts";
import { log } from "./lib/log.ts";
import { AtribucionDesdeChatwoot, EstadosEntregaChatwoot, bordeTwilioDesdeEntorno, mensajeriaDesdeEntorno, registrarEstadoEntrega } from "./mensajeria/index.ts";

const prisma = crearPrisma();
const mensajeria = mensajeriaDesdeEntorno();
// Vía A de docs/DECISION-ATRIBUCION.md (propuesta). Elegir otra vía = cambiar este adaptador.
const atribucion = new AtribucionDesdeChatwoot();
// Borde de Twilio (A7): firma, reintentos por MessageSid y reenvío sin modificar a Chatwoot.
// Apagado (rechaza todo) mientras no haya TWILIO_AUTH_TOKEN y PUBLIC_BASE_URL.
const twilio = bordeTwilioDesdeEntorno(prisma);

const app = crearApp({
  pingDb: () => pingBaseDatos(prisma),
  secretoWebhookChatwoot: mensajeria.secretoWebhookChatwoot,
  twilio,
  estadosEntrega: new EstadosEntregaChatwoot(),
  registrarEstadoEntrega: (cambio) => registrarEstadoEntrega({ prisma }, cambio),
  procesarEntrante: (evento) => procesarEntrante({ prisma, mensajeria: mensajeria.provider, atribucion }, evento),
  registrarTomaDeConversacion: (evento) => registrarTomaDeConversacion({ prisma }, evento),
});

const port = Number(process.env["PORT"] ?? 3000);
const server = app.listen(port, () => {
  log.info("backend_escuchando", { port, transporte: mensajeria.transporte, twilio: twilio.authToken && twilio.publicBaseUrl ? `activo (reenvío ${twilio.reenvio})` : "apagado" });
});

// Cada minuto, un ciclo (ver ciclo.ts): espera del bot y automatizaciones, cada uno aislado del otro.
const barrido = iniciarBarrido({
  intervaloMs: 60_000,
  tarea: async () => {
    await correrCiclo({ prisma, mensajeria: mensajeria.provider, twilio: twilio.borde });
  },
});

// SIGTERM llega en cada despliegue: cierre ordenado (src/cierre.ts), con código de salida fiel.
const cerrar = crearCierre({ barrido, server, prisma, salir: (codigo) => process.exit(codigo) });
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void cerrar(signal));
}
