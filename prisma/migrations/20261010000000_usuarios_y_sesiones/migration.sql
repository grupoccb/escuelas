-- CreateEnum
CREATE TYPE "rol_usuario" AS ENUM ('administrador', 'asesor', 'maestro', 'recepcion');

-- AlterTable
ALTER TABLE "organizacion" ADD COLUMN     "slug" TEXT;

-- CreateTable
CREATE TABLE "usuario" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "correo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "rol" "rol_usuario" NOT NULL,
    "contrasena_hash" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "contrasena_cambiada_en" TIMESTAMPTZ(6),
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_sucursal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "usuario_sucursal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sesion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_en" TIMESTAMPTZ(6) NOT NULL,
    "ultima_actividad_en" TIMESTAMPTZ(6) NOT NULL,
    "revocada_en" TIMESTAMPTZ(6),
    "ip" TEXT,
    "agente_usuario" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "sesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intento_acceso" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "correo" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "intento_acceso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "usuario_organizacion_id_idx" ON "usuario"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_id_organizacion_id_key" ON "usuario"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "usuario_sucursal_organizacion_id_idx" ON "usuario_sucursal"("organizacion_id");

-- CreateIndex
CREATE INDEX "usuario_sucursal_usuario_id_idx" ON "usuario_sucursal"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_sucursal_id_organizacion_id_key" ON "usuario_sucursal"("id", "organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_token_hash_key" ON "sesion"("token_hash");

-- CreateIndex
CREATE INDEX "sesion_organizacion_id_idx" ON "sesion"("organizacion_id");

-- CreateIndex
CREATE INDEX "sesion_usuario_id_idx" ON "sesion"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "sesion_id_organizacion_id_key" ON "sesion"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "intento_acceso_organizacion_id_idx" ON "intento_acceso"("organizacion_id");

-- CreateIndex
CREATE INDEX "intento_acceso_organizacion_id_correo_ip_creado_en_idx" ON "intento_acceso"("organizacion_id", "correo", "ip", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "intento_acceso_id_organizacion_id_key" ON "intento_acceso"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_sucursal" ADD CONSTRAINT "usuario_sucursal_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_sucursal" ADD CONSTRAINT "usuario_sucursal_usuario_id_organizacion_id_fkey" FOREIGN KEY ("usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "usuario_sucursal" ADD CONSTRAINT "usuario_sucursal_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_usuario_id_organizacion_id_fkey" FOREIGN KEY ("usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "intento_acceso" ADD CONSTRAINT "intento_acceso_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ── A mano: lo que Prisma no expresa ────────────────────────────────────────────────────

-- Identificador de la organización para iniciar sesión. Se rellena para las organizaciones que ya
-- existen a partir de su nombre (sin acentos, minúsculas, guiones); si dos darían el mismo, la
-- segunda lleva el comienzo de su id. Las organizaciones borradas quedan sin slug.
WITH base AS (
    SELECT o."id",
           o."creado_en",
           trim(both '-' from regexp_replace(
               lower(translate(o."nombre", 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
               '[^a-z0-9]+', '-', 'g')) AS "s"
    FROM "organizacion" o
    WHERE o."eliminado_en" IS NULL
), numerada AS (
    SELECT b."id", b."s",
           row_number() OVER (PARTITION BY b."s" ORDER BY b."creado_en", b."id") AS "n"
    FROM base b
)
UPDATE "organizacion" o
SET "slug" = CASE
        WHEN n."s" <> '' AND n."n" = 1 THEN n."s"
        ELSE coalesce(nullif(n."s", ''), 'org') || '-' || left(o."id"::text, 8)
    END
FROM numerada n
WHERE o."id" = n."id";

-- Único entre las organizaciones vivas; solo minúsculas, dígitos y guiones.
CREATE UNIQUE INDEX "organizacion_slug_vivo_key" ON "organizacion" ("slug") WHERE "eliminado_en" IS NULL AND "slug" IS NOT NULL;
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_slug_check" CHECK ("slug" IS NULL OR "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Un correo vivo por organización, siempre normalizado (minúsculas, sin espacios en los extremos).
CREATE UNIQUE INDEX "usuario_correo_vivo_key" ON "usuario" ("organizacion_id", "correo") WHERE "eliminado_en" IS NULL;
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_correo_check" CHECK ("correo" = lower(btrim("correo")) AND position('@' in "correo") > 1);

-- Un usuario aparece una sola vez por sucursal (entre las filas vivas).
CREATE UNIQUE INDEX "usuario_sucursal_viva_key" ON "usuario_sucursal" ("usuario_id", "sucursal_id") WHERE "eliminado_en" IS NULL;

-- El hash del token es un SHA-256 en hexadecimal (64 caracteres).
ALTER TABLE "sesion" ADD CONSTRAINT "sesion_token_hash_check" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
