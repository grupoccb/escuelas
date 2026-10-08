-- CreateEnum
CREATE TYPE "estado_conversacion" AS ENUM ('bot', 'en_atencion_humana', 'cerrada', 'opt_out');

-- CreateEnum
CREATE TYPE "paso_captacion" AS ENUM ('inicio', 'nombre', 'edad', 'sucursal', 'completo');

-- CreateEnum
CREATE TYPE "direccion_mensaje" AS ENUM ('entrante', 'saliente', 'nota_interna');

-- CreateEnum
CREATE TYPE "estatus_mensaje" AS ENUM ('recibido', 'pendiente', 'enviando', 'enviado', 'bloqueado', 'fallido');

-- CreateTable
CREATE TABLE "organizacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nombre" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "organizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vertical" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "vertical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucursal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "zona_horaria" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucursal_vertical" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "vertical_id" UUID NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "sucursal_vertical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bandeja_chatwoot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "vertical_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "chatwoot_account_id" INTEGER,
    "chatwoot_inbox_id" INTEGER,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "bandeja_chatwoot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "vertical_interes_id" UUID NOT NULL,
    "sucursal_interes_id" UUID,
    "telefono" TEXT NOT NULL,
    "nombre_contacto" TEXT,
    "nombre_prospecto" TEXT,
    "edad_declarada" INTEGER,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversacion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "bandeja_chatwoot_id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "chatwoot_conversacion_id" INTEGER NOT NULL,
    "estado" "estado_conversacion" NOT NULL DEFAULT 'bot',
    "paso_captacion" "paso_captacion" NOT NULL DEFAULT 'inicio',
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "pasar_a_asesor_pendiente" BOOLEAN NOT NULL DEFAULT false,
    "motivo_pase_asesor" TEXT,
    "ventana_servicio_hasta" TIMESTAMPTZ(6),
    "ultimo_mensaje_entrante_en" TIMESTAMPTZ(6),
    "ultimo_mensaje_saliente_en" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "conversacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensaje" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "conversacion_id" UUID NOT NULL,
    "direccion" "direccion_mensaje" NOT NULL,
    "estatus" "estatus_mensaje" NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "proveedor" TEXT NOT NULL,
    "id_externo" TEXT,
    "motivo_bloqueo" TEXT,
    "error" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_en" TIMESTAMPTZ(6),
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "mensaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vertical_organizacion_id_idx" ON "vertical"("organizacion_id");

-- CreateIndex
CREATE INDEX "sucursal_organizacion_id_idx" ON "sucursal"("organizacion_id");

-- CreateIndex
CREATE INDEX "sucursal_vertical_organizacion_id_idx" ON "sucursal_vertical"("organizacion_id");

-- CreateIndex
CREATE INDEX "bandeja_chatwoot_organizacion_id_idx" ON "bandeja_chatwoot"("organizacion_id");

-- CreateIndex
CREATE INDEX "lead_organizacion_id_idx" ON "lead"("organizacion_id");

-- CreateIndex
CREATE INDEX "conversacion_organizacion_id_idx" ON "conversacion"("organizacion_id");

-- CreateIndex
CREATE INDEX "mensaje_organizacion_id_idx" ON "mensaje"("organizacion_id");

-- CreateIndex
CREATE INDEX "mensaje_conversacion_id_creado_en_idx" ON "mensaje"("conversacion_id", "creado_en");

-- AddForeignKey
ALTER TABLE "vertical" ADD CONSTRAINT "vertical_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sucursal" ADD CONSTRAINT "sucursal_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sucursal_vertical" ADD CONSTRAINT "sucursal_vertical_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sucursal_vertical" ADD CONSTRAINT "sucursal_vertical_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "sucursal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sucursal_vertical" ADD CONSTRAINT "sucursal_vertical_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "vertical"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bandeja_chatwoot" ADD CONSTRAINT "bandeja_chatwoot_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bandeja_chatwoot" ADD CONSTRAINT "bandeja_chatwoot_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "vertical"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_vertical_interes_id_fkey" FOREIGN KEY ("vertical_interes_id") REFERENCES "vertical"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead" ADD CONSTRAINT "lead_sucursal_interes_id_fkey" FOREIGN KEY ("sucursal_interes_id") REFERENCES "sucursal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversacion" ADD CONSTRAINT "conversacion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversacion" ADD CONSTRAINT "conversacion_bandeja_chatwoot_id_fkey" FOREIGN KEY ("bandeja_chatwoot_id") REFERENCES "bandeja_chatwoot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversacion" ADD CONSTRAINT "conversacion_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensaje" ADD CONSTRAINT "mensaje_conversacion_id_fkey" FOREIGN KEY ("conversacion_id") REFERENCES "conversacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ------------------------------------------------------------------------------------------
-- Escrito a mano: Prisma no expresa índices únicos parciales ni CHECK (CLAUDE.md, Stack).
-- Los únicos de negocio aplican solo a filas vivas (WHERE eliminado_en IS NULL) para que un
-- registro borrado no bloquee un alta nueva (invariante 3).
-- ------------------------------------------------------------------------------------------

CREATE UNIQUE INDEX "vertical_slug_vivo_key"
    ON "vertical" ("organizacion_id", "slug") WHERE "eliminado_en" IS NULL;

CREATE UNIQUE INDEX "sucursal_nombre_vivo_key"
    ON "sucursal" ("organizacion_id", "nombre") WHERE "eliminado_en" IS NULL;

CREATE UNIQUE INDEX "sucursal_vertical_vivo_key"
    ON "sucursal_vertical" ("sucursal_id", "vertical_id") WHERE "eliminado_en" IS NULL;

-- Una bandeja por vertical, y cada bandeja de Chatwoot apunta a una sola fila.
CREATE UNIQUE INDEX "bandeja_chatwoot_vertical_vivo_key"
    ON "bandeja_chatwoot" ("organizacion_id", "vertical_id") WHERE "eliminado_en" IS NULL;
CREATE UNIQUE INDEX "bandeja_chatwoot_inbox_vivo_key"
    ON "bandeja_chatwoot" ("chatwoot_account_id", "chatwoot_inbox_id")
    WHERE "eliminado_en" IS NULL AND "chatwoot_inbox_id" IS NOT NULL;

-- Teléfono normalizado: un lead vivo por teléfono y vertical. "+521…" y "+52…" llegan
-- iguales porque todo pasa por normalizarTelefono() (invariante 7); el CHECK impide guardar
-- cualquier otra forma.
CREATE UNIQUE INDEX "lead_telefono_vivo_key"
    ON "lead" ("organizacion_id", "vertical_interes_id", "telefono") WHERE "eliminado_en" IS NULL;
ALTER TABLE "lead" ADD CONSTRAINT "lead_telefono_e164_check"
    CHECK ("telefono" ~ '^\+[1-9][0-9]{7,14}$' AND "telefono" !~ '^\+521[0-9]{10}$');
ALTER TABLE "lead" ADD CONSTRAINT "lead_edad_declarada_check"
    CHECK ("edad_declarada" IS NULL OR "edad_declarada" BETWEEN 1 AND 99);

CREATE UNIQUE INDEX "conversacion_chatwoot_vivo_key"
    ON "conversacion" ("bandeja_chatwoot_id", "chatwoot_conversacion_id") WHERE "eliminado_en" IS NULL;

-- Idempotencia de webhooks (invariante 8). Total a propósito, sin filtrar eliminado_en:
-- un mensaje ya procesado sigue procesado aunque después se borre.
CREATE UNIQUE INDEX "mensaje_id_externo_key"
    ON "mensaje" ("organizacion_id", "proveedor", "id_externo") WHERE "id_externo" IS NOT NULL;
