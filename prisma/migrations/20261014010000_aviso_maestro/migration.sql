-- CreateEnum
CREATE TYPE "tipo_aviso_maestro" AS ENUM ('agendada', 'reprogramada', 'cancelada');

-- CreateEnum
CREATE TYPE "entrega_aviso_maestro" AS ENUM ('sin_telefono', 'pendiente', 'enviando', 'enviado', 'bloqueado', 'descartado', 'fallido');

-- AlterEnum
ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'aviso_maestro_no_enviado';

-- AlterTable
ALTER TABLE "tarea_asesor" ADD COLUMN     "clase_muestra_id" UUID;

-- CreateTable
CREATE TABLE "conversacion_instructor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    "bandeja_chatwoot_id" UUID NOT NULL,
    "chatwoot_conversacion_id" INTEGER NOT NULL,
    "ventana_servicio_hasta" TIMESTAMPTZ(6),
    "ultimo_mensaje_entrante_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "conversacion_instructor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aviso_maestro" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "instructor_id" UUID NOT NULL,
    "clase_muestra_id" UUID NOT NULL,
    "tipo" "tipo_aviso_maestro" NOT NULL,
    "datos" JSONB NOT NULL,
    "entrega" "entrega_aviso_maestro" NOT NULL DEFAULT 'pendiente',
    "motivo_entrega" TEXT,
    "programado_para" TIMESTAMPTZ(6) NOT NULL,
    "enviado_en" TIMESTAMPTZ(6),
    "id_externo" TEXT,
    "leido_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "aviso_maestro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversacion_instructor_organizacion_id_idx" ON "conversacion_instructor"("organizacion_id");

-- CreateIndex
CREATE INDEX "conversacion_instructor_instructor_id_idx" ON "conversacion_instructor"("instructor_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversacion_instructor_id_organizacion_id_key" ON "conversacion_instructor"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "aviso_maestro_organizacion_id_idx" ON "aviso_maestro"("organizacion_id");

-- CreateIndex
CREATE INDEX "aviso_maestro_instructor_id_creado_en_idx" ON "aviso_maestro"("instructor_id", "creado_en");

-- CreateIndex
CREATE INDEX "aviso_maestro_entrega_programado_para_idx" ON "aviso_maestro"("entrega", "programado_para");

-- CreateIndex
CREATE UNIQUE INDEX "aviso_maestro_id_organizacion_id_key" ON "aviso_maestro"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "tarea_asesor" ADD CONSTRAINT "tarea_asesor_clase_muestra_id_organizacion_id_fkey" FOREIGN KEY ("clase_muestra_id", "organizacion_id") REFERENCES "clase_muestra"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversacion_instructor" ADD CONSTRAINT "conversacion_instructor_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversacion_instructor" ADD CONSTRAINT "conversacion_instructor_instructor_id_organizacion_id_fkey" FOREIGN KEY ("instructor_id", "organizacion_id") REFERENCES "instructor"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversacion_instructor" ADD CONSTRAINT "conversacion_instructor_bandeja_chatwoot_id_organizacion_i_fkey" FOREIGN KEY ("bandeja_chatwoot_id", "organizacion_id") REFERENCES "bandeja_chatwoot"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "aviso_maestro" ADD CONSTRAINT "aviso_maestro_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso_maestro" ADD CONSTRAINT "aviso_maestro_instructor_id_organizacion_id_fkey" FOREIGN KEY ("instructor_id", "organizacion_id") REFERENCES "instructor"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "aviso_maestro" ADD CONSTRAINT "aviso_maestro_clase_muestra_id_organizacion_id_fkey" FOREIGN KEY ("clase_muestra_id", "organizacion_id") REFERENCES "clase_muestra"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ── Lo que Prisma no expresa ─────────────────────────────────────────────────────────────────────────────
-- Un instructor tiene a lo más una conversación viva por bandeja, y una conversación de Chatwoot es de una sola persona.
CREATE UNIQUE INDEX "conversacion_instructor_instructor_key"
    ON "conversacion_instructor" ("instructor_id", "bandeja_chatwoot_id") WHERE "eliminado_en" IS NULL;
CREATE UNIQUE INDEX "conversacion_instructor_chatwoot_key"
    ON "conversacion_instructor" ("bandeja_chatwoot_id", "chatwoot_conversacion_id") WHERE "eliminado_en" IS NULL;

-- Idempotencia (invariante 8): UN aviso por clase y tipo de evento; un reintento no duplica.
CREATE UNIQUE INDEX "aviso_maestro_clase_tipo_key"
    ON "aviso_maestro" ("clase_muestra_id", "tipo") WHERE "eliminado_en" IS NULL;

-- Una tarea del asesor ligada a una clase: el índice sirve a las consultas «las tareas de esta clase».
CREATE INDEX "tarea_asesor_clase_muestra_idx" ON "tarea_asesor" ("clase_muestra_id") WHERE "clase_muestra_id" IS NOT NULL;

-- Enviado tiene su hora; sin teléfono no se manda nada.
ALTER TABLE "aviso_maestro" ADD CONSTRAINT "aviso_maestro_entrega_check" CHECK (
    ("entrega" <> 'enviado' OR "enviado_en" IS NOT NULL)
);
