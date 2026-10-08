// Transporte: la operación cruda contra el proveedor. No aplica reglas; eso es trabajo de
// MessagingProvider (invariante 4). Hay una implementación real (Chatwoot) y una falsa para
// probar sin credenciales (invariante 11).

export interface DestinoConversacion {
  chatwootAccountId: number;
  chatwootConversacionId: number;
}

export interface TransporteConversaciones {
  /** Mensaje al contacto. Devuelve el id del mensaje en el proveedor. */
  enviarMensaje(destino: DestinoConversacion, texto: string): Promise<{ idExterno: string }>;
  /** Nota que solo ven los asesores. */
  enviarNotaInterna(destino: DestinoConversacion, texto: string): Promise<{ idExterno: string }>;
  /** Pasa la conversación a la bandeja de asesores. */
  abrirConversacion(destino: DestinoConversacion): Promise<void>;
}

export class ErrorTransporte extends Error {
  readonly status: number | undefined;

  constructor(mensaje: string, status?: number) {
    super(mensaje);
    this.status = status;
  }
}
