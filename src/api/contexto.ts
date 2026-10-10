// Lo que cada petición autenticada lleva consigo: quién es, de qué organización y su `db` ya con el
// alcance de esa organización (invariante 1). Los handlers leen el contexto con `contextoDe(res)` y
// NO abren su propio alcance.

import type { Request, Response } from "express";
import { conAlcance, type BaseDatos } from "../datos/alcance.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import type { DepsAcceso } from "../auth/acceso.ts";
import type { UsuarioDeSesion } from "../auth/sesiones.ts";
import { normalizarIp } from "../http/ip.ts";
import type { FuenteOcupacion } from "../catalogo/cupo.ts";
import type { ProveedoresDelExpediente } from "../expediente/proveedores.ts";
import type { DirectorioAgentes } from "../mensajeria/index.ts";
import type { OpcionesSensibles } from "../sensibles/index.ts";
import { alcanceDeCatalogo, alcanceDeSucursales, type AlcanceDeSucursales } from "./alcance.ts";

/** Dependencias de la API ya resueltas (con sus valores por defecto). */
export interface DepsApi {
  prisma: PrismaRaiz;
  reloj: () => Date;
  acceso: DepsAcceso;
  cookieSegura: boolean;
  origenesPermitidos: string[];
  /** V2: true en un entorno local (desarrollo, pruebas o la demo): se aceptan además `localhost` y `127.0.0.1`. En producción, false: solo `origenesPermitidos`. */
  origenesLocales: boolean;
  /** Cifrador y regla del maestro para los datos de salud (los tests inyectan los suyos). */
  sensibles: OpcionesSensibles;
  /** Agentes de Chatwoot. Nulo = no configurado. */
  directorio: DirectorioAgentes | null;
  /**
   * De dónde salen los lugares ocupados de un grupo (cotizador, lista de espera). Por omisión cuenta las
   * inscripciones activas (`InscripcionesActivas`, F4).
   */
  fuenteOcupacion: FuenteOcupacion;
  /** Los enchufes del expediente del alumno hacia finanzas y productos (G5): por omisión, las implementaciones nulas documentadas. */
  expediente: ProveedoresDelExpediente;
  /** URL pública de Chatwoot (sin barra final) para armar el enlace a una conversación desde la interfaz (J3). Nulo = no configurada. */
  chatwootUrlPublica: string | null;
  /** V13-fix (EV-36): cuántas filas como máximo se revisan en una búsqueda por nombre de familias o alumnos. Más allá, la respuesta dice que la búsqueda quedó incompleta. */
  topeDeBusquedaPorNombre: number;
}

export interface ContextoApi {
  usuario: UsuarioDeSesion;
  sesionId: string;
  organizacionId: string;
  /** Cliente de base de datos con el alcance de la organización del usuario. */
  db: BaseDatos;
  ip: string;
  ahora(): Date;
  /** Sucursales que ve el usuario (se consulta una vez por petición). */
  alcance(): Promise<AlcanceDeSucursales>;
  /** Sucursales cuyo catálogo ve el usuario (el maestro ve donde da clases). Una consulta por petición. */
  alcanceCatalogo(): Promise<AlcanceDeSucursales>;
  /**
   * ¿La ruta declaró su acceso (`requierePermiso` o `soloSesion`)? Mientras no, `contextoDe` se niega
   * a entregar el contexto: una ruta sin declaración falla con 500 en vez de operar (EB-09).
   */
  accesoDeclarado: boolean;
}

const LLAVE = "contexto";

export function fijarContexto(res: Response, req: Request, deps: DepsApi, usuario: UsuarioDeSesion, sesionId: string): ContextoApi {
  const db = conAlcance(deps.prisma, usuario.organizacionId);
  let alcance: Promise<AlcanceDeSucursales> | undefined;
  let alcanceCatalogo: Promise<AlcanceDeSucursales> | undefined;
  const ctx: ContextoApi = {
    usuario,
    sesionId,
    organizacionId: usuario.organizacionId,
    db,
    ip: normalizarIp(req.ip),
    ahora: deps.reloj,
    alcance: () => (alcance ??= alcanceDeSucursales(db, usuario)),
    alcanceCatalogo: () => (alcanceCatalogo ??= alcanceDeCatalogo(db, usuario)),
    accesoDeclarado: false,
  };
  res.locals[LLAVE] = ctx;
  return ctx;
}

/**
 * El contexto SIN exigir la declaración de acceso. Solo para `src/api/autorizar.ts`, que es quien
 * la hace; las rutas usan `contextoDe`.
 */
export function contextoParaAutorizar(res: Response): ContextoApi {
  const ctx = res.locals[LLAVE] as ContextoApi | undefined;
  if (!ctx) throw new Error("contextoParaAutorizar() en una ruta sin autenticar");
  return ctx;
}

/**
 * El contexto de la petición. Lanza (500) si la ruta no pasó por `autenticar` o NO declaró su acceso
 * con `requierePermiso(...)` / `soloSesion()`: denegar por omisión (EB-09). Es un error de
 * programación, no del usuario.
 */
export function contextoDe(res: Response): ContextoApi {
  const ctx = contextoParaAutorizar(res);
  if (!ctx.accesoDeclarado) throw new Error("Ruta sin acceso declarado: usa requierePermiso(…) o soloSesion() (EB-09)");
  return ctx;
}
