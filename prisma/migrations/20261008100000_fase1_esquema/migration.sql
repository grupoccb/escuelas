-- Fase 1, bloque 1.1: esquema completo. Generado con `prisma migrate diff` y reordenado a mano

-- para migrar lo que ya existía (demo 0.5) sin perder datos.


-- ──────────────────────────────────────────────────────────────────────────────────────────
-- Tipos
-- ──────────────────────────────────────────────────────────────────────────────────────────


-- CreateEnum
CREATE TYPE "calidad_meta" AS ENUM ('alta', 'media', 'baja', 'desconocida');

-- CreateEnum
CREATE TYPE "origen_campana" AS ENUM ('facebook', 'instagram', 'tiktok', 'google', 'referido', 'presencial', 'otro');

-- CreateEnum
CREATE TYPE "origen_prospecto" AS ENUM ('bot', 'asesor');

-- CreateEnum
CREATE TYPE "tipo_interaccion" AS ENUM ('whatsapp', 'llamada', 'nota', 'cambio_etapa', 'pase_a_asesor', 'baja', 'automatizacion');

-- CreateEnum
CREATE TYPE "estado_consentimiento" AS ENUM ('opt_in', 'opt_out');

-- CreateEnum
CREATE TYPE "alcance_consentimiento" AS ENUM ('todo', 'marketing');

-- CreateEnum
CREATE TYPE "categoria_plantilla" AS ENUM ('marketing', 'utility', 'authentication', 'servicio');

-- CreateEnum
CREATE TYPE "estado_aprobacion_plantilla" AS ENUM ('pendiente', 'aprobada', 'rechazada', 'pausada', 'deshabilitada');

-- CreateEnum
CREATE TYPE "evento_disparador" AS ENUM ('lead_sin_respuesta');

-- CreateEnum
CREATE TYPE "estatus_ejecucion" AS ENUM ('programado', 'enviado', 'omitido', 'descartado', 'fallido', 'cancelado');

-- CreateEnum
CREATE TYPE "tipo_tarea_asesor" AS ENUM ('sin_plantilla_apta', 'revision_manual');

-- CreateEnum
CREATE TYPE "estado_tarea_asesor" AS ENUM ('pendiente', 'hecha', 'descartada');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "estatus_mensaje" ADD VALUE 'entregado';
ALTER TYPE "estatus_mensaje" ADD VALUE 'leido';


-- ──────────────────────────────────────────────────────────────────────────────────────────
-- Llaves foráneas simples que se reemplazan por compuestas (organizacion_id)
-- ──────────────────────────────────────────────────────────────────────────────────────────


-- DropForeignKey
ALTER TABLE "bandeja_chatwoot" DROP CONSTRAINT "bandeja_chatwoot_vertical_id_fkey";

-- DropForeignKey
ALTER TABLE "conversacion" DROP CONSTRAINT "conversacion_bandeja_chatwoot_id_fkey";

-- DropForeignKey
ALTER TABLE "conversacion" DROP CONSTRAINT "conversacion_lead_id_fkey";

-- DropForeignKey
ALTER TABLE "lead" DROP CONSTRAINT "lead_sucursal_interes_id_fkey";

-- DropForeignKey
ALTER TABLE "lead" DROP CONSTRAINT "lead_vertical_interes_id_fkey";

-- DropForeignKey
ALTER TABLE "mensaje" DROP CONSTRAINT "mensaje_conversacion_id_fkey";

-- DropForeignKey
ALTER TABLE "sucursal_vertical" DROP CONSTRAINT "sucursal_vertical_sucursal_id_fkey";

-- DropForeignKey
ALTER TABLE "sucursal_vertical" DROP CONSTRAINT "sucursal_vertical_vertical_id_fkey";


-- ──────────────────────────────────────────────────────────────────────────────────────────
-- Tablas nuevas
-- ──────────────────────────────────────────────────────────────────────────────────────────


-- CreateTable
CREATE TABLE "canal_whatsapp" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "vertical_id" UUID NOT NULL,
    "sucursal_id" UUID,
    "numero_whatsapp" TEXT,
    "messaging_service_sid" TEXT,
    "sender_sid" TEXT,
    "waba_id" TEXT,
    "nombre_publico" TEXT NOT NULL,
    "calidad_meta" "calidad_meta" NOT NULL DEFAULT 'desconocida',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "canal_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campana" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "origen" "origen_campana" NOT NULL,
    "vertical_id" UUID,
    "sucursal_id" UUID,
    "anuncio_id" TEXT,
    "presupuesto" DECIMAL(12,2),
    "fecha_inicio" DATE,
    "fecha_fin" DATE,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "campana_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapa_pipeline" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "es_ganado" BOOLEAN NOT NULL DEFAULT false,
    "es_perdido" BOOLEAN NOT NULL DEFAULT false,
    "dias_alerta_sin_movimiento" INTEGER,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "etapa_pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prospecto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "vertical_interes_id" UUID NOT NULL,
    "nombre" TEXT,
    "edad_declarada" INTEGER,
    "origen" "origen_prospecto" NOT NULL DEFAULT 'bot',
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "prospecto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interaccion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "conversacion_id" UUID,
    "tipo" "tipo_interaccion" NOT NULL,
    "contenido" TEXT,
    "datos" JSONB,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "interaccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consentimiento" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "telefono" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'whatsapp',
    "estado" "estado_consentimiento" NOT NULL,
    "alcance" "alcance_consentimiento" NOT NULL DEFAULT 'todo',
    "origen" TEXT,
    "evidencia" JSONB,
    "fecha" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "consentimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantilla_mensaje" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "content_sid" TEXT NOT NULL,
    "vertical_id" UUID,
    "categoria" "categoria_plantilla" NOT NULL,
    "tipo_content" TEXT NOT NULL DEFAULT 'text',
    "idioma" TEXT NOT NULL DEFAULT 'es_MX',
    "variables" JSONB NOT NULL DEFAULT '[]',
    "cuerpo_referencia" TEXT,
    "estado_aprobacion" "estado_aprobacion_plantilla" NOT NULL DEFAULT 'pendiente',
    "sincronizado_en" TIMESTAMPTZ(6),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "plantilla_mensaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automatizacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "vertical_id" UUID,
    "sucursal_id" UUID,
    "evento_disparador" "evento_disparador" NOT NULL,
    "offset_minutos" INTEGER NOT NULL DEFAULT 0,
    "plantilla_id" UUID,
    "condiciones" JSONB NOT NULL DEFAULT '{}',
    "max_intentos" INTEGER NOT NULL DEFAULT 1,
    "hora_inicio_min" INTEGER NOT NULL DEFAULT 540,
    "hora_fin_min" INTEGER NOT NULL DEFAULT 1200,
    "dias_permitidos" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "automatizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automatizacion_ejecucion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "automatizacion_id" UUID NOT NULL,
    "entidad_tipo" TEXT NOT NULL,
    "entidad_id" UUID NOT NULL,
    "ocurrencia" INTEGER NOT NULL DEFAULT 1,
    "programado_para" TIMESTAMPTZ(6) NOT NULL,
    "ejecutado_en" TIMESTAMPTZ(6),
    "estatus" "estatus_ejecucion" NOT NULL DEFAULT 'programado',
    "motivo_omision" TEXT,
    "mensaje_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "automatizacion_ejecucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarea_asesor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "conversacion_id" UUID,
    "tipo" "tipo_tarea_asesor" NOT NULL,
    "estado" "estado_tarea_asesor" NOT NULL DEFAULT 'pendiente',
    "descripcion" TEXT NOT NULL,
    "vence_en" TIMESTAMPTZ(6),
    "resuelta_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "tarea_asesor_pkey" PRIMARY KEY ("id")
);


-- ──────────────────────────────────────────────────────────────────────────────────────────
-- Datos existentes y columnas que cambian de tabla
-- ──────────────────────────────────────────────────────────────────────────────────────────


-- Etapa inicial para las organizaciones que ya existen. El resto de las etapas viene por seed.
INSERT INTO "etapa_pipeline" ("organizacion_id", "nombre", "orden")
SELECT "id", 'Nuevo', 1 FROM "organizacion";

-- Cada bandeja existente estrena un canal con su misma vertical; el canal toma el id de la
-- bandeja para que la migración sea determinista.
INSERT INTO "canal_whatsapp" ("id", "organizacion_id", "vertical_id", "nombre_publico", "creado_en", "eliminado_en")
SELECT "id", "organizacion_id", "vertical_id", "nombre", "creado_en", "eliminado_en" FROM "bandeja_chatwoot";

ALTER TABLE "bandeja_chatwoot" ADD COLUMN "canal_whatsapp_id" UUID;
UPDATE "bandeja_chatwoot" SET "canal_whatsapp_id" = "id";
ALTER TABLE "bandeja_chatwoot" ALTER COLUMN "canal_whatsapp_id" SET NOT NULL;
-- Al quitar vertical_id se cae también el índice único "una bandeja por vertical".
ALTER TABLE "bandeja_chatwoot" DROP COLUMN "vertical_id";

-- lead: columnas nuevas, etapa inicial para los existentes y el prospecto sale a su tabla.
ALTER TABLE "lead"
    ADD COLUMN "anuncio_id" TEXT,
    ADD COLUMN "anuncio_titulo" TEXT,
    ADD COLUMN "atribucion" JSONB,
    ADD COLUMN "campana_id" UUID,
    ADD COLUMN "ctwa_clid" TEXT,
    ADD COLUMN "etapa_id" UUID,
    ADD COLUMN "ultima_interaccion_en" TIMESTAMPTZ(6);

UPDATE "lead" SET "etapa_id" = (
    SELECT e."id" FROM "etapa_pipeline" e
    WHERE e."organizacion_id" = "lead"."organizacion_id" AND e."orden" = 1
);
ALTER TABLE "lead" ALTER COLUMN "etapa_id" SET NOT NULL;

INSERT INTO "prospecto" ("organizacion_id", "lead_id", "vertical_interes_id", "nombre", "edad_declarada", "origen", "creado_en", "eliminado_en")
SELECT "organizacion_id", "id", "vertical_interes_id", "nombre_prospecto", "edad_declarada", 'bot', "creado_en", "eliminado_en"
FROM "lead"
WHERE "nombre_prospecto" IS NOT NULL OR "edad_declarada" IS NOT NULL;

-- Al quitar edad_declarada se cae también su CHECK; el de prospecto va en el bloque final.
ALTER TABLE "lead" DROP COLUMN "edad_declarada", DROP COLUMN "nombre_prospecto";

-- AlterTable
ALTER TABLE "conversacion" ADD COLUMN     "ventana_gratis_hasta" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "mensaje" ADD COLUMN     "entregado_en" TIMESTAMPTZ(6),
ADD COLUMN     "error_codigo" INTEGER,
ADD COLUMN     "leido_en" TIMESTAMPTZ(6),
ADD COLUMN     "plantilla_id" UUID,
ADD COLUMN     "variables_usadas" JSONB;


-- ──────────────────────────────────────────────────────────────────────────────────────────
-- Índices
-- ──────────────────────────────────────────────────────────────────────────────────────────


-- CreateIndex
CREATE INDEX "canal_whatsapp_organizacion_id_idx" ON "canal_whatsapp"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "canal_whatsapp_id_organizacion_id_key" ON "canal_whatsapp"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "campana_organizacion_id_idx" ON "campana"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "campana_id_organizacion_id_key" ON "campana"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "etapa_pipeline_organizacion_id_idx" ON "etapa_pipeline"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "etapa_pipeline_id_organizacion_id_key" ON "etapa_pipeline"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "prospecto_organizacion_id_idx" ON "prospecto"("organizacion_id");

-- CreateIndex
CREATE INDEX "prospecto_lead_id_idx" ON "prospecto"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "prospecto_id_organizacion_id_key" ON "prospecto"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "interaccion_organizacion_id_idx" ON "interaccion"("organizacion_id");

-- CreateIndex
CREATE INDEX "interaccion_lead_id_creado_en_idx" ON "interaccion"("lead_id", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "interaccion_id_organizacion_id_key" ON "interaccion"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "consentimiento_organizacion_id_telefono_alcance_fecha_idx" ON "consentimiento"("organizacion_id", "telefono", "alcance", "fecha" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "consentimiento_id_organizacion_id_key" ON "consentimiento"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "plantilla_mensaje_organizacion_id_idx" ON "plantilla_mensaje"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "plantilla_mensaje_id_organizacion_id_key" ON "plantilla_mensaje"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "automatizacion_organizacion_id_idx" ON "automatizacion"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "automatizacion_id_organizacion_id_key" ON "automatizacion"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "automatizacion_ejecucion_organizacion_id_idx" ON "automatizacion_ejecucion"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "automatizacion_ejecucion_id_organizacion_id_key" ON "automatizacion_ejecucion"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "tarea_asesor_organizacion_id_idx" ON "tarea_asesor"("organizacion_id");

-- CreateIndex
CREATE INDEX "tarea_asesor_estado_vence_en_idx" ON "tarea_asesor"("estado", "vence_en");

-- CreateIndex
CREATE UNIQUE INDEX "tarea_asesor_id_organizacion_id_key" ON "tarea_asesor"("id", "organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "bandeja_chatwoot_id_organizacion_id_key" ON "bandeja_chatwoot"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "conversacion_lead_id_idx" ON "conversacion"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversacion_id_organizacion_id_key" ON "conversacion"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "lead_etapa_id_ultima_interaccion_en_idx" ON "lead"("etapa_id", "ultima_interaccion_en");

-- CreateIndex
CREATE UNIQUE INDEX "lead_id_organizacion_id_key" ON "lead"("id", "organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "mensaje_id_organizacion_id_key" ON "mensaje"("id", "organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "sucursal_id_organizacion_id_key" ON "sucursal"("id", "organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "sucursal_vertical_id_organizacion_id_key" ON "sucursal_vertical"("id", "organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "vertical_id_organizacion_id_key" ON "vertical"("id", "organizacion_id");


-- ──────────────────────────────────────────────────────────────────────────────────────────
-- Llaves foráneas compuestas: una fila no puede apuntar a otra organización
-- ──────────────────────────────────────────────────────────────────────────────────────────


-- AddForeignKey
ALTER TABLE "sucursal_vertical" ADD CONSTRAINT "sucursal_vertical_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sucursal_vertical" ADD CONSTRAINT "sucursal_vertical_vertical_id_organizacion_id_fkey" FOREIGN KEY ("vertical_id", "organizacion_id") REFERENCES "vertical"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "canal_whatsapp" ADD CONSTRAINT "canal_whatsapp_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canal_whatsapp" ADD CONSTRAINT "canal_whatsapp_vertical_id_organizacion_id_fkey" FOREIGN KEY ("vertical_id", "organizacion_id") REFERENCES "vertical"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "canal_whatsapp" ADD CONSTRAINT "canal_whatsapp_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "bandeja_chatwoot" ADD CONSTRAINT "bandeja_chatwoot_canal_whatsapp_id_organizacion_id_fkey" FOREIGN KEY ("canal_whatsapp_id", "organizacion_id") REFERENCES "canal_whatsapp"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "campana" ADD CONSTRAINT "campana_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campana" ADD CONSTRAINT "campana_vertical_id_organizacion_id_fkey" FOREIGN KEY ("vertical_id", "organizacion_id") REFERENCES "vertical"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "campana" ADD CONSTRAINT "campana_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "etapa_pipeline" ADD CONSTRAINT "etapa_pipeline_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_vertical_interes_id_organizacion_id_fkey" FOREIGN KEY ("vertical_interes_id", "organizacion_id") REFERENCES "vertical"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_sucursal_interes_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_interes_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_campana_id_organizacion_id_fkey" FOREIGN KEY ("campana_id", "organizacion_id") REFERENCES "campana"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_etapa_id_organizacion_id_fkey" FOREIGN KEY ("etapa_id", "organizacion_id") REFERENCES "etapa_pipeline"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_lead_id_organizacion_id_fkey" FOREIGN KEY ("lead_id", "organizacion_id") REFERENCES "lead"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_vertical_interes_id_organizacion_id_fkey" FOREIGN KEY ("vertical_interes_id", "organizacion_id") REFERENCES "vertical"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "interaccion" ADD CONSTRAINT "interaccion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interaccion" ADD CONSTRAINT "interaccion_lead_id_organizacion_id_fkey" FOREIGN KEY ("lead_id", "organizacion_id") REFERENCES "lead"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "interaccion" ADD CONSTRAINT "interaccion_conversacion_id_organizacion_id_fkey" FOREIGN KEY ("conversacion_id", "organizacion_id") REFERENCES "conversacion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversacion" ADD CONSTRAINT "conversacion_bandeja_chatwoot_id_organizacion_id_fkey" FOREIGN KEY ("bandeja_chatwoot_id", "organizacion_id") REFERENCES "bandeja_chatwoot"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "conversacion" ADD CONSTRAINT "conversacion_lead_id_organizacion_id_fkey" FOREIGN KEY ("lead_id", "organizacion_id") REFERENCES "lead"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_conversacion_id_organizacion_id_fkey" FOREIGN KEY ("conversacion_id", "organizacion_id") REFERENCES "conversacion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_plantilla_id_organizacion_id_fkey" FOREIGN KEY ("plantilla_id", "organizacion_id") REFERENCES "plantilla_mensaje"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "consentimiento" ADD CONSTRAINT "consentimiento_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantilla_mensaje" ADD CONSTRAINT "plantilla_mensaje_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plantilla_mensaje" ADD CONSTRAINT "plantilla_mensaje_vertical_id_organizacion_id_fkey" FOREIGN KEY ("vertical_id", "organizacion_id") REFERENCES "vertical"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "automatizacion" ADD CONSTRAINT "automatizacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automatizacion" ADD CONSTRAINT "automatizacion_vertical_id_organizacion_id_fkey" FOREIGN KEY ("vertical_id", "organizacion_id") REFERENCES "vertical"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "automatizacion" ADD CONSTRAINT "automatizacion_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "automatizacion" ADD CONSTRAINT "automatizacion_plantilla_id_organizacion_id_fkey" FOREIGN KEY ("plantilla_id", "organizacion_id") REFERENCES "plantilla_mensaje"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "automatizacion_ejecucion" ADD CONSTRAINT "automatizacion_ejecucion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automatizacion_ejecucion" ADD CONSTRAINT "automatizacion_ejecucion_automatizacion_id_organizacion_id_fkey" FOREIGN KEY ("automatizacion_id", "organizacion_id") REFERENCES "automatizacion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "automatizacion_ejecucion" ADD CONSTRAINT "automatizacion_ejecucion_mensaje_id_organizacion_id_fkey" FOREIGN KEY ("mensaje_id", "organizacion_id") REFERENCES "mensaje"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tarea_asesor" ADD CONSTRAINT "tarea_asesor_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea_asesor" ADD CONSTRAINT "tarea_asesor_lead_id_organizacion_id_fkey" FOREIGN KEY ("lead_id", "organizacion_id") REFERENCES "lead"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tarea_asesor" ADD CONSTRAINT "tarea_asesor_conversacion_id_organizacion_id_fkey" FOREIGN KEY ("conversacion_id", "organizacion_id") REFERENCES "conversacion"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ──────────────────────────────────────────────────────────────────────────────────────────
-- Escrito a mano: índices únicos parciales y CHECK (Prisma no los expresa)
-- ──────────────────────────────────────────────────────────────────────────────────────────


-- Los únicos de negocio aplican solo a filas vivas (WHERE eliminado_en IS NULL) para que un
-- registro borrado no bloquee un alta nueva (invariante 3).

-- Un número de WhatsApp pertenece a un solo canal en todo el sistema: el mensaje entrante llega
-- por número, antes de saber la organización.
CREATE UNIQUE INDEX "canal_whatsapp_numero_vivo_key"
    ON "canal_whatsapp" ("numero_whatsapp") WHERE "eliminado_en" IS NULL AND "numero_whatsapp" IS NOT NULL;

-- Una bandeja por canal.
CREATE UNIQUE INDEX "bandeja_chatwoot_canal_vivo_key"
    ON "bandeja_chatwoot" ("organizacion_id", "canal_whatsapp_id") WHERE "eliminado_en" IS NULL;

CREATE UNIQUE INDEX "campana_anuncio_vivo_key"
    ON "campana" ("organizacion_id", "anuncio_id") WHERE "eliminado_en" IS NULL AND "anuncio_id" IS NOT NULL;

CREATE UNIQUE INDEX "etapa_pipeline_orden_vivo_key"
    ON "etapa_pipeline" ("organizacion_id", "orden") WHERE "eliminado_en" IS NULL;
CREATE UNIQUE INDEX "etapa_pipeline_nombre_vivo_key"
    ON "etapa_pipeline" ("organizacion_id", "nombre") WHERE "eliminado_en" IS NULL;
ALTER TABLE "etapa_pipeline" ADD CONSTRAINT "etapa_pipeline_cierre_check"
    CHECK (NOT ("es_ganado" AND "es_perdido"));

-- El bot captura un solo prospecto por lead; los demás los agrega el asesor.
CREATE UNIQUE INDEX "prospecto_bot_vivo_key"
    ON "prospecto" ("lead_id") WHERE "origen" = 'bot' AND "eliminado_en" IS NULL;
ALTER TABLE "prospecto" ADD CONSTRAINT "prospecto_edad_declarada_check"
    CHECK ("edad_declarada" IS NULL OR "edad_declarada" BETWEEN 1 AND 99);

-- Consentimiento: mismo formato de teléfono que el lead (invariante 7).
ALTER TABLE "consentimiento" ADD CONSTRAINT "consentimiento_telefono_e164_check"
    CHECK ("telefono" ~ '^\+[1-9][0-9]{7,14}$' AND "telefono" !~ '^\+521[0-9]{10}$');
ALTER TABLE "consentimiento" ADD CONSTRAINT "consentimiento_canal_check"
    CHECK ("canal" IN ('whatsapp'));

-- Plantillas: un código por vertical (o general, sin vertical) e idioma.
CREATE UNIQUE INDEX "plantilla_mensaje_codigo_vivo_key"
    ON "plantilla_mensaje" ("organizacion_id", "codigo", COALESCE("vertical_id", '00000000-0000-0000-0000-000000000000'::uuid), "idioma")
    WHERE "eliminado_en" IS NULL;
ALTER TABLE "plantilla_mensaje" ADD CONSTRAINT "plantilla_mensaje_tipo_content_check"
    CHECK ("tipo_content" IN ('text', 'quick-reply', 'list-picker', 'call-to-action', 'media'));
-- Solo se puede enviar lo aprobado y activo.
CREATE INDEX "plantilla_mensaje_enviable_idx"
    ON "plantilla_mensaje" ("organizacion_id", "codigo")
    WHERE "estado_aprobacion" = 'aprobada' AND "activo" AND "eliminado_en" IS NULL;

-- Horario de envío (invariante 14): ninguna automatización puede salir de 09:00–20:00.
ALTER TABLE "automatizacion" ADD CONSTRAINT "automatizacion_horario_check"
    CHECK ("hora_inicio_min" >= 540 AND "hora_fin_min" <= 1200 AND "hora_inicio_min" < "hora_fin_min");
ALTER TABLE "automatizacion" ADD CONSTRAINT "automatizacion_dias_check"
    CHECK ("dias_permitidos" IS NOT NULL AND cardinality("dias_permitidos") > 0 AND "dias_permitidos" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]);
ALTER TABLE "automatizacion" ADD CONSTRAINT "automatizacion_max_intentos_check"
    CHECK ("max_intentos" >= 1);

-- Idempotencia de automatizaciones (invariante 8). Total a propósito, sin filtrar
-- eliminado_en: una ejecución ya hecha sigue hecha aunque después se borre.
CREATE UNIQUE INDEX "automatizacion_ejecucion_idempotencia_key"
    ON "automatizacion_ejecucion" ("automatizacion_id", "entidad_tipo", "entidad_id", "ocurrencia");
ALTER TABLE "automatizacion_ejecucion" ADD CONSTRAINT "automatizacion_ejecucion_ocurrencia_check"
    CHECK ("ocurrencia" >= 1);
CREATE INDEX "automatizacion_ejecucion_pendiente_idx"
    ON "automatizacion_ejecucion" ("programado_para") WHERE "estatus" = 'programado';

-- Una sola tarea pendiente por conversación y tipo: reintentar no llena la bandeja del asesor.
CREATE UNIQUE INDEX "tarea_asesor_pendiente_key"
    ON "tarea_asesor" ("conversacion_id", "tipo")
    WHERE "estado" = 'pendiente' AND "eliminado_en" IS NULL AND "conversacion_id" IS NOT NULL;
