// La parte de administración de Chatwoot que usa `ensayo:preparar`, EN MEMORIA (V9, invariante 11): para probarlo y para `--simulado`, que no toca el Chatwoot real.
// Recuerda lo que se le pidió, para que las pruebas comprueben que es idempotente y que el token nunca viaja donde no debe.

import type { BandejaChatwootEnsayo, PuertoChatwootEnsayo } from "../mensajeria/ensayo/preparar.ts";

export class ChatwootAdminFalso implements PuertoChatwootEnsayo {
  readonly cuenta: number;
  readonly bot = 3;
  readonly lista: BandejaChatwootEnsayo[];
  /** Cada llamada que cambia algo, en orden. */
  readonly llamadas: string[] = [];
  /** Credenciales que se le dieron a cada bandeja de Twilio (para ver que se actualizan, sin imprimirlas). */
  readonly credenciales = new Map<number, { sid: string; token: string }>();
  /** Si se define, crear la bandeja de Twilio falla con este texto (como un Chatwoot que no alcanza a Twilio). */
  fallarAlCrear: string | null = null;
  private siguiente: number;

  /** `cuenta` y `primerId` dejan que cada prueba use ids propios (la base no admite dos bandejas vivas con la misma cuenta y bandeja de Chatwoot). */
  constructor(existentes: BandejaChatwootEnsayo[] = [], { cuenta = 7, primerId = 100 }: { cuenta?: number; primerId?: number } = {}) {
    this.cuenta = cuenta;
    this.siguiente = primerId;
    this.lista = [...existentes];
  }

  async cuentaPorNombre(nombre: string): Promise<number> {
    this.llamadas.push(`cuenta:${nombre}`);
    return this.cuenta;
  }
  async botPorNombre(): Promise<number> {
    return this.bot;
  }
  async bandejas(): Promise<BandejaChatwootEnsayo[]> {
    return this.lista.map((b) => ({ ...b }));
  }
  async crearBandejaTwilio(_cuenta: number, datos: { nombre: string; sid: string; token: string; numero: string }): Promise<BandejaChatwootEnsayo> {
    if (this.fallarAlCrear) throw new Error(this.fallarAlCrear);
    const b = { id: this.siguiente++, name: datos.nombre, channel_type: "Channel::TwilioSms", phone_number: `whatsapp:${datos.numero}` };
    this.lista.push(b);
    this.credenciales.set(b.id, { sid: datos.sid, token: datos.token });
    this.llamadas.push(`crear:${datos.nombre}`);
    return { ...b };
  }
  async actualizarCredencialesTwilio(_cuenta: number, bandeja: number, datos: { sid: string; token: string }): Promise<void> {
    this.credenciales.set(bandeja, datos);
    this.llamadas.push(`credenciales:${bandeja}`);
  }
  async asignarBot(_cuenta: number, bandeja: number): Promise<void> {
    this.llamadas.push(`bot:${bandeja}`);
  }
  async sinAsignacionAutomatica(_cuenta: number, bandeja: number): Promise<void> {
    this.llamadas.push(`sin-asignacion:${bandeja}`);
  }
}
