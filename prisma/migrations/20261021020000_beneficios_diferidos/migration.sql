-- AlterEnum
ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'beneficio_en_revision';

-- AlterEnum
ALTER TYPE "estatus_aplicacion" ADD VALUE 'liberado';

-- AlterTable
ALTER TABLE "promocion_aplicacion" ADD COLUMN     "entregado_por_usuario_id" UUID,
ADD COLUMN     "liberado_en" TIMESTAMPTZ(6),
ADD COLUMN     "liberado_por_pago_id" UUID,
ADD COLUMN     "revision_en" TIMESTAMPTZ(6);

-- AddForeignKey
ALTER TABLE "promocion_aplicacion" ADD CONSTRAINT "promocion_aplicacion_liberado_por_pago_id_organizacion_id_fkey" FOREIGN KEY ("liberado_por_pago_id", "organizacion_id") REFERENCES "pago"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "promocion_aplicacion" ADD CONSTRAINT "promocion_aplicacion_entregado_por_usuario_id_organizacion_fkey" FOREIGN KEY ("entregado_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

