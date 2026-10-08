// El borde de Twilio (A7, decisión 5): el backend recibe lo que Twilio llama en lugar de Chatwoot,
// valida la firma (en app.ts, antes de llegar aquí), descarta los reintentos por MessageSid y
// reenvía el cuerpo SIN modificar a Chatwoot. Sirve a la vía A y a la vía C de
// docs/DECISION-ATRIBUCION.md: la elección sigue abierta hasta probar con Twilio real.
//
// Idempotencia (invariante 8): cada evento se RECLAMA en `evento_twilio` (único por proveedor,
// tipo, MessageSid y, en estados, MessageStatus) antes de reenviarlo. Un reintento de Twilio que
// llega después de un reenvío exitoso se descarta.
//
// Durabilidad (EA-03): al reclamar se guardan el cuerpo y las cabeceras. Si el reenvío falla o el
// proceso muere, un barrido por minuto (`reenviarPendientes`) reenvía los eventos `fallido` y los
// `procesando` vencidos con el mismo candado, hasta MAX_INTENTOS_REENVIO; después quedan
// `abandonado` con alerta. Garantía EXACTA: «al menos una vez» mientras la base conserve el evento.
// NO garantiza orden, ni que no haya un duplicado cuando Chatwoot aceptó el mensaje pero la
// respuesta se perdió (Chatwoot no es idempotente, H2), ni a los eventos cuyo receptor no se
// resuelve (EA-05: esos se reenvían una sola vez, sin registro, porque sin organización no hay
// dónde guardarlos).

import { altaConAlcance, conAlcance, type BaseDatos } from "../../datos/alcance.ts";
import { esViolacionUnica, type PrismaRaiz } from "../../datos/prisma.ts";
import { JSON_NULO } from "../../datos/tipos.ts";
import { listarOrganizaciones, resolverBandejaPorNumero } from "../../datos/sistema.ts";
import { enmascararTelefono, log } from "../../lib/log.ts";
import { normalizarNumeroWhatsapp } from "../../lib/telefono.ts";
import type { ParametrosTwilio } from "./firma.ts";
import type { ReenviadorTwilio, TipoWebhookTwilio } from "./reenviador.ts";

const PROVEEDOR = "twilio";

/** Cuánto tiempo se respeta el reclamo de un proceso antes de darlo por muerto y reclamarlo de nuevo. */
export const RECLAMO_TWILIO_VENCE_MS = 60_000;

/** Reintentos del barrido de reenvío antes de abandonar un evento y alertar. */
export const MAX_INTENTOS_REENVIO = 10;

export type ResultadoBorde =
  | "reenviado"
  | "duplicado"
  | "en_curso"
  /** El receptor no se resolvió a ninguna organización: se reenvió igual, sin registro, y quedó una alerta (EA-05). */
  | "reenviado_sin_organizacion"
  /** El receptor no se resolvió y no hay a dónde reenviar: solo alerta. */
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

export interface ResumenReenvio {
  /** Eventos pendientes que se reenviaron en este barrido. */
  reenviados: number;
  /** Eventos que volvieron a fallar (siguen pendientes de otro intento). */
  fallidos: number;
  /** Eventos que agotaron sus intentos y quedaron `abandonado`. */
  abandonados: number;
  /** Organizaciones o eventos cuyo trabajo lanzó y se saltó. */
  errores: number;
}

/** Contadores de alertas del borde desde que arrancó el proceso. Visibles en los logs de nivel error. */
export interface AlertasBorde {
  organizacionDesconocida: number;
  eventosAbandonados: number;
}

export interface BordeTwilio {
  procesar(entrada: EntradaBorde): Promise<ResultadoBorde>;
  /** Reenvía los eventos `fallido` y los `procesando` vencidos (EA-03). Lo llama el ciclo cada minuto. */
  reenviarPendientes(): Promise<ResumenReenvio>;
  readonly alertas: AlertasBorde;
}

export interface DepsBorde {
  prisma: PrismaRaiz;
  reenviador: ReenviadorTwilio;
  /**
   * Opción apagada por defecto: llevar `From` de los entrantes a la forma canónica (invariante 7)
   * ANTES de reenviar. Cambia el cuerpo, así que invalida la firma para quien lo valide después.
   */
  normalizarFromAlReenviar?: boolean;
  /**
   * Si el receptor no se resuelve a ninguna organización, reenviar igual a Chatwoot (por defecto sí)
   * y dejar una alerta. Perder el mensaje de una línea nueva o mal dada de alta es peor que un
   * duplicado (EA-05).
   */
  reenviarSinOrganizacion?: boolean;
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

type Reclamo = { estado: "reclamado"; id: string } | { estado: "duplicado" } | { estado: "en_curso" };

async function reclamar(
  db: BaseDatos,
  clave: { tipo: TipoWebhookTwilio; id_mensaje: string; estado_mensaje: string },
  numeroReceptor: string | null,
  ahora: Date,
  guardado: { cuerpo: Buffer; cabeceras: Record<string, string> },
): Promise<Reclamo> {
  try {
    const creado = await db.evento_twilio.create({
      data: altaConAlcance({
        proveedor: PROVEEDOR,
        ...clave,
        numero_receptor: numeroReceptor,
        estado_proceso: "procesando" as const,
        reclamado_en: ahora,
        // Guardados hasta que el evento se reenvíe: con ellos el barrido puede reintentar (EA-03).
        cuerpo: new Uint8Array(guardado.cuerpo),
        cabeceras: guardado.cabeceras,
      }),
      select: { id: true },
    });
    return { estado: "reclamado", id: creado.id };
  } catch (e) {
    if (!esViolacionUnica(e)) throw e;
  }
  const existente = await db.evento_twilio.findFirst({ where: { proveedor: PROVEEDOR, ...clave } });
  // No se ve en esta organización: el índice único es global y la fila es de otra. No debería pasar (un MessageSid es de una cuenta).
  if (!existente) {
    log.warn("evento_twilio_de_otra_organizacion", { tipo: clave.tipo });
    return { estado: "duplicado" };
  }
  if (existente.estado_proceso === "reenviado") return { estado: "duplicado" };
  // Un evento abandonado no se reintenta solo ni por Twilio: una persona decide.
  if (existente.estado_proceso === "abandonado") return { estado: "duplicado" };
  const vencido = existente.estado_proceso === "fallido" || existente.reclamado_en.getTime() < ahora.getTime() - RECLAMO_TWILIO_VENCE_MS;
  if (!vencido) return { estado: "en_curso" }; // otro proceso lo está reenviando ahora mismo
  const ganado = await reclamarVencido(db, existente, ahora, guardado);
  return ganado ? { estado: "reclamado", id: existente.id } : { estado: "en_curso" };
}

/**
 * Reclama de nuevo un evento fallido o con un reclamo vencido. Quien gana (mismo estado y mismo
 * número de intentos que se leyeron) reenvía; los demás esperan. Se compara el contador `intentos`,
 * no la fecha `reclamado_en`: un `Date` tiene milisegundos y la columna microsegundos, así que una
 * fila escrita por SQL nunca coincidía (EA-20). Lo comparten el webhook y el barrido de reenvío.
 */
async function reclamarVencido(
  db: BaseDatos,
  existente: { id: string; estado_proceso: string; intentos: number },
  ahora: Date,
  guardado?: { cuerpo: Buffer; cabeceras: Record<string, string> },
): Promise<boolean> {
  const r = await db.evento_twilio.updateMany({
    where: { id: existente.id, estado_proceso: existente.estado_proceso as "fallido" | "procesando", intentos: existente.intentos },
    data: {
      estado_proceso: "procesando",
      reclamado_en: ahora,
      intentos: { increment: 1 },
      error: null,
      ...(guardado ? { cuerpo: new Uint8Array(guardado.cuerpo), cabeceras: guardado.cabeceras } : {}),
    },
  });
  return r.count === 1;
}

export function crearBordeTwilio(deps: DepsBorde): BordeTwilio {
  const alertas: AlertasBorde = { organizacionDesconocida: 0, eventosAbandonados: 0 };
  const reloj = () => deps.reloj?.() ?? new Date();

  /**
   * Reenvía un evento ya reclamado y lo deja `reenviado` (y sin cuerpo) o `fallido`. true si salió.
   * El reclamo se identifica por `id` y por seguir `procesando`: lo que otro proceso ya resolvió no se pisa.
   */
  async function reenviarYMarcar(db: BaseDatos, id: string, tipo: TipoWebhookTwilio, cuerpo: Buffer, cabeceras: Record<string, string>): Promise<boolean> {
    try {
      await deps.reenviador.reenviar({ tipo, cuerpo, cabeceras });
    } catch (e) {
      // No se da por procesado: Twilio o el barrido lo reintentan y reclaman de nuevo el evento.
      await db.evento_twilio.updateMany({
        where: { id, estado_proceso: "procesando" },
        data: { estado_proceso: "fallido", error: (e as Error).message.slice(0, 500) },
      });
      log.error("webhook_twilio_reenvio_fallido", { tipo, error: (e as Error).message });
      return false;
    }
    const marcado = await db.evento_twilio.updateMany({
      where: { id, estado_proceso: "procesando" },
      data: { estado_proceso: "reenviado", reenviado_en: reloj(), cuerpo: null, cabeceras: JSON_NULO },
    });
    // Si esto falla ya se reenvió: se avisa, pero el reintento de Twilio se descartará por el reclamo vencido solo tras 60 s.
    if (marcado.count !== 1) log.error("webhook_twilio_sin_marcar", { tipo });
    return true;
  }

  return {
    alertas,

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
      const aEnviar = tipo === "entrante" && deps.normalizarFromAlReenviar ? normalizarFromEnCuerpo(cuerpo) : cuerpo;

      if (!bandeja) {
        // Número no dado de alta, con otro formato o canal desactivado: antes de A7 Chatwoot habría
        // recibido el mensaje. Se reenvía igual, sin registro (sin organización no hay dónde guardar
        // el evento ni scope que abrir), y queda una alerta visible (EA-05).
        alertas.organizacionDesconocida++;
        log.error("webhook_twilio_organizacion_desconocida", {
          tipo,
          receptor: enmascararTelefono(candidatosReceptor(tipo, params)[0] ?? null),
          total: alertas.organizacionDesconocida,
          reenviado: deps.reenviarSinOrganizacion !== false,
        });
        if (deps.reenviarSinOrganizacion === false) return "organizacion_desconocida";
        try {
          await deps.reenviador.reenviar({ tipo, cuerpo: aEnviar, cabeceras });
        } catch (e) {
          log.error("webhook_twilio_reenvio_fallido", { tipo, sinOrganizacion: true, error: (e as Error).message });
          return "fallo_reenvio"; // 502: Twilio puede reintentar
        }
        return "reenviado_sin_organizacion";
      }

      const db = conAlcance(deps.prisma, bandeja.organizacion_id);
      const clave = { tipo, id_mensaje: idMensaje, estado_mensaje: tipo === "estado" ? (primero(params["MessageStatus"]) ?? "") : "" };

      const reclamo = await reclamar(db, clave, numeroReceptor, reloj(), { cuerpo: aEnviar, cabeceras });
      if (reclamo.estado === "duplicado") {
        log.info("webhook_twilio_duplicado", { tipo });
        return "duplicado";
      }
      if (reclamo.estado === "en_curso") return "en_curso";

      return (await reenviarYMarcar(db, reclamo.id, tipo, aEnviar, cabeceras)) ? "reenviado" : "fallo_reenvio";
    },

    async reenviarPendientes() {
      const resumen: ResumenReenvio = { reenviados: 0, fallidos: 0, abandonados: 0, errores: 0 };
      const ahora = reloj();
      const espera = new Date(ahora.getTime() - RECLAMO_TWILIO_VENCE_MS);
      for (const org of await listarOrganizaciones(deps.prisma)) {
        try {
          const db = conAlcance(deps.prisma, org.id);
          const candidatos = await db.evento_twilio.findMany({
            where: {
              // `fallido`, o `procesando` con el reclamo vencido; en ambos casos al menos 60 s desde el último intento.
              estado_proceso: { in: ["fallido", "procesando"] },
              reclamado_en: { lt: espera },
              cuerpo: { not: null },
            },
            orderBy: { creado_en: "asc" },
            take: 50,
          });
          for (const c of candidatos) {
            try {
              if (c.intentos >= MAX_INTENTOS_REENVIO) {
                const r = await db.evento_twilio.updateMany({
                  where: { id: c.id, estado_proceso: c.estado_proceso, intentos: c.intentos },
                  data: { estado_proceso: "abandonado", error: `Abandonado tras ${c.intentos} intentos. Último error: ${c.error ?? "sin respuesta del reenvío"}`.slice(0, 500) },
                });
                if (r.count === 1) {
                  alertas.eventosAbandonados++;
                  resumen.abandonados++;
                  log.error("webhook_twilio_evento_abandonado", { tipo: c.tipo, intentos: c.intentos, total: alertas.eventosAbandonados });
                }
                continue;
              }
              if (!(await reclamarVencido(db, c, ahora))) continue; // otro proceso o el reintento de Twilio lo tomó
              const ok = await reenviarYMarcar(db, c.id, c.tipo, Buffer.from(c.cuerpo!), cabecerasDe(c.cabeceras));
              if (ok) resumen.reenviados++;
              else resumen.fallidos++;
            } catch (e) {
              resumen.errores++;
              log.error("webhook_twilio_barrido_error", { eventoId: c.id, error: (e as Error).message });
            }
          }
        } catch (e) {
          resumen.errores++;
          log.error("webhook_twilio_barrido_error", { organizacionId: org.id, error: (e as Error).message });
        }
      }
      return resumen;
    },
  };
}

/** Las cabeceras guardadas (JSON) como diccionario de texto. */
function cabecerasDe(valor: unknown): Record<string, string> {
  const salida: Record<string, string> = {};
  if (typeof valor === "object" && valor !== null && !Array.isArray(valor)) {
    for (const [k, v] of Object.entries(valor)) if (typeof v === "string") salida[k] = v;
  }
  return salida;
}
