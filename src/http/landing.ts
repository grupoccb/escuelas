// Rutas públicas de la landing (E1):
//
//   GET  /l/:vertical?org=&c=&s=&utm_*=   el cuestionario de esa vertical (`org` solo si el slug de la vertical se repite entre organizaciones;
//                                          `c` = código de campaña/QR, `s` = sucursal sugerida)
//   POST /l/:vertical                      el envío (application/x-www-form-urlencoded): crea el lead + prospecto, registra el aviso de privacidad y el
//                                          consentimiento, y redirige (303) a WhatsApp con el mensaje prellenado y el código de rastreo
//
// Protección contra abuso: límite de peticiones por IP (`LIMITE_LANDING_POR_MINUTO`, GET y POST), tope de cuerpo (`LIMITE_CUERPO_LANDING`),
// un campo trampa (honeypot) que solo llena un robot —se responde igual que a una persona y no se guarda nada—, validación completa en el servidor
// y respuestas iguales exista o no el lead (sin enumeración). Todo lo que se refleja va escapado y la CSP solo permite lo que la página usa
// (un script y un estilo con nonce por respuesta). Los errores no llevan nada interno.

import { randomBytes } from "node:crypto";
import express, { type NextFunction, type Request, type Response, Router } from "express";
import { origenAceptado, type PoliticaDeOrigenes } from "../api/csrf.ts";
import { LIMITE_CUERPO_LANDING } from "../api/cuerpos.ts";
import { cargarLanding, enlaceSimulado, leerParametros, registrarEnvioDeLanding, validarEnvio, type Landing } from "../captacion/landing.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import { enmascararTelefono, log } from "../lib/log.ts";
import { esEntornoLocal } from "../seguridad/entorno.ts";
import type { ConfigLimites } from "./config-limites.ts";
import { paginaDeError, paginaDeFormulario, paginaDeGracias } from "./landing-html.ts";
import { llaveDeIp, normalizarIp } from "./ip.ts";
import type { LimitadorDeTasa } from "./limite.ts";
import { formaDe, huella } from "../webhooks/forma.ts";
import { manejadorSoloLog, type ManejadorDeInesperados } from "../webhooks/inesperado.ts";

export interface DepsLanding {
  prisma: PrismaRaiz;
  /** Orígenes desde los que se acepta el envío (`ORIGEN_PUBLICO`); vacío = solo el propio host de la petición (únicamente en un entorno local). */
  origenesPermitidos?: readonly string[];
  /** Acepta también `localhost` y `127.0.0.1` (V2). Por omisión, solo fuera de producción o en la demo declarada. */
  origenesLocales?: boolean;
  reloj?: () => Date;
  limites?: ConfigLimites;
  limitador?: LimitadorDeTasa;
  /** Qué hacer con un envío que no se pudo procesar por un dato inesperado (WH). Sin él solo se clasifica y se loguea. */
  inesperados?: ManejadorDeInesperados;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/;

/**
 * EE-08: ¿el envío viene de la propia página? Un navegador siempre manda `Sec-Fetch-Site` y, en un POST, `Origin`: un formulario de OTRO sitio (o un script
 * de otra página) trae `cross-site` y su origen, y se rechaza. Sin ninguno de los dos no es un navegador (una prueba, `curl`): no se puede exigir —el límite
 * por IP es lo que lo frena—. `Origin: null` también pasa: un navegador lo manda en un POST del propio sitio cuando la página lleva `Referrer-Policy:
 * no-referrer`, que es la que tiene esta (Firefox); ahí manda `Sec-Fetch-Site`.
 */
export function origenDelEnvioAceptable(req: Pick<Request, "get">, politica: PoliticaDeOrigenes): boolean {
  if (req.get("sec-fetch-site") === "cross-site") return false;
  const origen = req.get("origin");
  if (origen === undefined || origen === "null") return true;
  return origenAceptado(origen, politica, req.get("host"));
}

/**
 * La CSP de la página. SIN `form-action` (EE-01): Chrome aplica esa directiva también a las redirecciones del envío, y el envío termina con un 303 a
 * `https://wa.me/…` (que a su vez redirige a `api.whatsapp.com`): con `form-action 'self'` el navegador bloqueaba el salto y la persona se quedaba en el
 * formulario con el botón «Enviando…» para siempre. Sin la directiva, la defensa contra un formulario inyectado es la que ya hay: nada del visitante
 * se refleja sin escapar, `default-src 'none'` y `base-uri 'none'`.
 */
function politica(res: Response, nonce: string): void {
  res.setHeader("Content-Security-Policy", `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src https:; frame-ancestors 'none'; base-uri 'none'`);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
}

export function rutasDeLanding(deps: DepsLanding): Router {
  const r = Router();
  const ahora = (): Date => deps.reloj?.() ?? new Date();

  /** Una página de error, igual para «no existe» y «es ambigua». */
  function error(res: Response, estado: number, titulo: string, mensaje: string, extra: Record<string, string> = {}): void {
    const nonce = randomBytes(16).toString("base64");
    politica(res, nonce);
    for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
    res.status(estado).send(paginaDeError(titulo, mensaje, { nonce }));
  }

  // Límite por IP, para GET y POST (el mismo perfil: `limites.landing`). Sin limitador (pruebas), no limita.
  r.use((req: Request, res: Response, next: NextFunction) => {
    if (!deps.limitador || !deps.limites) return next();
    const d = deps.limitador.consumir(`landing|${llaveDeIp(req.ip)}`, deps.limites.landing);
    if (d.permitido) return next();
    log.warn("limite_excedido", { limite: "landing" });
    error(res, 429, "Demasiadas solicitudes", "Intenta de nuevo en un momento.", { "Retry-After": String(Math.max(1, Math.ceil(d.reintentarEnSegundos))) });
  });

  /** La landing de esa URL, o responde el error y devuelve null. */
  async function landingDe(req: Request, res: Response): Promise<Landing | null> {
    const slug = typeof req.params["vertical"] === "string" ? req.params["vertical"] : "";
    const org = typeof req.query["org"] === "string" ? req.query["org"] : null;
    if (!SLUG.test(slug) || (org !== null && !SLUG.test(org))) {
      error(res, 404, "Página no encontrada", "Revisa el enlace e inténtalo de nuevo.");
      return null;
    }
    const landing = await cargarLanding(deps.prisma, slug, org, ahora());
    if (!landing) {
      error(res, 404, "Página no encontrada", "Revisa el enlace e inténtalo de nuevo.");
      return null;
    }
    if (!landing.aviso) {
      // Sin aviso de privacidad vigente no hay evidencia de consentimiento: no se recogen datos. Se responde EXACTAMENTE como a una página que no existe (EE-11):
      // un 503 distinto diría qué verticales existen.
      error(res, 404, "Página no encontrada", "Revisa el enlace e inténtalo de nuevo.");
      return null;
    }
    return landing;
  }

  const inesperados = deps.inesperados ?? manejadorSoloLog;
  /**
   * WH: lo que lance un handler nunca llega al cliente como 500. Una falla transitoria (base caída, tiempo agotado) → 503 «inténtalo en un momento»; un dato
   * inesperado (un valor que la base no guarda, una restricción…) → constancia + tarea y una página con el formulario y un mensaje general (422), sin
   * detalles. La constancia es idempotente: el mismo envío repetido deja UNA.
   */
  const seguro =
    (origenOperacion: "get" | "post", manejar: (req: Request, res: Response, saber: (l: Landing) => void) => Promise<void>) =>
    async (req: Request, res: Response): Promise<void> => {
      const visto: { landing: Landing | null } = { landing: null };
      try {
        await manejar(req, res, (l) => {
          visto.landing = l;
        });
      } catch (fallo) {
        if (res.headersSent) return;
        const cuerpo = (req.body ?? {}) as Record<string, unknown>;
        const clave = `${origenOperacion}:${huella(JSON.stringify([req.params["vertical"], Object.entries(cuerpo).sort(([a], [b]) => a.localeCompare(b)), req.query]))}`;
        const decision = await inesperados.falla({
          origen: "landing",
          clave,
          error: fallo,
          forma: formaDe({ cuerpo, consulta: req.query }),
          ...(visto.landing ? { contexto: { organizacionId: visto.landing.organizacionId } } : {}),
        });
        if (decision === "reintentar") {
          error(res, 503, "No disponible por ahora", "Intenta de nuevo en un momento.", { "Retry-After": "10" });
          return;
        }
        if (!visto.landing) {
          error(res, 404, "Página no encontrada", "Revisa el enlace e inténtalo de nuevo.");
          return;
        }
        let parametros: ReturnType<typeof leerParametros> = leerParametros({});
        try {
          parametros = leerParametros({ ...req.query, ...cuerpo });
        } catch {
          // parámetros ilegibles: el formulario se repinta sin ellos
        }
        const nonce = randomBytes(16).toString("base64");
        politica(res, nonce);
        res.status(422).send(paginaDeFormulario(visto.landing, parametros, { nonce }, { campos: {}, general: "No pudimos registrar tu solicitud. Escríbenos por WhatsApp o inténtalo de nuevo más tarde." }, {}));
      }
    };

  r.get("/:vertical", seguro("get", async (req: Request, res: Response, saber) => {
    const landing = await landingDe(req, res);
    if (!landing) return;
    saber(landing);
    const nonce = randomBytes(16).toString("base64");
    politica(res, nonce);
    res.status(200).send(paginaDeFormulario(landing, leerParametros(req.query), { nonce }));
  }));

  // EE-08: un envío que no viene de esta página se rechaza antes de leer el cuerpo y sin tocar la base.
  const soloDeEstaPagina = (req: Request, res: Response, next: NextFunction): void => {
    if (origenDelEnvioAceptable(req, { exactos: deps.origenesPermitidos ?? [], locales: deps.origenesLocales ?? esEntornoLocal(process.env) })) return next();
    log.warn("landing_origen_rechazado", { sitio: req.get("sec-fetch-site") ?? null });
    error(res, 403, "No se pudo enviar", "Envía el formulario desde la página de la escuela.");
  };

  r.post("/:vertical", soloDeEstaPagina, express.urlencoded({ extended: false, limit: LIMITE_CUERPO_LANDING, parameterLimit: 40 }), seguro("post", async (req: Request, res: Response, saber) => {
    const landing = await landingDe(req, res);
    if (!landing) return;
    saber(landing);
    const cuerpo = (req.body ?? {}) as Record<string, unknown>;
    // Los parámetros opcionales (campaña, utm) viajan en campos ocultos del formulario o en la URL.
    const parametros = leerParametros({ ...req.query, ...cuerpo });
    const nonce = randomBytes(16).toString("base64");

    // Honeypot: solo un robot llena el campo trampa. Se le responde EXACTAMENTE como a un envío bueno (303 a WhatsApp con un código que no existe, o la
    // página de gracias si la vertical no tiene número) y no se guarda nada (EE-10): no hay forma de distinguir la trampa de un éxito.
    if (typeof cuerpo["sitio_web"] === "string" && cuerpo["sitio_web"] !== "") {
      log.info("landing_trampa", { vertical: landing.verticalId });
      const enlace = await enlaceSimulado(deps.prisma, landing);
      if (enlace) {
        res.setHeader("Cache-Control", "no-store");
        res.redirect(303, enlace);
        return;
      }
      politica(res, nonce);
      res.status(200).send(paginaDeGracias(landing, { nonce }));
      return;
    }

    const validacion = validarEnvio(cuerpo, landing);
    if (!validacion.ok) {
      politica(res, nonce);
      const valores = {
        ...(typeof cuerpo["nombre_alumno"] === "string" ? { nombre_alumno: cuerpo["nombre_alumno"].slice(0, 200) } : {}),
        ...(typeof cuerpo["edad"] === "string" ? { edad: cuerpo["edad"].slice(0, 10) } : {}),
        ...(typeof cuerpo["sucursal_id"] === "string" ? { sucursal_id: cuerpo["sucursal_id"].slice(0, 60) } : {}),
        ...(typeof cuerpo["telefono"] === "string" ? { telefono: cuerpo["telefono"].slice(0, 40) } : {}),
        ...(typeof cuerpo["nombre_contacto"] === "string" ? { nombre_contacto: cuerpo["nombre_contacto"].slice(0, 200) } : {}),
      };
      res.status(422).send(paginaDeFormulario(landing, parametros, { nonce }, validacion.errores, valores));
      return;
    }

    const r2 = await registrarEnvioDeLanding(deps.prisma, landing, validacion.datos, parametros, { ip: normalizarIp(req.ip), agenteUsuario: (req.get("user-agent") ?? "").slice(0, 300) || null }, ahora());
    if (!r2.ok) {
      politica(res, nonce);
      const general = r2.motivo === "aviso_cambio" ? "El aviso de privacidad cambió. Léelo de nuevo y vuelve a enviar el formulario." : "Esta página no está disponible por ahora.";
      res.status(r2.motivo === "aviso_cambio" ? 409 : 503).send(paginaDeFormulario(landing, parametros, { nonce }, { campos: {}, general }, {}));
      return;
    }
    log.info("landing_envio", { vertical: landing.verticalId, lead: r2.leadId, telefono: enmascararTelefono(validacion.datos.telefono) });
    if (r2.enlace) {
      res.setHeader("Cache-Control", "no-store");
      res.redirect(303, r2.enlace);
      return;
    }
    politica(res, nonce);
    res.status(200).send(paginaDeGracias(landing, { nonce }));
  }));

  return r;
}
