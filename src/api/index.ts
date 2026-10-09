// Montaje único de la API: `crearApiRouter()` devuelve el router que `crearApp` monta en /api.
// Todo recurso nuevo se agrega aquí (ver docs/API.md, "Cómo agregar un recurso").
//
// Orden (importa):
//   1. cabeceras de API y protección CSRF para todo /api;
//   2. rutas públicas: iniciar y cerrar sesión;
//   3. a partir de aquí TODO exige sesión (`autenticar`, UNA vez, aquí), luego la guarda de módulos (V1: módulo apagado = 404) y cada ruta DEBE declarar su
//      acceso con `requierePermiso(…)` o `soloSesion()`: sin declaración `contextoDe` falla (denegar
//      por omisión, EB-09). `rutas.test.ts` recorre el router real y compara con una tabla escrita a mano;
//   4. 404 en JSON para rutas desconocidas, y el manejador de errores de la convención.

import { Router } from "express";
import { BLOQUEO_POR_DEFECTO, type ConfigBloqueo } from "../auth/acceso.ts";
import { PARAMETROS_POR_DEFECTO, type ParametrosScrypt } from "../auth/contrasena.ts";
import { configSesionDesdeEntorno, type ConfigSesion } from "../auth/sesiones.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import type { ConfigLimites } from "../http/config-limites.ts";
import type { LimitadorDeTasa } from "../http/limite.ts";
import { limitarApiPorIp } from "../http/limite-http.ts";
import { autenticar } from "./autenticar.ts";
import { cabecerasDeApi } from "./cabeceras.ts";
import type { DepsApi } from "./contexto.ts";
import { cookieSeguraDesdeEntorno } from "./cookies.ts";
import { origenesPermitidosDesdeEntorno, proteccionCsrf } from "./csrf.ts";
import { noEncontrado } from "./errores.ts";
import { guardaDeModulos } from "./modulos-rutas.ts";
import { manejadorDeErroresApi } from "./errores-http.ts";
import { rutasDeAutomatizaciones } from "./rutas/automatizaciones.ts";
import { rutasDeCanales } from "./rutas/canales.ts";
import { rutasDeConfiguracion } from "./rutas/configuracion.ts";
import { rutasDeGrupos } from "./rutas/grupos.ts";
import { rutasDeModulos } from "./rutas/modulos.ts";
import { rutasDeEventosInesperados } from "./rutas/eventos-inesperados.ts";
import { rutasDePlantillas } from "./rutas/plantillas.ts";
import { rutasDeProgramas } from "./rutas/programas.ts";
import { rutasDeSucursales } from "./rutas/sucursales.ts";
import { rutasDeVerticales } from "./rutas/verticales.ts";
import { rutasDeInstructores } from "./rutas/instructores.ts";
import { rutasDeSalones } from "./rutas/salones.ts";
import { InscripcionesActivas, type FuenteOcupacion } from "../catalogo/cupo.ts";
import { PROVEEDORES_NULOS, type ProveedoresDelExpediente } from "../expediente/proveedores.ts";
import { urlPublicaDeChatwoot, type DirectorioAgentes } from "../mensajeria/index.ts";
import type { OpcionesSensibles } from "../sensibles/index.ts";
import { rutasDeAsistencia } from "./rutas/asistencia.ts";
import { rutasDeCampanas } from "./rutas/campanas.ts";
import { rutasDeEventos } from "./rutas/eventos.ts";
import { rutasDeExpediente } from "./rutas/expediente.ts";
import { rutasDeNiveles } from "./rutas/niveles.ts";
import { rutasDeProgresion } from "./rutas/progresion.ts";
import { rutasDeCargos } from "./rutas/finanzas-cargos.ts";
import { rutasDePagos } from "./rutas/finanzas-pagos.ts";
import { rutasDeProductos } from "./rutas/finanzas-productos.ts";
import { rutasDeReporteDeClasesMuestra } from "./rutas/reportes-clases-muestra.ts";
import { rutasDeCostoPorCampana } from "./rutas/reportes-costos.ts";
import { rutasDeReporteEjecutivo } from "./rutas/reportes-ejecutivo.ts";
import { rutasDeExportaciones } from "./rutas/reportes-exportaciones.ts";
import { rutasDeBeneficios } from "./rutas/finanzas-beneficios.ts";
import { rutasDeEstadoDeCuenta } from "./rutas/finanzas-cuenta.ts";
import { rutasDeCierre } from "./rutas/cierre.ts";
import { rutasDeClasesMuestra } from "./rutas/clases-muestra.ts";
import { rutasDeCotizaciones } from "./rutas/cotizaciones.ts";
import { rutasDeCotizador } from "./rutas/cotizador.ts";
import { rutasDeEmbudo } from "./rutas/embudo.ts";
import { rutasDeFamilias } from "./rutas/familias.ts";
import { rutasDeInscripciones } from "./rutas/inscripciones.ts";
import { rutasDeConversaciones } from "./rutas/conversaciones.ts";
import { rutasDeConversion } from "./rutas/conversion.ts";
import { rutasDeInterfaz } from "./rutas/interfaz.ts";
import { rutasDeLeads } from "./rutas/leads.ts";
import { rutasDeMotivosBaja } from "./rutas/motivos-baja.ts";
import { rutasDeLegal } from "./rutas/legal.ts";
import { rutasDeListaEspera } from "./rutas/lista-espera.ts";
import { rutasDelMaestro } from "./rutas/maestro.ts";
import { rutasDePrecios } from "./rutas/precios.ts";
import { rutasDePromociones } from "./rutas/promociones.ts";
import { rutasDeRegistroCambios } from "./rutas/registro-cambios.ts";
import { rutasDeRegistroMuestra } from "./rutas/registro-muestra.ts";
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
  /** Variables de entorno de las que salen los valores por omisión (cookie segura, orígenes). Por omisión `process.env`. */
  entorno?: NodeJS.ProcessEnv;
  /** Orígenes que pueden hacer peticiones que cambian algo. Vacío = solo el propio host. */
  origenesPermitidos?: string[];
  /** Cifrado y regla del maestro de los datos de salud. Por omisión: clave del entorno y maestro sin acceso. */
  sensibles?: OpcionesSensibles;
  /** Agentes de Chatwoot (null = no configurado). Por omisión: ninguno. */
  directorio?: DirectorioAgentes | null;
  /** Límites por IP (B6). Sin ellos la API no limita. */
  limites?: ConfigLimites;
  limitador?: LimitadorDeTasa;
  /** Lugares ocupados por grupo. Por omisión, las inscripciones activas (`InscripcionesActivas`, F4). */
  fuenteOcupacion?: FuenteOcupacion;
  /** Estado de cuenta y productos del expediente (G5). Por omisión nulos hasta que la etapa H los enchufe. */
  expediente?: Partial<ProveedoresDelExpediente>;
}

export function resolverDepsApi(e: ApiDepsEntrada): DepsApi {
  const reloj = e.reloj ?? (() => new Date());
  const sesion = e.sesion ?? configSesionDesdeEntorno(e.entorno);
  return {
    prisma: e.prisma,
    reloj,
    acceso: { prisma: e.prisma, reloj, sesion, bloqueo: e.bloqueo ?? BLOQUEO_POR_DEFECTO, parametrosHash: e.parametrosHash ?? PARAMETROS_POR_DEFECTO },
    cookieSegura: e.cookieSegura ?? cookieSeguraDesdeEntorno(e.entorno),
    origenesPermitidos: e.origenesPermitidos ?? origenesPermitidosDesdeEntorno(e.entorno),
    sensibles: e.sensibles ?? {},
    directorio: e.directorio ?? null,
    fuenteOcupacion: e.fuenteOcupacion ?? new InscripcionesActivas(),
    expediente: { ...PROVEEDORES_NULOS, ...e.expediente },
    chatwootUrlPublica: urlPublicaDeChatwoot(e.entorno ?? process.env),
  };
}

export function crearApiRouter(entrada: ApiDepsEntrada): Router {
  const deps = resolverDepsApi(entrada);
  const api = Router();

  api.use(cabecerasDeApi);
  const { limites, limitador } = entrada;
  // Primero el límite general por IP (también frena a quien manda sesiones inventadas)...
  if (limites && limitador) api.use(limitarApiPorIp(limitador, "api", limites.api));
  api.use(proteccionCsrf(deps.origenesPermitidos));

  // ...y el del login, más estricto, solo para iniciar sesión.
  api.use(rutasPublicasDeSesion(deps, limites && limitador ? [limitarApiPorIp(limitador, "login", limites.login)] : []));

  // Desde aquí, todo con sesión. Una ruta nueva montada después queda autenticada sin que nadie lo recuerde.
  api.use(autenticar(deps));
  // V1: un módulo apagado en la organización del usuario hace que SUS rutas respondan 404 (como una que no existe), para todos los roles. Antes de cualquier ruta.
  api.use(guardaDeModulos());
  api.use(rutasDeSesionPropia(deps));
  api.use(rutasDeUsuarios(deps));
  api.use(rutasDeGrupos(deps));
  api.use(rutasDeVerticales(deps));
  api.use(rutasDeSucursales(deps));
  api.use(rutasDeProgramas(deps));
  api.use(rutasDeCanales(deps));
  api.use(rutasDeConfiguracion(deps));
  api.use(rutasDeModulos(deps));
  api.use(rutasDePlantillas(deps));
  api.use(rutasDeAutomatizaciones(deps));
  api.use(rutasDeEventosInesperados(deps));
  api.use(rutasDeSalones(deps));
  api.use(rutasDeInstructores(deps));
  api.use(rutasDePrecios(deps));
  api.use(rutasDePromociones(deps));
  api.use(rutasDeCotizador(deps));
  api.use(rutasDeCampanas(deps));
  api.use(rutasDeTareas(deps));
  // El embudo va ANTES que los leads: `/leads/estancados` no puede caer en `/leads/:id`.
  api.use(rutasDeEmbudo(deps));
  api.use(rutasDeConversion(deps));
  api.use(rutasDeLeads(deps));
  api.use(rutasDeCotizaciones(deps));
  api.use(rutasDeInterfaz(deps));
  api.use(rutasDeListaEspera(deps));
  api.use(rutasDeClasesMuestra(deps));
  api.use(rutasDeCierre(deps));
  api.use(rutasDeRegistroMuestra(deps));
  api.use(rutasDeLegal(deps));
  api.use(rutasDelMaestro(deps));
  api.use(rutasDeFamilias(deps));
  api.use(rutasDeInscripciones(deps));
  api.use(rutasDeCargos(deps));
  api.use(rutasDePagos(deps));
  api.use(rutasDeProductos(deps));
  api.use(rutasDeReporteDeClasesMuestra(deps));
  api.use(rutasDeCostoPorCampana(deps));
  api.use(rutasDeReporteEjecutivo(deps));
  api.use(rutasDeExportaciones(deps));
  api.use(rutasDeBeneficios(deps));
  api.use(rutasDeEstadoDeCuenta(deps));
  api.use(rutasDeAsistencia(deps));
  api.use(rutasDeNiveles(deps));
  api.use(rutasDeProgresion(deps));
  api.use(rutasDeEventos(deps));
  api.use(rutasDeExpediente(deps));
  api.use(rutasDeMotivosBaja(deps));
  api.use(rutasDeConversaciones(deps));
  api.use(rutasDeRegistroCambios(deps));
  api.use(rutasDeSalud(deps));

  // Cualquier otra ruta de /api: 404 con la convención.
  api.use(() => {
    throw noEncontrado("Ruta no encontrada");
  });
  api.use(manejadorDeErroresApi);
  return api;
}

