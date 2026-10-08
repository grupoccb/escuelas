-- CreateTable
CREATE TABLE "nivel_progresion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "vertical_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "color_hex" TEXT,
    "horas_minimas" INTEGER NOT NULL DEFAULT 0,
    "clases_minimas" INTEGER NOT NULL DEFAULT 0,
    "requisitos_texto" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "nivel_progresion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumno_progresion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "alumno_id" UUID NOT NULL,
    "nivel_id" UUID NOT NULL,
    "fecha_obtenido" DATE NOT NULL,
    "evento_id" UUID,
    "instructor_id" UUID,
    "observaciones" TEXT,
    "registrado_por_usuario_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "alumno_progresion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nivel_progresion_organizacion_id_idx" ON "nivel_progresion"("organizacion_id");

-- CreateIndex
CREATE INDEX "nivel_progresion_vertical_id_idx" ON "nivel_progresion"("vertical_id");

-- CreateIndex
CREATE UNIQUE INDEX "nivel_progresion_id_organizacion_id_key" ON "nivel_progresion"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "alumno_progresion_organizacion_id_idx" ON "alumno_progresion"("organizacion_id");

-- CreateIndex
CREATE INDEX "alumno_progresion_alumno_id_idx" ON "alumno_progresion"("alumno_id");

-- CreateIndex
CREATE INDEX "alumno_progresion_nivel_id_idx" ON "alumno_progresion"("nivel_id");

-- CreateIndex
CREATE UNIQUE INDEX "alumno_progresion_id_organizacion_id_key" ON "alumno_progresion"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "nivel_progresion" ADD CONSTRAINT "nivel_progresion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nivel_progresion" ADD CONSTRAINT "nivel_progresion_vertical_id_organizacion_id_fkey" FOREIGN KEY ("vertical_id", "organizacion_id") REFERENCES "vertical"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "alumno_progresion" ADD CONSTRAINT "alumno_progresion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumno_progresion" ADD CONSTRAINT "alumno_progresion_alumno_id_organizacion_id_fkey" FOREIGN KEY ("alumno_id", "organizacion_id") REFERENCES "alumno"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "alumno_progresion" ADD CONSTRAINT "alumno_progresion_nivel_id_organizacion_id_fkey" FOREIGN KEY ("nivel_id", "organizacion_id") REFERENCES "nivel_progresion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "alumno_progresion" ADD CONSTRAINT "alumno_progresion_instructor_id_organizacion_id_fkey" FOREIGN KEY ("instructor_id", "organizacion_id") REFERENCES "instructor"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "alumno_progresion" ADD CONSTRAINT "alumno_progresion_registrado_por_usuario_id_organizacion_i_fkey" FOREIGN KEY ("registrado_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- G3: los peldaños de una vertical se ordenan sin repetir `orden` ni nombre entre los vivos.
CREATE UNIQUE INDEX "nivel_progresion_vertical_orden_key" ON "nivel_progresion" ("vertical_id", "orden") WHERE "eliminado_en" IS NULL;
CREATE UNIQUE INDEX "nivel_progresion_vertical_nombre_key" ON "nivel_progresion" ("vertical_id", lower("nombre")) WHERE "eliminado_en" IS NULL;
ALTER TABLE "nivel_progresion" ADD CONSTRAINT "nivel_progresion_color_chk" CHECK ("color_hex" IS NULL OR "color_hex" ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE "nivel_progresion" ADD CONSTRAINT "nivel_progresion_minimos_chk" CHECK ("horas_minimas" >= 0 AND "clases_minimas" >= 0 AND "orden" >= 0);
ALTER TABLE "nivel_progresion" ADD CONSTRAINT "nivel_progresion_nombre_chk" CHECK (length(btrim("nombre")) BETWEEN 1 AND 80);
-- Un alumno obtiene cada peldaño UNA vez entre las filas vivas.
CREATE UNIQUE INDEX "alumno_progresion_alumno_nivel_key" ON "alumno_progresion" ("alumno_id", "nivel_id") WHERE "eliminado_en" IS NULL;
-- Para hallar el nivel actual (el más reciente) de un alumno.
CREATE INDEX "alumno_progresion_actual_idx" ON "alumno_progresion" ("alumno_id", "fecha_obtenido" DESC, "creado_en" DESC) WHERE "eliminado_en" IS NULL;
ALTER TABLE "alumno_progresion" ADD CONSTRAINT "alumno_progresion_fecha_chk" CHECK ("fecha_obtenido" >= DATE '2000-01-01' AND "fecha_obtenido" <= DATE '2999-12-31');
