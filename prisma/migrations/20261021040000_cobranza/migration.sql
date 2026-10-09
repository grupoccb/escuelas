-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "evento_disparador" ADD VALUE 'cargo_por_vencer';
ALTER TYPE "evento_disparador" ADD VALUE 'cargo_vencido';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'deuda_vencida';
ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'cobranza_sin_canal';

-- AlterTable
ALTER TABLE "configuracion_organizacion" ADD COLUMN     "umbral_dias_deuda" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "tarea_asesor" ADD COLUMN     "cargo_id" UUID;

-- AddForeignKey
ALTER TABLE "tarea_asesor" ADD CONSTRAINT "tarea_asesor_cargo_id_organizacion_id_fkey" FOREIGN KEY ("cargo_id", "organizacion_id") REFERENCES "cargo"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

