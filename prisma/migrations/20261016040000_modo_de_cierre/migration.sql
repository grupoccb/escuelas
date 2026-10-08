-- CreateEnum
CREATE TYPE "modo_cierre_inscripcion" AS ENUM ('asesor_whatsapp', 'maestro_en_sitio');

-- AlterEnum
ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'listo_para_cerrar';

-- AlterTable
ALTER TABLE "configuracion_organizacion" ADD COLUMN     "modo_cierre" "modo_cierre_inscripcion" NOT NULL DEFAULT 'asesor_whatsapp';

-- AlterTable
ALTER TABLE "clase_muestra" ADD COLUMN     "listo_para_cerrar_en" TIMESTAMPTZ(6),
ADD COLUMN     "listo_para_cerrar_por_usuario_id" UUID;

-- AddForeignKey
ALTER TABLE "clase_muestra" ADD CONSTRAINT "clase_muestra_listo_para_cerrar_por_usuario_id_organizacio_fkey" FOREIGN KEY ("listo_para_cerrar_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Quién y cuándo marcó «listo para cerrar», siempre juntos.
ALTER TABLE "clase_muestra" ADD CONSTRAINT "clase_muestra_listo_check" CHECK (("listo_para_cerrar_en" IS NULL) = ("listo_para_cerrar_por_usuario_id" IS NULL));
