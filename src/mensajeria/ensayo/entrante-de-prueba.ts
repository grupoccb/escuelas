// Un mensaje entrante «de Twilio» armado y firmado a mano, para el ensayo (V9): sirve para comprobar `+521…` contra `+52…` con TU celular, porque WhatsApp
// decide en qué forma llega y no se puede forzar desde el teléfono. Se firma con TU token y la URL pública, así que entra por el mismo camino que uno real (y el
// asistente contestará de verdad por Twilio al número que pongas: úsalo solo con tu propio celular).

import { randomBytes } from "node:crypto";
import { normalizarTelefono } from "../../lib/telefono.ts";
import { calcularFirmaTwilio } from "../twilio/firma.ts";
import { urlsDeEnsayo } from "./entorno.ts";

export interface PeticionDePrueba {
  url: string;
  cuerpo: string;
  firma: string;
}

/** `desde`: el celular tal cual quieres que llegue (`+5215512345678` o `+525512345678`). */
export function entranteDePrueba(o: { origen: string; token: string; sid: string; numeroEscuela: string; desde: string; texto: string }): PeticionDePrueba {
  const e164 = normalizarTelefono(o.desde);
  // `normalizarTelefono` colapsa +521 a +52: aquí se respeta la forma que se pidió, porque justo eso es lo que se prueba.
  const crudo = o.desde.trim().replace(/^whatsapp:/, "").replace(/[\s\-().]/g, "");
  if (!e164 || !/^\+\d{10,15}$/.test(crudo)) throw new Error(`«${o.desde}» no es un celular válido. Escríbelo con el signo + y el código de país, por ejemplo +5215512345678.`);
  const sid = `SM${randomBytes(16).toString("hex")}`;
  const params: Record<string, string> = {
    SmsMessageSid: sid,
    NumMedia: "0",
    ProfileName: "Ensayo",
    MessageType: "text",
    SmsSid: sid,
    WaId: crudo.slice(1),
    SmsStatus: "received",
    Body: o.texto,
    To: o.numeroEscuela,
    NumSegments: "1",
    MessageSid: sid,
    AccountSid: o.sid,
    From: `whatsapp:${crudo}`,
    ApiVersion: "2010-04-01",
  };
  const url = urlsDeEnsayo(o.origen).entrantes;
  return { url, cuerpo: new URLSearchParams(params).toString(), firma: calcularFirmaTwilio(o.token, url, params) };
}
