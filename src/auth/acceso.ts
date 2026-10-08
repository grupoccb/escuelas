// Inicio de sesión y cambio de contraseña (B1).
//
// Lo que se cuida:
// - Un solo mensaje para "no existe", "inactivo" y "contraseña mala": `ErrorCredenciales`.
// - Mismo trabajo en todos los casos: si el usuario no existe se verifica contra un hash ficticio
//   con los mismos parámetros, así el tiempo de respuesta no delata qué correos hay.
// - Bloqueo temporal por (correo, IP): tras `maxFallos` intentos en `ventanaMs`, nada se verifica
//   hasta que el más viejo salga de la ventana. Se cuenta también para correos inexistentes.
// - El cupo de intentos se RESERVA antes de verificar (bajo un candado por correo e IP) y se libera
//   al acertar: N intentos simultáneos no pueden colarse más allá del tope.
// - Al acertar se cierra la puerta a lo anterior: los intentos de esa pareja se marcan eliminados.

import { altaConAlcance, conAlcance, type BaseDatos } from "../datos/alcance.ts";
import { transaccionConBloqueo } from "../datos/bloqueos.ts";
import type { PrismaRaiz } from "../datos/prisma.ts";
import { resolverOrganizacionPorSlug, unicaOrganizacion } from "../datos/sistema.ts";
import { log } from "../lib/log.ts";
import { hashContrasena, problemasDeContrasena, verificarContrasena, verificarContrasenaFicticia, PARAMETROS_POR_DEFECTO, type ParametrosScrypt } from "./contrasena.ts";
import { crearSesion, revocarSesionesDeUsuario, type ConfigSesion } from "./sesiones.ts";
import type { Rol } from "./roles.ts";

export class ErrorCredenciales extends Error {
  constructor() {
    super("Correo o contraseña incorrectos");
  }
}

export class ErrorBloqueado extends Error {
  readonly reintentarEnSegundos: number;
  constructor(reintentarEnSegundos: number) {
    super("Demasiados intentos. Espera unos minutos e inténtalo de nuevo.");
    this.reintentarEnSegundos = reintentarEnSegundos;
  }
}

export class ErrorContrasenaDebil extends Error {
  readonly problemas: string[];
  constructor(problemas: string[]) {
    super("La contraseña no cumple la política");
    this.problemas = problemas;
  }
}

export interface ConfigBloqueo {
  /** Intentos permitidos por (correo, IP) dentro de la ventana. */
  maxFallos: number;
  ventanaMs: number;
}

export const BLOQUEO_POR_DEFECTO: ConfigBloqueo = { maxFallos: 5, ventanaMs: 15 * 60 * 1000 };

export interface DepsAcceso {
  prisma: PrismaRaiz;
  reloj: () => Date;
  sesion: ConfigSesion;
  bloqueo: ConfigBloqueo;
  /** Parámetros de scrypt para los hashes NUEVOS (los tests usan los baratos). */
  parametrosHash: ParametrosScrypt;
}

export function depsAccesoPorDefecto(prisma: PrismaRaiz, sesion: ConfigSesion): DepsAcceso {
  return { prisma, reloj: () => new Date(), sesion, bloqueo: BLOQUEO_POR_DEFECTO, parametrosHash: PARAMETROS_POR_DEFECTO };
}

/** Minúsculas y sin espacios en los extremos: la única forma en que un correo entra a la base. */
export function normalizarCorreo(correo: string): string {
  return correo.normalize("NFKC").trim().toLowerCase();
}

/** Forma mínima de un correo: algo@algo.algo, sin espacios. La validación real es el mensaje de confirmación. */
export function correoValido(correo: string): boolean {
  return correo.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
}

export interface EntradaLogin {
  /** Slug de la organización. Si se omite, solo vale cuando existe una única organización. */
  organizacion?: string | undefined;
  correo: string;
  contrasena: string;
  ip: string;
  agente: string | null;
}

export interface UsuarioAutenticado {
  id: string;
  organizacionId: string;
  correo: string;
  nombre: string;
  rol: Rol;
}

export interface ResultadoLogin {
  token: string;
  sesionId: string;
  expiraEn: Date;
  usuario: UsuarioAutenticado;
}

/** Reserva un intento de (correo, IP) o lanza `ErrorBloqueado`. Atómico por pareja. */
async function reservarIntento(db: BaseDatos, organizacionId: string, correo: string, ip: string, deps: DepsAcceso): Promise<string> {
  return transaccionConBloqueo(db, organizacionId, `login:${correo}|${ip}`, async (tx) => {
    const ahora = deps.reloj();
    const desde = new Date(ahora.getTime() - deps.bloqueo.ventanaMs);
    const recientes = await tx.intento_acceso.findMany({
      where: { correo, ip, creado_en: { gt: desde } },
      select: { creado_en: true },
      orderBy: { creado_en: "asc" },
    });
    if (recientes.length >= deps.bloqueo.maxFallos) {
      const masViejo = recientes[0]?.creado_en ?? ahora;
      const espera = Math.max(1, Math.ceil((masViejo.getTime() + deps.bloqueo.ventanaMs - ahora.getTime()) / 1000));
      throw new ErrorBloqueado(espera);
    }
    const intento = await tx.intento_acceso.create({ data: altaConAlcance({ correo, ip, creado_en: ahora }), select: { id: true } });
    return intento.id;
  });
}

/** Libera los intentos de la pareja (se acertó). */
async function liberarIntentos(db: BaseDatos, correo: string, ip: string, ahora: Date): Promise<void> {
  await db.intento_acceso.updateMany({ where: { correo, ip }, data: { eliminado_en: ahora } });
}

export async function iniciarSesion(deps: DepsAcceso, entrada: EntradaLogin): Promise<ResultadoLogin> {
  const correo = normalizarCorreo(entrada.correo);
  const organizacion = entrada.organizacion ? await resolverOrganizacionPorSlug(deps.prisma, entrada.organizacion) : await unicaOrganizacion(deps.prisma);

  if (!organizacion || !correoValido(correo)) {
    // Mismo trabajo y mismo mensaje que con una contraseña mala.
    await verificarContrasenaFicticia(entrada.contrasena);
    throw new ErrorCredenciales();
  }

  const db = conAlcance(deps.prisma, organizacion.id);
  await reservarIntento(db, organizacion.id, correo, entrada.ip, deps);

  const usuario = await db.usuario.findFirst({
    where: { correo },
    select: { id: true, correo: true, nombre: true, rol: true, contrasena_hash: true, activo: true },
  });
  const acierta = usuario ? await verificarContrasena(entrada.contrasena, usuario.contrasena_hash) : await verificarContrasenaFicticia(entrada.contrasena);
  if (!usuario || !usuario.activo || !acierta) {
    log.warn("login_fallido", { organizacion: organizacion.id, ip: entrada.ip });
    throw new ErrorCredenciales();
  }

  const ahora = deps.reloj();
  await liberarIntentos(db, correo, entrada.ip, ahora);
  const sesion = await crearSesion(db, usuario.id, { ip: entrada.ip, agente: entrada.agente }, deps.sesion, ahora);
  log.info("login_exitoso", { organizacion: organizacion.id, usuario_id: usuario.id });
  return {
    ...sesion,
    usuario: { id: usuario.id, organizacionId: organizacion.id, correo: usuario.correo, nombre: usuario.nombre, rol: usuario.rol },
  };
}

export interface EntradaCambioContrasena {
  usuarioId: string;
  organizacionId: string;
  sesionActualId: string;
  actual: string;
  nueva: string;
  ip: string;
}

/**
 * Cambia la contraseña de quien está dentro. Exige la actual (con el mismo bloqueo por intentos que
 * el login: una sesión robada no sirve para adivinarla) y cierra las DEMÁS sesiones del usuario.
 */
export async function cambiarContrasena(deps: DepsAcceso, entrada: EntradaCambioContrasena): Promise<void> {
  const db = conAlcance(deps.prisma, entrada.organizacionId);
  const usuario = await db.usuario.findFirst({ where: { id: entrada.usuarioId, activo: true }, select: { id: true, correo: true, nombre: true, contrasena_hash: true } });
  if (!usuario) throw new ErrorCredenciales();

  await reservarIntento(db, entrada.organizacionId, usuario.correo, entrada.ip, deps);
  if (!(await verificarContrasena(entrada.actual, usuario.contrasena_hash))) throw new ErrorCredenciales();
  const problemas = problemasDeContrasena(entrada.nueva, { correo: usuario.correo, nombre: usuario.nombre });
  if (problemas.length > 0) throw new ErrorContrasenaDebil(problemas);

  const ahora = deps.reloj();
  const hash = await hashContrasena(entrada.nueva, deps.parametrosHash);
  await db.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: usuario.id }, data: { contrasena_hash: hash, contrasena_cambiada_en: ahora } });
    await revocarSesionesDeUsuario(tx, usuario.id, ahora, entrada.sesionActualId);
  });
  await liberarIntentos(db, usuario.correo, entrada.ip, ahora);
}
