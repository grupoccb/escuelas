-- CreateEnum
CREATE TYPE "concepto_cargo" AS ENUM ('inscripcion', 'mensualidad', 'evento', 'producto');

-- CreateEnum
CREATE TYPE "estatus_cargo" AS ENUM ('pendiente', 'pagado', 'vencido', 'cancelado');

-- CreateTable
CREATE TABLE "cargo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "tutor_id" UUID NOT NULL,
    "alumno_id" UUID NOT NULL,
    "inscripcion_id" UUID,
    "sucursal_id" UUID NOT NULL,
    "concepto" "concepto_cargo" NOT NULL,
    "periodo" TEXT,
    "descripcion" TEXT,
    "monto" DECIMAL(12,2) NOT NULL,
    "descuento" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "monto_final" DECIMAL(12,2) NOT NULL,
    "monto_pagado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "fecha_vencimiento" DATE NOT NULL,
    "estatus" "estatus_cargo" NOT NULL DEFAULT 'pendiente',
    "creado_por_usuario_id" UUID,
    "cancelado_en" TIMESTAMPTZ(6),
    "cancelado_por_usuario_id" UUID,
    "motivo_cancelacion" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "cargo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cargo_organizacion_id_idx" ON "cargo"("organizacion_id");

-- CreateIndex
CREATE INDEX "cargo_tutor_id_estatus_idx" ON "cargo"("tutor_id", "estatus");

-- CreateIndex
CREATE INDEX "cargo_alumno_id_idx" ON "cargo"("alumno_id");

-- CreateIndex
CREATE INDEX "cargo_inscripcion_id_idx" ON "cargo"("inscripcion_id");

-- CreateIndex
CREATE INDEX "cargo_estatus_fecha_vencimiento_idx" ON "cargo"("estatus", "fecha_vencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "cargo_id_organizacion_id_key" ON "cargo"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_tutor_id_organizacion_id_fkey" FOREIGN KEY ("tutor_id", "organizacion_id") REFERENCES "tutor"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_alumno_id_organizacion_id_fkey" FOREIGN KEY ("alumno_id", "organizacion_id") REFERENCES "alumno"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_inscripcion_id_organizacion_id_fkey" FOREIGN KEY ("inscripcion_id", "organizacion_id") REFERENCES "inscripcion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_creado_por_usuario_id_organizacion_id_fkey" FOREIGN KEY ("creado_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_cancelado_por_usuario_id_organizacion_id_fkey" FOREIGN KEY ("cancelado_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ── Lo que Prisma no expresa (H1) ─────────────────────────────────────────────────────────────────────────
-- El dinero se protege EN LA BASE (regla de Eduardo): nada de «comprobar y luego actuar». Estos CHECK y disparadores fallan cerrados aunque el código se equivoque.
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_importes_check" CHECK (
    "monto" >= 0 AND "descuento" >= 0 AND "descuento" <= "monto" AND "monto_final" = "monto" - "descuento"
    AND "monto_pagado" >= 0 AND "monto_pagado" <= "monto_final"
);
-- Estatus coherente con el saldo: pagado ⇔ lo pagado es todo el monto final; un cargo cancelado no tiene pagos vivos (primero se cancela el pago).
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_estatus_saldo_check" CHECK (
    ("estatus" = 'cancelado' AND "monto_pagado" = 0) OR ("estatus" <> 'cancelado' AND (("estatus" = 'pagado') = ("monto_pagado" = "monto_final")))
);
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_cancelacion_check" CHECK (("estatus" = 'cancelado') = ("cancelado_en" IS NOT NULL));
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_periodo_check" CHECK (
    ("periodo" IS NULL OR "periodo" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
    AND ("concepto" <> 'mensualidad' OR ("periodo" IS NOT NULL AND "inscripcion_id" IS NOT NULL))
    AND ("concepto" <> 'inscripcion' OR "inscripcion_id" IS NOT NULL)
);
-- Idempotencia de la generación (invariante 8): UNA mensualidad por (inscripción, periodo) y UN cargo de inscripción por inscripción, aunque el barrido corra en paralelo.
-- Los cancelados cuentan: un cargo cancelado a propósito no se vuelve a generar.
CREATE UNIQUE INDEX "cargo_mensualidad_periodo_key" ON "cargo" ("inscripcion_id", "periodo") WHERE "concepto" = 'mensualidad' AND "eliminado_en" IS NULL;
CREATE UNIQUE INDEX "cargo_inscripcion_key" ON "cargo" ("inscripcion_id") WHERE "concepto" = 'inscripcion' AND "eliminado_en" IS NULL;
-- Lo que se cobra de una familia: abiertos por responsable, por antigüedad.
CREATE INDEX "cargo_abiertos_idx" ON "cargo" ("tutor_id", "fecha_vencimiento") WHERE "estatus" IN ('pendiente', 'vencido') AND "eliminado_en" IS NULL;

-- El dinero de un cargo no se edita (como el precio congelado de la inscripción): una corrección es cancelar y generar otro. Solo cambian el estatus, lo pagado
-- (que mueven los disparadores de los pagos) y los datos de la cancelación. Un cargo cancelado no vuelve a abrirse.
CREATE FUNCTION "cargo_blindaje"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."organizacion_id" <> OLD."organizacion_id" OR NEW."tutor_id" <> OLD."tutor_id" OR NEW."alumno_id" <> OLD."alumno_id"
       OR NEW."inscripcion_id" IS DISTINCT FROM OLD."inscripcion_id" OR NEW."sucursal_id" <> OLD."sucursal_id" OR NEW."concepto" <> OLD."concepto"
       OR NEW."periodo" IS DISTINCT FROM OLD."periodo" OR NEW."monto" <> OLD."monto" OR NEW."descuento" <> OLD."descuento"
       OR NEW."monto_final" <> OLD."monto_final" OR NEW."fecha_vencimiento" <> OLD."fecha_vencimiento" THEN
        RAISE EXCEPTION 'cargo_inmutable: el dinero, el responsable y el vencimiento de un cargo no se editan (cancélalo y genera otro)' USING ERRCODE = '23514';
    END IF;
    IF OLD."estatus" = 'cancelado' AND (NEW."estatus" <> 'cancelado' OR NEW."monto_pagado" <> OLD."monto_pagado") THEN
        RAISE EXCEPTION 'cargo_cancelado: un cargo cancelado no vuelve a abrirse' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER "cargo_blindaje_trg" BEFORE UPDATE ON "cargo" FOR EACH ROW EXECUTE FUNCTION "cargo_blindaje"();
