// Escenario del ensayo con WhatsApp real, de punta a punta y SIN nada real (V9, invariante 11): el backend de verdad (app HTTP, borde de Twilio, bot,
// Postgres), un Chatwoot falso con su parte de Twilio y un Twilio falso que firma contra la URL pública del «túnel». Lo arma igual que `src/server.ts`.

import { randomInt } from "node:crypto";
import type { Server } from "node:http";
import { crearBordePublico } from "../mensajeria/ensayo/borde-publico.ts";
import { procesarEntrante } from "../captacion/entrante.ts";
import { registrarDesasignacionDeConversacion, registrarTomaDeConversacion } from "../captacion/toma.ts";
import { InscripcionesActivas } from "../catalogo/cupo.ts";
import { conAlcance, type BaseDatos } from "../datos/alcance.ts";
import { crearApp } from "../http/app.ts";
import {
  AtribucionDesdeChatwoot,
  EstadosEntregaChatwoot,
  MessagingProvider,
  ReenviadorTwilioHttp,
  crearBordeTwilio,
  registrarEstadoEntrega,
  type BordeTwilio,
} from "../mensajeria/index.ts";
import { TransporteChatwoot } from "../mensajeria/chatwoot/transporte.ts";
import { ChatwootFalso } from "./chatwoot-falso.ts";
import type { PrismaPruebas } from "./prisma-pruebas.ts";
import { sembrarOrganizacion, type OrganizacionDePrueba } from "./semilla.ts";
import { escucharSinReuso, puertoDe } from "./servidor.ts";
import { TwilioFalso } from "./twilio-falso.ts";

export const TOKEN_DE_ENSAYO = "0123456789abcdef0123456789abcdef";
export const SID_DE_ENSAYO = `AC${"1".repeat(32)}`;
export const SANDBOX = "whatsapp:+14155238886";
export const URL_PUBLICA = "https://ensayo-prueba.example.test";

export interface EscenarioEnsayo {
  org: OrganizacionDePrueba;
  db: BaseDatos;
  twilio: TwilioFalso;
  chatwoot: ChatwootFalso;
  borde: BordeTwilio;
  /** La URL pública que el backend usa para firmar (la del «túnel»). */
  urlPublica: string;
  /** Dónde escucha el backend de verdad. */
  urlLocal: string;
  /** Dónde escucha el borde público (solo con `porBordePublico`). */
  urlBordePublico: string | null;
  cerrar(): Promise<void>;
}

export interface OpcionesEnsayo {
  /** Por omisión se confía en el proxy como en el ensayo (el túnel es un salto). */
  confiarEnProxy?: boolean | number | string;
  /** El FRONTEND_URL de Chatwoot (de donde sale el status_callback). Por omisión, la URL pública. */
  frontendUrlDeChatwoot?: string;
  /** La URL pública que el backend cree tener (PUBLIC_BASE_URL). Por omisión, la misma que usa Twilio. */
  urlPublicaDelBackend?: string | null;
  token?: string;
  /** El «túnel» llega al backend por el borde público del ensayo (`ensayo-borde` de compose), como en el ensayo real. */
  porBordePublico?: boolean;
}

export async function montarEnsayo(prisma: PrismaPruebas, o: OpcionesEnsayo = {}): Promise<EscenarioEnsayo> {
  const org = await sembrarOrganizacion(prisma, "Ensayo");
  // El canal recibe por el número del sandbox, como lo deja `ensayo:preparar`. Un número solo puede estar en un canal vivo (índice único): se libera de otra prueba.
  await prisma.canal_whatsapp.updateMany({ where: { numero_whatsapp: SANDBOX }, data: { numero_whatsapp: null } });
  await prisma.canal_whatsapp.update({ where: { id: org.canalId }, data: { numero_whatsapp: SANDBOX } });
  const db = conAlcance(prisma, org.organizacionId);
  const token = o.token ?? TOKEN_DE_ENSAYO;

  const twilio = new TwilioFalso({ sid: SID_DE_ENSAYO, token: TOKEN_DE_ENSAYO, numero: SANDBOX });
  const urlTwilio = await twilio.iniciar();
  const tokenBot = `bot-${randomInt(1e9)}`;
  const secretoBot = `secreto-${randomInt(1e9)}-del-ensayo`;
  const chatwoot = new ChatwootFalso({
    cuenta: org.chatwootAccountId,
    bandeja: org.chatwootInboxId,
    tokenBot,
    secretoBot,
    frontendUrl: o.frontendUrlDeChatwoot ?? URL_PUBLICA,
    twilio: { url: urlTwilio, sid: SID_DE_ENSAYO, token: TOKEN_DE_ENSAYO, numero: SANDBOX },
  });
  const urlChatwoot = await chatwoot.iniciar();

  const mensajeria = new MessagingProvider({ transporte: new TransporteChatwoot({ url: urlChatwoot, tokenBot }) });
  const borde = crearBordeTwilio({
    prisma,
    reenviador: new ReenviadorTwilioHttp({ urlEntrantes: `${urlChatwoot}/twilio/callback`, urlEstados: `${urlChatwoot}/twilio/delivery_status` }),
    reenviarSinOrganizacion: true,
  });
  const fuenteOcupacion = new InscripcionesActivas();
  const app = crearApp({
    pingDb: async () => {},
    secretoWebhookChatwoot: secretoBot,
    confiarEnProxy: o.confiarEnProxy ?? 1,
    twilio: { authToken: token, publicBaseUrl: o.urlPublicaDelBackend === undefined ? URL_PUBLICA : o.urlPublicaDelBackend, borde },
    estadosEntrega: new EstadosEntregaChatwoot(),
    registrarEstadoEntrega: (cambio) => registrarEstadoEntrega({ prisma }, cambio),
    procesarEntrante: (evento) => procesarEntrante({ prisma, mensajeria, atribucion: new AtribucionDesdeChatwoot(), fuenteOcupacion }, evento),
    registrarTomaDeConversacion: (evento) => registrarTomaDeConversacion({ prisma }, evento),
    registrarDesasignacion: (evento) => registrarDesasignacionDeConversacion({ prisma }, evento),
  });
  const server: Server = escucharSinReuso(app);
  const puerto = await puertoDe(server);
  const urlLocal = `http://127.0.0.1:${puerto}`;
  chatwoot.backendUrl = urlLocal;
  let bordePublico: Server | null = null;
  let urlBordePublico: string | null = null;
  if (o.porBordePublico) {
    bordePublico = crearBordePublico({ destino: urlLocal }).listen(0, "127.0.0.1");
    urlBordePublico = `http://127.0.0.1:${await puertoDe(bordePublico)}`;
  }
  twilio.tunel = { publica: URL_PUBLICA, local: urlBordePublico ?? urlLocal };

  return {
    org,
    db,
    twilio,
    chatwoot,
    borde,
    urlPublica: URL_PUBLICA,
    urlLocal,
    urlBordePublico,
    cerrar: async () => {
      await chatwoot.vaciar();
      await prisma.canal_whatsapp.updateMany({ where: { id: org.canalId }, data: { numero_whatsapp: null } });
      server.close();
      bordePublico?.close();
      await chatwoot.cerrar();
      await twilio.cerrar();
    },
  };
}
