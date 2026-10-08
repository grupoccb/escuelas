-- CreateEnum
CREATE TYPE "estatus_alumno" AS ENUM ('activo', 'baja', 'congelado');

-- AlterTable
ALTER TABLE "lead" ADD COLUMN     "tutor_id" UUID;

-- AlterTable
ALTER TABLE "prospecto" ADD COLUMN     "alumno_id" UUID;

-- CreateTable
CREATE TABLE "tutor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT,
    "telefono" TEXT NOT NULL,
    "correo" TEXT,
    "direccion" TEXT,
    "como_nos_conocio" TEXT,
    "sucursal_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "tutor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alumno" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "fecha_nacimiento" DATE NOT NULL,
    "sexo" "sexo_persona",
    "estatus" "estatus_alumno" NOT NULL DEFAULT 'activo',
    "sucursal_id" UUID,
    "escuela_nombre" TEXT,
    "escuela_turno" "turno_escolar",
    "talla_uniforme" TEXT,
    "practico_antes" BOOLEAN,
    "practico_donde" TEXT,
    "practico_nivel" TEXT,
    "motivo_clase" "motivo_clase_muestra",
    "motivo_clase_detalle" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "alumno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tutor_alumno" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "tutor_id" UUID NOT NULL,
    "alumno_id" UUID NOT NULL,
    "parentesco" TEXT NOT NULL,
    "es_responsable_pago" BOOLEAN NOT NULL DEFAULT false,
    "es_contacto_urgencia" BOOLEAN NOT NULL DEFAULT false,
    "puede_recoger" BOOLEAN NOT NULL DEFAULT false,
    "lo_lleva" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "tutor_alumno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tutor_organizacion_id_idx" ON "tutor"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_id_organizacion_id_key" ON "tutor"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "alumno_organizacion_id_idx" ON "alumno"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "alumno_id_organizacion_id_key" ON "alumno"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "tutor_alumno_organizacion_id_idx" ON "tutor_alumno"("organizacion_id");

-- CreateIndex
CREATE INDEX "tutor_alumno_tutor_id_idx" ON "tutor_alumno"("tutor_id");

-- CreateIndex
CREATE INDEX "tutor_alumno_alumno_id_idx" ON "tutor_alumno"("alumno_id");

-- CreateIndex
CREATE UNIQUE INDEX "tutor_alumno_id_organizacion_id_key" ON "tutor_alumno"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_tutor_id_organizacion_id_fkey" FOREIGN KEY ("tutor_id", "organizacion_id") REFERENCES "tutor"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_alumno_id_organizacion_id_fkey" FOREIGN KEY ("alumno_id", "organizacion_id") REFERENCES "alumno"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tutor" ADD CONSTRAINT "tutor_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor" ADD CONSTRAINT "tutor_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "alumno" ADD CONSTRAINT "alumno_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alumno" ADD CONSTRAINT "alumno_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tutor_alumno" ADD CONSTRAINT "tutor_alumno_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutor_alumno" ADD CONSTRAINT "tutor_alumno_tutor_id_organizacion_id_fkey" FOREIGN KEY ("tutor_id", "organizacion_id") REFERENCES "tutor"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tutor_alumno" ADD CONSTRAINT "tutor_alumno_alumno_id_organizacion_id_fkey" FOREIGN KEY ("alumno_id", "organizacion_id") REFERENCES "alumno"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ── Lo que Prisma no expresa ─────────────────────────────────────────────────────────────────────────────
-- Un tutor por teléfono normalizado dentro de la organización (detección de familia): el mismo teléfono es la misma familia.
CREATE UNIQUE INDEX "tutor_telefono_vivo_key" ON "tutor" ("organizacion_id", "telefono") WHERE "eliminado_en" IS NULL;
-- E.164 y colapsado: el «1» de móvil de +521 se quita SIEMPRE antes de guardar (normalizarTelefono(), invariante 7).
ALTER TABLE "tutor" ADD CONSTRAINT "tutor_telefono_check" CHECK ("telefono" ~ '^\+[1-9][0-9]{7,14}$' AND "telefono" !~ '^\+521[0-9]{10}$');
-- El nacimiento del acta no es anterior a 1900 (que no sea futuro depende de HOY y lo valida la aplicación).
ALTER TABLE "alumno" ADD CONSTRAINT "alumno_nacimiento_check" CHECK ("fecha_nacimiento" >= DATE '1900-01-01');
ALTER TABLE "alumno" ADD CONSTRAINT "alumno_antecedentes_check" CHECK ("practico_antes" IS DISTINCT FROM FALSE OR ("practico_donde" IS NULL AND "practico_nivel" IS NULL));
-- Una fila viva por (tutor, alumno) y a lo más un responsable de pago por alumno (el estado de cuenta le llega a ese tutor).
CREATE UNIQUE INDEX "tutor_alumno_vivo_key" ON "tutor_alumno" ("tutor_id", "alumno_id") WHERE "eliminado_en" IS NULL;
CREATE UNIQUE INDEX "tutor_alumno_responsable_pago_key" ON "tutor_alumno" ("alumno_id") WHERE "es_responsable_pago" AND "eliminado_en" IS NULL;
-- Búsqueda de alumnos por nombre.
CREATE INDEX "alumno_organizacion_nombre_idx" ON "alumno" ("organizacion_id", lower("apellidos"), lower("nombre")) WHERE "eliminado_en" IS NULL;
-- Un prospecto se convierte en UN alumno, y un alumno viene de UN prospecto (a lo más) vivo.
CREATE UNIQUE INDEX "prospecto_alumno_vivo_key" ON "prospecto" ("alumno_id") WHERE "alumno_id" IS NOT NULL AND "eliminado_en" IS NULL;
CREATE INDEX "lead_tutor_idx" ON "lead" ("tutor_id") WHERE "tutor_id" IS NOT NULL;
