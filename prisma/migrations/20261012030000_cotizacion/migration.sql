-- CreateEnum
CREATE TYPE "estatus_cotizacion" AS ENUM ('vigente', 'aceptada', 'vencida');

-- CreateEnum
CREATE TYPE "origen_cotizacion" AS ENUM ('bot', 'asesor');

-- AlterEnum
ALTER TYPE "paso_captacion" ADD VALUE 'horario';

-- AlterTable
ALTER TABLE "configuracion_organizacion" ADD COLUMN     "cotizacion_vigencia_dias" INTEGER NOT NULL DEFAULT 7;

-- CreateTable
CREATE TABLE "cotizacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "prospecto_id" UUID NOT NULL,
    "programa_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "origen" "origen_cotizacion" NOT NULL,
    "conversacion_id" UUID,
    "creado_por_usuario_id" UUID,
    "grupo_elegido_id" UUID,
    "fecha" DATE NOT NULL,
    "vigente_hasta" DATE NOT NULL,
    "estatus" "estatus_cotizacion" NOT NULL DEFAULT 'vigente',
    "snapshot" JSONB NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cotizacion_organizacion_id_idx" ON "cotizacion"("organizacion_id");

-- CreateIndex
CREATE INDEX "cotizacion_lead_id_idx" ON "cotizacion"("lead_id");

-- CreateIndex
CREATE INDEX "cotizacion_prospecto_id_programa_id_idx" ON "cotizacion"("prospecto_id", "programa_id");

-- CreateIndex
CREATE UNIQUE INDEX "cotizacion_id_organizacion_id_key" ON "cotizacion"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_lead_id_organizacion_id_fkey" FOREIGN KEY ("lead_id", "organizacion_id") REFERENCES "lead"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_prospecto_id_organizacion_id_fkey" FOREIGN KEY ("prospecto_id", "organizacion_id") REFERENCES "prospecto"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_programa_id_organizacion_id_fkey" FOREIGN KEY ("programa_id", "organizacion_id") REFERENCES "programa"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_conversacion_id_organizacion_id_fkey" FOREIGN KEY ("conversacion_id", "organizacion_id") REFERENCES "conversacion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_creado_por_usuario_id_organizacion_id_fkey" FOREIGN KEY ("creado_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_grupo_elegido_id_organizacion_id_fkey" FOREIGN KEY ("grupo_elegido_id", "organizacion_id") REFERENCES "grupo"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ── Lo que Prisma no expresa ─────────────────────────────────────────────────────────────────────────────
-- A lo más UNA cotización vigente por (prospecto, programa): una nueva reemplaza (vence) a la anterior en la misma
-- transacción; si dos altas compiten, la base rechaza a la segunda y se repite.
CREATE UNIQUE INDEX "cotizacion_vigente_key"
    ON "cotizacion" ("prospecto_id", "programa_id")
    WHERE "estatus" = 'vigente' AND "eliminado_en" IS NULL;

-- Vale desde el día que se cotizó, nunca antes; los días de vigencia de la configuración son positivos.
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_vigencia_check" CHECK ("vigente_hasta" >= "fecha");
-- El bot la manda dentro de una conversación y ningún asesor la hizo; la de un asesor no viene de una conversación.
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_origen_check" CHECK (
    ("origen" = 'asesor' AND "conversacion_id" IS NULL) OR ("origen" = 'bot' AND "creado_por_usuario_id" IS NULL AND "conversacion_id" IS NOT NULL)
);
ALTER TABLE "cotizacion" ADD CONSTRAINT "cotizacion_snapshot_check" CHECK (jsonb_typeof("snapshot") = 'object');
ALTER TABLE "configuracion_organizacion" ADD CONSTRAINT "configuracion_cotizacion_vigencia_check" CHECK ("cotizacion_vigencia_dias" BETWEEN 1 AND 365);
