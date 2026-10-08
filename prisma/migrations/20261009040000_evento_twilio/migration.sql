-- CreateEnum
CREATE TYPE "tipo_evento_twilio" AS ENUM ('entrante', 'estado');

-- CreateEnum
CREATE TYPE "estado_proceso_evento" AS ENUM ('procesando', 'reenviado', 'fallido');

-- CreateTable
CREATE TABLE "evento_twilio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "proveedor" TEXT NOT NULL DEFAULT 'twilio',
    "tipo" "tipo_evento_twilio" NOT NULL,
    "id_mensaje" TEXT NOT NULL,
    "estado_mensaje" TEXT NOT NULL DEFAULT '',
    "numero_receptor" TEXT,
    "estado_proceso" "estado_proceso_evento" NOT NULL DEFAULT 'procesando',
    "intentos" INTEGER NOT NULL DEFAULT 1,
    "reclamado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reenviado_en" TIMESTAMPTZ(6),
    "error" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "evento_twilio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evento_twilio_organizacion_id_idx" ON "evento_twilio"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "evento_twilio_id_organizacion_id_key" ON "evento_twilio"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "evento_twilio" ADD CONSTRAINT "evento_twilio_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Idempotencia del borde de Twilio (invariante 8): un evento (por MessageSid, tipo y, en los
-- estados, MessageStatus) se reclama una sola vez entre los vivos.
CREATE UNIQUE INDEX "evento_twilio_unico_key"
    ON "evento_twilio" ("proveedor", "tipo", "id_mensaje", "estado_mensaje")
    WHERE "eliminado_en" IS NULL;
