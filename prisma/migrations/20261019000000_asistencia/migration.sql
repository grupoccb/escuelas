-- CreateEnum
CREATE TYPE "estatus_asistencia" AS ENUM ('presente', 'falta', 'justificada');

-- CreateEnum
CREATE TYPE "metodo_asistencia" AS ENUM ('manual', 'qr');

-- CreateTable
CREATE TABLE "asistencia" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "inscripcion_id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "estatus" "estatus_asistencia" NOT NULL,
    "metodo" "metodo_asistencia" NOT NULL DEFAULT 'manual',
    "registrado_por_usuario_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "asistencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asistencia_organizacion_id_idx" ON "asistencia"("organizacion_id");

-- CreateIndex
CREATE INDEX "asistencia_inscripcion_id_fecha_idx" ON "asistencia"("inscripcion_id", "fecha");

-- CreateIndex
CREATE INDEX "asistencia_grupo_id_fecha_idx" ON "asistencia"("grupo_id", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "asistencia_id_organizacion_id_key" ON "asistencia"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "asistencia" ADD CONSTRAINT "asistencia_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencia" ADD CONSTRAINT "asistencia_inscripcion_id_organizacion_id_fkey" FOREIGN KEY ("inscripcion_id", "organizacion_id") REFERENCES "inscripcion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "asistencia" ADD CONSTRAINT "asistencia_grupo_id_organizacion_id_fkey" FOREIGN KEY ("grupo_id", "organizacion_id") REFERENCES "grupo"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "asistencia" ADD CONSTRAINT "asistencia_registrado_por_usuario_id_organizacion_id_fkey" FOREIGN KEY ("registrado_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- G1: UNA fila por (inscripción, fecha) entre las vivas: el pase es idempotente y dos pases simultáneos no duplican.
CREATE UNIQUE INDEX "asistencia_inscripcion_fecha_key" ON "asistencia" ("inscripcion_id", "fecha") WHERE "eliminado_en" IS NULL;
-- Para el pase de un grupo y fecha, y para la racha de una inscripción.
CREATE INDEX "asistencia_grupo_fecha_vivas_idx" ON "asistencia" ("grupo_id", "fecha") WHERE "eliminado_en" IS NULL;
ALTER TABLE "asistencia" ADD CONSTRAINT "asistencia_fecha_chk" CHECK ("fecha" >= DATE '2000-01-01' AND "fecha" <= DATE '2999-12-31');
