-- CreateEnum
CREATE TYPE "estatus_venta" AS ENUM ('registrada', 'anulada');

-- AlterTable
ALTER TABLE "cargo" ADD COLUMN     "venta_id" UUID;

-- CreateTable
CREATE TABLE "producto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "vertical_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "talla" TEXT,
    "precio" DECIMAL(12,2) NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "tutor_id" UUID NOT NULL,
    "alumno_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DECIMAL(12,2) NOT NULL,
    "es_promocional" BOOLEAN NOT NULL DEFAULT false,
    "promocion_aplicacion_id" UUID,
    "fecha" DATE NOT NULL,
    "estatus" "estatus_venta" NOT NULL DEFAULT 'registrada',
    "registrada_por_usuario_id" UUID,
    "anulada_en" TIMESTAMPTZ(6),
    "anulada_por_usuario_id" UUID,
    "motivo_anulacion" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "venta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "producto_organizacion_id_idx" ON "producto"("organizacion_id");

-- CreateIndex
CREATE INDEX "producto_vertical_id_idx" ON "producto"("vertical_id");

-- CreateIndex
CREATE UNIQUE INDEX "producto_id_organizacion_id_key" ON "producto"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "venta_organizacion_id_idx" ON "venta"("organizacion_id");

-- CreateIndex
CREATE INDEX "venta_tutor_id_idx" ON "venta"("tutor_id");

-- CreateIndex
CREATE INDEX "venta_alumno_id_idx" ON "venta"("alumno_id");

-- CreateIndex
CREATE INDEX "venta_producto_id_idx" ON "venta"("producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "venta_id_organizacion_id_key" ON "venta"("id", "organizacion_id");

-- NOT VALID: C3 dejó `producto_id` como un uuid sin llave (las filas de prueba de antes de existir `producto` traen ids inventados); toda fila nueva o modificada sí se valida.
ALTER TABLE "promocion_beneficio" ADD CONSTRAINT "promocion_beneficio_producto_id_organizacion_id_fkey" FOREIGN KEY ("producto_id", "organizacion_id") REFERENCES "producto"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;

-- AddForeignKey
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_venta_id_organizacion_id_fkey" FOREIGN KEY ("venta_id", "organizacion_id") REFERENCES "venta"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "producto" ADD CONSTRAINT "producto_vertical_id_organizacion_id_fkey" FOREIGN KEY ("vertical_id", "organizacion_id") REFERENCES "vertical"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_tutor_id_organizacion_id_fkey" FOREIGN KEY ("tutor_id", "organizacion_id") REFERENCES "tutor"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_alumno_id_organizacion_id_fkey" FOREIGN KEY ("alumno_id", "organizacion_id") REFERENCES "alumno"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_producto_id_organizacion_id_fkey" FOREIGN KEY ("producto_id", "organizacion_id") REFERENCES "producto"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_promocion_aplicacion_id_organizacion_id_fkey" FOREIGN KEY ("promocion_aplicacion_id", "organizacion_id") REFERENCES "promocion_aplicacion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_registrada_por_usuario_id_organizacion_id_fkey" FOREIGN KEY ("registrada_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "venta" ADD CONSTRAINT "venta_anulada_por_usuario_id_organizacion_id_fkey" FOREIGN KEY ("anulada_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ── Lo que Prisma no expresa (H5) ─────────────────────────────────────────────────────────────────────────
-- El stock y el dinero se protegen EN LA BASE, dentro de la misma transacción (regla de Eduardo).
ALTER TABLE "producto" ADD CONSTRAINT "producto_stock_check" CHECK ("stock" >= 0);
ALTER TABLE "producto" ADD CONSTRAINT "producto_precio_check" CHECK ("precio" >= 0);
ALTER TABLE "producto" ADD CONSTRAINT "producto_nombre_check" CHECK (btrim("nombre") <> '');

ALTER TABLE "venta" ADD CONSTRAINT "venta_importes_check" CHECK ("cantidad" > 0 AND "precio_unitario" >= 0);
-- Promocional ⇔ precio 0 y ligada a la aplicación del beneficio que entrega; una venta normal no se liga a ninguna.
ALTER TABLE "venta" ADD CONSTRAINT "venta_promocional_check" CHECK (
    ("es_promocional" AND "precio_unitario" = 0 AND "promocion_aplicacion_id" IS NOT NULL) OR (NOT "es_promocional" AND "promocion_aplicacion_id" IS NULL)
);
ALTER TABLE "venta" ADD CONSTRAINT "venta_anulacion_check" CHECK (("estatus" = 'anulada') = ("anulada_en" IS NOT NULL));
-- Una venta por beneficio entregado, y un cargo por venta.
CREATE UNIQUE INDEX "venta_promocion_aplicacion_key" ON "venta" ("promocion_aplicacion_id") WHERE "promocion_aplicacion_id" IS NOT NULL AND "eliminado_en" IS NULL;
CREATE UNIQUE INDEX "cargo_venta_key" ON "cargo" ("venta_id") WHERE "venta_id" IS NOT NULL AND "eliminado_en" IS NULL;

-- VENDER descuenta el stock y ANULAR lo devuelve, por disparador: no existe una venta sin su movimiento de inventario, y dos ventas por la última pieza se forman en la fila del
-- producto (UPDATE atómico + CHECK de arriba: gana una, la otra recibe `producto_stock_check`).
CREATE FUNCTION "venta_mueve_stock"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW."estatus" <> 'registrada' THEN
            RAISE EXCEPTION 'venta_nace_registrada: una venta nace registrada' USING ERRCODE = '23514';
        END IF;
        UPDATE "producto" SET "stock" = "stock" - NEW."cantidad" WHERE "id" = NEW."producto_id" AND "organizacion_id" = NEW."organizacion_id";
        RETURN NEW;
    END IF;
    -- UPDATE: lo único que cambia es registrada → anulada (y devuelve las piezas).
    IF NEW."organizacion_id" <> OLD."organizacion_id" OR NEW."tutor_id" <> OLD."tutor_id" OR NEW."alumno_id" <> OLD."alumno_id" OR NEW."producto_id" <> OLD."producto_id"
       OR NEW."sucursal_id" <> OLD."sucursal_id" OR NEW."cantidad" <> OLD."cantidad" OR NEW."precio_unitario" <> OLD."precio_unitario"
       OR NEW."es_promocional" <> OLD."es_promocional" OR NEW."promocion_aplicacion_id" IS DISTINCT FROM OLD."promocion_aplicacion_id" OR NEW."fecha" <> OLD."fecha" THEN
        RAISE EXCEPTION 'venta_inmutable: una venta no se edita (se anula)' USING ERRCODE = '23514';
    END IF;
    IF OLD."estatus" = 'anulada' AND NEW."estatus" <> 'anulada' THEN
        RAISE EXCEPTION 'venta_anulada: una venta anulada no vuelve a registrarse' USING ERRCODE = '23514';
    END IF;
    IF OLD."estatus" = 'registrada' AND NEW."estatus" = 'anulada' THEN
        UPDATE "producto" SET "stock" = "stock" + OLD."cantidad" WHERE "id" = OLD."producto_id" AND "organizacion_id" = OLD."organizacion_id";
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER "venta_mueve_stock_trg" BEFORE INSERT OR UPDATE ON "venta" FOR EACH ROW EXECUTE FUNCTION "venta_mueve_stock"();

CREATE FUNCTION "venta_no_se_borra"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'venta_inmutable: una venta no se borra (se anula)' USING ERRCODE = '23514';
END
$$;
CREATE TRIGGER "venta_no_se_borra_trg" BEFORE DELETE ON "venta" FOR EACH ROW EXECUTE FUNCTION "venta_no_se_borra"();
CREATE TRIGGER "venta_no_se_borra_truncate_trg" BEFORE TRUNCATE ON "venta" FOR EACH STATEMENT EXECUTE FUNCTION "venta_no_se_borra"();

-- Ventas ↔ cargos, AL CONFIRMAR la transacción: una venta normal registrada tiene exactamente un cargo de producto vivo por cantidad × precio; una anulada o promocional, ninguno vivo.
CREATE FUNCTION "venta_cuadra_con_su_cargo"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v RECORD;
    vivos integer;
    esperado numeric;
    montos numeric;
BEGIN
    SELECT "id", "organizacion_id", "estatus", "es_promocional", "cantidad", "precio_unitario" INTO v FROM "venta" WHERE "id" = NEW."id";
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    SELECT count(*), COALESCE(max("monto_final"), 0) INTO vivos, montos FROM "cargo" WHERE "venta_id" = v."id" AND "organizacion_id" = v."organizacion_id" AND "estatus" <> 'cancelado';
    esperado := v."cantidad" * v."precio_unitario";
    IF v."estatus" = 'registrada' AND NOT v."es_promocional" THEN
        IF vivos <> 1 OR montos <> esperado THEN
            RAISE EXCEPTION 'venta_cuadra_con_su_cargo: una venta registrada debe tener un cargo vivo de cantidad × precio (%)', esperado USING ERRCODE = '23514';
        END IF;
    ELSIF vivos <> 0 THEN
        RAISE EXCEPTION 'venta_cuadra_con_su_cargo: una venta anulada o promocional no tiene cargo vivo' USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER "venta_cuadra_con_su_cargo_trg" AFTER INSERT OR UPDATE ON "venta" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "venta_cuadra_con_su_cargo"();
