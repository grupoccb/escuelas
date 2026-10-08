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
import { LIMITE_CUERPO_LANDING } from "../api/cuerpos.ts";
import { cargarLanding, leerParametros, registrarEnvioDeLanding, validarEnvio, type Landing } from "../captacion/landing.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import { enmascararTelefono, log } from "../lib/log.ts";
import type { ConfigLimites } from "./config-limites.ts";
import { paginaDeError, paginaDeFormulario, paginaDeGracias } from "./landing-html.ts";
import { llaveDeIp, normalizarIp } from "./ip.ts";
import type { LimitadorDeTasa } from "./limite.ts";

export interface DepsLanding {
  prisma: PrismaRaiz;
  reloj?: () => Date;
  limites?: ConfigLimites;
  limitador?: LimitadorDeTasa;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/;

function politica(res: Response, nonce: string): void {
  res.setHeader("Content-Security-Policy", `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src https:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`);
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
      // Sin aviso de privacidad vigente no hay evidencia de consentimiento: no se recogen datos.
      error(res, 503, "No disponible por ahora", "Esta página no está disponible en este momento. Inténtalo más tarde.");
      return null;
    }
    return landing;
  }

  r.get("/:vertical", async (req: Request, res: Response) => {
    const landing = await landingDe(req, res);
    if (!landing) return;
    const nonce = randomBytes(16).toString("base64");
    politica(res, nonce);
    res.status(200).send(paginaDeFormulario(landing, leerParametros(req.query), { nonce }));
  });

  r.post("/:vertical", express.urlencoded({ extended: false, limit: LIMITE_CUERPO_LANDING, parameterLimit: 40 }), async (req: Request, res: Response) => {
    const landing = await landingDe(req, res);
    if (!landing) return;
    const cuerpo = (req.body ?? {}) as Record<string, unknown>;
    // Los parámetros opcionales (campaña, utm) viajan en campos ocultos del formulario o en la URL.
    const parametros = leerParametros({ ...req.query, ...cuerpo });
    const nonce = randomBytes(16).toString("base64");

    // Honeypot: solo un robot llena el campo trampa. Se le responde como a cualquiera y no se guarda nada.
    if (typeof cuerpo["sitio_web"] === "string" && cuerpo["sitio_web"] !== "") {
      log.info("landing_trampa", { vertical: landing.verticalId });
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
  });

  return r;
}
