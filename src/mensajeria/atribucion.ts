// Atribución de un lead a un anuncio Click-to-WhatsApp. El resto del sistema solo conoce esta
// interfaz; de dónde sale el dato (vía A, B o C de docs/DECISION-ATRIBUCION.md) es un adaptador.
// Elegir otra vía cambia un adaptador y nada más.

import type { EventoEntrante } from "./chatwoot/webhook.ts";

export interface Atribucion {
  /** Id del anuncio en Meta (ReferralSourceId). Obligatorio: sin él no hay atribución. */
  anuncioId: string;
  ctwaClid: string | null;
  anuncioTitulo: string | null;
  tipoOrigen: string | null;
  urlOrigen: string | null;
  /** El referral completo tal como llegó, para no perder campos que hoy no se usan. */
  crudo: Record<string, unknown>;
}

export interface FuenteAtribucion {
  /** Atribución del mensaje entrante, o null si no vino de un anuncio. No lanza por datos raros. */
  obtener(evento: EventoEntrante): Promise<Atribucion | null>;
}

/** Sin fuente de atribución: ningún mensaje viene de un anuncio. */
export class SinAtribucion implements FuenteAtribucion {
  async obtener(): Promise<Atribucion | null> {
    return null;
  }
}

/** Implementación simulada para tests y demos: se programa qué mensaje trae qué atribución. */
export class AtribucionSimulada implements FuenteAtribucion {
  private readonly porMensaje = new Map<string, Atribucion>();

  programar(idMensaje: string, atribucion: Atribucion): void {
    this.porMensaje.set(idMensaje, atribucion);
  }

  async obtener(evento: EventoEntrante): Promise<Atribucion | null> {
    return this.porMensaje.get(evento.idMensaje) ?? null;
  }
}
