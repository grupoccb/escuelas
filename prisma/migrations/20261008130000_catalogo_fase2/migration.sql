-- Catálogo de Fase 2 (N11): programa, grupo y grupo_horario.

-- CreateTable
CREATE TABLE "programa" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "vertical_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "edad_min" INTEGER NOT NULL,
    "edad_max" INTEGER NOT NULL,
    "nivel" TEXT,
    "descripcion_publica" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "programa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupo" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "programa_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "salon" TEXT,
    "cupo_maximo" INTEGER NOT NULL,
    "permite_lista_espera" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupo_horario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "hora_inicio_min" INTEGER NOT NULL,
    "hora_fin_min" INTEGER NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "grupo_horario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "programa_organizacion_id_idx" ON "programa"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "programa_id_organizacion_id_key" ON "programa"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "grupo_organizacion_id_idx" ON "grupo"("organizacion_id");

-- CreateIndex
CREATE INDEX "grupo_programa_id_idx" ON "grupo"("programa_id");

-- CreateIndex
CREATE UNIQUE INDEX "grupo_id_organizacion_id_key" ON "grupo"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "grupo_horario_organizacion_id_idx" ON "grupo_horario"("organizacion_id");

-- CreateIndex
CREATE INDEX "grupo_horario_grupo_id_idx" ON "grupo_horario"("grupo_id");

-- CreateIndex
CREATE UNIQUE INDEX "grupo_horario_id_organizacion_id_key" ON "grupo_horario"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "programa" ADD CONSTRAINT "programa_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programa" ADD CONSTRAINT "programa_vertical_id_organizacion_id_fkey" FOREIGN KEY ("vertical_id", "organizacion_id") REFERENCES "vertical"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "programa" ADD CONSTRAINT "programa_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grupo" ADD CONSTRAINT "grupo_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupo" ADD CONSTRAINT "grupo_programa_id_organizacion_id_fkey" FOREIGN KEY ("programa_id", "organizacion_id") REFERENCES "programa"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "grupo_horario" ADD CONSTRAINT "grupo_horario_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupo_horario" ADD CONSTRAINT "grupo_horario_grupo_id_organizacion_id_fkey" FOREIGN KEY ("grupo_id", "organizacion_id") REFERENCES "grupo"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ------------------------------------------------------------------------------------------
-- Escrito a mano: índices únicos parciales y CHECK (Prisma no los expresa). Las llaves
-- naturales hacen idempotente el seed y evitan duplicar el catálogo.
-- ------------------------------------------------------------------------------------------

CREATE UNIQUE INDEX "programa_nombre_vivo_key"
    ON "programa" ("organizacion_id", "sucursal_id", "nombre") WHERE "eliminado_en" IS NULL;
ALTER TABLE "programa" ADD CONSTRAINT "programa_edades_check"
    CHECK ("edad_min" BETWEEN 0 AND 99 AND "edad_max" BETWEEN 0 AND 99 AND "edad_min" <= "edad_max");

CREATE UNIQUE INDEX "grupo_nombre_vivo_key"
    ON "grupo" ("programa_id", "nombre") WHERE "eliminado_en" IS NULL;
ALTER TABLE "grupo" ADD CONSTRAINT "grupo_cupo_check" CHECK ("cupo_maximo" >= 1);

CREATE UNIQUE INDEX "grupo_horario_vivo_key"
    ON "grupo_horario" ("grupo_id", "dia_semana", "hora_inicio_min") WHERE "eliminado_en" IS NULL;
ALTER TABLE "grupo_horario" ADD CONSTRAINT "grupo_horario_rango_check"
    CHECK ("dia_semana" BETWEEN 0 AND 6 AND "hora_inicio_min" >= 0 AND "hora_fin_min" <= 1440 AND "hora_inicio_min" < "hora_fin_min");
