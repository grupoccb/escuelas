// Prepara (y deshace) el ensayo con WhatsApp real (V9): deja una bandeja de WhatsApp-por-Twilio en Chatwoot, con el Agent Bot y sin asignación automática,
// el número en `canal_whatsapp` de la organización y la bandeja de la base apuntando a ella. Es IDEMPOTENTE: correrlo dos veces no crea nada de más; correrlo con
// una URL pública nueva (el túnel cambia en cada arranque) solo actualiza lo que cambió.
//
// No habla con la red por sí mismo: recibe dos PUERTOS (Chatwoot y Twilio). Los reales viven en scripts/ (herramientas de desarrollo); las pruebas y
// `--simulado` usan los falsos (invariante 11). Nunca devuelve ni imprime un secreto completo.

import { conAlcance } from "../../datos/alcance.ts";
import type { PrismaRaiz } from "../../datos/prisma.ts";
import { listarOrganizaciones } from "../../datos/sistema.ts";
import { enmascararSecreto, sinSecretos, urlsDeEnsayo, type EntornoEnsayo } from "./entorno.ts";

/** Sufijo con el que se nombra la bandeja de Twilio en Chatwoot: así `revertir` reconoce la suya y nunca toca otra. */
export const SUFIJO_BANDEJA_ENSAYO = " (ensayo WhatsApp)";

export interface BandejaChatwootEnsayo {
  id: number;
  name: string;
  channel_type: string;
  phone_number?: string | null;
}

export interface PuertoChatwootEnsayo {
  cuentaPorNombre(nombre: string): Promise<number>;
  botPorNombre(cuenta: number, nombre: string): Promise<number>;
  bandejas(cuenta: number): Promise<BandejaChatwootEnsayo[]>;
  /** Crea la bandeja de WhatsApp por Twilio (Chatwoot valida las credenciales con Twilio). */
  crearBandejaTwilio(cuenta: number, datos: { nombre: string; sid: string; token: string; numero: string }): Promise<BandejaChatwootEnsayo>;
  actualizarCredencialesTwilio(cuenta: number, bandeja: number, datos: { sid: string; token: string }): Promise<void>;
  asignarBot(cuenta: number, bandeja: number, bot: number): Promise<void>;
  sinAsignacionAutomatica(cuenta: number, bandeja: number): Promise<void>;
}

export type ResultadoCredenciales = { ok: true; nombreCuenta: string | null } | { ok: false; motivo: string };

export interface PuertoTwilioEnsayo {
  verificarCredenciales(sid: string, token: string): Promise<ResultadoCredenciales>;
}

export interface ResumenEnsayo {
  organizacion: string;
  canal: string;
  bandejaDeLaBase: string;
  chatwoot: { cuenta: number; bandeja: number; nombre: string; estado: "creada" | "credenciales actualizadas" };
  numero: string;
  /** Lo que se cambió en la base (o, con `soloVer`, lo que se cambiaría). */
  cambios: string[];
  /** Lo que hay que pegar en la consola de Twilio. */
  consolaTwilio: { cuandoLlegaUnMensaje: string; urlDeEstados: string };
  tokenEnmascarado: string;
}

export class ErrorDeEnsayo extends Error {}

/** Qué bandeja ya existente en Chatwoot corresponde a la de la base: primero la que ya tiene el id; si no, por nombre. Nunca una de otro tipo por el nombre equivocado. */
export function elegirBandejaExistente(existentes: BandejaChatwootEnsayo[], idGuardado: number | null, nombre: string, tipo: string): BandejaChatwootEnsayo | undefined {
  const delTipo = existentes.filter((b) => b.channel_type === tipo);
  return delTipo.find((b) => b.id === idGuardado) ?? delTipo.find((b) => b.name === nombre);
}

interface OpcionesPreparar {
  prisma: PrismaRaiz;
  entorno: EntornoEnsayo;
  chatwoot: PuertoChatwootEnsayo;
  twilio: PuertoTwilioEnsayo;
  /** Simulación en seco: no escribe en la base ni crea nada en Chatwoot (solo lee y valida). */
  soloVer?: boolean;
}

export async function prepararEnsayo({ prisma, entorno, chatwoot, twilio, soloVer = false }: OpcionesPreparar): Promise<ResumenEnsayo> {
  const secretos = [entorno.twilio.token, entorno.chatwoot.tokenAdmin];
  const cred = await twilio.verificarCredenciales(entorno.twilio.sid, entorno.twilio.token);
  if (!cred.ok) throw new ErrorDeEnsayo(`Twilio no aceptó las credenciales: ${sinSecretos(cred.motivo, secretos)}. Revisa TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN en .env (están en la consola de Twilio).`);

  const cuenta = await chatwoot.cuentaPorNombre(entorno.chatwoot.cuenta);
  const bot = await chatwoot.botPorNombre(cuenta, entorno.chatwoot.botNombre);

  const organizaciones = await listarOrganizaciones(prisma);
  const org = organizaciones[0];
  if (!org) throw new ErrorDeEnsayo("No hay ninguna organización en la base. ¿Corrió la demo (`docker compose up -d --build --wait`)?");
  const db = conAlcance(prisma, org.id);

  const canales = await db.canal_whatsapp.findMany({ orderBy: { creado_en: "asc" } });
  const canal = entorno.canal ? canales.find((c) => c.nombre_publico === entorno.canal) : canales[0];
  if (!canal) {
    throw new ErrorDeEnsayo(
      entorno.canal
        ? `No existe un canal llamado «${entorno.canal}». Los que hay: ${canales.map((c) => `«${c.nombre_publico}»`).join(", ") || "(ninguno)"}.`
        : "La organización no tiene canales de WhatsApp.",
    );
  }
  const otro = canales.find((c) => c.id !== canal.id && c.numero_whatsapp === entorno.twilio.numero);
  if (otro) throw new ErrorDeEnsayo(`El número ${entorno.twilio.numero} ya está en otro canal («${otro.nombre_publico}»). Un número solo puede recibir en un canal.`);
  const bandeja = (await db.bandeja_chatwoot.findMany({ where: { canal_whatsapp_id: canal.id }, orderBy: { creado_en: "asc" } }))[0];
  if (!bandeja) throw new ErrorDeEnsayo(`El canal «${canal.nombre_publico}» no tiene bandeja. Corre la preparación de la demo primero.`);

  // 1. La bandeja de Twilio en Chatwoot (por número; si no, por nombre).
  const nombre = `${bandeja.nombre}${SUFIJO_BANDEJA_ENSAYO}`;
  const numeroSinPrefijo = entorno.twilio.numero.replace(/^whatsapp:/, "");
  const existentes = await chatwoot.bandejas(cuenta);
  const propia = existentes.find((b) => b.channel_type === "Channel::TwilioSms" && (b.phone_number ?? "").replace(/^whatsapp:/, "") === numeroSinPrefijo) ?? elegirBandejaExistente(existentes, null, nombre, "Channel::TwilioSms");
  let enChatwoot: BandejaChatwootEnsayo | undefined = propia;
  const yaExistia = enChatwoot !== undefined;
  const cambios: string[] = [];
  if (!enChatwoot) {
    if (soloVer) enChatwoot = { id: 0, name: nombre, channel_type: "Channel::TwilioSms", phone_number: numeroSinPrefijo };
    else {
      try {
        enChatwoot = await chatwoot.crearBandejaTwilio(cuenta, { nombre, sid: entorno.twilio.sid, token: entorno.twilio.token, numero: numeroSinPrefijo });
      } catch (e) {
        throw new ErrorDeEnsayo(`Chatwoot no pudo crear la bandeja de Twilio: ${sinSecretos(e instanceof Error ? e.message : String(e), secretos)}. Si dice que no alcanza a Twilio, revisa que Chatwoot se levantó con ENSAYO_TWILIO_BLOQUEO_PREFIJO en .env (docs/ENSAYO-WHATSAPP-REAL.md, «Si algo falla»).`);
      }
    }
    cambios.push(`bandeja «${nombre}» creada en Chatwoot`);
  } else {
    // Ya existía: se vuelven a dar las credenciales (el token puede haber cambiado) sin duplicar nada.
    if (!soloVer) await chatwoot.actualizarCredencialesTwilio(cuenta, enChatwoot.id, { sid: entorno.twilio.sid, token: entorno.twilio.token });
  }
  if (!soloVer) {
    await chatwoot.asignarBot(cuenta, enChatwoot.id, bot);
    await chatwoot.sinAsignacionAutomatica(cuenta, enChatwoot.id);
  }

  // 2. La base: el número en el canal y la bandeja apuntando a la de Twilio.
  if (canal.numero_whatsapp !== entorno.twilio.numero) cambios.push(`canal «${canal.nombre_publico}»: número ${canal.numero_whatsapp ?? "(sin número)"} → ${entorno.twilio.numero}`);
  if (bandeja.chatwoot_inbox_id !== enChatwoot.id || bandeja.chatwoot_account_id !== cuenta) cambios.push(`bandeja «${bandeja.nombre}»: pasa a ser la de Twilio${enChatwoot.id > 0 ? ` (bandeja ${enChatwoot.id} de Chatwoot)` : ""}`);
  if (!soloVer) {
    if (canal.numero_whatsapp !== entorno.twilio.numero) await db.canal_whatsapp.update({ where: { id: canal.id }, data: { numero_whatsapp: entorno.twilio.numero } });
    await db.bandeja_chatwoot.update({ where: { id: bandeja.id }, data: { chatwoot_account_id: cuenta, chatwoot_inbox_id: enChatwoot.id } });
  }

  const urls = urlsDeEnsayo(entorno.origen);
  return {
    organizacion: org.nombre,
    canal: canal.nombre_publico,
    bandejaDeLaBase: bandeja.nombre,
    chatwoot: { cuenta, bandeja: enChatwoot.id, nombre: enChatwoot.name, estado: yaExistia ? "credenciales actualizadas" : "creada" },
    numero: entorno.twilio.numero,
    cambios,
    consolaTwilio: { cuandoLlegaUnMensaje: urls.entrantes, urlDeEstados: urls.estados },
    tokenEnmascarado: enmascararSecreto(entorno.twilio.token),
  };
}

export interface ResumenReversion {
  canales: string[];
  cambios: string[];
}

/**
 * Regresa al modo simulado: quita el número de los canales cuya bandeja es la del ensayo y vuelve a apuntar la bandeja de la base a la bandeja tipo API de
 * la demo (la de siempre). NO borra nada en Chatwoot: la bandeja de Twilio y sus conversaciones quedan (se pueden borrar a mano). Sin variables de Twilio.
 */
export async function revertirEnsayo({ prisma, chatwoot, cuentaNombre, soloVer = false }: { prisma: PrismaRaiz; chatwoot: PuertoChatwootEnsayo; cuentaNombre: string; soloVer?: boolean }): Promise<ResumenReversion> {
  const cuenta = await chatwoot.cuentaPorNombre(cuentaNombre);
  const existentes = await chatwoot.bandejas(cuenta);
  const resumen: ResumenReversion = { canales: [], cambios: [] };
  for (const org of await listarOrganizaciones(prisma)) {
    const db = conAlcance(prisma, org.id);
    for (const bandeja of await db.bandeja_chatwoot.findMany({ orderBy: { creado_en: "asc" } })) {
      const actual = existentes.find((b) => b.id === bandeja.chatwoot_inbox_id);
      const esDelEnsayo = actual?.channel_type === "Channel::TwilioSms" && actual.name.endsWith(SUFIJO_BANDEJA_ENSAYO);
      if (!esDelEnsayo) continue;
      const api = elegirBandejaExistente(existentes, null, bandeja.nombre, "Channel::Api");
      if (!api) throw new ErrorDeEnsayo(`No encuentro la bandeja de la demo «${bandeja.nombre}» en Chatwoot para regresar a ella. Corre \`docker compose up -d\` (la prepara) y repite.`);
      const canal = await db.canal_whatsapp.findFirst({ where: { id: bandeja.canal_whatsapp_id } });
      resumen.canales.push(canal?.nombre_publico ?? bandeja.nombre);
      resumen.cambios.push(`canal «${canal?.nombre_publico ?? bandeja.nombre}»: se quita el número ${canal?.numero_whatsapp ?? "(sin número)"}`, `bandeja «${bandeja.nombre}»: vuelve a la de la demo (bandeja ${api.id})`);
      if (!soloVer) {
        if (canal) await db.canal_whatsapp.update({ where: { id: canal.id }, data: { numero_whatsapp: null } });
        await db.bandeja_chatwoot.update({ where: { id: bandeja.id }, data: { chatwoot_account_id: cuenta, chatwoot_inbox_id: api.id } });
      }
    }
  }
  return resumen;
}
