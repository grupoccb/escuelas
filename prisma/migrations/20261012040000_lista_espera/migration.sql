-- CreateEnum
CREATE TYPE "estatus_lista_espera" AS ENUM ('esperando', 'ofrecido', 'inscrito', 'cancelado');

-- AlterEnum
ALTER TYPE "paso_captacion" ADD VALUE 'lista_espera';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'lista_espera_nueva';
ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'lista_espera_lugar_liberado';

-- AlterTable
ALTER TABLE "configuracion_organizacion" ADD COLUMN     "lista_espera_oferta_horas" INTEGER NOT NULL DEFAULT 48;

-- CreateTable
CREATE TABLE "lista_espera" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "prospecto_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "estatus" "estatus_lista_espera" NOT NULL DEFAULT 'esperando',
    "posicion" INTEGER NOT NULL,
    "ofrecido_en" TIMESTAMPTZ(6),
    "vence_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "lista_espera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lista_espera_organizacion_id_idx" ON "lista_espera"("organizacion_id");

-- CreateIndex
CREATE INDEX "lista_espera_grupo_id_idx" ON "lista_espera"("grupo_id");

-- CreateIndex
CREATE INDEX "lista_espera_lead_id_idx" ON "lista_espera"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "lista_espera_id_organizacion_id_key" ON "lista_espera"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_grupo_id_organizacion_id_fkey" FOREIGN KEY ("grupo_id", "organizacion_id") REFERENCES "grupo"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_prospecto_id_organizacion_id_fkey" FOREIGN KEY ("prospecto_id", "organizacion_id") REFERENCES "prospecto"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_lead_id_organizacion_id_fkey" FOREIGN KEY ("lead_id", "organizacion_id") REFERENCES "lead"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ── Lo que Prisma no expresa ─────────────────────────────────────────────────────────────────────────────
-- Una entrada VIVA (esperando u ofrecido) por (grupo, prospecto): apuntarse dos veces no duplica.
CREATE UNIQUE INDEX "lista_espera_viva_key"
    ON "lista_espera" ("grupo_id", "prospecto_id")
    WHERE "estatus" IN ('esperando', 'ofrecido') AND "eliminado_en" IS NULL;

-- La posición es única por grupo entre las vivas: dos altas simultáneas no pueden quedar con la misma
-- (la segunda falla y se repite con la posición siguiente).
CREATE UNIQUE INDEX "lista_espera_posicion_key"
    ON "lista_espera" ("grupo_id", "posicion")
    WHERE "estatus" IN ('esperando', 'ofrecido') AND "eliminado_en" IS NULL;

ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_posicion_check" CHECK ("posicion" >= 1);
-- «Ofrecido» tiene fecha de oferta y de vencimiento (posterior); las demás, no hablan de oferta aquí.
ALTER TABLE "lista_espera" ADD CONSTRAINT "lista_espera_oferta_check" CHECK (
    ("estatus" = 'ofrecido' AND "ofrecido_en" IS NOT NULL AND "vence_en" IS NOT NULL AND "vence_en" > "ofrecido_en")
    OR ("estatus" = 'esperando' AND "ofrecido_en" IS NULL AND "vence_en" IS NULL)
    OR "estatus" IN ('inscrito', 'cancelado')
);
ALTER TABLE "configuracion_organizacion" ADD CONSTRAINT "configuracion_lista_espera_horas_check" CHECK ("lista_espera_oferta_horas" BETWEEN 1 AND 720);
