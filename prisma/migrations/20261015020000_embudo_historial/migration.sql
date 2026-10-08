-- CreateEnum
CREATE TYPE "origen_cambio_etapa" AS ENUM ('usuario', 'sistema');

-- CreateEnum
CREATE TYPE "regla_transicion" AS ENUM ('permitida', 'solo_administrador', 'prohibida');

-- AlterTable
ALTER TABLE "lead" ADD COLUMN     "motivo_perdida_id" UUID,
ADD COLUMN     "recuperaciones" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "motivo_perdida" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "motivo_perdida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_etapa_historial" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "etapa_anterior_id" UUID,
    "etapa_nueva_id" UUID NOT NULL,
    "origen" "origen_cambio_etapa" NOT NULL,
    "usuario_id" UUID,
    "motivo" TEXT,
    "motivo_perdida_id" UUID,
    "nota" TEXT,
    "es_recuperacion" BOOLEAN NOT NULL DEFAULT false,
    "secuencia" BIGSERIAL NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "lead_etapa_historial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transicion_etapa" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "desde_etapa_id" UUID NOT NULL,
    "hacia_etapa_id" UUID NOT NULL,
    "regla" "regla_transicion" NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "transicion_etapa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "motivo_perdida_organizacion_id_idx" ON "motivo_perdida"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "motivo_perdida_id_organizacion_id_key" ON "motivo_perdida"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "lead_etapa_historial_organizacion_id_idx" ON "lead_etapa_historial"("organizacion_id");

-- CreateIndex
CREATE INDEX "lead_etapa_historial_lead_id_secuencia_idx" ON "lead_etapa_historial"("lead_id", "secuencia");

-- CreateIndex
CREATE UNIQUE INDEX "lead_etapa_historial_id_organizacion_id_key" ON "lead_etapa_historial"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "transicion_etapa_organizacion_id_idx" ON "transicion_etapa"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "transicion_etapa_id_organizacion_id_key" ON "transicion_etapa"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_motivo_perdida_id_organizacion_id_fkey" FOREIGN KEY ("motivo_perdida_id", "organizacion_id") REFERENCES "motivo_perdida"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "motivo_perdida" ADD CONSTRAINT "motivo_perdida_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_etapa_historial" ADD CONSTRAINT "lead_etapa_historial_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_etapa_historial" ADD CONSTRAINT "lead_etapa_historial_lead_id_organizacion_id_fkey" FOREIGN KEY ("lead_id", "organizacion_id") REFERENCES "lead"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_etapa_historial" ADD CONSTRAINT "lead_etapa_historial_etapa_anterior_id_organizacion_id_fkey" FOREIGN KEY ("etapa_anterior_id", "organizacion_id") REFERENCES "etapa_pipeline"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_etapa_historial" ADD CONSTRAINT "lead_etapa_historial_etapa_nueva_id_organizacion_id_fkey" FOREIGN KEY ("etapa_nueva_id", "organizacion_id") REFERENCES "etapa_pipeline"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_etapa_historial" ADD CONSTRAINT "lead_etapa_historial_usuario_id_organizacion_id_fkey" FOREIGN KEY ("usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead_etapa_historial" ADD CONSTRAINT "lead_etapa_historial_motivo_perdida_id_organizacion_id_fkey" FOREIGN KEY ("motivo_perdida_id", "organizacion_id") REFERENCES "motivo_perdida"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transicion_etapa" ADD CONSTRAINT "transicion_etapa_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transicion_etapa" ADD CONSTRAINT "transicion_etapa_desde_etapa_id_organizacion_id_fkey" FOREIGN KEY ("desde_etapa_id", "organizacion_id") REFERENCES "etapa_pipeline"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transicion_etapa" ADD CONSTRAINT "transicion_etapa_hacia_etapa_id_organizacion_id_fkey" FOREIGN KEY ("hacia_etapa_id", "organizacion_id") REFERENCES "etapa_pipeline"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ── Lo que Prisma no expresa ─────────────────────────────────────────────────────────────────────────────
-- Un motivo de pérdida por código y organización, entre los vivos; el código es un identificador (minúsculas, dígitos y guion bajo).
CREATE UNIQUE INDEX "motivo_perdida_codigo_key" ON "motivo_perdida" ("organizacion_id", "codigo") WHERE "eliminado_en" IS NULL;
ALTER TABLE "motivo_perdida" ADD CONSTRAINT "motivo_perdida_codigo_check" CHECK ("codigo" ~ '^[a-z][a-z0-9_]{0,39}$');

-- Una regla de transición por par de etapas, y nunca de una etapa a sí misma.
CREATE UNIQUE INDEX "transicion_etapa_par_key" ON "transicion_etapa" ("organizacion_id", "desde_etapa_id", "hacia_etapa_id") WHERE "eliminado_en" IS NULL;
ALTER TABLE "transicion_etapa" ADD CONSTRAINT "transicion_etapa_distintas_check" CHECK ("desde_etapa_id" <> "hacia_etapa_id");

-- Historial: una persona deja su usuario y el sistema no; recuperar exige la nota; el contador no baja de cero.
ALTER TABLE "lead_etapa_historial" ADD CONSTRAINT "lead_etapa_historial_origen_check" CHECK (
    ("origen" = 'usuario' AND "usuario_id" IS NOT NULL) OR ("origen" = 'sistema' AND "usuario_id" IS NULL)
);
ALTER TABLE "lead_etapa_historial" ADD CONSTRAINT "lead_etapa_historial_recuperacion_check" CHECK (NOT "es_recuperacion" OR ("nota" IS NOT NULL AND length(btrim("nota")) > 0));
ALTER TABLE "lead_etapa_historial" ADD CONSTRAINT "lead_etapa_historial_etapas_check" CHECK ("etapa_anterior_id" IS NULL OR "etapa_anterior_id" <> "etapa_nueva_id");
ALTER TABLE "lead" ADD CONSTRAINT "lead_recuperaciones_check" CHECK ("recuperaciones" >= 0);

-- El historial es de SOLO ANEXAR por la base (como registro_cambio): corregir un movimiento es otro movimiento.
CREATE FUNCTION "lead_etapa_historial_solo_anexar"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'lead_etapa_historial es de solo anexar (no se actualiza ni se borra)';
END;
$$;
CREATE TRIGGER "lead_etapa_historial_solo_anexar_trg" BEFORE UPDATE OR DELETE ON "lead_etapa_historial"
    FOR EACH ROW EXECUTE FUNCTION "lead_etapa_historial_solo_anexar"();
CREATE TRIGGER "lead_etapa_historial_solo_anexar_truncate_trg" BEFORE TRUNCATE ON "lead_etapa_historial"
    FOR EACH STATEMENT EXECUTE FUNCTION "lead_etapa_historial_solo_anexar"();

-- Los leads que ya existen entran al historial con su alta: sin etapa anterior y en la etapa en que están hoy (no se sabe por cuáles pasaron).
INSERT INTO "lead_etapa_historial" ("organizacion_id", "lead_id", "etapa_anterior_id", "etapa_nueva_id", "origen", "motivo", "creado_en")
SELECT l."organizacion_id", l."id", NULL, l."etapa_id", 'sistema', 'alta_previa_al_historial', l."creado_en"
FROM "lead" l
WHERE l."eliminado_en" IS NULL
ORDER BY l."creado_en", l."id";
