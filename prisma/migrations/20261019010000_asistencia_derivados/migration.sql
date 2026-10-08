-- AlterEnum
ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'faltas_consecutivas';

-- AlterTable
ALTER TABLE "configuracion_organizacion" ADD COLUMN     "umbral_faltas_consecutivas" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "tarea_asesor" ADD COLUMN     "inscripcion_id" UUID,
ADD COLUMN     "referencia_fecha" DATE;

-- AddForeignKey
ALTER TABLE "tarea_asesor" ADD CONSTRAINT "tarea_asesor_inscripcion_id_organizacion_id_fkey" FOREIGN KEY ("inscripcion_id", "organizacion_id") REFERENCES "inscripcion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- G2: el umbral de faltas es de la organización y razonable.
ALTER TABLE "configuracion_organizacion" ADD CONSTRAINT "configuracion_umbral_faltas_chk" CHECK ("umbral_faltas_consecutivas" BETWEEN 1 AND 30);
-- Una tarea de faltas PENDIENTE por inscripción (el índice no nombra el valor nuevo del enum: se agregó en esta misma migración).
CREATE UNIQUE INDEX "tarea_asesor_inscripcion_pendiente_key" ON "tarea_asesor" ("inscripcion_id", "tipo") WHERE "estado" = 'pendiente' AND "eliminado_en" IS NULL AND "inscripcion_id" IS NOT NULL;
-- Y UNA por racha, sin importar su estado: resolverla a mano mientras la racha sigue, o repetir el pase, no la vuelve a crear.
CREATE UNIQUE INDEX "tarea_asesor_inscripcion_racha_key" ON "tarea_asesor" ("inscripcion_id", "tipo", "referencia_fecha") WHERE "eliminado_en" IS NULL AND "inscripcion_id" IS NOT NULL AND "referencia_fecha" IS NOT NULL;
