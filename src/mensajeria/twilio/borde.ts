// El borde de Twilio (A7, decisión 5): el backend recibe lo que Twilio llama en lugar de Chatwoot,
// valida la firma (en app.ts, antes de llegar aquí), descarta los reintentos por MessageSid y
// reenvía el cuerpo SIN modificar a Chatwoot. Sirve a la vía A y a la vía C de
// docs/DECISION-ATRIBUCION.md: la elección sigue abierta hasta probar con Twilio real.
//
// Idempotencia (invariante 8): cada evento se RECLAMA en `evento_twilio` (único por proveedor,
// tipo, MessageSid y, en estados, MessageStatus) antes de reenviarlo. Un reintento de Twilio que
// llega después de un reenvío exitoso se descarta; si el reenvío falla, el evento queda
// `fallido` y el reintento puede reclamarlo (al menos una vez: un mensaje perdido es peor que
// uno repetido, y el reintento solo ocurre si el reenvío falló o su resultado no se conoce).

import { altaConAlcance, conAlcance, type BaseDatos } from "../../datos/alcance.ts";
import { esViolacionUnica, type PrismaRaiz } from "../../datos/prisma.ts";
import { resolverBandejaPorNumero } from "../../datos/sistema.ts";
import { enmascararTelefono, log } from "../../lib/log.ts";
import { normalizarNumeroWhatsapp } from "../../lib/telefono.ts";
import type { ParametrosTwilio } from "./firma.ts";
import type { ReenviadorTwilio, TipoWebhookTwilio } from "./reenviador.ts";

const PROVEEDOR = "twilio";

/** Cuánto tiempo se respeta el reclamo de un proceso antes de darlo por muerto y reclamarlo de nuevo. */
export const RECLAMO_TWILIO_VENCE_MS = 60_000;

export type ResultadoBorde =
  | "reenviado"
  | "duplicado"
  | "en_curso"
  | "organizacion_desconocida"
  | "sin_identificador"
  | "fallo_reenvio";

export interface EntradaBorde {
  tipo: TipoWebhookTwilio;
  /** El cuerpo tal como llegó. */
  cuerpo: Buffer;
  params: ParametrosTwilio;
  /** Cabeceras a reenviar (ya filtradas). */
  cabeceras: Record<string, string>;
}

export interface BordeTwilio {
  procesar(entrada: EntradaBorde): Promise<ResultadoBorde>;
}

export interface DepsBorde {
  prisma: PrismaRaiz;
  reenviador: ReenviadorTwilio;
  /**
   * Opción apagada por defecto: llevar `From` de los entrantes a la forma canónica (invariante 7)
   * ANTES de reenviar. Cambia el cuerpo, así que invalida la firma para quien lo valide después.
   */
  normalizarFromAlReenviar?: boolean;
  reloj?: () => Date;
}

const primero = (v: string | string[] | undefined): string | null => {
  const x = Array.isArray(v) ? v[0] : v;
  return x && x.trim() !== "" ? x.trim() : null;
};

/** Identificador del mensaje: MessageSid, o los nombres antiguos de Twilio. */
function idMensajeDe(params: ParametrosTwilio): string | null {
  return primero(params["MessageSid"]) ?? primero(params["SmsMessageSid"]) ?? primero(params["SmsSid"]);
}

/**
 * Números de la escuela candidatos a resolver la organización. En un entrante, el receptor es
 * `To`. En un estado de entrega de algo que mandó la escuela, `From` es la escuela y `To` el
 * contacto; se prueba `From` y luego `To`.
 */
function candidatosReceptor(tipo: TipoWebhookTwilio, params: ParametrosTwilio): string[] {
  const to = primero(params["To"]);
  const from = primero(params["From"]);
  return (tipo === "entrante" ? [to] : [from, to]).filter((x): x is string => x !== null);
}

/**
 * Reescribe SOLO el valor de `From` en el cuerpo del formulario; los demás bytes quedan idénticos.
 * Si no se puede interpretar el número, el cuerpo no cambia.
 */
export function normalizarFromEnCuerpo(cuerpo: Buffer): Buffer {
  // latin1 conserva cada byte tal cual al volver a codificar.
  const pares = cuerpo.toString("latin1").split("&");
  let cambio = false;
  const nuevos = pares.map((par) => {
    const i = par.indexOf("=");
    if (i < 0) return par;
    let nombre: string;
    let valor: string;
    try {
      nombre = decodeURIComponent(par.slice(0, i).replaceAll("+", " "));
      valor = decodeURIComponent(par.slice(i + 1).replaceAll("+", " "));
    } catch {
      return par;
    }
    if (nombre !== "From") return par;
    const canonico = normalizarNumeroWhatsapp(valor);
    if (!canonico || canonico === valor) return par;
    cambio = true;
    return `${par.slice(0, i)}=${encodeURIComponent(canonico)}`;
  });
  return cambio ? Buffer.from(nuevos.join("&"), "latin1") : cuerpo;
}

type Reclamo = "reclamado" | "duplicado" | "en_curso";

async function reclamar(
  db: BaseDatos,
  clave: { tipo: TipoWebhookTwilio; id_mensaje: string; estado_mensaje: string },
  numeroReceptor: string | null,
  ahora: Date,
): Promise<Reclamo> {
  try {
    await db.evento_twilio.create({
      data: altaConAlcance({ proveedor: PROVEEDOR, ...clave, numero_receptor: numeroReceptor, estado_proceso: "procesando" as const, reclamado_en: ahora }),
    });
    return "reclamado";
  } catch (e) {
    if (!esViolacionUnica(e)) throw e;
  }
  const existente = await db.evento_twilio.findFirst({ where: { proveedor: PROVEEDOR, ...clave } });
  // No se ve en esta organización: el índice único es global y la fila es de otra. No debería pasar (un MessageSid es de una cuenta).
  if (!existente) {
    log.warn("evento_twilio_de_otra_organizacion", { tipo: clave.tipo });
    return "duplicado";
  }
  if (existente.estado_proceso === "reenviado") return "duplicado";
  const vencido = existente.estado_proceso === "fallido" || existente.reclamado_en.getTime() < ahora.getTime() - RECLAMO_TWILIO_VENCE_MS;
  if (!vencido) return "en_curso"; // otro proceso lo está reenviando ahora mismo
  // Quien gana este reclamo (mismo estado y mismo número de intentos que se leyeron) reenvía; los
  // demás esperan. Se compara el contador `intentos`, no la fecha `reclamado_en`: un `Date` tiene
  // milisegundos y la columna microsegundos, así que una fila escrita por SQL nunca coincidía (EA-20).
  const r = await db.evento_twilio.updateMany({
    where: { id: existente.id, estado_proceso: existente.estado_proceso, intentos: existente.intentos },
    data: { estado_proceso: "procesando", reclamado_en: ahora, intentos: { increment: 1 }, error: null },
  });
  return r.count === 1 ? "reclamado" : "en_curso";
}

export function crearBordeTwilio(deps: DepsBorde): BordeTwilio {
  return {
    async procesar({ tipo, cuerpo, params, cabeceras }) {
      const idMensaje = idMensajeDe(params);
      if (!idMensaje) {
        log.warn("webhook_twilio_sin_identificador", { tipo });
        return "sin_identificador";
      }

      // La organización sale del número de la escuela (invariante 1): sin ella no hay scope.
      let bandeja: Awaited<ReturnType<typeof resolverBandejaPorNumero>> = null;
      let numeroReceptor: string | null = null;
      for (const candidato of candidatosReceptor(tipo, params)) {
        bandeja = await resolverBandejaPorNumero(deps.prisma, candidato);
        if (bandeja) {
          numeroReceptor = normalizarNumeroWhatsapp(candidato);
          break;
        }
      }
      if (!bandeja) {
        log.warn("webhook_twilio_organizacion_desconocida", { tipo, receptor: enmascararTelefono(candidatosReceptor(tipo, params)[0] ?? null) });
        return "organizacion_desconocida";
      }

      const db = conAlcance(deps.prisma, bandeja.organizacion_id);
      const ahora = deps.reloj?.() ?? new Date();
      const clave = { tipo, id_mensaje: idMensaje, estado_mensaje: tipo === "estado" ? (primero(params["MessageStatus"]) ?? "") : "" };

      const reclamo = await reclamar(db, clave, numeroReceptor, ahora);
      if (reclamo === "duplicado") {
        log.info("webhook_twilio_duplicado", { tipo });
        return "duplicado";
      }
      if (reclamo === "en_curso") return "en_curso";

      const aEnviar = tipo === "entrante" && deps.normalizarFromAlReenviar ? normalizarFromEnCuerpo(cuerpo) : cuerpo;
      try {
        await deps.reenviador.reenviar({ tipo, cuerpo: aEnviar, cabeceras });
      } catch (e) {
        // No se da por procesado: Twilio reintenta y el reintento reclama de nuevo el evento.
        await db.evento_twilio.updateMany({
          where: { proveedor: PROVEEDOR, ...clave, estado_proceso: "procesando" },
          data: { estado_proceso: "fallido", error: (e as Error).message.slice(0, 500) },
        });
        log.error("webhook_twilio_reenvio_fallido", { tipo, error: (e as Error).message });
        return "fallo_reenvio";
      }
      const marcado = await db.evento_twilio.updateMany({
        where: { proveedor: PROVEEDOR, ...clave, estado_proceso: "procesando" },
        data: { estado_proceso: "reenviado", reenviado_en: deps.reloj?.() ?? new Date() },
      });
      // Si esto falla ya se reenvió: se avisa, pero el reintento de Twilio se descartará por el reclamo vencido solo tras 60 s.
      if (marcado.count !== 1) log.error("webhook_twilio_sin_marcar", { tipo });
      return "reenviado";
    },
  };
}
