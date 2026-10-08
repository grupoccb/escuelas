// Transporte: la operación cruda contra el proveedor. No aplica reglas; eso es trabajo de
// MessagingProvider (invariante 4). Hay una implementación real (Chatwoot) y una falsa para
// probar sin credenciales (invariante 11).

export interface DestinoConversacion {
  chatwootAccountId: number;
  chatwootConversacionId: number;
}

/** Una plantilla aprobada lista para mandar. */
export interface PlantillaAEnviar {
  /** Nombre de la plantilla en el proveedor (friendly_name de Twilio). */
  codigo: string;
  idioma: string;
  contentSid: string;
  /** Variables de la plantilla por posición: {"1": "valor"}. */
  variables: Record<string, string>;
  /** El texto ya con las variables puestas, para la transcripción. */
  cuerpo: string;
}

export interface TransporteConversaciones {
  /** Mensaje al contacto. Devuelve el id del mensaje en el proveedor. */
  enviarMensaje(destino: DestinoConversacion, texto: string): Promise<{ idExterno: string }>;
  /** Plantilla aprobada: lo único que puede salir fuera de la ventana de servicio. */
  enviarPlantilla(destino: DestinoConversacion, plantilla: PlantillaAEnviar): Promise<{ idExterno: string }>;
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

/**
 * El envío pudo haber salido o no: se acabó el tiempo, la conexión se cortó a medias, o Chatwoot
 * respondió bien pero sin un id utilizable. A diferencia de ErrorTransporte (no se pudo contactar
 * al proveedor o respondió con un error definitivo), aquí NO se sabe. MessagingProvider no lo
 * reenvía (a lo sumo una vez, invariante 8) y deja una tarea al asesor.
 */
export class EnvioIncierto extends ErrorTransporte {}
