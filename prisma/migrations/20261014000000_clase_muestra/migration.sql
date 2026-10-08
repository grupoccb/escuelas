-- CreateEnum
CREATE TYPE "tipo_sistema_etapa" AS ENUM ('nuevo', 'contactado', 'muestra_agendada', 'muestra_asistida', 'negociacion', 'inscrito', 'perdido');


-- CreateEnum
CREATE TYPE "estatus_clase_muestra" AS ENUM ('agendada', 'asistio', 'no_asistio', 'reagendada', 'cancelada');

-- CreateEnum
CREATE TYPE "origen_clase_muestra" AS ENUM ('bot', 'usuario');

-- AlterEnum
ALTER TYPE "paso_captacion" ADD VALUE 'fecha_muestra';

-- AlterTable
ALTER TABLE "configuracion_organizacion" ADD COLUMN     "clase_muestra_anticipacion_min" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "clase_muestra_horizonte_dias" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "vertical" ADD COLUMN     "clase_muestra_whatsapp_activo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "etapa_pipeline" ADD COLUMN     "tipo_sistema" "tipo_sistema_etapa";

-- AlterTable
ALTER TABLE "conversacion" ADD COLUMN     "muestra_ofrecida" JSONB;

-- CreateTable
CREATE TABLE "clase_muestra" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "prospecto_id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "fecha_hora" TIMESTAMPTZ(6) NOT NULL,
    "estatus" "estatus_clase_muestra" NOT NULL DEFAULT 'agendada',
    "agendada_por" "origen_clase_muestra" NOT NULL,
    "agendada_por_usuario_id" UUID,
    "conversacion_id" UUID,
    "reprogramada_de_id" UUID,
    "motivo_cancelacion" TEXT,
    "notas" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "clase_muestra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clase_muestra_organizacion_id_idx" ON "clase_muestra"("organizacion_id");

-- CreateIndex
CREATE INDEX "clase_muestra_grupo_id_fecha_hora_idx" ON "clase_muestra"("grupo_id", "fecha_hora");

-- CreateIndex
CREATE INDEX "clase_muestra_prospecto_id_idx" ON "clase_muestra"("prospecto_id");

-- CreateIndex
CREATE INDEX "clase_muestra_lead_id_idx" ON "clase_muestra"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "clase_muestra_id_organizacion_id_key" ON "clase_muestra"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "clase_muestra" ADD CONSTRAINT "clase_muestra_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clase_muestra" ADD CONSTRAINT "clase_muestra_lead_id_organizacion_id_fkey" FOREIGN KEY ("lead_id", "organizacion_id") REFERENCES "lead"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "clase_muestra" ADD CONSTRAINT "clase_muestra_prospecto_id_organizacion_id_fkey" FOREIGN KEY ("prospecto_id", "organizacion_id") REFERENCES "prospecto"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "clase_muestra" ADD CONSTRAINT "clase_muestra_grupo_id_organizacion_id_fkey" FOREIGN KEY ("grupo_id", "organizacion_id") REFERENCES "grupo"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "clase_muestra" ADD CONSTRAINT "clase_muestra_agendada_por_usuario_id_organizacion_id_fkey" FOREIGN KEY ("agendada_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "clase_muestra" ADD CONSTRAINT "clase_muestra_conversacion_id_organizacion_id_fkey" FOREIGN KEY ("conversacion_id", "organizacion_id") REFERENCES "conversacion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "clase_muestra" ADD CONSTRAINT "clase_muestra_reprogramada_de_id_organizacion_id_fkey" FOREIGN KEY ("reprogramada_de_id", "organizacion_id") REFERENCES "clase_muestra"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ── Lo que Prisma no expresa ─────────────────────────────────────────────────────────────────────────────
-- A lo más una etapa viva por tipo de sistema y organización: el código busca por tipo, nunca por nombre, y
-- tiene que encontrar una sola.
CREATE UNIQUE INDEX "etapa_pipeline_tipo_sistema_key"
    ON "etapa_pipeline" ("organizacion_id", "tipo_sistema")
    WHERE "tipo_sistema" IS NOT NULL AND "eliminado_en" IS NULL;

-- Un prospecto tiene a lo más una clase muestra VIGENTE por grupo (la misma sesión dos veces tampoco).
CREATE UNIQUE INDEX "clase_muestra_vigente_key"
    ON "clase_muestra" ("prospecto_id", "grupo_id")
    WHERE "estatus" = 'agendada' AND "eliminado_en" IS NULL;

-- Origen coherente: el bot agenda dentro de una conversación y sin usuario; una persona deja su usuario y no hay conversación.
ALTER TABLE "clase_muestra" ADD CONSTRAINT "clase_muestra_origen_check" CHECK (
    ("agendada_por" = 'bot' AND "conversacion_id" IS NOT NULL AND "agendada_por_usuario_id" IS NULL)
    OR ("agendada_por" = 'usuario' AND "agendada_por_usuario_id" IS NOT NULL AND "conversacion_id" IS NULL)
);
-- Una clase no se reemplaza a sí misma.
ALTER TABLE "clase_muestra" ADD CONSTRAINT "clase_muestra_reprogramada_check" CHECK ("reprogramada_de_id" IS NULL OR "reprogramada_de_id" <> "id");
-- Las sesiones empiezan en un minuto exacto (las del horario del grupo lo son).
ALTER TABLE "clase_muestra" ADD CONSTRAINT "clase_muestra_minuto_check" CHECK (date_trunc('minute', "fecha_hora") = "fecha_hora");

ALTER TABLE "configuracion_organizacion" ADD CONSTRAINT "configuracion_muestra_anticipacion_check" CHECK ("clase_muestra_anticipacion_min" BETWEEN 0 AND 10080);
ALTER TABLE "configuracion_organizacion" ADD CONSTRAINT "configuracion_muestra_horizonte_check" CHECK ("clase_muestra_horizonte_dias" BETWEEN 1 AND 365);
