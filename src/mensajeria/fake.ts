// Transporte falso (invariante 11): registra lo que se habría enviado. Lo usan los tests y el
// backend cuando no hay credenciales de Chatwoot.

import { randomUUID } from "node:crypto";
import { ErrorTransporte, type DestinoConversacion, type TransporteConversaciones } from "./transporte.ts";

export interface EnvioRegistrado {
  tipo: "mensaje" | "nota_interna" | "abrir";
  destino: DestinoConversacion;
  texto?: string;
}

export class TransporteFalso implements TransporteConversaciones {
  readonly envios: EnvioRegistrado[] = [];
  /** Si se define, cada envío que cumpla la condición falla. */
  fallarSi: ((envio: EnvioRegistrado) => boolean) | undefined;

  async enviarMensaje(destino: DestinoConversacion, texto: string): Promise<{ idExterno: string }> {
    this.registrar({ tipo: "mensaje", destino, texto });
    return { idExterno: `falso-${randomUUID()}` };
  }

  async enviarNotaInterna(destino: DestinoConversacion, texto: string): Promise<{ idExterno: string }> {
    this.registrar({ tipo: "nota_interna", destino, texto });
    return { idExterno: `falso-${randomUUID()}` };
  }

  async abrirConversacion(destino: DestinoConversacion): Promise<void> {
    this.registrar({ tipo: "abrir", destino });
  }

  private registrar(envio: EnvioRegistrado): void {
    if (this.fallarSi?.(envio)) throw new ErrorTransporte("falla simulada", 500);
    this.envios.push(envio);
  }
}
