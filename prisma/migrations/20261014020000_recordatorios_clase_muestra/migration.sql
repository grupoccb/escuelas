-- AlterEnum
ALTER TYPE "evento_disparador" ADD VALUE 'clase_muestra_proxima';

-- AlterTable
ALTER TABLE "clase_muestra" ADD COLUMN     "ultimo_recordatorio_en" TIMESTAMPTZ(6);

