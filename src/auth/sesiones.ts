// Sesiones (B1). El token es de 32 bytes aleatorios y solo viaja en la cookie; en la base queda su
// SHA-256 (un volcado de la tabla no sirve para entrar). Una sesión vale mientras:
//   - no esté revocada (cierre de sesión, cambio de contraseña, usuario desactivado),
//   - no pasen 12 h desde que nació (expiración ABSOLUTA, no se renueva con el uso), y
//   - no pasen `inactividadMs` desde su último uso (configurable).
// Además el usuario debe seguir vivo y activo: se vuelve a leer en cada petición, así que
// desactivarlo o cambiarle el rol surte efecto en la siguiente.

import { createHash, randomBytes } from "node:crypto";
import { altaConAlcance, conAlcance, type BaseDatos, type Consultas } from "../datos/alcance.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import { buscarSesionPorHash } from "../datos/sistema.ts";
import type { Rol } from "./roles.ts";

/** Duración absoluta de una sesión. */
export const DURACION_SESION_MS = 12 * 60 * 60 * 1000;
/** Inactividad por defecto: 2 horas. Se cambia con `SESION_INACTIVIDAD_MIN`. */
export const INACTIVIDAD_POR_DEFECTO_MS = 2 * 60 * 60 * 1000;
/** La última actividad se escribe a lo más una vez por este intervalo (evita una escritura por petición). */
const REFRESCO_ACTIVIDAD_MS = 60 * 1000;

export interface ConfigSesion {
  duracionMs: number;
  inactividadMs: number;
}

export function configSesionDesdeEntorno(env: NodeJS.ProcessEnv = process.env): ConfigSesion {
  const minutos = Number(env["SESION_INACTIVIDAD_MIN"]);
  const inactividadMs = Number.isFinite(minutos) && minutos >= 1 ? Math.min(minutos * 60_000, DURACION_SESION_MS) : INACTIVIDAD_POR_DEFECTO_MS;
  return { duracionMs: DURACION_SESION_MS, inactividadMs };
}

export interface UsuarioDeSesion {
  id: string;
  organizacionId: string;
  correo: string;
  nombre: string;
  rol: Rol;
}

export interface SesionValida {
  sesionId: string;
  usuario: UsuarioDeSesion;
}

export function hashDeToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Token nuevo: 32 bytes aleatorios en base64url (43 caracteres). */
export function nuevoToken(): string {
  return randomBytes(32).toString("base64url");
}

const FORMA_DE_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export async function crearSesion(
  db: BaseDatos | Consultas,
  usuarioId: string,
  origen: { ip: string | null; agente: string | null },
  config: ConfigSesion,
  ahora: Date,
): Promise<{ token: string; sesionId: string; expiraEn: Date }> {
  const token = nuevoToken();
  const expiraEn = new Date(ahora.getTime() + config.duracionMs);
  const sesion = await db.sesion.create({
    data: altaConAlcance({
      usuario_id: usuarioId,
      token_hash: hashDeToken(token),
      expira_en: expiraEn,
      ultima_actividad_en: ahora,
      creado_en: ahora,
      ip: origen.ip,
      agente_usuario: origen.agente?.slice(0, 200) ?? null,
    }),
    select: { id: true },
  });
  return { token, sesionId: sesion.id, expiraEn };
}

/**
 * La sesión de un token, o null si no existe, está revocada, expiró (absoluta o por inactividad) o
 * el usuario ya no está activo. Refresca la última actividad (a lo más cada minuto) sin revivir una
 * sesión revocada: la escritura es condicional a `revocada_en IS NULL`.
 */
export async function validarSesion(raiz: PrismaRaiz, token: string, config: ConfigSesion, ahora: Date): Promise<SesionValida | null> {
  if (!FORMA_DE_TOKEN.test(token)) return null;
  const guardada = await buscarSesionPorHash(raiz, hashDeToken(token));
  if (!guardada) return null;
  if (guardada.revocada_en) return null;
  if (ahora >= guardada.expira_en) return null;
  if (ahora.getTime() - guardada.ultima_actividad_en.getTime() >= config.inactividadMs) return null;

  const db = conAlcance(raiz, guardada.organizacion_id);
  const usuario = await db.usuario.findFirst({
    where: { id: guardada.usuario_id, activo: true },
    select: { id: true, correo: true, nombre: true, rol: true },
  });
  if (!usuario) return null;

  if (ahora.getTime() - guardada.ultima_actividad_en.getTime() >= REFRESCO_ACTIVIDAD_MS) {
    await db.sesion.updateMany({ where: { id: guardada.id, revocada_en: null }, data: { ultima_actividad_en: ahora } });
  }
  return {
    sesionId: guardada.id,
    usuario: { id: usuario.id, organizacionId: guardada.organizacion_id, correo: usuario.correo, nombre: usuario.nombre, rol: usuario.rol },
  };
}

/** Cierra una sesión. Idempotente: cerrar una ya cerrada no cambia nada. */
export async function revocarSesion(db: BaseDatos | Consultas, sesionId: string, ahora: Date): Promise<void> {
  await db.sesion.updateMany({ where: { id: sesionId, revocada_en: null }, data: { revocada_en: ahora } });
}

/** Cierra todas las sesiones de un usuario (salvo, si se indica, una). Devuelve cuántas cerró. */
export async function revocarSesionesDeUsuario(db: BaseDatos | Consultas, usuarioId: string, ahora: Date, excepto?: string): Promise<number> {
  const r = await db.sesion.updateMany({
    where: { usuario_id: usuarioId, revocada_en: null, ...(excepto ? { id: { not: excepto } } : {}) },
    data: { revocada_en: ahora },
  });
  return r.count;
}
