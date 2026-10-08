// Tipos de la base que el resto del código puede usar sin importar el cliente generado.

export type {
  estado_conversacion as EstadoConversacion,
  paso_captacion as PasoCaptacion,
  direccion_mensaje as DireccionMensaje,
  estatus_mensaje as EstatusMensaje,
  origen_mensaje as OrigenMensaje,
  tipo_tarea_asesor as TipoTareaAsesor,
} from "../generated/prisma/enums.ts";

import { Prisma } from "../generated/prisma/client.ts";

/** Valor que Prisma acepta en una columna JSON. */
export type ValorJson = Prisma.InputJsonValue;

/** Para poner en NULL una columna JSON (Prisma distingue el NULL de SQL del valor JSON `null`). */
export const JSON_NULO = Prisma.JsonNull;

import { estado_tarea_asesor, tipo_tarea_asesor } from "../generated/prisma/enums.ts";

/** Valores de los enums de tareas, para validar entradas sin importar el cliente generado. */
export const TIPOS_DE_TAREA = Object.values(tipo_tarea_asesor) as [tipo_tarea_asesor, ...tipo_tarea_asesor[]];
export const ESTADOS_DE_TAREA = Object.values(estado_tarea_asesor) as ["pendiente", "hecha", "descartada"];
