-- CreateEnum
CREATE TYPE "origen_evento_inesperado" AS ENUM ('chatwoot', 'twilio_entrante', 'twilio_estado', 'landing', 'barrido_twilio');

-- CreateEnum
CREATE TYPE "causa_evento_inesperado" AS ENUM ('json_invalido', 'forma_inesperada', 'sin_identificador', 'dato_invalido', 'texto_con_nul', 'restriccion_base', 'registro_inexistente', 'bandeja_sin_aprovisionar', 'reenvio_abandonado', 'error_interno');

-- AlterEnum
ALTER TYPE "tipo_tarea_asesor" ADD VALUE 'evento_inesperado';

-- AlterTable
ALTER TABLE "tarea_asesor" ALTER COLUMN "lead_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "evento_inesperado" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID,
    "origen" "origen_evento_inesperado" NOT NULL,
    "clave" TEXT NOT NULL,
    "causa" "causa_evento_inesperado" NOT NULL,
    "detalle" TEXT NOT NULL,
    "forma" JSONB NOT NULL DEFAULT '{}',
    "intentos" INTEGER NOT NULL DEFAULT 1,
    "lead_id" UUID,
    "conversacion_id" UUID,
    "tarea_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "evento_inesperado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evento_inesperado_organizacion_id_idx" ON "evento_inesperado"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "evento_inesperado_id_organizacion_id_key" ON "evento_inesperado"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "evento_inesperado" ADD CONSTRAINT "evento_inesperado_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento_inesperado" ADD CONSTRAINT "evento_inesperado_lead_id_organizacion_id_fkey" FOREIGN KEY ("lead_id", "organizacion_id") REFERENCES "lead"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "evento_inesperado" ADD CONSTRAINT "evento_inesperado_conversacion_id_organizacion_id_fkey" FOREIGN KEY ("conversacion_id", "organizacion_id") REFERENCES "conversacion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "evento_inesperado" ADD CONSTRAINT "evento_inesperado_tarea_id_organizacion_id_fkey" FOREIGN KEY ("tarea_id", "organizacion_id") REFERENCES "tarea_asesor"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- WH: UN evento del proveedor deja UNA constancia por organización (un reintento solo suma `intentos`). Los eventos que no se pudieron atar a ninguna
-- organización comparten la «organización nula» (un uuid de ceros): el mismo cuerpo roto, reintentado, también deja una sola.
CREATE UNIQUE INDEX "evento_inesperado_origen_clave_key"
  ON "evento_inesperado" (COALESCE("organizacion_id", '00000000-0000-0000-0000-000000000000'::uuid), "origen", "clave") WHERE "eliminado_en" IS NULL;
ALTER TABLE "evento_inesperado" ADD CONSTRAINT "evento_inesperado_intentos_chk" CHECK ("intentos" >= 1);
-- Sin organización no hay a qué atar un lead, una conversación ni una tarea (las llaves foráneas compuestas no se comprueban con un NULL).
ALTER TABLE "evento_inesperado" ADD CONSTRAINT "evento_inesperado_sin_organizacion_chk"
  CHECK ("organizacion_id" IS NOT NULL OR ("lead_id" IS NULL AND "conversacion_id" IS NULL AND "tarea_id" IS NULL));
