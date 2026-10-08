// Montaje único de la API: `crearApiRouter()` devuelve el router que `crearApp` monta en /api.
// Todo recurso nuevo se agrega aquí (ver docs/API.md, "Cómo agregar un recurso").
//
// Orden (importa):
//   1. cabeceras de API y protección CSRF para todo /api;
//   2. rutas públicas: iniciar y cerrar sesión;
//   3. a partir de aquí TODO exige sesión (`autenticar`) y cada ruta declara su permiso;
//   4. 404 en JSON para rutas desconocidas, y el manejador de errores de la convención.

import { Router } from "express";
import { BLOQUEO_POR_DEFECTO, type ConfigBloqueo } from "../auth/acceso.ts";
import { PARAMETROS_POR_DEFECTO, type ParametrosScrypt } from "../auth/contrasena.ts";
import { configSesionDesdeEntorno, type ConfigSesion } from "../auth/sesiones.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import { cabecerasDeApi } from "./cabeceras.ts";
import type { DepsApi } from "./contexto.ts";
import { cookieSeguraDesdeEntorno } from "./cookies.ts";
import { origenesPermitidosDesdeEntorno, proteccionCsrf } from "./csrf.ts";
import { noEncontrado } from "./errores.ts";
import { manejadorDeErroresApi } from "./errores-http.ts";
import { rutasDeGrupos } from "./rutas/grupos.ts";
import type { OpcionesSensibles } from "../sensibles/index.ts";
import { rutasDeLeads } from "./rutas/leads.ts";
import { rutasDeRegistroCambios } from "./rutas/registro-cambios.ts";
import { rutasDeSalud } from "./rutas/salud.ts";
import { rutasDeSesionPropia, rutasPublicasDeSesion } from "./rutas/sesion.ts";
import { rutasDeTareas } from "./rutas/tareas.ts";
import { rutasDeUsuarios } from "./rutas/usuarios.ts";

export interface ApiDepsEntrada {
  prisma: PrismaRaiz;
  reloj?: () => Date;
  sesion?: ConfigSesion;
  bloqueo?: ConfigBloqueo;
  /** Parámetros de scrypt para contraseñas NUEVAS. Los tests pasan los baratos. */
  parametrosHash?: ParametrosScrypt;
  cookieSegura?: boolean;
  /** Orígenes que pueden hacer peticiones que cambian algo. Vacío = solo el propio host. */
  origenesPermitidos?: string[];
  /** Cifrado y regla del maestro de los datos de salud. Por omisión: clave del entorno y maestro sin acceso. */
  sensibles?: OpcionesSensibles;
}

export function resolverDepsApi(e: ApiDepsEntrada): DepsApi {
  const reloj = e.reloj ?? (() => new Date());
  const sesion = e.sesion ?? configSesionDesdeEntorno();
  return {
    prisma: e.prisma,
    reloj,
    acceso: { prisma: e.prisma, reloj, sesion, bloqueo: e.bloqueo ?? BLOQUEO_POR_DEFECTO, parametrosHash: e.parametrosHash ?? PARAMETROS_POR_DEFECTO },
    cookieSegura: e.cookieSegura ?? cookieSeguraDesdeEntorno(),
    origenesPermitidos: e.origenesPermitidos ?? origenesPermitidosDesdeEntorno(),
    sensibles: e.sensibles ?? {},
  };
}

export function crearApiRouter(entrada: ApiDepsEntrada): Router {
  const deps = resolverDepsApi(entrada);
  const api = Router();

  api.use(cabecerasDeApi);
  api.use(proteccionCsrf(deps.origenesPermitidos));

  api.use(rutasPublicasDeSesion(deps));

  api.use(rutasDeSesionPropia(deps));
  api.use(rutasDeUsuarios(deps));
  api.use(rutasDeGrupos(deps));
  api.use(rutasDeTareas(deps));
  api.use(rutasDeLeads(deps));
  api.use(rutasDeRegistroCambios(deps));
  api.use(rutasDeSalud(deps));

  // Cualquier otra ruta de /api: 404 con la convención.
  api.use(() => {
    throw noEncontrado("Ruta no encontrada");
  });
  api.use(manejadorDeErroresApi);
  return api;
}

