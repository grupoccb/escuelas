-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "evento_disparador" ADD VALUE 'lead_frio';
ALTER TYPE "evento_disparador" ADD VALUE 'promocion_por_vencer';

-- AlterEnum
ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'lead_frio';

-- CreateTable
CREATE TABLE "aviso_promocion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "automatizacion_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "prospecto_id" UUID NOT NULL,
    "cotizacion_id" UUID NOT NULL,
    "promocion_id" UUID NOT NULL,
    "vence_el" DATE NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "aviso_promocion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "aviso_promocion_organizacion_id_idx" ON "aviso_promocion"("organizacion_id");

-- CreateIndex
CREATE INDEX "aviso_promocion_lead_id_idx" ON "aviso_promocion"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "aviso_promocion_id_organizacion_id_key" ON "aviso_promocion"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "aviso_promocion" ADD CONSTRAINT "aviso_promocion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso_promocion" ADD CONSTRAINT "aviso_promocion_automatizacion_id_organizacion_id_fkey" FOREIGN KEY ("automatizacion_id", "organizacion_id") REFERENCES "automatizacion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "aviso_promocion" ADD CONSTRAINT "aviso_promocion_lead_id_organizacion_id_fkey" FOREIGN KEY ("lead_id", "organizacion_id") REFERENCES "lead"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "aviso_promocion" ADD CONSTRAINT "aviso_promocion_prospecto_id_organizacion_id_fkey" FOREIGN KEY ("prospecto_id", "organizacion_id") REFERENCES "prospecto"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "aviso_promocion" ADD CONSTRAINT "aviso_promocion_cotizacion_id_organizacion_id_fkey" FOREIGN KEY ("cotizacion_id", "organizacion_id") REFERENCES "cotizacion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "aviso_promocion" ADD CONSTRAINT "aviso_promocion_promocion_id_organizacion_id_fkey" FOREIGN KEY ("promocion_id", "organizacion_id") REFERENCES "promocion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ── Lo que Prisma no expresa ─────────────────────────────────────────────────────────────────────────────
-- «No se repite el mismo aviso para la misma promoción y el mismo lead»: uno por (automatización, lead, promoción) entre los vivos.
CREATE UNIQUE INDEX "aviso_promocion_unico_key"
    ON "aviso_promocion" ("automatizacion_id", "lead_id", "promocion_id")
    WHERE "eliminado_en" IS NULL;
