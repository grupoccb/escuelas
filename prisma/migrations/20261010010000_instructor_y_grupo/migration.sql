-- AlterTable
ALTER TABLE "grupo" ADD COLUMN     "instructor_id" UUID;

-- CreateTable
CREATE TABLE "instructor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "usuario_id" UUID,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "instructor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instructor_organizacion_id_idx" ON "instructor"("organizacion_id");

-- CreateIndex
CREATE INDEX "instructor_usuario_id_idx" ON "instructor"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "instructor_id_organizacion_id_key" ON "instructor"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "grupo" ADD CONSTRAINT "grupo_instructor_id_organizacion_id_fkey" FOREIGN KEY ("instructor_id", "organizacion_id") REFERENCES "instructor"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "instructor" ADD CONSTRAINT "instructor_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instructor" ADD CONSTRAINT "instructor_usuario_id_organizacion_id_fkey" FOREIGN KEY ("usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- A lo más un instructor vivo por usuario.
CREATE UNIQUE INDEX "instructor_usuario_vivo_key" ON "instructor" ("organizacion_id", "usuario_id") WHERE "usuario_id" IS NOT NULL AND "eliminado_en" IS NULL;
