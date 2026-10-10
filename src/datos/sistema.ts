// Las únicas consultas sin scope de organización. Cada una existe porque hay que averiguar la
// organización a partir de un identificador externo, antes de poder abrir el scope.
// Agregar otra aquí es una decisión explícita, no un atajo.
//
// Excepciones de inicio de sesión (B1): antes de abrir un alcance hay que saber de qué organización
// es quien llega. Son tres y solo devuelven lo mínimo:
// - `resolverOrganizacionPorSlug`: el identificador corto que escribe quien inicia sesión.
// - `unicaOrganizacion`: si solo existe UNA organización viva, el login puede omitir el slug.
// - `buscarSesionPorHash`: la cookie trae un token; su SHA-256 es la única llave para llegar a la
//   sesión, y la sesión dice la organización. Después de esto TODO va con `conAlcance`.
//
// Excepción de la landing pública (E1): la URL `/l/:vertical` no trae sesión ni organización; el slug de la vertical (y, si hay
// ambigüedad, el slug de la organización) es lo único que identifica a quién pertenece la página.
// - `resolverVerticalPublica`: devuelve la (organización, vertical) SOLO si el slug identifica exactamente una vertical activa.
//
// Excepción de los eventos inesperados (WH): una constancia de un evento público que no se pudo atar a ninguna organización (JSON roto, receptor
// desconocido). No hay alcance que abrir; la fila queda con `organizacion_id` nulo y SOLO se escribe aquí.
// - `registrarEventoInesperadoSinOrganizacion`: alta idempotente por (origen, clave); un reintento suma `intentos`.

import { clienteSinAlcance, type PrismaRaiz } from "./prisma.ts";
import { normalizarNumeroWhatsapp } from "../lib/telefono.ts";

export interface BandejaResuelta {
  id: string;
  organizacion_id: string;
  canal_whatsapp_id: string;
  /** Vertical del canal: lo que el contacto quiere. */
  vertical_id: string;
  /** Sucursal fija del canal; nulo si el canal atiende todas. */
  sucursal_id: string | null;
}

/** El mayor valor que guarda una columna `INTEGER` de Postgres: un identificador de Chatwoot mayor no puede ser de ninguna bandeja nuestra. */
export const ENTERO_MAXIMO_DE_LA_BASE = 2_147_483_647;

/** Bandeja de Chatwoot de la que viene un evento del Agent Bot. */
export async function resolverBandejaChatwoot(
  raiz: PrismaRaiz,
  chatwootAccountId: number,
  chatwootInboxId: number,
): Promise<BandejaResuelta | null> {
  // EG-02: un número fuera del rango de `INTEGER` (válido para JavaScript, imposible para la base) haría fallar la consulta (P2020) y, con ella, la constancia
  // del propio evento inesperado: el webhook respondería 503 sin fin. No es de ninguna bandeja: no existe.
  for (const id of [chatwootAccountId, chatwootInboxId]) if (!Number.isInteger(id) || id < 0 || id > ENTERO_MAXIMO_DE_LA_BASE) return null;
  const prisma = clienteSinAlcance(raiz);
  const b = await prisma.bandeja_chatwoot.findFirst({
    where: {
      chatwoot_account_id: chatwootAccountId,
      chatwoot_inbox_id: chatwootInboxId,
      eliminado_en: null,
      organizacion: { eliminado_en: null },
      canal_whatsapp: { eliminado_en: null },
    },
    select: {
      id: true,
      organizacion_id: true,
      canal_whatsapp_id: true,
      canal_whatsapp: { select: { vertical_id: true, sucursal_id: true } },
    },
  });
  if (!b) return null;
  return {
    id: b.id,
    organizacion_id: b.organizacion_id,
    canal_whatsapp_id: b.canal_whatsapp_id,
    vertical_id: b.canal_whatsapp.vertical_id,
    sucursal_id: b.canal_whatsapp.sucursal_id,
  };
}

/**
 * Bandeja del canal de WhatsApp que tiene ese número receptor. El número se normaliza antes de
 * buscar (invariante 7). Sirve a las fuentes que traen el número receptor en el evento.
 */
export async function resolverBandejaPorNumero(raiz: PrismaRaiz, numeroReceptor: string): Promise<BandejaResuelta | null> {
  const prisma = clienteSinAlcance(raiz);
  const numero = normalizarNumeroWhatsapp(numeroReceptor);
  if (!numero) return null;
  const canal = await prisma.canal_whatsapp.findFirst({
    where: { numero_whatsapp: numero, eliminado_en: null, activo: true, organizacion: { eliminado_en: null } },
    select: {
      id: true,
      organizacion_id: true,
      vertical_id: true,
      sucursal_id: true,
      bandejas_chatwoot: { where: { eliminado_en: null }, select: { id: true }, take: 1 },
    },
  });
  const bandeja = canal?.bandejas_chatwoot[0];
  if (!canal || !bandeja) return null;
  return {
    id: bandeja.id,
    organizacion_id: canal.organizacion_id,
    canal_whatsapp_id: canal.id,
    vertical_id: canal.vertical_id,
    sucursal_id: canal.sucursal_id,
  };
}

/** Organizaciones vivas. Lo usa el aprovisionamiento de la demo para recorrerlas una por una. */
export async function listarOrganizaciones(raiz: PrismaRaiz): Promise<{ id: string; nombre: string }[]> {
  return clienteSinAlcance(raiz).organizacion.findMany({
    where: { eliminado_en: null },
    select: { id: true, nombre: true },
    orderBy: { creado_en: "asc" },
  });
}

/** Verifica que la base responde. */
export async function pingBaseDatos(raiz: PrismaRaiz): Promise<void> {
  await clienteSinAlcance(raiz).$queryRaw`SELECT 1`;
}

/**
 * Excepción de salud (K4): las migraciones que Prisma anotó en `_prisma_migrations` (no es una tabla de negocio: no tiene organización). Solo devuelve nombres:
 * las terminadas y las que empezaron y no terminaron. Lo usa `/salud/lista` para decir «las migraciones están al día».
 */
export async function estadoDeMigraciones(raiz: PrismaRaiz): Promise<{ aplicadas: string[]; sinTerminar: string[] }> {
  const filas = await clienteSinAlcance(raiz).$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY migration_name`;
  return {
    aplicadas: filas.filter((f) => f.finished_at !== null && f.rolled_back_at === null).map((f) => f.migration_name),
    sinTerminar: filas.filter((f) => f.finished_at === null && f.rolled_back_at === null).map((f) => f.migration_name),
  };
}

/** Organización a partir del identificador corto del login (`slug`). Solo organizaciones vivas. */
export async function resolverOrganizacionPorSlug(raiz: PrismaRaiz, slug: string): Promise<{ id: string } | null> {
  return clienteSinAlcance(raiz).organizacion.findFirst({ where: { slug, eliminado_en: null }, select: { id: true } });
}

/** La organización, si y solo si existe exactamente una viva (con slug o sin él); si no, null. */
export async function unicaOrganizacion(raiz: PrismaRaiz): Promise<{ id: string } | null> {
  const vivas = await clienteSinAlcance(raiz).organizacion.findMany({ where: { eliminado_en: null }, select: { id: true }, take: 2 });
  return vivas.length === 1 ? (vivas[0] ?? null) : null;
}

/** Lo que dice una sesión guardada. El token nunca se guarda: se busca por su SHA-256. */
export interface SesionGuardada {
  id: string;
  organizacion_id: string;
  usuario_id: string;
  expira_en: Date;
  ultima_actividad_en: Date;
  revocada_en: Date | null;
}

/** Sesión por el SHA-256 (hex) de su token. No filtra por organización: es de donde se obtiene. */
export async function buscarSesionPorHash(raiz: PrismaRaiz, tokenHash: string): Promise<SesionGuardada | null> {
  return clienteSinAlcance(raiz).sesion.findFirst({
    // Una sesión de una organización dada de baja deja de valer en la siguiente petición (EB-13).
    where: { token_hash: tokenHash, eliminado_en: null, organizacion: { eliminado_en: null } },
    select: { id: true, organizacion_id: true, usuario_id: true, expira_en: true, ultima_actividad_en: true, revocada_en: true },
  });
}

/**
 * La vertical y su organización a partir de lo que trae la URL pública de la landing (E1): el slug de la vertical y, opcionalmente, el de la
 * organización (los slugs de vertical son únicos por organización, no globales). Solo cuenta lo vivo y activo. Si el slug identifica más de una
 * vertical (o ninguna) devuelve null: la página responde igual para «no existe» y «es ambiguo», sin revelar qué organizaciones hay.
 */
export async function resolverVerticalPublica(raiz: PrismaRaiz, slugVertical: string, slugOrganizacion: string | null): Promise<{ organizacion_id: string; vertical_id: string } | null> {
  const filas = await clienteSinAlcance(raiz).vertical.findMany({
    where: { slug: slugVertical, activo: true, eliminado_en: null, organizacion: { eliminado_en: null, ...(slugOrganizacion ? { slug: slugOrganizacion } : {}) } },
    select: { id: true, organizacion_id: true },
    take: 2,
  });
  const una = filas.length === 1 ? filas[0] : undefined;
  return una ? { organizacion_id: una.organizacion_id, vertical_id: una.id } : null;
}

export interface EventoInesperadoSinOrganizacion {
  origen: "chatwoot" | "twilio_entrante" | "twilio_estado" | "landing" | "barrido_twilio";
  clave: string;
  causa: "json_invalido" | "forma_inesperada" | "sin_identificador" | "dato_invalido" | "texto_con_nul" | "restriccion_base" | "registro_inexistente" | "bandeja_sin_aprovisionar" | "reenvio_abandonado" | "error_interno";
  detalle: string;
  forma: Record<string, unknown>;
}

/**
 * EG-20: una constancia sin organización nace de un cuerpo que NO se pudo atar a nadie (JSON roto, receptor desconocido) pero que sí traía una firma válida;
 * cada cuerpo distinto era una fila nueva sin tope ni retención. Ahora hay un tope por día para todo el sistema y las que pasan de 30 días se dan de baja
 * (borrado lógico). Pasado el tope el evento se acepta igual (el proveedor no reintenta) y queda UNA línea de log `error` por cada uno que se descarta.
 */
export const TOPE_SIN_ORGANIZACION_POR_DIA = 500;
export const RETENCION_SIN_ORGANIZACION_DIAS = 30;

/** Constancia de un evento que no se pudo atar a ninguna organización. Idempotente: devuelve `nuevo` solo la primera vez; `descartado` si ya se pasó el tope del día. */
export async function registrarEventoInesperadoSinOrganizacion(
  raiz: PrismaRaiz,
  e: EventoInesperadoSinOrganizacion,
  o: { ahora?: Date; topePorDia?: number } = {},
): Promise<{ nuevo: boolean; descartado?: boolean }> {
  const prisma = clienteSinAlcance(raiz);
  const ahora = o.ahora ?? new Date();
  const dia = 86_400_000;
  // Retención: lo de hace más de 30 días se da de baja (la tabla es de solo anexar para el resto del sistema; esto es borrado lógico).
  await prisma.evento_inesperado.updateMany({ where: { organizacion_id: null, eliminado_en: null, creado_en: { lt: new Date(ahora.getTime() - RETENCION_SIN_ORGANIZACION_DIAS * dia) } }, data: { eliminado_en: ahora } });
  // Un reintento del MISMO evento solo suma `intentos` (no cuenta contra el tope).
  const repetido = await prisma.evento_inesperado.updateMany({ where: { organizacion_id: null, origen: e.origen, clave: e.clave, eliminado_en: null }, data: { intentos: { increment: 1 } } });
  if (repetido.count > 0) return { nuevo: false };
  if ((await prisma.evento_inesperado.count({ where: { organizacion_id: null, eliminado_en: null, creado_en: { gte: new Date(ahora.getTime() - dia) } } })) >= (o.topePorDia ?? TOPE_SIN_ORGANIZACION_POR_DIA)) {
    return { nuevo: false, descartado: true };
  }
  try {
    await prisma.evento_inesperado.create({ data: { origen: e.origen, clave: e.clave, causa: e.causa, detalle: e.detalle, forma: e.forma as never, creado_en: ahora } });
    return { nuevo: true };
  } catch (error) {
    if ((error as { code?: unknown }).code !== "P2002") throw error;
  }
  // Otro igual se guardó justo a la vez: es el mismo evento.
  await prisma.evento_inesperado.updateMany({ where: { organizacion_id: null, origen: e.origen, clave: e.clave, eliminado_en: null }, data: { intentos: { increment: 1 } } });
  return { nuevo: false };
}
