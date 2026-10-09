-- CreateEnum
CREATE TYPE "metodo_pago" AS ENUM ('efectivo', 'tarjeta', 'transferencia');

-- CreateEnum
CREATE TYPE "estatus_pago" AS ENUM ('aplicado', 'cancelado');

-- CreateEnum
CREATE TYPE "estatus_aplicacion_pago" AS ENUM ('aplicada', 'revertida');

-- CreateTable
CREATE TABLE "pago" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "tutor_id" UUID NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "monto_aplicado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "metodo" "metodo_pago" NOT NULL,
    "referencia" TEXT,
    "fecha" DATE NOT NULL,
    "estatus" "estatus_pago" NOT NULL DEFAULT 'aplicado',
    "clave_idempotencia" TEXT,
    "registrado_por_usuario_id" UUID,
    "cancelado_en" TIMESTAMPTZ(6),
    "cancelado_por_usuario_id" UUID,
    "motivo_cancelacion" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago_aplicacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "pago_id" UUID NOT NULL,
    "cargo_id" UUID NOT NULL,
    "monto_aplicado" DECIMAL(12,2) NOT NULL,
    "estatus" "estatus_aplicacion_pago" NOT NULL DEFAULT 'aplicada',
    "revertida_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "pago_aplicacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pago_organizacion_id_idx" ON "pago"("organizacion_id");

-- CreateIndex
CREATE INDEX "pago_tutor_id_fecha_idx" ON "pago"("tutor_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "pago_id_organizacion_id_key" ON "pago"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "pago_aplicacion_organizacion_id_idx" ON "pago_aplicacion"("organizacion_id");

-- CreateIndex
CREATE INDEX "pago_aplicacion_pago_id_idx" ON "pago_aplicacion"("pago_id");

-- CreateIndex
CREATE INDEX "pago_aplicacion_cargo_id_idx" ON "pago_aplicacion"("cargo_id");

-- CreateIndex
CREATE UNIQUE INDEX "pago_aplicacion_id_organizacion_id_key" ON "pago_aplicacion"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_tutor_id_organizacion_id_fkey" FOREIGN KEY ("tutor_id", "organizacion_id") REFERENCES "tutor"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_registrado_por_usuario_id_organizacion_id_fkey" FOREIGN KEY ("registrado_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pago" ADD CONSTRAINT "pago_cancelado_por_usuario_id_organizacion_id_fkey" FOREIGN KEY ("cancelado_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pago_aplicacion" ADD CONSTRAINT "pago_aplicacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_aplicacion" ADD CONSTRAINT "pago_aplicacion_pago_id_organizacion_id_fkey" FOREIGN KEY ("pago_id", "organizacion_id") REFERENCES "pago"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "pago_aplicacion" ADD CONSTRAINT "pago_aplicacion_cargo_id_organizacion_id_fkey" FOREIGN KEY ("cargo_id", "organizacion_id") REFERENCES "cargo"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ── Lo que Prisma no expresa (H2) ─────────────────────────────────────────────────────────────────────────
-- El dinero se protege EN LA BASE, dentro de la misma transacción (regla de Eduardo). Nada de «comprobar y luego actuar»: lo que sigue falla cerrado aunque el
-- código se equivoque o alguien escriba por SQL directo.

ALTER TABLE "pago" ADD CONSTRAINT "pago_importes_check" CHECK ("monto" > 0 AND "monto_aplicado" >= 0 AND "monto_aplicado" <= "monto");
ALTER TABLE "pago" ADD CONSTRAINT "pago_cancelacion_check" CHECK (
    ("estatus" = 'cancelado') = ("cancelado_en" IS NOT NULL) AND ("estatus" <> 'cancelado' OR "monto_aplicado" = 0)
);
ALTER TABLE "pago_aplicacion" ADD CONSTRAINT "pago_aplicacion_importe_check" CHECK ("monto_aplicado" > 0);
ALTER TABLE "pago_aplicacion" ADD CONSTRAINT "pago_aplicacion_reversa_check" CHECK (("estatus" = 'revertida') = ("revertida_en" IS NOT NULL));
-- Idempotencia del cliente: una clave, un pago (también si luego se canceló).
CREATE UNIQUE INDEX "pago_clave_idempotencia_key" ON "pago" ("organizacion_id", "clave_idempotencia") WHERE "clave_idempotencia" IS NOT NULL;
-- Un pago cubre un cargo UNA vez (el reparto trae un renglón por cargo).
CREATE UNIQUE INDEX "pago_aplicacion_pago_cargo_key" ON "pago_aplicacion" ("pago_id", "cargo_id");

-- Una aplicación NACE aplicada y suma en el cargo y en el pago con UN UPDATE atómico cada uno: el segundo pago simultáneo al mismo cargo espera el candado de la fila,
-- relee el valor nuevo y, si se pasa, los CHECK de arriba lo rechazan (cargo_importes_check / pago_importes_check). El cargo y el pago tienen que ser del MISMO tutor, el
-- cargo estar abierto y el pago aplicado; si no, la fila no se actualiza y se rechaza.
CREATE FUNCTION "pago_aplicacion_alta"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."estatus" <> 'aplicada' THEN
        RAISE EXCEPTION 'pago_aplicacion_nace_aplicada: una aplicación nace aplicada' USING ERRCODE = '23514';
    END IF;
    UPDATE "pago" SET "monto_aplicado" = "monto_aplicado" + NEW."monto_aplicado"
        WHERE "id" = NEW."pago_id" AND "organizacion_id" = NEW."organizacion_id" AND "estatus" = 'aplicado';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'pago_no_aplicable: el pago no existe o está cancelado' USING ERRCODE = '23514';
    END IF;
    UPDATE "cargo" SET "monto_pagado" = "monto_pagado" + NEW."monto_aplicado",
                       "estatus" = CASE WHEN "monto_pagado" + NEW."monto_aplicado" = "monto_final" THEN 'pagado'::"estatus_cargo" ELSE "estatus" END
        WHERE "id" = NEW."cargo_id" AND "organizacion_id" = NEW."organizacion_id" AND "estatus" IN ('pendiente', 'vencido')
          AND "tutor_id" = (SELECT "tutor_id" FROM "pago" WHERE "id" = NEW."pago_id" AND "organizacion_id" = NEW."organizacion_id");
    IF NOT FOUND THEN
        RAISE EXCEPTION 'cargo_no_aplicable: el cargo no existe, está saldado o cancelado, o es de otra familia' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER "pago_aplicacion_alta_trg" AFTER INSERT ON "pago_aplicacion" FOR EACH ROW EXECUTE FUNCTION "pago_aplicacion_alta"();

-- De SOLO ANEXAR salvo el paso aplicada → revertida (cancelar el pago): nada más se edita y nada se borra. Al revertir, el cargo y el pago recalculan (un cargo pagado
-- vuelve a pendiente; el barrido lo materializa como vencido si toca).
CREATE FUNCTION "pago_aplicacion_cambio"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
        RAISE EXCEPTION 'pago_aplicacion es de solo anexar (no se borra)' USING ERRCODE = '23514';
    END IF;
    IF OLD."estatus" <> 'aplicada' OR NEW."estatus" <> 'revertida' OR NEW."pago_id" <> OLD."pago_id" OR NEW."cargo_id" <> OLD."cargo_id"
       OR NEW."monto_aplicado" <> OLD."monto_aplicado" OR NEW."organizacion_id" <> OLD."organizacion_id" THEN
        RAISE EXCEPTION 'pago_aplicacion es de solo anexar: lo único que cambia es aplicada → revertida' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER "pago_aplicacion_cambio_trg" BEFORE UPDATE OR DELETE ON "pago_aplicacion" FOR EACH ROW EXECUTE FUNCTION "pago_aplicacion_cambio"();
CREATE TRIGGER "pago_aplicacion_truncate_trg" BEFORE TRUNCATE ON "pago_aplicacion" FOR EACH STATEMENT EXECUTE FUNCTION "pago_aplicacion_cambio"();

CREATE FUNCTION "pago_aplicacion_reversa"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE "pago" SET "monto_aplicado" = "monto_aplicado" - OLD."monto_aplicado" WHERE "id" = OLD."pago_id" AND "organizacion_id" = OLD."organizacion_id";
    UPDATE "cargo" SET "monto_pagado" = "monto_pagado" - OLD."monto_aplicado",
                       "estatus" = CASE WHEN "estatus" = 'pagado' THEN 'pendiente'::"estatus_cargo" ELSE "estatus" END
        WHERE "id" = OLD."cargo_id" AND "organizacion_id" = OLD."organizacion_id";
    RETURN NEW;
END
$$;
CREATE TRIGGER "pago_aplicacion_reversa_trg" AFTER UPDATE ON "pago_aplicacion" FOR EACH ROW EXECUTE FUNCTION "pago_aplicacion_reversa"();

-- Un pago no se borra ni se edita: solo avanzan lo aplicado (los disparadores de arriba) y su cancelación (aplicado → cancelado, que no vuelve).
CREATE FUNCTION "pago_blindaje"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
        RAISE EXCEPTION 'pago_inmutable: un pago no se borra (se cancela)' USING ERRCODE = '23514';
    END IF;
    IF NEW."organizacion_id" <> OLD."organizacion_id" OR NEW."tutor_id" <> OLD."tutor_id" OR NEW."monto" <> OLD."monto" OR NEW."metodo" <> OLD."metodo"
       OR NEW."referencia" IS DISTINCT FROM OLD."referencia" OR NEW."fecha" <> OLD."fecha" OR NEW."clave_idempotencia" IS DISTINCT FROM OLD."clave_idempotencia" THEN
        RAISE EXCEPTION 'pago_inmutable: el monto, la familia, el método y la fecha de un pago no se editan (cancélalo y registra otro)' USING ERRCODE = '23514';
    END IF;
    IF OLD."estatus" = 'cancelado' AND NEW."estatus" <> 'cancelado' THEN
        RAISE EXCEPTION 'pago_cancelado: un pago cancelado no vuelve a aplicarse' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER "pago_blindaje_trg" BEFORE UPDATE OR DELETE ON "pago" FOR EACH ROW EXECUTE FUNCTION "pago_blindaje"();
CREATE TRIGGER "pago_truncate_trg" BEFORE TRUNCATE ON "pago" FOR EACH STATEMENT EXECUTE FUNCTION "pago_blindaje"();

-- Un pago aplicado cubre EXACTAMENTE su monto (no hay saldo a favor): se comprueba AL CONFIRMAR la transacción, cuando el pago y todas sus aplicaciones ya están.
CREATE FUNCTION "pago_cubre_su_monto"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    p RECORD;
BEGIN
    SELECT "monto", "monto_aplicado", "estatus" INTO p FROM "pago" WHERE "id" = NEW."id";
    IF FOUND AND p."estatus" = 'aplicado' AND p."monto_aplicado" <> p."monto" THEN
        RAISE EXCEPTION 'pago_cubre_su_monto: un pago aplicado debe cubrir exactamente su monto (monto %, aplicado %)', p."monto", p."monto_aplicado" USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END
$$;
CREATE CONSTRAINT TRIGGER "pago_cubre_su_monto_trg" AFTER INSERT OR UPDATE ON "pago" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "pago_cubre_su_monto"();

-- Un cargo tampoco se borra físicamente (invariante 3).
CREATE FUNCTION "cargo_no_se_borra"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'cargo_inmutable: un cargo no se borra (se cancela)' USING ERRCODE = '23514';
END
$$;
CREATE TRIGGER "cargo_no_se_borra_trg" BEFORE DELETE ON "cargo" FOR EACH ROW EXECUTE FUNCTION "cargo_no_se_borra"();
CREATE TRIGGER "cargo_no_se_borra_truncate_trg" BEFORE TRUNCATE ON "cargo" FOR EACH STATEMENT EXECUTE FUNCTION "cargo_no_se_borra"();
