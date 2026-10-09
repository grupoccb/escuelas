-- V2, decisión 4: reprogramar o cancelar una clase muestra por una PERSONA avisa a la familia (aviso de servicio). Dos eventos de automatización nuevos, uno por cambio, y un tipo
-- de tarea para el asesor cuando el aviso no puede salir a tiempo (fuera de horario con la clase encima, sin WhatsApp, tope de mensajes del día).

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "evento_disparador" ADD VALUE 'clase_muestra_reprogramada';
ALTER TYPE "evento_disparador" ADD VALUE 'clase_muestra_cancelada';

-- AlterEnum
ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'avisar_cambio_de_clase';
