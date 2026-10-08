-- AlterEnum
ALTER TYPE "evento_disparador" ADD VALUE 'clase_muestra_no_asistio';

-- AlterEnum
ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'llamar_no_asistio';

-- AlterTable
ALTER TABLE "configuracion_organizacion" ADD COLUMN     "clase_muestra_correccion_horas" INTEGER NOT NULL DEFAULT 48;

-- AlterTable
ALTER TABLE "automatizacion" ADD COLUMN     "espaciado_minutos" INTEGER;

-- AlterTable
ALTER TABLE "clase_muestra" ADD COLUMN     "asistencia_marcada_en" TIMESTAMPTZ(6),
ADD COLUMN     "asistencia_marcada_por_usuario_id" UUID;

-- AddForeignKey
ALTER TABLE "clase_muestra" ADD CONSTRAINT "clase_muestra_asistencia_marcada_por_usuario_id_organizaci_fkey" FOREIGN KEY ("asistencia_marcada_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ── Lo que Prisma no expresa ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "configuracion_organizacion" ADD CONSTRAINT "configuracion_muestra_correccion_check" CHECK ("clase_muestra_correccion_horas" BETWEEN 1 AND 720);
-- El espaciado entre intentos de recuperación, si se fija, es de al menos una hora.
ALTER TABLE "automatizacion" ADD CONSTRAINT "automatizacion_espaciado_check" CHECK ("espaciado_minutos" IS NULL OR "espaciado_minutos" >= 60);
-- Quien marcó la asistencia y cuándo van juntos.
ALTER TABLE "clase_muestra" ADD CONSTRAINT "clase_muestra_asistencia_check" CHECK (
    ("asistencia_marcada_en" IS NULL AND "asistencia_marcada_por_usuario_id" IS NULL)
    OR ("asistencia_marcada_en" IS NOT NULL AND "asistencia_marcada_por_usuario_id" IS NOT NULL)
);
