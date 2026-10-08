-- CreateTable
CREATE TABLE "precio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "programa_id" UUID NOT NULL,
    "costo_inscripcion" DECIMAL(12,2) NOT NULL,
    "costo_mensualidad" DECIMAL(12,2) NOT NULL,
    "moneda" TEXT NOT NULL DEFAULT 'MXN',
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "precio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "precio_organizacion_id_idx" ON "precio"("organizacion_id");

-- CreateIndex
CREATE INDEX "precio_programa_id_vigencia_desde_idx" ON "precio"("programa_id", "vigencia_desde");

-- CreateIndex
CREATE UNIQUE INDEX "precio_id_organizacion_id_key" ON "precio"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "precio" ADD CONSTRAINT "precio_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precio" ADD CONSTRAINT "precio_programa_id_organizacion_id_fkey" FOREIGN KEY ("programa_id", "organizacion_id") REFERENCES "programa"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ── Restricciones que Prisma no expresa ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "precio" ADD CONSTRAINT "precio_costos_check" CHECK ("costo_inscripcion" >= 0 AND "costo_mensualidad" >= 0);
ALTER TABLE "precio" ADD CONSTRAINT "precio_moneda_check" CHECK ("moneda" ~ '^[A-Z]{3}$');
ALTER TABLE "precio" ADD CONSTRAINT "precio_vigencia_check" CHECK ("vigencia_hasta" IS NULL OR "vigencia_hasta" >= "vigencia_desde");

-- Las vigencias de un programa no se traslapan (entre los precios vivos). `daterange(desde, hasta, '[]')` con
-- hasta nulo es abierto por la derecha. Una sola tabla: aquí SÍ sirve la restricción de exclusión, y la
-- base arbitra dos altas simultáneas aunque no pasen por la API.
ALTER TABLE "precio" ADD CONSTRAINT "precio_vigencia_excl"
    EXCLUDE USING gist ("programa_id" WITH =, daterange("vigencia_desde", "vigencia_hasta", '[]') WITH &&)
    WHERE ("eliminado_en" IS NULL);
