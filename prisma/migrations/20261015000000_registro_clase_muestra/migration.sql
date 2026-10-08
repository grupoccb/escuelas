-- CreateEnum
CREATE TYPE "estatus_registro_muestra" AS ENUM ('borrador', 'completo', 'cerrado');

-- CreateEnum
CREATE TYPE "sexo_persona" AS ENUM ('femenino', 'masculino', 'otro');

-- CreateEnum
CREATE TYPE "turno_escolar" AS ENUM ('matutino', 'vespertino', 'jornada_completa');

-- CreateEnum
CREATE TYPE "motivo_clase_muestra" AS ENUM ('disciplina', 'condicion_fisica', 'socializacion', 'competencia', 'otro');

-- CreateEnum
CREATE TYPE "interes_percibido" AS ENUM ('alto', 'medio', 'bajo');

-- CreateTable
CREATE TABLE "registro_clase_muestra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "clase_muestra_id" UUID NOT NULL,
    "prospecto_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "estatus" "estatus_registro_muestra" NOT NULL DEFAULT 'borrador',
    "alumno_nombre" TEXT,
    "alumno_apellidos" TEXT,
    "alumno_fecha_nacimiento" DATE,
    "alumno_sexo" "sexo_persona",
    "escuela_nombre" TEXT,
    "escuela_turno" "turno_escolar",
    "talla_uniforme" TEXT,
    "practico_antes" BOOLEAN,
    "practico_donde" TEXT,
    "practico_nivel" TEXT,
    "motivo_clase" "motivo_clase_muestra",
    "motivo_clase_detalle" TEXT,
    "nivel_observado" TEXT,
    "grupo_recomendado_id" UUID,
    "interes_percibido" "interes_percibido",
    "notas_maestro" TEXT,
    "salud_contacto_registrado" BOOLEAN NOT NULL DEFAULT false,
    "salud_completa" BOOLEAN NOT NULL DEFAULT false,
    "completo_en" TIMESTAMPTZ(6),
    "cerrado_en" TIMESTAMPTZ(6),
    "cerrado_por_usuario_id" UUID,
    "creado_por_usuario_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "registro_clase_muestra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registro_tutor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "registro_id" UUID NOT NULL,
    "posicion" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT,
    "parentesco" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "correo" TEXT,
    "es_responsable_pago" BOOLEAN NOT NULL DEFAULT false,
    "lo_lleva" BOOLEAN NOT NULL DEFAULT false,
    "puede_recoger" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "registro_tutor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registro_clase_muestra_organizacion_id_idx" ON "registro_clase_muestra"("organizacion_id");

-- CreateIndex
CREATE INDEX "registro_clase_muestra_prospecto_id_idx" ON "registro_clase_muestra"("prospecto_id");

-- CreateIndex
CREATE INDEX "registro_clase_muestra_lead_id_idx" ON "registro_clase_muestra"("lead_id");

-- CreateIndex
CREATE INDEX "registro_clase_muestra_clase_muestra_id_idx" ON "registro_clase_muestra"("clase_muestra_id");

-- CreateIndex
CREATE UNIQUE INDEX "registro_clase_muestra_id_organizacion_id_key" ON "registro_clase_muestra"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "registro_tutor_organizacion_id_idx" ON "registro_tutor"("organizacion_id");

-- CreateIndex
CREATE INDEX "registro_tutor_registro_id_idx" ON "registro_tutor"("registro_id");

-- CreateIndex
CREATE UNIQUE INDEX "registro_tutor_id_organizacion_id_key" ON "registro_tutor"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "registro_clase_muestra" ADD CONSTRAINT "registro_clase_muestra_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_clase_muestra" ADD CONSTRAINT "registro_clase_muestra_clase_muestra_id_organizacion_id_fkey" FOREIGN KEY ("clase_muestra_id", "organizacion_id") REFERENCES "clase_muestra"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "registro_clase_muestra" ADD CONSTRAINT "registro_clase_muestra_prospecto_id_organizacion_id_fkey" FOREIGN KEY ("prospecto_id", "organizacion_id") REFERENCES "prospecto"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "registro_clase_muestra" ADD CONSTRAINT "registro_clase_muestra_lead_id_organizacion_id_fkey" FOREIGN KEY ("lead_id", "organizacion_id") REFERENCES "lead"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "registro_clase_muestra" ADD CONSTRAINT "registro_clase_muestra_grupo_recomendado_id_organizacion_i_fkey" FOREIGN KEY ("grupo_recomendado_id", "organizacion_id") REFERENCES "grupo"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "registro_clase_muestra" ADD CONSTRAINT "registro_clase_muestra_creado_por_usuario_id_organizacion__fkey" FOREIGN KEY ("creado_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "registro_clase_muestra" ADD CONSTRAINT "registro_clase_muestra_cerrado_por_usuario_id_organizacion_fkey" FOREIGN KEY ("cerrado_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "registro_tutor" ADD CONSTRAINT "registro_tutor_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_tutor" ADD CONSTRAINT "registro_tutor_registro_id_organizacion_id_fkey" FOREIGN KEY ("registro_id", "organizacion_id") REFERENCES "registro_clase_muestra"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ── Lo que Prisma no expresa ─────────────────────────────────────────────────────────────────────────────
-- Un registro vivo por clase muestra (1:1).
CREATE UNIQUE INDEX "registro_clase_muestra_clase_key"
    ON "registro_clase_muestra" ("clase_muestra_id")
    WHERE "eliminado_en" IS NULL;

-- Coherencia del estatus: completo y cerrado dejan su sello; cerrado, quién lo cerró.
ALTER TABLE "registro_clase_muestra" ADD CONSTRAINT "registro_muestra_estatus_check" CHECK (
    ("estatus" = 'borrador')
    OR ("estatus" = 'completo' AND "completo_en" IS NOT NULL AND "cerrado_en" IS NULL)
    OR ("estatus" = 'cerrado' AND "completo_en" IS NOT NULL AND "cerrado_en" IS NOT NULL AND "cerrado_por_usuario_id" IS NOT NULL)
);
-- Quien no ha practicado antes no tiene dónde ni nivel.
ALTER TABLE "registro_clase_muestra" ADD CONSTRAINT "registro_muestra_antecedentes_check" CHECK (
    "practico_antes" IS DISTINCT FROM FALSE OR ("practico_donde" IS NULL AND "practico_nivel" IS NULL)
);
-- El detalle del motivo solo tiene sentido con un motivo; la fecha de nacimiento no es anterior a 1900 (la de «no es futura» y
-- «edad razonable» depende de HOY y la valida la aplicación: un CHECK con CURRENT_DATE no es inmutable).
ALTER TABLE "registro_clase_muestra" ADD CONSTRAINT "registro_muestra_motivo_check" CHECK ("motivo_clase_detalle" IS NULL OR "motivo_clase" IS NOT NULL);
ALTER TABLE "registro_clase_muestra" ADD CONSTRAINT "registro_muestra_nacimiento_check" CHECK ("alumno_fecha_nacimiento" IS NULL OR "alumno_fecha_nacimiento" >= DATE '1900-01-01');
-- La salud completa incluye el contacto.
ALTER TABLE "registro_clase_muestra" ADD CONSTRAINT "registro_muestra_salud_check" CHECK (NOT "salud_completa" OR "salud_contacto_registrado");

-- Tutores: a lo más un responsable de pago, uno que lo lleva y un teléfono sin repetir por registro.
CREATE UNIQUE INDEX "registro_tutor_pago_key" ON "registro_tutor" ("registro_id") WHERE "es_responsable_pago" AND "eliminado_en" IS NULL;
CREATE UNIQUE INDEX "registro_tutor_lo_lleva_key" ON "registro_tutor" ("registro_id") WHERE "lo_lleva" AND "eliminado_en" IS NULL;
CREATE UNIQUE INDEX "registro_tutor_telefono_key" ON "registro_tutor" ("registro_id", "telefono") WHERE "eliminado_en" IS NULL;

-- El registro de accesos a salud distingue la validación interna (comparar el contacto de emergencia con los tutores sin
-- mostrar nada) de una lectura.
ALTER TABLE "acceso_dato_sensible" DROP CONSTRAINT "acceso_dato_sensible_valores_check";
ALTER TABLE "acceso_dato_sensible" ADD CONSTRAINT "acceso_dato_sensible_valores_check"
    CHECK ("accion" IN ('leer', 'escribir', 'validar') AND "resultado" IN ('permitido', 'denegado'));
