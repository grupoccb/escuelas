-- CreateEnum
CREATE TYPE "estatus_inscripcion" AS ENUM ('activa', 'congelada', 'baja');

-- AlterTable
ALTER TABLE "promocion_aplicacion" ADD COLUMN     "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "meses_gratis" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "inscripcion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "alumno_id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "programa_id" UUID NOT NULL,
    "lead_id" UUID,
    "prospecto_id" UUID,
    "cotizacion_id" UUID,
    "promocion_id" UUID,
    "fecha_inscripcion" DATE NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_baja" DATE,
    "estatus" "estatus_inscripcion" NOT NULL DEFAULT 'activa',
    "precio_inscripcion_aplicado" DECIMAL(12,2) NOT NULL,
    "precio_mensualidad_aplicado" DECIMAL(12,2) NOT NULL,
    "descuento_inscripcion_aplicado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descuento_mensualidad_aplicado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "meses_gratis_aplicados" INTEGER NOT NULL DEFAULT 0,
    "meses_pagados_por_adelantado" INTEGER NOT NULL DEFAULT 0,
    "dia_corte_pago" INTEGER NOT NULL,
    "creado_por_usuario_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "inscripcion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inscripcion_organizacion_id_idx" ON "inscripcion"("organizacion_id");

-- CreateIndex
CREATE INDEX "inscripcion_alumno_id_idx" ON "inscripcion"("alumno_id");

-- CreateIndex
CREATE INDEX "inscripcion_grupo_id_idx" ON "inscripcion"("grupo_id");

-- CreateIndex
CREATE INDEX "inscripcion_lead_id_idx" ON "inscripcion"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "inscripcion_id_organizacion_id_key" ON "inscripcion"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "promocion_aplicacion" ADD CONSTRAINT "promocion_aplicacion_inscripcion_id_organizacion_id_fkey" FOREIGN KEY ("inscripcion_id", "organizacion_id") REFERENCES "inscripcion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;
-- NOT VALID a propósito: antes de F3 el campo era un uuid sin llave y las pruebas de C3 dejaron filas con ids inventados. Las filas nuevas SÍ se validan.


-- AddForeignKey
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_alumno_id_organizacion_id_fkey" FOREIGN KEY ("alumno_id", "organizacion_id") REFERENCES "alumno"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_grupo_id_organizacion_id_fkey" FOREIGN KEY ("grupo_id", "organizacion_id") REFERENCES "grupo"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_programa_id_organizacion_id_fkey" FOREIGN KEY ("programa_id", "organizacion_id") REFERENCES "programa"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_lead_id_organizacion_id_fkey" FOREIGN KEY ("lead_id", "organizacion_id") REFERENCES "lead"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_prospecto_id_organizacion_id_fkey" FOREIGN KEY ("prospecto_id", "organizacion_id") REFERENCES "prospecto"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_cotizacion_id_organizacion_id_fkey" FOREIGN KEY ("cotizacion_id", "organizacion_id") REFERENCES "cotizacion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_promocion_id_organizacion_id_fkey" FOREIGN KEY ("promocion_id", "organizacion_id") REFERENCES "promocion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_creado_por_usuario_id_organizacion_id_fkey" FOREIGN KEY ("creado_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ── Lo que Prisma no expresa ─────────────────────────────────────────────────────────────────────────────
-- Una inscripción ACTIVA por (alumno, grupo): inscribir dos veces al mismo grupo es imposible, aunque dos peticiones lleguen a la vez.
CREATE UNIQUE INDEX "inscripcion_activa_key" ON "inscripcion" ("alumno_id", "grupo_id") WHERE "estatus" = 'activa' AND "eliminado_en" IS NULL;
-- El cupo de un grupo = sus inscripciones activas (contexto, índices que importan).
CREATE INDEX "inscripcion_cupo_idx" ON "inscripcion" ("grupo_id") WHERE "estatus" = 'activa' AND "eliminado_en" IS NULL;
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_dia_corte_check" CHECK ("dia_corte_pago" BETWEEN 1 AND 31);
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_precios_check" CHECK (
    "precio_inscripcion_aplicado" >= 0 AND "precio_mensualidad_aplicado" >= 0
    AND "descuento_inscripcion_aplicado" >= 0 AND "descuento_inscripcion_aplicado" <= "precio_inscripcion_aplicado"
    AND "descuento_mensualidad_aplicado" >= 0 AND "descuento_mensualidad_aplicado" <= "precio_mensualidad_aplicado"
);
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_meses_check" CHECK ("meses_gratis_aplicados" >= 0 AND "meses_pagados_por_adelantado" >= 0);
-- Una baja lleva su fecha y no es anterior al inicio.
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_baja_check" CHECK (("estatus" = 'baja') = ("fecha_baja" IS NOT NULL) AND ("fecha_baja" IS NULL OR "fecha_baja" >= "fecha_inicio"));
ALTER TABLE "promocion_aplicacion" ADD CONSTRAINT "promocion_aplicacion_montos_check" CHECK ("descuento" >= 0 AND "meses_gratis" >= 0);
