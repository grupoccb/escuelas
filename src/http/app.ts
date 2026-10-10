// App HTTP (Express 5). La crea una fábrica con dependencias inyectadas para que los tests
// no necesiten base ni red.

import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { cabecerasDeSeguridad, hstsActivo } from "../api/cabeceras.ts";
import { crearApiRouter, resolverDepsApi, type ApiDepsEntrada } from "../api/index.ts";
import { LIMITE_CUERPO_CHATWOOT, LIMITE_CUERPO_TWILIO } from "../api/cuerpos.ts";
import { noEncontrado } from "../api/errores.ts";
import { log } from "../lib/log.ts";
import { contarRespuesta, contarWebhook } from "../observabilidad/proceso.ts";
import { revisarListo, type DepsDeSalud } from "../observabilidad/salud.ts";
import { createHash, timingSafeEqual } from "node:crypto";
import type { ConfigLimites } from "./config-limites.ts";
import type { LimitadorDeTasa } from "./limite.ts";
import { admitirWebhookValido, rechazar429, registrarFirmaInvalida } from "./limite-http.ts";
import { rutasDeLanding } from "./landing.ts";
import { rutasDeWeb } from "./web.ts";
import { manejadorSoloLog, type ContextoDeEvento, type ManejadorDeInesperados } from "../webhooks/inesperado.ts";
import { formaDe, formaDeBytes, huella, idSeguro } from "../webhooks/forma.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import {
  contextoChatwootDe,
  esMensajeEntranteIlegible,
  idDeMensajeChatwoot,
  interpretarDesasignacion,
  interpretarEventoChatwoot,
  interpretarTomaDeConversacion,
  explicarRechazoDeTwilio,
  traeFirmaDeTwilio,
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

const unico = (v: string | string[] | undefined): string | null => {
  const x = Array.isArray(v) ? v[0] : v;
  return x !== undefined && x.trim() !== "" ? x.trim() : null;
};

/** Los números de la escuela que pueden ubicar la organización de un evento de Twilio: en un entrante `To`; en un estado, `From` y luego `To`. */
function receptoresDe(tipo: "entrante" | "estado", params: Record<string, string | string[] | undefined>): string[] {
  const to = unico(params["To"]);
  const from = unico(params["From"]);
  return (tipo === "entrante" ? [to] : [from, to]).filter((x): x is string => x !== null);
}

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
  /** Interfaz web (J1): el build estático de Vite en `/`. Sin build (`index.html`) en el directorio, el backend sigue sin interfaz. */
  web?: { directorio: string };
  /** API de la aplicación (/api). Sin ella, /api no existe. */
  api?: ApiDepsEntrada;
  /** Qué hacer con un evento que no se pudo procesar (WH). Sin él solo se clasifica y se loguea; `server.ts` pasa el que guarda la constancia y la tarea. */
  inesperados?: ManejadorDeInesperados;
  /** Landing pública por vertical (/l/:vertical, E1). Sin ella, /l no existe. */
  landing?: { prisma: PrismaRaiz; origenesPermitidos?: readonly string[]; origenesLocales?: boolean };
  /** Límites de peticiones (B6). Sin ellos no se limita nada: `server.ts` siempre los pasa. */
  limites?: ConfigLimites;
  limitador?: LimitadorDeTasa;
  /** `trust proxy` de Express: cuántos saltos de proxy creer para leer la IP real. Por omisión ninguno. */
  confiarEnProxy?: boolean | number | string;
  /** `/salud/lista` (K4): qué se comprueba además de la base (migraciones, barrido, Chatwoot). Sin esto solo se comprueba la base. */
  salud?: Omit<DepsDeSalud, "pingDb">;
  /** `/metricas` (K4): formato Prometheus, con el token en `Authorization: Bearer`. Sin token configurado la ruta no existe (404). */
  metricas?: { token: string | null; texto(): Promise<string> };
  /** Variables de entorno (por omisión `process.env`): de ahí salen la cookie segura y HSTS si no se pasan. */
  entorno?: NodeJS.ProcessEnv;
  reloj?: () => Date;
}

export function crearApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  // V13-fix (EV-01): una ruta es EXACTAMENTE la que se declaró. Sin esto `/API/cargos` llegaba al mismo manejador que `/api/cargos` sin pasar por la guarda de módulos. Los routers de
  // /api, /l y la interfaz hacen lo mismo (`crearRouter`, src/http/enrutador.ts).
  app.set("case sensitive routing", true);
  app.set("strict routing", true);
  // La IP del cliente (req.ip) sale de la conexión, salvo que se configure confiar en un proxy.
  app.set("trust proxy", deps.confiarEnProxy ?? false);
  const { limites, limitador } = deps;
  // HSTS con la MISMA resolución de la cookie segura que usa la API (no un valor aparte que nadie pasa, EB-05).
  const entorno = deps.entorno ?? process.env;
  const cookieSegura = deps.api ? resolverDepsApi({ ...deps.api, entorno: deps.api.entorno ?? entorno }).cookieSegura : false;
  app.use(cabecerasDeSeguridad(hstsActivo(cookieSegura, deps.api?.entorno ?? entorno)));
  // K4: cuenta las respuestas por grupo de ruta y clase (2xx…5xx) para /metricas. Solo el grupo y la clase: nunca la ruta exacta ni el contenido.
  app.use((req, res, next) => {
    res.on("finish", () => contarRespuesta(req.originalUrl.split("?")[0] ?? "/", res.statusCode));
    next();
  });

  // V13-fix (verificación): `strict routing` hace que `/webhooks/twilio/entrantes/` (con barra final) deje de existir. Un proveedor, el balanceador, Prometheus o un anuncio llaman a la dirección
  // TAL CUAL se escribió en su consola, y con la barra final antes entraban (y Twilio firma esa misma dirección: la firma se calcula con `originalUrl`, que aquí no cambia). Sin esto un
  // WhatsApp entrante a una URL configurada con barra se perdía en un 404. Solo las rutas PÚBLICAS de fuera de `/api` (webhooks, salud, métricas, landing) pierden UNA barra final; `/api` y la
  // interfaz siguen exactas.
  app.use((req, _res, next) => {
    const i = req.url.search(/[?#]/);
    const ruta = i < 0 ? req.url : req.url.slice(0, i);
    if (ruta.length > 1 && ruta.endsWith("/") && !ruta.endsWith("//") && /^\/(?:webhooks|twilio|salud|metricas|l)(?:\/|$)/.test(ruta)) req.url = ruta.slice(0, -1) + (i < 0 ? "" : req.url.slice(i));
    next();
  });

  // API de la aplicación (B1-B3): sesiones, permisos y recursos. Ver src/api/index.ts y docs/API.md.
  if (deps.api) app.use("/api", crearApiRouter({ ...(limites ? { limites } : {}), ...(limitador ? { limitador } : {}), entorno, ...deps.api }));

  // `/API/…`, `/Api/…`: no son la API (el router distingue mayúsculas) ni la interfaz. Responden lo mismo que una ruta que no existe, en JSON y para cualquier método.
  app.use((req, res, next) => {
    if (!/^\/api(?:\/|$)/i.test(req.path)) {
      next();
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.status(404).json(noEncontrado("Ruta no encontrada").cuerpo());
  });

  // Landing pública (E1): sin sesión; su propia protección contra abuso (límite por IP, honeypot, tope de cuerpo) vive en src/http/landing.ts.
  if (deps.landing) app.use("/l", rutasDeLanding({ prisma: deps.landing.prisma, ...(deps.inesperados ? { inesperados: deps.inesperados } : {}), ...(deps.landing.origenesPermitidos ? { origenesPermitidos: deps.landing.origenesPermitidos } : {}), ...(deps.landing.origenesLocales !== undefined ? { origenesLocales: deps.landing.origenesLocales } : {}), ...(deps.reloj ? { reloj: deps.reloj } : {}), ...(limites ? { limites } : {}), ...(limitador ? { limitador } : {}) }));

  // K4. `/salud` (liveness): el proceso atiende. NO toca la base: una caída de la base no debe hacer que el orquestador reinicie las tareas en bucle.
  app.get("/salud", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true });
  });

  // `/salud/lista` (readiness): base, migraciones al día y barrido corriendo (503 si algo falla). Sin datos sensibles. Ver src/observabilidad/salud.ts.
  app.get("/salud/lista", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const r = await revisarListo({ pingDb: deps.pingDb, ...(deps.salud ?? {}) });
    res.status(r.listo ? 200 : 503).json({ listo: r.listo, degradado: r.degradado, comprobaciones: r.comprobaciones });
  });

  // `/metricas` (formato Prometheus): protegida por un token compartido; el balanceador no la publica (infra/alb.tf). Sin token configurado, no existe.
  app.get("/metricas", async (req, res) => {
    const m = deps.metricas;
    if (!m || !m.token) {
      res.status(404).end();
      return;
    }
    const hash = (v: string): Buffer => createHash("sha256").update(v).digest();
    if (!timingSafeEqual(hash(req.headers.authorization ?? ""), hash(`Bearer ${m.token}`))) {
      log.warn("metricas_rechazado");
      res.status(401).set("WWW-Authenticate", "Bearer").end();
      return;
    }
    try {
      res.status(200).type("text/plain; version=0.0.4; charset=utf-8").set("Cache-Control", "no-store").send(await m.texto());
    } catch (error) {
      log.error("metricas_error", { error: error instanceof Error ? error.message : String(error) });
      res.status(503).type("text/plain").send("métricas no disponibles\n");
    }
  });

  // WH (regla 5 de Eduardo): un webhook NUNCA responde 500 por un dato inesperado. Lo que lance el procesamiento se clasifica (src/webhooks/clasificar.ts): una
  // falla transitoria de infraestructura (base caída, tiempo agotado, interbloqueo) → 503 y el proveedor reintenta; todo lo demás (forma rara, tipos o
  // rangos incorrectos, texto con NUL, restricciones por datos, conversación borrada, bandeja sin aprovisionar…) se atrapa: log sin datos sensibles, UNA
  // constancia + tarea para el asesor (idempotente por evento del proveedor) y 2xx para que no reintente en bucle.
  const inesperados = deps.inesperados ?? manejadorSoloLog;

  // Webhook del Agent Bot. La firma se valida sobre el cuerpo crudo antes de parsear nada
  // (invariante 9). El procesamiento es idempotente.
  // La protección por IP (B6, EB-04) se aplica DESPUÉS de verificar la firma: los rechazos gastan un cupo
  // propio y solo lo firmado y legítimo gasta el techo; ver src/http/limite-http.ts.
  app.post("/webhooks/chatwoot", express.raw({ type: () => true, limit: LIMITE_CUERPO_CHATWOOT }), async (req, res) => {
    const cuerpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!verificarWebhookChatwoot(req, cuerpo, deps.secretoWebhookChatwoot, deps.reloj?.())) {
      const fallos = registrarFirmaInvalida(limitador, limites, "chatwoot", req);
      contarWebhook("chatwoot", fallos.permitido ? "rechazado" : "limitado");
      log.warn("webhook_chatwoot_rechazado");
      if (!fallos.permitido) rechazar429(res, fallos.reintentarEnSegundos);
      else res.status(401).json({ ok: false });
      return;
    }
    const techo = admitirWebhookValido(limitador, limites, "chatwoot", req);
    if (!techo.permitido) {
      contarWebhook("chatwoot", "limitado");
      rechazar429(res, techo.reintentarEnSegundos);
      return;
    }

    /** Responde según lo que decidió el manejador: aceptado → 200; reintentar → 503 (el proveedor repite). */
    const responder = (decision: "aceptado" | "reintentar", resultado: string): void => {
      contarWebhook("chatwoot", decision === "reintentar" ? "reintentar" : "inesperado");
      if (decision === "reintentar") res.status(503).json({ ok: false });
      else res.json({ ok: true, resultado });
    };
    /** Un evento entendido y procesado (aunque el resultado sea «ignorado» o «duplicado»). */
    const aceptar = (resultado: string): void => {
      contarWebhook("chatwoot", "aceptado");
      res.json({ ok: true, resultado });
    };

    let payload: unknown;
    try {
      payload = JSON.parse(cuerpo.toString("utf8"));
    } catch {
      responder(await inesperados.dato({ origen: "chatwoot", clave: `sha:${huella(cuerpo)}`, causa: "json_invalido", detalle: "El cuerpo no es un JSON legible", forma: formaDeBytes(cuerpo) }), "inesperado");
      return;
    }

    // Lo que el catch necesita saber para dejar la constancia: de qué evento se trata y a qué organización pertenece.
    let clave = idDeMensajeChatwoot(payload) ?? `sha:${huella(cuerpo)}`;
    const cadena = contextoChatwootDe(payload);
    const contexto: ContextoDeEvento | undefined = cadena ? { chatwoot: cadena } : undefined;
    try {
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        responder(await inesperados.dato({ origen: "chatwoot", clave, causa: "forma_inesperada", detalle: "El JSON no es un objeto", forma: formaDe(payload) }), "inesperado");
        return;
      }
      const evento = interpretarEventoChatwoot(payload);
      if (evento) {
        clave = `${evento.llave.proveedor}:${idSeguro(evento.llave.id) ?? huella(cuerpo)}`;
        const { resultado } = await deps.procesarEntrante(evento);
        aceptar(resultado);
        return;
      }
      // No es un mensaje del contacto. Puede ser que una persona tome la conversación...
      const toma = interpretarTomaDeConversacion(payload);
      if (toma) {
        clave = `sha:${huella(cuerpo)}`;
        aceptar(await deps.registrarTomaDeConversacion(toma));
        return;
      }
      // ...o que la conversación se quede sin asesor (B5)...
      const desasignacion = interpretarDesasignacion(payload);
      if (desasignacion && deps.registrarDesasignacion) {
        clave = `sha:${huella(cuerpo)}`;
        aceptar(await deps.registrarDesasignacion(desasignacion));
        return;
      }
      // ...o un cambio de estado de entrega de un saliente.
      const cambio = deps.estadosEntrega.interpretar(payload);
      if (cambio) {
        clave = `sha:${huella(cuerpo)}`;
        aceptar(await deps.registrarEstadoEntrega(cambio));
        return;
      }
      // Un mensaje entrante que no se pudo leer (faltan campos, tipos incorrectos, números fuera de rango) no se ignora en silencio: sería perder lo que
      // escribió una familia. Se deja constancia y una tarea.
      if (esMensajeEntranteIlegible(payload)) {
        responder(await inesperados.dato({ origen: "chatwoot", clave, causa: "forma_inesperada", detalle: "Un mensaje entrante no trae los campos que el sistema necesita", forma: formaDe(payload), ...(contexto ? { contexto } : {}) }), "inesperado");
        return;
      }
      aceptar("ignorado");
    } catch (error) {
      responder(await inesperados.falla({ origen: "chatwoot", clave, error, forma: formaDe(payload), ...(contexto ? { contexto } : {}) }), "inesperado");
    }
  });

  // Borde de Twilio (A7): Twilio llama aquí en lugar de a Chatwoot. Se valida la firma de Twilio
  // sobre el cuerpo CRUDO (invariante 9), se descartan los reintentos por MessageSid y se reenvía
  // el cuerpo sin modificar. Rechazos: 403 sin firma válida, 5xx si el reenvío falla (Twilio
  // reintenta). Nunca se devuelve nada interno.
  const TWIML_VACIO = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>";
  /**
   * Valida la firma de una petición de Twilio contra la URL PÚBLICA configurada (nunca contra el host que llega: detrás de un túnel el host y el esquema que ve
   * el servidor no son los que Twilio firmó). Si no cuadra, deja en el log POR QUÉ, en español y sin secretos (ensayo con WhatsApp real: la causa casi siempre
   * es una URL distinta a la configurada en la consola de Twilio). El esquema y el host que ve el servidor solo se creen si se configuró `TRUST_PROXY`.
   */
  const verificarTwilio = (req: Request, cuerpo: Buffer, ruta: string, nombreLimite: string, origen: "twilio_entrante" | "twilio_estado") => {
    const t = deps.twilio;
    const verificado = verificarWebhookTwilio(req, cuerpo, t?.authToken, t?.publicBaseUrl ? urlPublicaDe(t.publicBaseUrl, req.originalUrl) : null);
    if (t && verificado) return { t, verificado, fallos: null };
    const fallos = registrarFirmaInvalida(limitador, limites, nombreLimite, req);
    contarWebhook(origen, fallos.permitido ? "rechazado" : "limitado");
    const explicacion = explicarRechazoDeTwilio(t?.publicBaseUrl, Boolean(t?.authToken), {
      protocolo: req.protocol,
      host: req.host,
      rutaConQuery: req.originalUrl,
      confiaEnProxy: Boolean(req.app.get("trust proxy")),
      traeFirma: traeFirmaDeTwilio(req),
    });
    log.warn("webhook_twilio_rechazado", { ruta, url_esperada: explicacion.urlEsperada, url_vista: explicacion.urlVista, pistas: explicacion.pistas });
    return { t: null, verificado: null, fallos };
  };

  // Prueba del ensayo: valida la firma como cualquier webhook de Twilio y contesta 200 sin tocar nada (ni la base, ni Chatwoot). Sirve a `npm run ensayo:diagnostico`
  // para comprobar, a través del túnel, que la URL pública y el token cuadran antes de mandar un WhatsApp.
  app.post("/webhooks/twilio/diagnostico", express.raw({ type: () => true, limit: LIMITE_CUERPO_TWILIO }), (req, res) => {
    const cuerpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const r = verificarTwilio(req, cuerpo, "/webhooks/twilio/diagnostico", "twilio", "twilio_estado");
    if (!r.t) {
      if (r.fallos && !r.fallos.permitido) rechazar429(res, r.fallos.reintentarEnSegundos);
      else res.status(403).end();
      return;
    }
    res.status(200).json({ ok: true });
  });

  // `/twilio/delivery_status` es la ruta donde Chatwoot manda a Twilio que avise los estados de lo que envía (su `status_callback` sale de su FRONTEND_URL, EA-02).
  // En el ensayo esa URL es la del túnel y cae aquí: el mismo borde que `/webhooks/twilio/estados` (firma, MessageSid+estado únicos, reenvío a Chatwoot).
  for (const [ruta, tipo] of [
    ["/webhooks/twilio/entrantes", "entrante"],
    ["/webhooks/twilio/estados", "estado"],
    ["/twilio/delivery_status", "estado"],
  ] as const) {
    const nombreLimite = `twilio${tipo === "entrante" ? "" : "-estados"}`;
    const origen = tipo === "entrante" ? ("twilio_entrante" as const) : ("twilio_estado" as const);
    app.post(ruta, express.raw({ type: () => true, limit: LIMITE_CUERPO_TWILIO }), async (req, res) => {
      const cuerpo = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const { t, verificado, fallos } = verificarTwilio(req, cuerpo, ruta, nombreLimite, origen);
      if (!t || !verificado) {
        if (fallos && !fallos.permitido) rechazar429(res, fallos.reintentarEnSegundos);
        else res.status(403).end();
        return;
      }
      const techo = admitirWebhookValido(limitador, limites, nombreLimite, req);
      if (!techo.permitido) {
        contarWebhook(origen, "limitado");
        rechazar429(res, techo.reintentarEnSegundos);
        return;
      }
      const aceptado = (resultado: "aceptado" | "inesperado" = "aceptado"): void => {
        contarWebhook(origen, resultado);
        if (tipo === "entrante") res.status(200).type("text/xml").send(TWIML_VACIO);
        else res.status(200).end();
      };
      const entrada = { tipo, cuerpo, params: verificado.params, cabeceras: verificado.cabeceras };
      const contexto: ContextoDeEvento = { numeroReceptor: receptoresDe(tipo, verificado.params) };
      const sid = idSeguro(unico(verificado.params["MessageSid"]) ?? unico(verificado.params["SmsMessageSid"]) ?? unico(verificado.params["SmsSid"]));
      const clave = `${sid ?? `sha:${huella(cuerpo)}`}${tipo === "estado" ? `:${idSeguro(unico(verificado.params["MessageStatus"])) ?? ""}` : ""}`;
      try {
        const resultado = await t.borde.procesar(entrada);
        switch (resultado) {
          case "sin_identificador": {
            // Un evento sin MessageSid no se puede deduplicar ni reenviar con garantías: constancia + tarea y 2xx (Twilio no lo reintentaría con otro resultado).
            const d = await inesperados.dato({ origen, clave, causa: "sin_identificador", detalle: "El evento de Twilio no trae MessageSid", forma: formaDe(verificado.params), contexto });
            if (d === "reintentar") {
              contarWebhook(origen, "reintentar");
              res.status(503).set("Retry-After", "5").end();
            } else aceptado("inesperado");
            return;
          }
          case "en_curso":
            contarWebhook(origen, "reintentar");
            res.status(503).set("Retry-After", "5").end();
            return;
          case "fallo_reenvio":
            contarWebhook(origen, "reintentar");
            res.status(502).end();
            return;
          default:
            // reenviado, duplicado u organización desconocida: Twilio no debe reintentar.
            aceptado();
        }
      } catch (error) {
        const d = await inesperados.falla({ origen, clave, error, forma: formaDe(verificado.params), contexto });
        if (d === "reintentar") {
          contarWebhook(origen, "reintentar");
          res.status(503).set("Retry-After", "5").end();
          return;
        }
        // Un dato inesperado no debe costar el mensaje de una familia: se reenvía a Chatwoot tal cual, sin registro, y la constancia avisa a una persona.
        const reenviado = await t.borde.reenviarSinRegistro(entrada).catch(() => false);
        if (reenviado) aceptado("inesperado");
        else {
          contarWebhook(origen, "reintentar");
          res.status(502).end();
        }
      }
    });
  }

  // Interfaz web (J1): al final, para que no tape nada del backend; `/api`, `/webhooks`, `/l` y `/salud` pasan de largo (src/http/web.ts).
  if (deps.web) {
    const web = rutasDeWeb(deps.web.directorio);
    if (web) app.use(web);
    else log.warn("web_sin_build", { directorio: deps.web.directorio });
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
