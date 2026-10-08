-- AlterEnum
ALTER TYPE "estado_proceso_evento" ADD VALUE 'abandonado';

-- AlterTable
ALTER TABLE "evento_twilio" ADD COLUMN     "cabeceras" JSONB,
ADD COLUMN     "cuerpo" BYTEA;

