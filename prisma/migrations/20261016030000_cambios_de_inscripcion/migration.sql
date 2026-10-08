-- CreateEnum
CREATE TYPE "tipo_movimiento_inscripcion" AS ENUM ('cambio_grupo', 'congelacion', 'reactivacion', 'baja');

-- AlterTable
ALTER TABLE "inscripcion" ADD COLUMN     "congelada_desde" DATE,
ADD COLUMN     "motivo_baja_id" UUID;

-- CreateTable
CREATE TABLE "motivo_baja" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "motivo_baja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscripcion_movimiento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "inscripcion_id" UUID NOT NULL,
    "tipo" "tipo_movimiento_inscripcion" NOT NULL,
    "grupo_anterior_id" UUID,
    "grupo_nuevo_id" UUID,
    "motivo_baja_id" UUID,
    "fecha" DATE NOT NULL,
    "usuario_id" UUID,
    "secuencia" BIGSERIAL NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "inscripcion_movimiento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "motivo_baja_organizacion_id_idx" ON "motivo_baja"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "motivo_baja_id_organizacion_id_key" ON "motivo_baja"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "inscripcion_movimiento_organizacion_id_idx" ON "inscripcion_movimiento"("organizacion_id");

-- CreateIndex
CREATE INDEX "inscripcion_movimiento_inscripcion_id_secuencia_idx" ON "inscripcion_movimiento"("inscripcion_id", "secuencia");

-- CreateIndex
CREATE UNIQUE INDEX "inscripcion_movimiento_id_organizacion_id_key" ON "inscripcion_movimiento"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_motivo_baja_id_organizacion_id_fkey" FOREIGN KEY ("motivo_baja_id", "organizacion_id") REFERENCES "motivo_baja"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "motivo_baja" ADD CONSTRAINT "motivo_baja_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripcion_movimiento" ADD CONSTRAINT "inscripcion_movimiento_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscripcion_movimiento" ADD CONSTRAINT "inscripcion_movimiento_inscripcion_id_organizacion_id_fkey" FOREIGN KEY ("inscripcion_id", "organizacion_id") REFERENCES "inscripcion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inscripcion_movimiento" ADD CONSTRAINT "inscripcion_movimiento_grupo_anterior_id_organizacion_id_fkey" FOREIGN KEY ("grupo_anterior_id", "organizacion_id") REFERENCES "grupo"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inscripcion_movimiento" ADD CONSTRAINT "inscripcion_movimiento_grupo_nuevo_id_organizacion_id_fkey" FOREIGN KEY ("grupo_nuevo_id", "organizacion_id") REFERENCES "grupo"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inscripcion_movimiento" ADD CONSTRAINT "inscripcion_movimiento_motivo_baja_id_organizacion_id_fkey" FOREIGN KEY ("motivo_baja_id", "organizacion_id") REFERENCES "motivo_baja"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "inscripcion_movimiento" ADD CONSTRAINT "inscripcion_movimiento_usuario_id_organizacion_id_fkey" FOREIGN KEY ("usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ── Lo que Prisma no expresa ─────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "motivo_baja_codigo_key" ON "motivo_baja" ("organizacion_id", "codigo") WHERE "eliminado_en" IS NULL;
ALTER TABLE "motivo_baja" ADD CONSTRAINT "motivo_baja_codigo_check" CHECK ("codigo" ~ '^[a-z][a-z0-9_]{0,39}$');
-- El motivo solo existe en una baja y el «desde cuándo» solo en una congelada; una baja SIEMPRE trae su motivo (las bajas que ya existían, ninguna: F5 es nuevo).
-- NOT VALID: las filas de antes de F5 (solo existen en bases de prueba: F3 aún no estaba en uso) no traen motivo ni «desde cuándo»; toda fila nueva o modificada sí se valida.
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_motivo_baja_check" CHECK (("estatus" = 'baja') = ("motivo_baja_id" IS NOT NULL)) NOT VALID;
ALTER TABLE "inscripcion" ADD CONSTRAINT "inscripcion_congelada_check" CHECK (("estatus" = 'congelada') = ("congelada_desde" IS NOT NULL)) NOT VALID;
-- Coherencia del movimiento: el cambio de grupo lleva los dos grupos y distintos; la baja, su motivo.
ALTER TABLE "inscripcion_movimiento" ADD CONSTRAINT "inscripcion_movimiento_check" CHECK (
    ("tipo" = 'cambio_grupo' AND "grupo_anterior_id" IS NOT NULL AND "grupo_nuevo_id" IS NOT NULL AND "grupo_anterior_id" <> "grupo_nuevo_id")
    OR ("tipo" = 'baja' AND "motivo_baja_id" IS NOT NULL)
    OR ("tipo" IN ('congelacion', 'reactivacion'))
);
-- De SOLO ANEXAR por la base (como registro_cambio y lead_etapa_historial): corregir un movimiento es otro movimiento.
CREATE FUNCTION "inscripcion_movimiento_solo_anexar"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'inscripcion_movimiento es de solo anexar (no se actualiza ni se borra)';
END;
$$;
CREATE TRIGGER "inscripcion_movimiento_solo_anexar_trg" BEFORE UPDATE OR DELETE ON "inscripcion_movimiento"
    FOR EACH ROW EXECUTE FUNCTION "inscripcion_movimiento_solo_anexar"();
CREATE TRIGGER "inscripcion_movimiento_solo_anexar_truncate_trg" BEFORE TRUNCATE ON "inscripcion_movimiento"
    FOR EACH STATEMENT EXECUTE FUNCTION "inscripcion_movimiento_solo_anexar"();
