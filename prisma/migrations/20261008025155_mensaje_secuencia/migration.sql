-- DropIndex
DROP INDEX "mensaje_conversacion_id_creado_en_idx";

-- AlterTable
ALTER TABLE "mensaje" ADD COLUMN     "secuencia" BIGSERIAL NOT NULL;

-- CreateIndex
CREATE INDEX "mensaje_conversacion_id_secuencia_idx" ON "mensaje"("conversacion_id", "secuencia");
