-- CreateEnum
CREATE TYPE "tipo_codigo_rastreo" AS ENUM ('campana', 'lead');

-- AlterEnum
ALTER TYPE "origen_prospecto" ADD VALUE 'landing';

-- CreateTable
CREATE TABLE "codigo_rastreo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" "tipo_codigo_rastreo" NOT NULL,
    "campana_id" UUID,
    "sucursal_id" UUID,
    "vertical_id" UUID,
    "lead_id" UUID,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "max_usos" INTEGER,
    "vigente_desde" TIMESTAMPTZ(6),
    "vigente_hasta" TIMESTAMPTZ(6),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "codigo_rastreo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "codigo_rastreo_organizacion_id_idx" ON "codigo_rastreo"("organizacion_id");

-- CreateIndex
CREATE INDEX "codigo_rastreo_lead_id_idx" ON "codigo_rastreo"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "codigo_rastreo_id_organizacion_id_key" ON "codigo_rastreo"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "codigo_rastreo" ADD CONSTRAINT "codigo_rastreo_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codigo_rastreo" ADD CONSTRAINT "codigo_rastreo_campana_id_organizacion_id_fkey" FOREIGN KEY ("campana_id", "organizacion_id") REFERENCES "campana"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "codigo_rastreo" ADD CONSTRAINT "codigo_rastreo_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "codigo_rastreo" ADD CONSTRAINT "codigo_rastreo_vertical_id_organizacion_id_fkey" FOREIGN KEY ("vertical_id", "organizacion_id") REFERENCES "vertical"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "codigo_rastreo" ADD CONSTRAINT "codigo_rastreo_lead_id_organizacion_id_fkey" FOREIGN KEY ("lead_id", "organizacion_id") REFERENCES "lead"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ── Lo que Prisma no expresa ─────────────────────────────────────────────────────────────────────────────
-- El código es único entre los vivos de la organización (uno borrado libera el código). Formato: 8 caracteres de un alfabeto sin ambiguos
-- (sin I, L, O, 0 ni 1) y con al menos un dígito: así una palabra cualquiera de un mensaje casi nunca se confunde con un código.
CREATE UNIQUE INDEX "codigo_rastreo_codigo_key" ON "codigo_rastreo" ("organizacion_id", "codigo") WHERE "eliminado_en" IS NULL;
ALTER TABLE "codigo_rastreo" ADD CONSTRAINT "codigo_rastreo_formato_check" CHECK ("codigo" ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8}$' AND "codigo" ~ '[2-9]');
-- Un código de campaña lleva su campaña; uno de lead, su lead (y se usa una sola vez). Los usos no son negativos ni pasan del tope.
ALTER TABLE "codigo_rastreo" ADD CONSTRAINT "codigo_rastreo_tipo_check" CHECK (
    ("tipo" = 'campana' AND "campana_id" IS NOT NULL AND "lead_id" IS NULL)
    OR ("tipo" = 'lead' AND "lead_id" IS NOT NULL AND "max_usos" = 1)
);
ALTER TABLE "codigo_rastreo" ADD CONSTRAINT "codigo_rastreo_usos_check" CHECK ("usos" >= 0 AND ("max_usos" IS NULL OR ("max_usos" >= 1 AND "usos" <= "max_usos")));
ALTER TABLE "codigo_rastreo" ADD CONSTRAINT "codigo_rastreo_vigencia_check" CHECK ("vigente_desde" IS NULL OR "vigente_hasta" IS NULL OR "vigente_hasta" > "vigente_desde");
-- Un lead tiene a lo más un código vivo sin usar a la vez (el de su mensaje prellenado de WhatsApp).
CREATE UNIQUE INDEX "codigo_rastreo_lead_vivo_key" ON "codigo_rastreo" ("lead_id") WHERE "tipo" = 'lead' AND "usos" = 0 AND "activo" AND "eliminado_en" IS NULL;
