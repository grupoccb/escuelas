// Lo que cada petición autenticada lleva consigo: quién es, de qué organización y su `db` ya con el
// alcance de esa organización (invariante 1). Los handlers leen el contexto con `contextoDe(res)` y
// NO abren su propio alcance.

import type { Request, Response } from "express";
import { conAlcance, type BaseDatos } from "../datos/alcance.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import type { DepsAcceso } from "../auth/acceso.ts";
import type { UsuarioDeSesion } from "../auth/sesiones.ts";
import { normalizarIp } from "../http/ip.ts";

/** Dependencias de la API ya resueltas (con sus valores por defecto). */
export interface DepsApi {
  prisma: PrismaRaiz;
  reloj: () => Date;
  acceso: DepsAcceso;
  cookieSegura: boolean;
  origenesPermitidos: string[];
}

export interface ContextoApi {
  usuario: UsuarioDeSesion;
  sesionId: string;
  organizacionId: string;
  /** Cliente de base de datos con el alcance de la organización del usuario. */
  db: BaseDatos;
  ip: string;
  ahora(): Date;
}

const LLAVE = "contexto";

export function fijarContexto(res: Response, req: Request, deps: DepsApi, usuario: UsuarioDeSesion, sesionId: string): ContextoApi {
  const ctx: ContextoApi = {
    usuario,
    sesionId,
    organizacionId: usuario.organizacionId,
    db: conAlcance(deps.prisma, usuario.organizacionId),
    ip: normalizarIp(req.ip),
    ahora: deps.reloj,
  };
  res.locals[LLAVE] = ctx;
  return ctx;
}

/** El contexto de la petición. Lanza si se llama en una ruta que no pasó por `autenticar` (error de programación). */
export function contextoDe(res: Response): ContextoApi {
  const ctx = res.locals[LLAVE] as ContextoApi | undefined;
  if (!ctx) throw new Error("contextoDe() en una ruta sin autenticar");
  return ctx;
}
