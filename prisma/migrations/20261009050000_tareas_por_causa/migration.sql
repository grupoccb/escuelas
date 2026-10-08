-- AlterEnum
-- Tareas para el asesor por causa (EA-14). Varios valores en una migración: requiere PostgreSQL 12 o
-- posterior (el proyecto usa 16). Los valores nuevos no se usan dentro de esta migración.

ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'envio_incierto';
ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'automatizacion_omitida';
ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'baja_solicitada';
ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'nota_fallida';

