-- CreateTable
CREATE TABLE "configuracion_organizacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "max_automaticos_por_dia" INTEGER NOT NULL DEFAULT 3,
    "max_marketing_por_ventana" INTEGER NOT NULL DEFAULT 1,
    "ventana_marketing_dias" INTEGER NOT NULL DEFAULT 7,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "configuracion_organizacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "configuracion_organizacion_organizacion_id_idx" ON "configuracion_organizacion"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_organizacion_id_organizacion_id_key" ON "configuracion_organizacion"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "configuracion_organizacion" ADD CONSTRAINT "configuracion_organizacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Una sola fila viva de configuración por organización.
CREATE UNIQUE INDEX "configuracion_organizacion_unica_key"
    ON "configuracion_organizacion" ("organizacion_id")
    WHERE "eliminado_en" IS NULL;

-- Topes no negativos; la ventana de marketing, de 1 a 365 días.
ALTER TABLE "configuracion_organizacion" ADD CONSTRAINT "configuracion_organizacion_topes_check"
    CHECK ("max_automaticos_por_dia" >= 0 AND "max_marketing_por_ventana" >= 0 AND "ventana_marketing_dias" BETWEEN 1 AND 365);

-- Las organizaciones que ya existen reciben su fila con los valores por defecto (3 por día, 1 de
-- marketing cada 7 días). Las nuevas la crea su seed; sin fila, el lector usa los mismos valores.
INSERT INTO "configuracion_organizacion" ("organizacion_id")
SELECT o."id" FROM "organizacion" o WHERE o."eliminado_en" IS NULL;
