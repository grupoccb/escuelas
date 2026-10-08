-- AlterEnum
ALTER TYPE "paso_captacion" ADD VALUE 'programa';

-- AlterTable
ALTER TABLE "vertical" ADD COLUMN     "cotizador_whatsapp_activo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "prospecto" ADD COLUMN     "programa_sugerido_id" UUID;

-- AddForeignKey
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_programa_sugerido_id_organizacion_id_fkey" FOREIGN KEY ("programa_sugerido_id", "organizacion_id") REFERENCES "programa"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

