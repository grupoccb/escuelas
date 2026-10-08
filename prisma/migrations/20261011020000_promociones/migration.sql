-- CreateEnum
CREATE TYPE "condicion_promocion" AS ENUM ('sin_condicion', 'al_pagar_primera_mensualidad', 'min_hermanos', 'pago_anticipado');

-- CreateEnum
CREATE TYPE "tipo_beneficio" AS ENUM ('descuento_inscripcion', 'descuento_mensualidad', 'producto_gratis', 'meses_gratis');

-- CreateEnum
CREATE TYPE "modo_beneficio" AS ENUM ('porcentaje', 'monto_fijo', 'total');

-- CreateEnum
CREATE TYPE "momento_disparo" AS ENUM ('inmediato', 'al_cumplir_condicion');

-- CreateEnum
CREATE TYPE "estatus_aplicacion" AS ENUM ('pendiente', 'entregado');

-- CreateTable
CREATE TABLE "promocion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE,
    "condicion_tipo" "condicion_promocion" NOT NULL DEFAULT 'sin_condicion',
    "condicion_valor" JSONB,
    "cupo_maximo" INTEGER,
    "cupo_usado" INTEGER NOT NULL DEFAULT 0,
    "acumulable" BOOLEAN NOT NULL DEFAULT false,
    "prioridad" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "promocion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promocion_vertical" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "promocion_id" UUID NOT NULL,
    "vertical_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "promocion_vertical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promocion_sucursal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "promocion_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "promocion_sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promocion_programa" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "promocion_id" UUID NOT NULL,
    "programa_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "promocion_programa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promocion_beneficio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "promocion_id" UUID NOT NULL,
    "tipo" "tipo_beneficio" NOT NULL,
    "modo" "modo_beneficio" NOT NULL,
    "valor" DECIMAL(12,2),
    "producto_id" UUID,
    "descripcion" TEXT,
    "momento_disparo" "momento_disparo" NOT NULL DEFAULT 'inmediato',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "promocion_beneficio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promocion_aplicacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "inscripcion_id" UUID NOT NULL,
    "promocion_id" UUID NOT NULL,
    "beneficio_id" UUID NOT NULL,
    "estatus" "estatus_aplicacion" NOT NULL DEFAULT 'pendiente',
    "fecha_entrega" TIMESTAMPTZ(6),
    "autorizado_por_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "promocion_aplicacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promocion_organizacion_id_idx" ON "promocion"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "promocion_id_organizacion_id_key" ON "promocion"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "promocion_vertical_organizacion_id_idx" ON "promocion_vertical"("organizacion_id");

-- CreateIndex
CREATE INDEX "promocion_vertical_promocion_id_idx" ON "promocion_vertical"("promocion_id");

-- CreateIndex
CREATE UNIQUE INDEX "promocion_vertical_id_organizacion_id_key" ON "promocion_vertical"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "promocion_sucursal_organizacion_id_idx" ON "promocion_sucursal"("organizacion_id");

-- CreateIndex
CREATE INDEX "promocion_sucursal_promocion_id_idx" ON "promocion_sucursal"("promocion_id");

-- CreateIndex
CREATE UNIQUE INDEX "promocion_sucursal_id_organizacion_id_key" ON "promocion_sucursal"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "promocion_programa_organizacion_id_idx" ON "promocion_programa"("organizacion_id");

-- CreateIndex
CREATE INDEX "promocion_programa_promocion_id_idx" ON "promocion_programa"("promocion_id");

-- CreateIndex
CREATE UNIQUE INDEX "promocion_programa_id_organizacion_id_key" ON "promocion_programa"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "promocion_beneficio_organizacion_id_idx" ON "promocion_beneficio"("organizacion_id");

-- CreateIndex
CREATE INDEX "promocion_beneficio_promocion_id_idx" ON "promocion_beneficio"("promocion_id");

-- CreateIndex
CREATE UNIQUE INDEX "promocion_beneficio_id_organizacion_id_key" ON "promocion_beneficio"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "promocion_aplicacion_organizacion_id_idx" ON "promocion_aplicacion"("organizacion_id");

-- CreateIndex
CREATE INDEX "promocion_aplicacion_inscripcion_id_idx" ON "promocion_aplicacion"("inscripcion_id");

-- CreateIndex
CREATE UNIQUE INDEX "promocion_aplicacion_id_organizacion_id_key" ON "promocion_aplicacion"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "promocion" ADD CONSTRAINT "promocion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promocion_vertical" ADD CONSTRAINT "promocion_vertical_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promocion_vertical" ADD CONSTRAINT "promocion_vertical_promocion_id_organizacion_id_fkey" FOREIGN KEY ("promocion_id", "organizacion_id") REFERENCES "promocion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "promocion_vertical" ADD CONSTRAINT "promocion_vertical_vertical_id_organizacion_id_fkey" FOREIGN KEY ("vertical_id", "organizacion_id") REFERENCES "vertical"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "promocion_sucursal" ADD CONSTRAINT "promocion_sucursal_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promocion_sucursal" ADD CONSTRAINT "promocion_sucursal_promocion_id_organizacion_id_fkey" FOREIGN KEY ("promocion_id", "organizacion_id") REFERENCES "promocion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "promocion_sucursal" ADD CONSTRAINT "promocion_sucursal_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "promocion_programa" ADD CONSTRAINT "promocion_programa_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promocion_programa" ADD CONSTRAINT "promocion_programa_promocion_id_organizacion_id_fkey" FOREIGN KEY ("promocion_id", "organizacion_id") REFERENCES "promocion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "promocion_programa" ADD CONSTRAINT "promocion_programa_programa_id_organizacion_id_fkey" FOREIGN KEY ("programa_id", "organizacion_id") REFERENCES "programa"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "promocion_beneficio" ADD CONSTRAINT "promocion_beneficio_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promocion_beneficio" ADD CONSTRAINT "promocion_beneficio_promocion_id_organizacion_id_fkey" FOREIGN KEY ("promocion_id", "organizacion_id") REFERENCES "promocion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "promocion_aplicacion" ADD CONSTRAINT "promocion_aplicacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promocion_aplicacion" ADD CONSTRAINT "promocion_aplicacion_promocion_id_organizacion_id_fkey" FOREIGN KEY ("promocion_id", "organizacion_id") REFERENCES "promocion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "promocion_aplicacion" ADD CONSTRAINT "promocion_aplicacion_beneficio_id_organizacion_id_fkey" FOREIGN KEY ("beneficio_id", "organizacion_id") REFERENCES "promocion_beneficio"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "promocion_aplicacion" ADD CONSTRAINT "promocion_aplicacion_autorizado_por_id_organizacion_id_fkey" FOREIGN KEY ("autorizado_por_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ── Índices parciales y CHECK (no caben en Prisma) ─────────────────────────────────────────────────
-- El código de una promoción es único entre las vivas de la organización.
CREATE UNIQUE INDEX "promocion_codigo_vivo_key" ON "promocion" ("organizacion_id", "codigo") WHERE "eliminado_en" IS NULL;
ALTER TABLE "promocion" ADD CONSTRAINT "promocion_vigencia_check" CHECK ("vigencia_hasta" IS NULL OR "vigencia_hasta" >= "vigencia_desde");
-- Nunca se pasa del cupo: el consumo atómico (consumirCupo) lo respeta y la base lo impone si algo lo olvida.
ALTER TABLE "promocion" ADD CONSTRAINT "promocion_cupo_check" CHECK ("cupo_usado" >= 0 AND ("cupo_maximo" IS NULL OR ("cupo_maximo" >= 1 AND "cupo_usado" <= "cupo_maximo")));
ALTER TABLE "promocion" ADD CONSTRAINT "promocion_prioridad_check" CHECK ("prioridad" BETWEEN -1000 AND 1000);
-- `condicion_valor` coherente con `condicion_tipo` (la validación fina es de la API: src/promociones/condicion.ts).
ALTER TABLE "promocion" ADD CONSTRAINT "promocion_condicion_check" CHECK (
    ("condicion_tipo" IN ('sin_condicion', 'al_pagar_primera_mensualidad') AND "condicion_valor" IS NULL)
    OR ("condicion_tipo" = 'min_hermanos' AND "condicion_valor" IS NOT NULL AND "condicion_valor" ? 'hermanos')
    OR ("condicion_tipo" = 'pago_anticipado' AND "condicion_valor" IS NOT NULL AND "condicion_valor" ? 'meses')
);

-- Alcance: una fila viva por (promoción, vertical | sucursal | programa).
CREATE UNIQUE INDEX "promocion_vertical_vivo_key" ON "promocion_vertical" ("organizacion_id", "promocion_id", "vertical_id") WHERE "eliminado_en" IS NULL;
CREATE UNIQUE INDEX "promocion_sucursal_vivo_key" ON "promocion_sucursal" ("organizacion_id", "promocion_id", "sucursal_id") WHERE "eliminado_en" IS NULL;
CREATE UNIQUE INDEX "promocion_programa_vivo_key" ON "promocion_programa" ("organizacion_id", "promocion_id", "programa_id") WHERE "eliminado_en" IS NULL;

-- Combinaciones válidas de tipo, modo y valor de un beneficio.
ALTER TABLE "promocion_beneficio" ADD CONSTRAINT "promocion_beneficio_combinacion_check" CHECK (
    ("tipo" IN ('descuento_inscripcion', 'descuento_mensualidad') AND (
        ("modo" = 'total' AND "valor" IS NULL)
        OR ("modo" = 'porcentaje' AND "valor" IS NOT NULL AND "valor" > 0 AND "valor" <= 100)
        OR ("modo" = 'monto_fijo' AND "valor" IS NOT NULL AND "valor" > 0)))
    OR ("tipo" = 'producto_gratis' AND "modo" = 'total' AND "valor" IS NULL)
    OR ("tipo" = 'meses_gratis' AND "modo" = 'total' AND "valor" IS NOT NULL AND "valor" >= 1 AND "valor" <= 24 AND "valor" = trunc("valor"))
);

-- Una aplicación viva por (inscripción, beneficio): un reintento no duplica. Entregado ⇔ tiene fecha de entrega.
CREATE UNIQUE INDEX "promocion_aplicacion_vivo_key" ON "promocion_aplicacion" ("organizacion_id", "inscripcion_id", "beneficio_id") WHERE "eliminado_en" IS NULL;
ALTER TABLE "promocion_aplicacion" ADD CONSTRAINT "promocion_aplicacion_entrega_check" CHECK (("estatus" = 'entregado') = ("fecha_entrega" IS NOT NULL));
