-- CreateEnum
CREATE TYPE "sujeto_salud" AS ENUM ('prospecto', 'alumno');

-- CreateTable
CREATE TABLE "ficha_salud" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "sujeto_tipo" "sujeto_salud" NOT NULL,
    "sujeto_id" UUID NOT NULL,
    "alergias" TEXT,
    "condiciones_medicas" TEXT,
    "medicamentos" TEXT,
    "contacto_emergencia" TEXT,
    "autorizacion_atencion_medica" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "ficha_salud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acceso_dato_sensible" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizacion_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "sujeto_tipo" "sujeto_salud" NOT NULL,
    "sujeto_id" UUID NOT NULL,
    "accion" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "campos" TEXT[],
    "motivo" TEXT,
    "ruta" TEXT,
    "creado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en" TIMESTAMPTZ(6),

    CONSTRAINT "acceso_dato_sensible_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ficha_salud_organizacion_id_idx" ON "ficha_salud"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "ficha_salud_id_organizacion_id_key" ON "ficha_salud"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "acceso_dato_sensible_organizacion_id_idx" ON "acceso_dato_sensible"("organizacion_id");

-- CreateIndex
CREATE INDEX "acceso_dato_sensible_organizacion_id_sujeto_tipo_sujeto_id__idx" ON "acceso_dato_sensible"("organizacion_id", "sujeto_tipo", "sujeto_id", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "acceso_dato_sensible_id_organizacion_id_key" ON "acceso_dato_sensible"("id", "organizacion_id");

-- AddForeignKey
ALTER TABLE "ficha_salud" ADD CONSTRAINT "ficha_salud_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceso_dato_sensible" ADD CONSTRAINT "acceso_dato_sensible_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceso_dato_sensible" ADD CONSTRAINT "acceso_dato_sensible_usuario_id_organizacion_id_fkey" FOREIGN KEY ("usuario_id", "organizacion_id") REFERENCES "usuario"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Una ficha viva por sujeto.
CREATE UNIQUE INDEX "ficha_salud_sujeto_vivo_key" ON "ficha_salud" ("organizacion_id", "sujeto_tipo", "sujeto_id") WHERE "eliminado_en" IS NULL;

-- El registro de accesos es de solo anexar (ni UPDATE ni DELETE).
CREATE FUNCTION "acceso_dato_sensible_solo_anexar"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'acceso_dato_sensible es de solo anexar (no se actualiza ni se borra)';
END;
$$;
CREATE TRIGGER "acceso_dato_sensible_solo_anexar_trg" BEFORE UPDATE OR DELETE ON "acceso_dato_sensible"
    FOR EACH ROW EXECUTE FUNCTION "acceso_dato_sensible_solo_anexar"();

ALTER TABLE "acceso_dato_sensible" ADD CONSTRAINT "acceso_dato_sensible_valores_check"
    CHECK ("accion" IN ('leer', 'escribir') AND "resultado" IN ('permitido', 'denegado'));
