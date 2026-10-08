// Tipos de la base que el resto del código puede usar sin importar el cliente generado.

export type {
  estado_conversacion as EstadoConversacion,
  paso_captacion as PasoCaptacion,
  direccion_mensaje as DireccionMensaje,
  estatus_mensaje as EstatusMensaje,
} from "../generated/prisma/enums.ts";

import type { Prisma } from "../generated/prisma/client.ts";

/** Valor que Prisma acepta en una columna JSON. */
export type ValorJson = Prisma.InputJsonValue;
