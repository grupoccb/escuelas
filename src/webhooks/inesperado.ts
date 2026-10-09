// WH: qué se hace con un evento público (webhook de Chatwoot o de Twilio, landing, barrido del borde) que no se pudo procesar.
//
//   · falla transitoria (src/webhooks/clasificar.ts) → «reintentar»: el webhook responde 5xx y el proveedor lo repite;
//   · dato inesperado → se atrapa: log SIN datos sensibles ni teléfonos, UNA constancia (`evento_inesperado`) y, si hay a quién avisar, una TAREA para el
//     asesor; el webhook responde 2xx para que el proveedor no reintente en bucle. Es idempotente por evento del proveedor: un reintento del mismo evento
//     solo suma `intentos`, no crea otra constancia ni otra tarea.
//
// Si la propia constancia no se puede guardar (la base no responde), vuelve a ser «reintentar»: nada se pierde en silencio.

import { altaConAlcance, conAlcance, type BaseDatos } from "../datos/alcance.ts";
import { esViolacionUnica, type PrismaRaiz } from "../datos/prisma.ts";
import { registrarEventoInesperadoSinOrganizacion, resolverBandejaChatwoot, resolverBandejaPorNumero, type BandejaResuelta } from "../datos/sistema.ts";
import { log } from "../lib/log.ts";
import { ErrorTransitorio } from "../lib/transitorio.ts";
import { clasificarError, type CausaInesperada } from "./clasificar.ts";

export type OrigenEvento = "chatwoot" | "twilio_entrante" | "twilio_estado" | "landing" | "barrido_twilio";

/** Con qué se ata el evento a una organización, una conversación y un lead (todo opcional: un JSON roto no trae nada de esto). */
export interface ContextoDeEvento {
  /** Cuenta y bandeja de Chatwoot (y la conversación, si la trae). */
  chatwoot?: { cuenta: number; bandeja: number; conversacion?: number };
  /** Número de WhatsApp de la escuela (Twilio: `To` o `From`), crudo. */
  numeroReceptor?: string[];
  /** Organización ya conocida (landing, barrido). */
  organizacionId?: string;
}

export interface EventoInesperado {
  origen: OrigenEvento;
  /** Identificador del evento del proveedor, o la huella del cuerpo. La llave de idempotencia de la constancia. */
  clave: string;
  causa: CausaInesperada;
  detalle: string;
  forma: Record<string, unknown>;
  contexto?: ContextoDeEvento;
}

export type Decision = "aceptado" | "reintentar";

/** Lo que usan las rutas públicas para atrapar lo inesperado. Detrás de una interfaz para que las pruebas unitarias no necesiten base (invariante 11). */
export interface ManejadorDeInesperados {
  /** Un error lanzado al procesar el evento: transitorio → «reintentar»; inesperado → constancia + tarea y «aceptado». */
  falla(e: { origen: OrigenEvento; clave: string; error: unknown; forma?: Record<string, unknown>; contexto?: ContextoDeEvento }): Promise<Decision>;
  /** Un dato inesperado que no lanzó nada (JSON roto, forma rara, sin identificador): constancia + tarea y «aceptado». */
  dato(e: EventoInesperado): Promise<Decision>;
}

const TEXTO_DE_CAUSA: Record<CausaInesperada, string> = {
  json_invalido: "el cuerpo no era un JSON legible",
  forma_inesperada: "venía con una forma que el sistema no entiende",
  sin_identificador: "no traía el identificador del mensaje",
  dato_invalido: "traía un dato con un tipo o un valor que el sistema no acepta",
  texto_con_nul: "traía un texto con un carácter que la base de datos no guarda",
  restriccion_base: "chocó con una restricción de la base de datos",
  registro_inexistente: "se refería a algo que ya no existe",
  bandeja_sin_aprovisionar: "la bandeja de la conversación todavía no está aprovisionada en Chatwoot",
  reenvio_abandonado: "no se pudo reenviar a Chatwoot tras varios intentos",
  error_interno: "falló por una causa no prevista",
};

const TEXTO_DE_ORIGEN: Record<OrigenEvento, string> = {
  chatwoot: "Llegó de Chatwoot",
  twilio_entrante: "Llegó de Twilio un mensaje entrante",
  twilio_estado: "Llegó de Twilio un estado de entrega",
  landing: "Llegó un envío de la landing",
  barrido_twilio: "El barrido de reenvío de Twilio no pudo entregar un evento",
};

/** Resuelve la organización del contexto: la dada, la de la bandeja de Chatwoot o la del número de la escuela. */
async function bandejaDe(prisma: PrismaRaiz, c: ContextoDeEvento | undefined): Promise<Pick<BandejaResuelta, "id" | "organizacion_id"> | null> {
  if (!c) return null;
  // EG-02: la constancia no puede depender de que el dato del evento se pueda buscar. Si la consulta falla por el DATO (un número que la base no guarda, un texto con
  // NUL), el evento simplemente no se ata a ninguna organización; solo una falla del MOMENTO se relanza (así se pide el reintento).
  const buscar = async (consulta: () => Promise<Pick<BandejaResuelta, "id" | "organizacion_id"> | null>) => {
    try {
      return await consulta();
    } catch (error) {
      if (clasificarError(error).clase === "transitorio") throw error;
      return null;
    }
  };
  if (c.chatwoot) {
    const { cuenta, bandeja } = c.chatwoot;
    const b = await buscar(() => resolverBandejaChatwoot(prisma, cuenta, bandeja));
    if (b) return b;
  }
  for (const numero of c.numeroReceptor ?? []) {
    const b = await buscar(() => resolverBandejaPorNumero(prisma, numero));
    if (b) return b;
  }
  return null;
}

/**
 * La conversación y el lead del evento, si el sistema ya los conoce. Es una lectura APARTE (fuera de la transacción de la constancia): un identificador
 * ilegible o fuera del rango de la base (justo el tipo de dato que trae un evento inesperado) haría fallar la lectura, y una constancia no puede depender
 * de ella; en ese caso simplemente no se ata a una conversación.
 */
async function conversacionDe(db: BaseDatos, bandejaId: string | null, conversacionChatwoot: number | undefined): Promise<{ id: string; lead_id: string } | null> {
  if (!bandejaId || conversacionChatwoot === undefined || !Number.isSafeInteger(conversacionChatwoot) || conversacionChatwoot < 0 || conversacionChatwoot > 2_147_483_647) return null;
  try {
    return await db.conversacion.findFirst({ where: { bandeja_chatwoot_id: bandejaId, chatwoot_conversacion_id: conversacionChatwoot }, select: { id: true, lead_id: true } });
  } catch {
    return null;
  }
}

function descripcionDeTarea(e: EventoInesperado, chatwootConversacion: number | undefined): string {
  const dondeEstaba = chatwootConversacion !== undefined ? ` (conversación ${chatwootConversacion} de Chatwoot)` : "";
  return `${TEXTO_DE_ORIGEN[e.origen]}${dondeEstaba} y ${TEXTO_DE_CAUSA[e.causa]}. El sistema no lo pudo procesar y no lo va a reintentar solo. Revisa la conversación y atiende a la persona por ahí si hace falta.`;
}

/**
 * Deja la constancia y la tarea de un evento inesperado. Idempotente por (origen, clave). Devuelve `nuevo` solo la primera vez. Lanza si la base no
 * responde (quien llama lo trata como transitorio).
 */
export async function registrarEventoInesperado(prisma: PrismaRaiz, e: EventoInesperado): Promise<{ nuevo: boolean; tareaId: string | null }> {
  const bandeja = await bandejaDe(prisma, e.contexto);
  const organizacionId = e.contexto?.organizacionId ?? bandeja?.organizacion_id ?? null;
  if (!organizacionId) {
    const r = await registrarEventoInesperadoSinOrganizacion(prisma, { origen: e.origen, clave: e.clave, causa: e.causa, detalle: e.detalle, forma: e.forma });
    log.error("evento_inesperado", { origen: e.origen, causa: e.causa, organizacion: null, nuevo: r.nuevo, detalle: e.detalle });
    return { nuevo: r.nuevo, tareaId: null };
  }

  const db = conAlcance(prisma, organizacionId);
  const conv = await conversacionDe(db, bandeja?.id ?? null, e.contexto?.chatwoot?.conversacion);
  for (let intento = 1; ; intento++) {
    try {
      const tareaId = await db.$transaction(async (tx) => {
        // 1. La constancia: el índice único (origen, clave) rechaza a un segundo que llegue a la vez (aborta SU transacción: no deja tarea).
        const evento = await tx.evento_inesperado.create({
          data: altaConAlcance({
            origen: e.origen,
            clave: e.clave,
            causa: e.causa,
            detalle: e.detalle,
            forma: e.forma as never,
            lead_id: conv?.lead_id ?? null,
            conversacion_id: conv?.id ?? null,
          }),
          select: { id: true },
        });
        // 2. La tarea para el asesor (tipo propio). Con conversación conocida: una pendiente por conversación (varios eventos raros seguidos no llenan la
        // bandeja); sin ella (nadie a quien atar), una por evento, sin lead: la ve el administrador.
        let tarea: { id: string } | null = null;
        if (conv) tarea = await tx.tarea_asesor.findFirst({ where: { conversacion_id: conv.id, tipo: "evento_inesperado", estado: "pendiente" }, select: { id: true } });
        tarea ??= await tx.tarea_asesor.create({
          data: altaConAlcance({
            lead_id: conv?.lead_id ?? null,
            conversacion_id: conv?.id ?? null,
            tipo: "evento_inesperado" as const,
            descripcion: descripcionDeTarea(e, e.contexto?.chatwoot?.conversacion),
          }),
          select: { id: true },
        });
        await tx.evento_inesperado.update({ where: { id: evento.id }, data: { tarea_id: tarea.id } });
        return tarea.id;
      });
      log.error("evento_inesperado", { origen: e.origen, causa: e.causa, nuevo: true, detalle: e.detalle });
      return { nuevo: true, tareaId };
    } catch (error) {
      if (!esViolacionUnica(error)) throw error;
    }
    // Un choque de unicidad es de DOS cosas: el mismo evento ya tiene constancia (un reintento del proveedor) o, en una carrera, otro evento de la misma
    // conversación creó la tarea pendiente un instante antes (se repite: ahora la ve y la reutiliza).
    const previo = await db.evento_inesperado.findFirst({ where: { origen: e.origen, clave: e.clave }, select: { id: true } });
    if (previo) {
      await db.evento_inesperado.updateMany({ where: { origen: e.origen, clave: e.clave }, data: { intentos: { increment: 1 } } });
      log.warn("evento_inesperado_repetido", { origen: e.origen, causa: e.causa });
      return { nuevo: false, tareaId: null };
    }
    if (intento >= 3) throw new ErrorTransitorio("La constancia del evento chocó tres veces con otra que se creaba a la vez");
  }
}

/** El manejador real: guarda la constancia y la tarea en la base. */
export function crearManejadorDeInesperados(prisma: PrismaRaiz): ManejadorDeInesperados {
  const atender = async (e: EventoInesperado): Promise<Decision> => {
    try {
      await registrarEventoInesperado(prisma, e);
      return "aceptado";
    } catch (error) {
      // Ni la constancia se pudo guardar: la infraestructura está mal. Que el proveedor reintente.
      log.error("evento_inesperado_sin_constancia", { origen: e.origen, causa: e.causa, detalle: clasificarError(error).detalle });
      return "reintentar";
    }
  };
  return {
    dato: atender,
    async falla({ origen, clave, error, forma, contexto }) {
      const c = clasificarError(error);
      if (c.clase === "transitorio") {
        log.error("webhook_falla_transitoria", { origen, detalle: c.detalle });
        return "reintentar";
      }
      return atender({ origen, clave, causa: c.causa, detalle: c.detalle, forma: forma ?? {}, ...(contexto ? { contexto } : {}) });
    },
  };
}

/** Sin base (pruebas unitarias de las rutas): clasifica y deja el log, nada más. */
export const manejadorSoloLog: ManejadorDeInesperados = {
  async dato(e) {
    log.error("evento_inesperado", { origen: e.origen, causa: e.causa, detalle: e.detalle });
    return "aceptado";
  },
  async falla({ origen, error }) {
    const c = clasificarError(error);
    if (c.clase === "transitorio") {
      log.error("webhook_falla_transitoria", { origen, detalle: c.detalle });
      return "reintentar";
    }
    log.error("evento_inesperado", { origen, causa: c.causa, detalle: c.detalle });
    return "aceptado";
  },
};
