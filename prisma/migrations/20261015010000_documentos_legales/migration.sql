-- CreateEnum
CREATE TYPE "tipo_documento_legal" AS ENUM ('reglamento', 'uso_imagen', 'aviso_privacidad');

-- CreateEnum
CREATE TYPE "resultado_aceptacion" AS ENUM ('aceptada', 'rechazada', 'revocada');

-- CreateEnum
CREATE TYPE "canal_aceptacion" AS ENUM ('presencial', 'web', 'whatsapp', 'telefono');

-- CreateTable
CREATE TABLE "documento_legal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "tipo" "tipo_documento_legal" NOT NULL,
    "vertical_id" UUID,
    "version" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "texto_hash" TEXT NOT NULL,
    "vigente_desde" TIMESTAMPTZ(6) NOT NULL,
    "creado_por_usuario_id" UUID,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "documento_legal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aceptacion_legal" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "tipo" "tipo_documento_legal" NOT NULL,
    "version_aceptada" INTEGER NOT NULL,
    "resultado" "resultado_aceptacion" NOT NULL,
    "lead_id" UUID NOT NULL,
    "prospecto_id" UUID NOT NULL,
    "registro_clase_muestra_id" UUID,
    "registro_tutor_id" UUID,
    "aceptante_nombre" TEXT NOT NULL,
    "aceptante_parentesco" TEXT,
    "canal" "canal_aceptacion" NOT NULL,
    "capturada_por_usuario_id" UUID,
    "aceptado_en" TIMESTAMPTZ(6) NOT NULL,
    "texto_hash" TEXT NOT NULL,
    "evidencia" JSONB,
    "ip" TEXT,
    "agente_usuario" TEXT,
    "secuencia" BIGSERIAL NOT NULL,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "aceptacion_legal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documento_legal_organizacion_id_idx" ON "documento_legal"("organizacion_id");

-- CreateIndex
CREATE INDEX "documento_legal_organizacion_id_tipo_version_idx" ON "documento_legal"("organizacion_id", "tipo", "version");

-- CreateIndex
CREATE UNIQUE INDEX "documento_legal_id_organizacion_id_key" ON "documento_legal"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "aceptacion_legal_organizacion_id_idx" ON "aceptacion_legal"("organizacion_id");

-- CreateIndex
CREATE INDEX "aceptacion_legal_prospecto_id_tipo_secuencia_idx" ON "aceptacion_legal"("prospecto_id", "tipo", "secuencia");

-- CreateIndex
CREATE INDEX "aceptacion_legal_documento_id_idx" ON "aceptacion_legal"("documento_id");

-- CreateIndex
CREATE UNIQUE INDEX "aceptacion_legal_id_organizacion_id_key" ON "aceptacion_legal"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "documento_legal" ADD CONSTRAINT "documento_legal_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_legal" ADD CONSTRAINT "documento_legal_vertical_id_organizacion_id_fkey" FOREIGN KEY ("vertical_id", "organizacion_id") REFERENCES "vertical"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "documento_legal" ADD CONSTRAINT "documento_legal_creado_por_usuario_id_organizacion_id_fkey" FOREIGN KEY ("creado_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "aceptacion_legal" ADD CONSTRAINT "aceptacion_legal_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aceptacion_legal" ADD CONSTRAINT "aceptacion_legal_documento_id_organizacion_id_fkey" FOREIGN KEY ("documento_id", "organizacion_id") REFERENCES "documento_legal"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "aceptacion_legal" ADD CONSTRAINT "aceptacion_legal_lead_id_organizacion_id_fkey" FOREIGN KEY ("lead_id", "organizacion_id") REFERENCES "lead"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "aceptacion_legal" ADD CONSTRAINT "aceptacion_legal_prospecto_id_organizacion_id_fkey" FOREIGN KEY ("prospecto_id", "organizacion_id") REFERENCES "prospecto"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "aceptacion_legal" ADD CONSTRAINT "aceptacion_legal_registro_clase_muestra_id_organizacion_id_fkey" FOREIGN KEY ("registro_clase_muestra_id", "organizacion_id") REFERENCES "registro_clase_muestra"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "aceptacion_legal" ADD CONSTRAINT "aceptacion_legal_registro_tutor_id_organizacion_id_fkey" FOREIGN KEY ("registro_tutor_id", "organizacion_id") REFERENCES "registro_tutor"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "aceptacion_legal" ADD CONSTRAINT "aceptacion_legal_capturada_por_usuario_id_organizacion_id_fkey" FOREIGN KEY ("capturada_por_usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;



-- ── Lo que Prisma no expresa ─────────────────────────────────────────────────────────────────────────────
-- Una versión por (organización, tipo, alcance): el alcance «general» (sin vertical) se cuenta como uno más.
CREATE UNIQUE INDEX "documento_legal_version_key"
    ON "documento_legal" ("organizacion_id", "tipo", COALESCE("vertical_id", '00000000-0000-0000-0000-000000000000'::uuid), "version")
    WHERE "eliminado_en" IS NULL;
ALTER TABLE "documento_legal" ADD CONSTRAINT "documento_legal_version_check" CHECK ("version" >= 1);
ALTER TABLE "documento_legal" ADD CONSTRAINT "documento_legal_texto_check" CHECK (length(btrim("texto")) > 0 AND "texto_hash" ~ '^[0-9a-f]{64}$');

-- La evidencia: hash de lo mostrado bien formado; quien aceptó tiene nombre; revocar solo tiene sentido con una versión.
ALTER TABLE "aceptacion_legal" ADD CONSTRAINT "aceptacion_legal_texto_hash_check" CHECK ("texto_hash" ~ '^[0-9a-f]{64}$' AND "version_aceptada" >= 1);
ALTER TABLE "aceptacion_legal" ADD CONSTRAINT "aceptacion_legal_nombre_check" CHECK (length(btrim("aceptante_nombre")) > 0);

-- SOLO DE ANEXAR, por la base: ni UPDATE, ni DELETE, ni TRUNCATE (también en cascada), como registro_cambio. Un documento legal
-- que se puede reescribir no prueba qué se aceptó; una aceptación que se puede editar no es evidencia. Corregir = fila nueva.
-- Límite honesto (igual que en registro_cambio): el dueño de la tabla puede quitar el disparador; ver docs/API.md, «Roles de base de datos».
CREATE FUNCTION "documento_legal_solo_anexar"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'documento_legal es de solo anexar (una nueva versión es una fila nueva; no se actualiza ni se borra)';
END;
$$;
CREATE TRIGGER "documento_legal_solo_anexar_trg" BEFORE UPDATE OR DELETE ON "documento_legal"
    FOR EACH ROW EXECUTE FUNCTION "documento_legal_solo_anexar"();
CREATE TRIGGER "documento_legal_solo_anexar_truncate_trg" BEFORE TRUNCATE ON "documento_legal"
    FOR EACH STATEMENT EXECUTE FUNCTION "documento_legal_solo_anexar"();

CREATE FUNCTION "aceptacion_legal_solo_anexar"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'aceptacion_legal es de solo anexar (una revocación es una fila nueva; no se actualiza ni se borra)';
END;
$$;
CREATE TRIGGER "aceptacion_legal_solo_anexar_trg" BEFORE UPDATE OR DELETE ON "aceptacion_legal"
    FOR EACH ROW EXECUTE FUNCTION "aceptacion_legal_solo_anexar"();
CREATE TRIGGER "aceptacion_legal_solo_anexar_truncate_trg" BEFORE TRUNCATE ON "aceptacion_legal"
    FOR EACH STATEMENT EXECUTE FUNCTION "aceptacion_legal_solo_anexar"();
