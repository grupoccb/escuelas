// Transporte falso (invariante 11): registra lo que se habría enviado. Lo usan los tests y el
// backend cuando no hay credenciales de Chatwoot.

import { randomUUID } from "node:crypto";
import { EnvioIncierto, ErrorTransporte, type ContactoNuevo, type DestinoConversacion, type PlantillaAEnviar, type TransporteConversaciones } from "./transporte.ts";

export interface EnvioRegistrado {
  tipo: "mensaje" | "plantilla" | "nota_interna" | "abrir" | "iniciar";
  destino: DestinoConversacion;
  texto?: string;
  plantilla?: PlantillaAEnviar;
  /** Solo `iniciar`: a quién se le abrió la conversación. */
  contacto?: ContactoNuevo;
}

export class TransporteFalso implements TransporteConversaciones {
  readonly envios: EnvioRegistrado[] = [];
  /** Si se define, cada envío que cumpla la condición falla de forma definitiva: no salió (ErrorTransporte). */
  fallarSi: ((envio: EnvioRegistrado) => boolean) | undefined;
  /**
   * Si se define, cada envío que cumpla la condición SÍ sale (queda registrado) pero el transporte
   * lanza EnvioIncierto, como un tiempo de espera agotado con el mensaje ya creado en el proveedor.
   */
  inciertoSi: ((envio: EnvioRegistrado) => boolean) | undefined;
  /** Demora de cada envío, en ms (para probar carreras y tiempos de espera). */
  demoraMs = 0;
  /**
   * Se llama con el id del proveedor DESPUÉS de crear el mensaje y ANTES de devolverlo: es el
   * momento en que un evento de entrega puede llegar antes de que se guarde el id.
   */
  alEnviar: ((envio: EnvioRegistrado, idExterno: string) => Promise<void>) | undefined;

  async enviarMensaje(destino: DestinoConversacion, texto: string): Promise<{ idExterno: string }> {
    return this.enviar({ tipo: "mensaje", destino, texto });
  }

  async enviarPlantilla(destino: DestinoConversacion, plantilla: PlantillaAEnviar): Promise<{ idExterno: string }> {
    return this.enviar({ tipo: "plantilla", destino, texto: plantilla.cuerpo, plantilla });
  }

  async enviarNotaInterna(destino: DestinoConversacion, texto: string): Promise<{ idExterno: string }> {
    return this.enviar({ tipo: "nota_interna", destino, texto });
  }

  async abrirConversacion(destino: DestinoConversacion): Promise<void> {
    this.registrar({ tipo: "abrir", destino });
  }

  /** Ids de conversación que reparte `iniciarConversacion`, por encima de los que usan los tests (aleatorios hasta 2 000 millones). */
  private siguienteConversacion = 2_100_000_000;

  async iniciarConversacion(chatwootAccountId: number, _chatwootInboxId: number, contacto: ContactoNuevo): Promise<{ chatwootConversacionId: number }> {
    if (this.demoraMs > 0) await new Promise((resolver) => setTimeout(resolver, this.demoraMs));
    const chatwootConversacionId = this.siguienteConversacion++;
    this.registrar({ tipo: "iniciar", destino: { chatwootAccountId, chatwootConversacionId }, contacto });
    return { chatwootConversacionId };
  }

  private async enviar(envio: EnvioRegistrado): Promise<{ idExterno: string }> {
    if (this.demoraMs > 0) await new Promise((resolver) => setTimeout(resolver, this.demoraMs));
    this.registrar(envio);
    const idExterno = `falso-${randomUUID()}`;
    await this.alEnviar?.(envio, idExterno);
    if (this.inciertoSi?.(envio)) throw new EnvioIncierto("tiempo de espera agotado (simulado): no se sabe si salió");
    return { idExterno };
  }

  private registrar(envio: EnvioRegistrado): void {
    if (this.fallarSi?.(envio)) throw new ErrorTransporte("falla simulada", 500);
    this.envios.push(envio);
  }
}
