// Sesión: iniciar, cerrar, quién soy y cambiar la contraseña.
//
//   POST   /api/sesion          { organizacion?, correo, contrasena }   → 201 + cookie
//   DELETE /api/sesion                                                  → 204 (borra la cookie; exige el encabezado anti-CSRF como toda escritura)
//   GET    /api/yo                                                      → el usuario de la sesión, sus permisos y los módulos encendidos de su organización
//   POST   /api/yo/contrasena   { actual, nueva }                       → 204; cierra las demás sesiones

import { type Router, type Request, type Response } from "express";
import { crearRouter } from "../../http/enrutador.ts";
import express from "express";
import { ErrorBloqueado, ErrorContrasenaDebil, ErrorCredenciales, cambiarContrasena, iniciarSesion } from "../../auth/acceso.ts";
import { revocarSesion, validarSesion } from "../../auth/sesiones.ts";
import { conAlcance } from "../../datos/alcance.ts";
import { borrarCookieSesion, fijarCookieSesion, leerCookie, nombreCookieSesion } from "../cookies.ts";
import { contextoDe, type DepsApi } from "../contexto.ts";
import { ErrorApi, demasiadasPeticiones, validacion } from "../errores.ts";
import { correo, objeto, opcional, parsear, texto, textoLiteral } from "../validar.ts";
import { normalizarIp } from "../../http/ip.ts";
import { soloSesion } from "../autorizar.ts";
import { permisosEfectivos } from "../modulos-rutas.ts";
import { registrarCambio } from "../registro.ts";
import { LIMITE_CUERPO_LOGIN } from "../cuerpos.ts";
import { leerConfiguracion } from "../../configuracion/index.ts";
import { leerModulos, tiposDeTareaApagados } from "../../modulos/index.ts";

const esquemaLogin = objeto({
  organizacion: opcional(texto({ max: 63, minusculas: true })),
  correo: correo(),
  contrasena: textoLiteral({ max: 1024 }),
});

const esquemaCambio = objeto({
  actual: textoLiteral({ max: 1024 }),
  nueva: textoLiteral({ max: 1024 }),
});

/** Rutas públicas (sin sesión): iniciar y cerrar. */
export function rutasPublicasDeSesion(deps: DepsApi, antesDeLogin: express.RequestHandler[] = []): Router {
  const r = crearRouter();

  r.post("/sesion", ...antesDeLogin, express.json({ limit: LIMITE_CUERPO_LOGIN }), async (req: Request, res: Response) => {
    const entrada = parsear(esquemaLogin, req.body);
    try {
      const r = await iniciarSesion(deps.acceso, {
        organizacion: entrada.organizacion,
        correo: entrada.correo,
        contrasena: entrada.contrasena,
        ip: normalizarIp(req.ip),
        agente: req.get("user-agent") ?? null,
      });
      fijarCookieSesion(res, r.token, r.expiraEn, deps.cookieSegura);
      res.status(201).json({
        usuario: { id: r.usuario.id, correo: r.usuario.correo, nombre: r.usuario.nombre, rol: r.usuario.rol },
        sesion: { expira_en: r.expiraEn.toISOString() },
      });
    } catch (e) {
      if (e instanceof ErrorCredenciales) throw new ErrorApi("no_autenticado", e.message);
      if (e instanceof ErrorBloqueado) throw demasiadasPeticiones(e.reintentarEnSegundos, e.message);
      throw e;
    }
  });

  r.delete("/sesion", async (req: Request, res: Response) => {
    // Cerrar sesión nunca falla: sin cookie, o con una vencida, simplemente no hay nada que cerrar.
    const token = leerCookie(req, nombreCookieSesion(deps.cookieSegura));
    const sesion = token ? await validarSesion(deps.prisma, token, deps.acceso.sesion, deps.reloj()) : null;
    if (sesion) await revocarSesion(conAlcance(deps.prisma, sesion.usuario.organizacionId), sesion.sesionId, deps.reloj());
    borrarCookieSesion(res, deps.cookieSegura);
    res.status(204).end();
  });

  return r;
}

/** Rutas del usuario en sesión. */
export function rutasDeSesionPropia(deps: DepsApi): Router {
  const r = crearRouter();
  const dentro = soloSesion();

  r.get("/yo", dentro, async (_req, res) => {
    const ctx = contextoDe(res);
    const organizacion = await ctx.db.organizacion.findFirst({ where: {}, select: { id: true, nombre: true, slug: true } });
    const alcance = await ctx.alcance();
    const sucursales = await ctx.db.sucursal.findMany({
      where: alcance.todas ? {} : { id: { in: alcance.sucursalIds } },
      select: { id: true, nombre: true },
      orderBy: [{ nombre: "asc" }, { id: "asc" }],
    });
    const modulos = await leerModulos(ctx.db);
    res.json({
      usuario: { id: ctx.usuario.id, correo: ctx.usuario.correo, nombre: ctx.usuario.nombre, rol: ctx.usuario.rol },
      organizacion,
      sucursales,
      // V1: los permisos EFECTIVOS: los del rol menos los de los módulos apagados (así la interfaz no muestra nada de lo que no está encendido).
      permisos: permisosEfectivos(ctx.usuario.rol, modulos),
      // J1: lo que la interfaz necesita para armarse sin pedir más (quién cierra la inscripción y dónde está Chatwoot).
      configuracion: { modo_cierre: (await leerConfiguracion(ctx.db)).modoCierre, chatwoot_url_publica: deps.chatwootUrlPublica },
      // V1: los módulos encendidos de la organización. La interfaz oculta lo apagado y no pide nada de ello.
      modulos,
      // V13-fix (EV-15): los tipos de tarea cuyo módulo está apagado (la interfaz no los ofrece en el filtro de tareas).
      tipos_de_tarea_apagados: tiposDeTareaApagados(modulos),
    });
  });

  r.post("/yo/contrasena", dentro, express.json({ limit: LIMITE_CUERPO_LOGIN }), async (req, res) => {
    const ctx = contextoDe(res);
    const entrada = parsear(esquemaCambio, req.body);
    try {
      await cambiarContrasena(deps.acceso, {
        usuarioId: ctx.usuario.id,
        organizacionId: ctx.organizacionId,
        sesionActualId: ctx.sesionId,
        actual: entrada.actual,
        nueva: entrada.nueva,
        ip: ctx.ip,
      });
    } catch (e) {
      if (e instanceof ErrorCredenciales) throw validacion([{ campo: "actual", mensaje: "La contraseña actual no es correcta" }]);
      if (e instanceof ErrorBloqueado) throw demasiadasPeticiones(e.reintentarEnSegundos, e.message);
      if (e instanceof ErrorContrasenaDebil) throw validacion(e.problemas.map((mensaje) => ({ campo: "nueva", mensaje })));
      throw e;
    }
    await ctx.db.$transaction((tx) => registrarCambio(tx, ctx, { entidad: "usuario", entidadId: ctx.usuario.id, accion: "cambiar_contrasena" }));
    res.status(204).end();
  });

  return r;
}

